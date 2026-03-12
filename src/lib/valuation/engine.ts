/**
 * Valuation Engine v2 — GestionPatrimonio
 * Full P&L DCF (restaurants), NOI-DCF (real estate), Collectibles
 */

import type { ValuationResult, ConfidenceScore } from '../../types'

// ── HELPERS ─────────────────────────────────────────────────
export function formatCurrency(amount: number, currency = 'EUR'): string {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount)
}

export function pv(rate: number, periods: number, fv: number): number {
    return fv / Math.pow(1 + rate, periods)
}

function confidence(filled: number, total: number, hasDefaults: boolean): ConfidenceScore {
    const pct = filled / total
    if (pct >= 0.85 && !hasDefaults) return 'high'
    if (pct >= 0.6) return 'medium'
    return 'low'
}

const RISK_DR = { low: 0.07, medium: 0.10, high: 0.14 }

export function getDiscountRateByRisk(risk: 'low' | 'medium' | 'high', rf = 0.04): number {
    return rf + RISK_DR[risk]
}

export function getDiscountRateFromPreset(rf: number, erp: number, crp: number, beta = 1.0): number {
    return rf + beta * erp + crp
}

// ── RESTAURANT / BUSINESS FULL P&L DCF ─────────────────────

export interface RestaurantDCFInputs {
    // Income statement
    revenue: number                   // annual revenue €
    cogsRate: number                  // COGS % of revenue (food & beverage cost) e.g. 0.28
    staffCostRate: number             // % of revenue e.g. 0.32
    rentAnnual: number                // annual rent (if leased) or 0 if owned
    utilsAndOtherRate: number         // utilities, supplies, marketing, insurance % of revenue e.g. 0.10
    depreciationAnnual?: number       // D&A €/year (furniture, equipment) e.g. 15000

    // Growth & risk
    revenueGrowthRate: number         // e.g. 0.05
    taxRate: number                   // effective tax rate e.g. 0.25
    discountRate: number              // WACC / discount rate
    terminalGrowthRate: number        // e.g. 0.02
    horizonYears: number              // projection years e.g. 5 | 7 | 10

    // Capital
    maintenanceCapexAnnual?: number   // maintenance capex €/year
    workingCapitalDays?: number        // WC days of revenue (approx), default 15 days
    debtOutstanding?: number           // net debt €

    // Property regime
    regime?: 'owned' | 'leased'       // if leased, rent is already in costs above

    // Adjustments
    fxRate?: number                   // currency conversion
    ownershipPct?: number             // % ownership e.g. 1.0
}

export function runRestaurantDCF(inputs: RestaurantDCFInputs): ValuationResult & { plTable: PlYear[] } {
    const {
        revenue, cogsRate, staffCostRate, rentAnnual, utilsAndOtherRate,
        depreciationAnnual = revenue * 0.03,
        revenueGrowthRate, taxRate, discountRate, terminalGrowthRate, horizonYears,
        maintenanceCapexAnnual = revenue * 0.02,
        workingCapitalDays = 15,
        debtOutstanding = 0,
        fxRate = 1,
        ownershipPct = 1,
    } = inputs

    const g = Math.min(terminalGrowthRate, discountRate - 0.01)
    const plTable: PlYear[] = []
    let pvSum = 0
    let curRevenue = revenue

    for (let y = 1; y <= horizonYears; y++) {
        curRevenue *= (1 + revenueGrowthRate)
        const cogs = curRevenue * cogsRate
        const grossProfit = curRevenue - cogs
        const staff = curRevenue * staffCostRate
        const rent = rentAnnual * Math.pow(1 + 0.03, y)  // rent grows 3%/yr CPI
        const utils = curRevenue * utilsAndOtherRate
        const ebitda = grossProfit - staff - rent - utils
        const da = depreciationAnnual * Math.pow(1 + 0.02, y)
        const ebit = ebitda - da
        const tax = Math.max(ebit * taxRate, 0)
        const nopat = ebit - tax
        const capex = maintenanceCapexAnnual * Math.pow(1 + revenueGrowthRate, y)
        const deltaWC = curRevenue * (workingCapitalDays / 365) * revenueGrowthRate
        const fcf = nopat + da - capex - deltaWC
        pvSum += pv(discountRate, y, fcf)

        plTable.push({ year: y, revenue: curRevenue, cogs, grossProfit, staff, rent, utils, ebitda, da, ebit, tax, nopat, capex, fcf })
    }

    const lastFCF = plTable[plTable.length - 1].fcf * (1 + g)
    const tv = lastFCF / (discountRate - g)
    const pvTV = pv(discountRate, horizonYears, tv)
    const ev = (pvSum + pvTV) * fxRate
    const equity = Math.max(ev - debtOutstanding, 0) * ownershipPct

    const ebitdaBase = plTable[0].ebitda
    const ebitdaMarginBase = ebitdaBase / revenue
    const base = equity
    const low = base * 0.75
    const high = base * 1.35

    const ebitdaMultiple = (ebitdaBase > 0 ? equity / ebitdaBase : 0).toFixed(1)

    return {
        low, base, high,
        confidence: confidence(Object.values(inputs).filter(v => v !== undefined).length, 12, false),
        method: 'dcf',
        drivers: [
            `Ventas año 1: ${formatCurrency(plTable[0].revenue)}`,
            `EBITDA: ${formatCurrency(ebitdaBase)} (${(ebitdaMarginBase * 100).toFixed(1)}% margen)`,
            `COGS: ${(cogsRate * 100).toFixed(0)}% · Staff: ${(staffCostRate * 100).toFixed(0)}% · Alquiler: ${formatCurrency(rentAnnual)}/año`,
            `Descuento: ${(discountRate * 100).toFixed(1)}% · Crecimiento: ${(revenueGrowthRate * 100).toFixed(1)}%/año`,
            `EV: ${formatCurrency(ev)} · ${ebitdaMultiple}× EBITDA`,
            `Valor Terminal: ${formatCurrency(pvTV)} (${(pvTV / ev * 100).toFixed(0)}% del EV)`,
        ],
        explanation: `DCF completo con P&L proyectado a ${horizonYears} años. EBITDA base ${(ebitdaMarginBase * 100).toFixed(1)}%, tasa de descuento ${(discountRate * 100).toFixed(1)}%. Régimen: ${inputs.regime === 'owned' ? 'Local propio' : 'Local arrendado'}.`,
        assumptions: { ...inputs, pvSum, pvTV, ev, ebitdaBase, ebitdaMarginBase },
        plTable,
    }
}

export interface PlYear {
    year: number
    revenue: number; cogs: number; grossProfit: number
    staff: number; rent: number; utils: number
    ebitda: number; da: number; ebit: number
    tax: number; nopat: number; capex: number; fcf: number
}

// ── SIMPLE DCF (backwards compat) ────────────────────────────
export interface DCFInputs {
    revenue: number; revenueGrowthRate: number; ebitdaMargin: number
    capexPct?: number; capexLevel?: 'low' | 'medium' | 'high'
    taxRate: number; discountRate: number; terminalGrowthRate: number
    horizonYears: number; fxRate?: number; workingCapitalPct?: number
    depreciationPct?: number; debtOutstanding?: number
}

const CAPEX_MAP = { low: 0.03, medium: 0.06, high: 0.10 }

export function runDCF(inputs: DCFInputs): ValuationResult {
    const { revenue, revenueGrowthRate, ebitdaMargin, taxRate, discountRate, terminalGrowthRate, horizonYears, fxRate = 1, workingCapitalPct = 0.02, depreciationPct = 0.03, debtOutstanding = 0 } = inputs
    const capexPct = inputs.capexPct ?? CAPEX_MAP[inputs.capexLevel ?? 'medium']
    const g = Math.min(terminalGrowthRate, discountRate - 0.01)

    let pvSum = 0, curRevenue = revenue
    const fcfs: number[] = []
    for (let y = 1; y <= horizonYears; y++) {
        curRevenue *= (1 + revenueGrowthRate)
        const ebitda = curRevenue * ebitdaMargin
        const da = curRevenue * depreciationPct
        const ebit = ebitda - da
        const nopat = ebit - ebit * taxRate
        const capex = curRevenue * capexPct
        const deltaWC = curRevenue * workingCapitalPct * revenueGrowthRate
        const fcf = nopat + da - capex - deltaWC
        pvSum += pv(discountRate, y, fcf)
        fcfs.push(fcf)
    }
    const lastFCF = fcfs[fcfs.length - 1] * (1 + g)
    const tv = lastFCF / (discountRate - g)
    const pvTV = pv(discountRate, horizonYears, tv)
    const ev = (pvSum + pvTV) * fxRate
    const base = Math.max(ev - debtOutstanding, 0)

    return {
        low: base * 0.75, base, high: base * 1.30,
        confidence: confidence(Object.values(inputs).filter(v => v !== undefined).length, 10, !inputs.capexPct),
        method: 'dcf',
        drivers: [
            `EBITDA Margin: ${(ebitdaMargin * 100).toFixed(1)}%`, `Revenue Growth: ${(revenueGrowthRate * 100).toFixed(1)}%/año`,
            `Discount Rate: ${(discountRate * 100).toFixed(1)}%`, `Terminal Growth: ${(g * 100).toFixed(1)}%`, `Horizonte: ${horizonYears} años`,
        ],
        explanation: `DCF simplificado a ${horizonYears} años. Tasa de descuento ${(discountRate * 100).toFixed(1)}%, crecimiento terminal ${(g * 100).toFixed(1)}%.`,
        assumptions: { ...inputs, capexPct, g, pvSum, pvTV },
    }
}

// ── REAL ESTATE FULL DCF ─────────────────────────────────────

export interface RealEstateInputs {
    // Income
    grossRentalIncome: number          // € / year
    occupancyRate?: number             // default 0.95
    // Operating costs
    maintenancePct?: number            // % of gross income, default 0.05
    managementFeePct?: number          // % of gross income, default 0.08
    ibiAnnual?: number                 // property tax € / year
    insuranceAnnual?: number           // buildings insurance € / year
    communityAnnual?: number           // community fees € / year
    otherOpexAnnual?: number           // other fixed costs
    // Financing
    debtOutstanding?: number
    annualDebtService?: number         // interest + principal repayment per year
    // Appreciation / exit
    capRate: number
    rentalGrowthRate?: number          // default 0.03
    propertyAppreciationRate?: number  // default 0.03
    discountRate?: number
    horizonYears?: number
    // Comparables
    sqm?: number
    pricePerSqm?: number
    // Property regime
    regime?: 'owned' | 'leased'       // if owned: full asset. if leased: only biz value
}

export function valuateRealEstate(inputs: RealEstateInputs): ValuationResult {
    const {
        grossRentalIncome, occupancyRate = 0.95,
        maintenancePct = 0.05, managementFeePct = 0.08,
        ibiAnnual = 0, insuranceAnnual = 0, communityAnnual = 0, otherOpexAnnual = 0,
        debtOutstanding = 0,
        capRate, rentalGrowthRate = 0.03, propertyAppreciationRate = 0.03,
        horizonYears = 10, sqm, pricePerSqm,
    } = inputs

    const effectiveRent = grossRentalIncome * occupancyRate
    const opex = effectiveRent * (maintenancePct + managementFeePct) + ibiAnnual + insuranceAnnual + communityAnnual + otherOpexAnnual
    const noi = effectiveRent - opex
    const dr = inputs.discountRate ?? (capRate + 0.02)

    // NOI/Cap Rate valuation
    const byCapRate = noi / capRate

    // DCF with exit
    let pvRents = 0, curNOI = noi
    for (let y = 1; y <= horizonYears; y++) {
        curNOI *= (1 + rentalGrowthRate)
        pvRents += pv(dr, y, curNOI)
    }
    const exitPropertyValue = byCapRate * Math.pow(1 + propertyAppreciationRate, horizonYears)
    const pvExit = pv(dr, horizonYears, exitPropertyValue)
    const dcfValue = pvRents + pvExit

    // Blended: 60% cap rate, 40% DCF
    const blended = byCapRate * 0.6 + dcfValue * 0.4
    const equity = Math.max(blended - debtOutstanding, 0)

    // Comps cross-check
    const compValue = sqm && pricePerSqm ? sqm * pricePerSqm : null
    const base = compValue ? (equity * 0.7 + compValue * 0.3) : equity

    const grossCompressionYield = noi / base
    const occupancyCostRatio = opex / grossRentalIncome

    const filledCount = Object.values(inputs).filter(v => v !== undefined && v !== null).length
    const hasDefaults = !inputs.maintenancePct || !inputs.occupancyRate

    return {
        low: Math.max(base * 0.82, 0), base: Math.max(base, 0), high: base * 1.22,
        confidence: confidence(filledCount, 10, hasDefaults),
        method: 'dcf',
        drivers: [
            `NOI: ${formatCurrency(noi)}/año`,
            `Cap Rate: ${(capRate * 100).toFixed(2)}% → Valor cap: ${formatCurrency(byCapRate)}`,
            `Ocupación: ${(occupancyRate * 100).toFixed(0)}% · Crecimiento renta: ${(rentalGrowthRate * 100).toFixed(1)}%/año`,
            `OpEx total: ${formatCurrency(opex)}/año (IBI+seguros+gestión+mant.)`,
            `Rendimiento bruto: ${(grossRentalIncome / base * 100).toFixed(2)}% · Neto: ${(grossCompressionYield * 100).toFixed(2)}%`,
            compValue ? `Comparable €/m²: ${formatCurrency(compValue)}` : `DCF exit value: ${formatCurrency(pvExit)}`,
        ],
        explanation: `Valoración inmobiliaria NOI/Cap Rate (${(capRate * 100).toFixed(2)}%) con DCF ${horizonYears} años y valor de salida. NOI neto ${formatCurrency(noi)}/año tras descontar ${(occupancyCostRatio * 100).toFixed(0)}% en gastos.`,
        assumptions: { ...inputs, effectiveRent, opex, noi, byCapRate, dcfValue, compValue },
    }
}

// ── COLLECTIBLES ────────────────────────────────────────────

export interface CollectibleInputs {
    purchasePrice: number; purchaseYear: number; currentYear?: number
    appreciationRate?: number; depreciationRate?: number
    condition?: number; liquidityDiscount?: number; sellerFee?: number; compsMedian?: number
}

export function valuateCollectible(inputs: CollectibleInputs): ValuationResult {
    const { purchasePrice, purchaseYear, currentYear = new Date().getFullYear(), condition = 8, liquidityDiscount = 0.05, sellerFee = 0.10 } = inputs
    const years = currentYear - purchaseYear
    const rate = inputs.appreciationRate ?? inputs.depreciationRate ?? 0
    const condFactor = 0.6 + (condition / 10) * 0.4
    const timeAdj = purchasePrice * Math.pow(1 + rate, years)
    const condAdj = timeAdj * condFactor
    const blended = inputs.compsMedian ? (condAdj * 0.4 + inputs.compsMedian * 0.6) : condAdj
    const base = Math.max(blended * (1 - liquidityDiscount - sellerFee), 0)

    return {
        low: base * 0.80, base, high: base * 1.25,
        confidence: confidence(Object.values(inputs).filter(v => v !== undefined).length, 8, !inputs.compsMedian && !inputs.appreciationRate),
        method: inputs.compsMedian ? 'comps' : 'cost',
        drivers: [
            `Precio compra: ${formatCurrency(purchasePrice)}`, `Años: ${years}`, `Estado (1-10): ${condition}`,
            `Apreciación/depreciación: ${(rate * 100).toFixed(1)}%/año`,
            inputs.compsMedian ? `Comps mediana: ${formatCurrency(inputs.compsMedian)}` : '',
        ].filter(Boolean),
        explanation: `Valoración por coste ajustado (antigüedad + estado)${inputs.compsMedian ? ' con comparables de mercado' : ''}.`,
        assumptions: { ...inputs, years, condFactor, timeAdj, blended },
    }
}
