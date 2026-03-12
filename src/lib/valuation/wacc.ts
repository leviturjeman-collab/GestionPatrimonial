/**
 * WACC / CAPM Engine — GestionPatrimonio
 * Professional-grade cost of capital calculations
 */

export interface WACCInputs {
    // CAPM inputs
    riskFreeRate: number         // Rf — Spanish 10Y bond yield (e.g. 0.034)
    equityRiskPremium: number    // ERP — Damodaran (e.g. 0.055 for Spain)
    beta: number                 // levered beta (e.g. 0.9 for food service)
    countryRiskPremium?: number  // CRP extra (e.g. 0.01)
    sizePremium?: number         // SME size premium (e.g. 0.02)

    // Debt inputs
    costOfDebt: number           // pre-tax cost of debt (e.g. 0.045)
    taxRate: number              // effective IS rate (e.g. 0.25)

    // Capital structure
    equityWeight: number         // E/V (e.g. 0.70)
    debtWeight: number           // D/V (e.g. 0.30)
    preferredWeight?: number     // P/V if applicable
    costOfPreferred?: number
}

export interface WACCResult {
    costOfEquity: number         // CAPM result
    costOfDebtAfterTax: number
    wacc: number
    details: {
        capmFormula: string
        waccFormula: string
        breakdown: Array<{ label: string; value: number }>
    }
}

/** Levered beta from unlevered using Hamada equation */
export function leverBeta(unleveredBeta: number, debtToEquity: number, taxRate: number): number {
    return unleveredBeta * (1 + (1 - taxRate) * debtToEquity)
}

/** CAPM: Ke = Rf + β × ERP + CRP + γ (size) */
export function computeCostOfEquity(inputs: Pick<WACCInputs, 'riskFreeRate' | 'equityRiskPremium' | 'beta' | 'countryRiskPremium' | 'sizePremium'>): number {
    const { riskFreeRate, equityRiskPremium, beta, countryRiskPremium = 0, sizePremium = 0 } = inputs
    return riskFreeRate + beta * equityRiskPremium + countryRiskPremium + sizePremium
}

/** After-tax cost of debt: Kd × (1 - t) */
export function costOfDebtAfterTax(costOfDebt: number, taxRate: number): number {
    return costOfDebt * (1 - taxRate)
}

/** Full WACC = E/V × Ke + D/V × Kd(1-t) + P/V × Kp */
export function computeWACC(inputs: WACCInputs): WACCResult {
    const ke = computeCostOfEquity(inputs)
    const kdAt = costOfDebtAfterTax(inputs.costOfDebt, inputs.taxRate)
    const kp = inputs.costOfPreferred ?? 0
    const wp = inputs.preferredWeight ?? 0

    const wacc = inputs.equityWeight * ke + inputs.debtWeight * kdAt + wp * kp

    return {
        costOfEquity: ke,
        costOfDebtAfterTax: kdAt,
        wacc,
        details: {
            capmFormula: `Ke = ${(inputs.riskFreeRate * 100).toFixed(2)}% + ${inputs.beta.toFixed(2)} × ${(inputs.equityRiskPremium * 100).toFixed(2)}% + ${((inputs.countryRiskPremium ?? 0) * 100).toFixed(2)}% + ${((inputs.sizePremium ?? 0) * 100).toFixed(2)}% = ${(ke * 100).toFixed(2)}%`,
            waccFormula: `WACC = ${(inputs.equityWeight * 100).toFixed(0)}% × ${(ke * 100).toFixed(2)}% + ${(inputs.debtWeight * 100).toFixed(0)}% × ${(kdAt * 100).toFixed(2)}% = ${(wacc * 100).toFixed(2)}%`,
            breakdown: [
                { label: 'Rf (tipo libre riesgo)', value: inputs.riskFreeRate },
                { label: 'β × ERP', value: inputs.beta * inputs.equityRiskPremium },
                { label: 'Prima riesgo país', value: inputs.countryRiskPremium ?? 0 },
                { label: 'Prima tamaño (SME)', value: inputs.sizePremium ?? 0 },
                { label: 'Ke (coste equity)', value: ke },
                { label: 'Kd antes impuestos', value: inputs.costOfDebt },
                { label: 'Kd después impuestos', value: kdAt },
                { label: 'WACC', value: wacc },
            ],
        },
    }
}

// ── SENSITIVITY MATRIX ────────────────────────────────────────

/** Generate a 2D sensitivity table: vary two parameters, compute equity value each time */
export function sensitivityMatrix(
    rowValues: number[],   // e.g. WACC range [0.07, 0.08, ..., 0.14]
    colValues: number[],   // e.g. terminal growth range [0.01, 0.015, 0.02, 0.025, 0.03]
    computeFn: (rowVal: number, colVal: number) => number,  // returns equity value
): ({ value: number; rowVal: number; colVal: number } | null)[][] {
    return rowValues.map(r => colValues.map(c => ({ value: computeFn(r, c), rowVal: r, colVal: c })))
}

/** Range generator helper */
export function range(start: number, end: number, steps: number): number[] {
    const delta = (end - start) / (steps - 1)
    return Array.from({ length: steps }, (_, i) => +(start + i * delta).toFixed(4))
}

// ── SPANISH REAL ESTATE SECTOR DEFAULTS ────────────────────────

export interface SpanishREDefaults {
    beta: number
    rf: number           // Bono español 10Y
    erp: number          // Equity Risk Premium (Damodaran Spain)
    crp: number          // Country Risk Premium
    sizePremium: number  // SME / private asset premium
    capRate: number      // Typical cap rate
    capRateHint: string  // Guidance text
    debtCost: number     // Typical mortgage / financing cost
    taxRate: number      // IRPF rendimientos capital / IS
    rentalGrowth: number // Typical growth %
    occupancy: number    // Typical occupancy %
    maintenancePct: number
    managementFeePct: number
}

/**
 * Spanish RE defaults by asset type — calibrated for 2025/2026
 * Sources: Banco de España, Damodaran, CBRE Spain, Idealista, INE
 */
export const SPANISH_RE_DEFAULTS: Record<string, SpanishREDefaults> = {
    local_comercial: {
        beta: 0.60, rf: 0.032, erp: 0.058, crp: 0.0072, sizePremium: 0.02,
        capRate: 0.055, capRateHint: 'Madrid prime: 4.0–4.5%, Barcelona: 4.2–5.0%, secundario: 5.5–7.0%',
        debtCost: 0.04, taxRate: 0.25, rentalGrowth: 0.025, occupancy: 0.92,
        maintenancePct: 0.06, managementFeePct: 0.08,
    },
    oficina: {
        beta: 0.65, rf: 0.032, erp: 0.058, crp: 0.0072, sizePremium: 0.02,
        capRate: 0.045, capRateHint: 'Madrid CBD: 3.5–4.0%, Barcelona 22@: 3.8–4.5%, periferia: 5.5–7.0%',
        debtCost: 0.04, taxRate: 0.25, rentalGrowth: 0.02, occupancy: 0.88,
        maintenancePct: 0.05, managementFeePct: 0.10,
    },
    vivienda: {
        beta: 0.45, rf: 0.032, erp: 0.058, crp: 0.0072, sizePremium: 0.015,
        capRate: 0.05, capRateHint: 'Madrid/Barcelona centro: 3.5–4.5%, capitales provincia: 5.0–6.5%, costa: 4.5–6.0%',
        debtCost: 0.035, taxRate: 0.19, rentalGrowth: 0.03, occupancy: 0.95,
        maintenancePct: 0.04, managementFeePct: 0.06,
    },
    piso: {
        beta: 0.45, rf: 0.032, erp: 0.058, crp: 0.0072, sizePremium: 0.015,
        capRate: 0.052, capRateHint: 'Madrid centro: 3.8–4.5%, periferia: 5.0–6.0%, ciudades medias: 5.5–7.5%',
        debtCost: 0.035, taxRate: 0.19, rentalGrowth: 0.03, occupancy: 0.95,
        maintenancePct: 0.04, managementFeePct: 0.06,
    },
    nave: {
        beta: 0.70, rf: 0.032, erp: 0.058, crp: 0.0072, sizePremium: 0.025,
        capRate: 0.065, capRateHint: 'Corredor Henares: 4.5–5.5%, logístico prime: 4.0–5.0%, secundario: 6.5–8.0%',
        debtCost: 0.045, taxRate: 0.25, rentalGrowth: 0.02, occupancy: 0.90,
        maintenancePct: 0.03, managementFeePct: 0.05,
    },
    garaje: {
        beta: 0.35, rf: 0.032, erp: 0.058, crp: 0.0072, sizePremium: 0.025,
        capRate: 0.06, capRateHint: 'Madrid centro: 4.0–5.5%, periferia: 6.0–8.0%',
        debtCost: 0.035, taxRate: 0.19, rentalGrowth: 0.015, occupancy: 0.90,
        maintenancePct: 0.02, managementFeePct: 0.05,
    },
    suelo: {
        beta: 0.80, rf: 0.032, erp: 0.058, crp: 0.0072, sizePremium: 0.03,
        capRate: 0.04, capRateHint: 'Suelo urbano: yield implícito bajo, prima por revalorización',
        debtCost: 0.05, taxRate: 0.25, rentalGrowth: 0.02, occupancy: 1.0,
        maintenancePct: 0.01, managementFeePct: 0.02,
    },
}

/** Get defaults for a given Spanish real estate asset type */
export function getSpanishREDefaults(assetType: string): SpanishREDefaults {
    return SPANISH_RE_DEFAULTS[assetType] ?? SPANISH_RE_DEFAULTS['vivienda']
}
