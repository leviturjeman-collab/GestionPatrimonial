export type ExpertiseLevel = 'easy' | 'intermediate' | 'pro'
export type AssetCategory = 'real_estate' | 'restaurant' | 'watch' | 'car' | 'other'
export type AssetStatus = 'active' | 'for_sale' | 'sold' | 'retired'
export type LiquidityLevel = 'high' | 'medium' | 'low'
export type ValuationMethod = 'dcf' | 'comps' | 'cost' | 'manual'
export type ConfidenceScore = 'high' | 'medium' | 'low'
export type OwnershipType = 'personal' | 'company' | 'co_ownership'
export type ScenarioType = 'conservative' | 'base' | 'optimistic'

export interface Profile {
    id: string
    full_name: string | null
    base_currency: string
    default_country: string
    expertise_level: ExpertiseLevel
    global_assumptions: Record<string, unknown>
    created_at: string
    updated_at: string
}

export interface CountryPreset {
    id: string
    user_id: string | null
    country_code: string
    country_name: string
    currency: string
    risk_free_rate: number
    equity_risk_premium: number
    country_risk_premium: number
    expected_inflation: number
    fx_vs_base: number
    effective_tax_rate: number
    is_default: boolean
    created_at: string
}

export interface Asset {
    id: string
    user_id: string
    name: string
    category: AssetCategory
    subcategory: string | null
    country_operating: string
    country_fiscal: string | null
    currency: string
    ownership_pct: number
    ownership_type: OwnershipType
    status: AssetStatus
    purchase_date: string | null
    purchase_cost: number | null
    preferred_valuation_method: ValuationMethod
    liquidity_level: LiquidityLevel
    liquidity_days_est: number | null
    tags: string[]
    notes: string | null
    sector_data: Record<string, unknown>
    created_at: string
    updated_at: string
    // Joined
    latest_valuation?: ValuationSnapshot | null
    total_debt?: number
}

export interface DebtFacility {
    id: string
    asset_id: string
    user_id: string
    lender: string | null
    debt_type: string
    outstanding_principal: number
    annual_interest_rate: number
    annual_payment: number
    maturity_date: string | null
    currency: string
    notes: string | null
    created_at: string
}

export interface ValuationSnapshot {
    id: string
    asset_id: string
    user_id: string
    snapshot_date: string
    value_low: number | null
    value_base: number
    value_high: number | null
    method_used: string
    confidence_score: ConfidenceScore
    drivers: string[]
    explanation: string | null
    assumptions_metadata: Record<string, unknown>
    engine_version: string
    created_at: string
}

export interface DCFModel {
    id: string
    asset_id: string
    user_id: string
    mode: 'easy' | 'pro'
    horizon_years: number
    revenue_year1: number | null
    revenue_growth_rate: number | null
    ebitda_margin: number | null
    capex_pct: number | null
    tax_rate: number | null
    wacc: number | null
    terminal_growth_rate: number | null
    fcf_type: 'fcff' | 'fcfe'
    risk_free_rate: number | null
    equity_risk_premium: number | null
    country_risk_premium: number | null
    beta: number | null
    debt_ratio: number | null
    cost_of_debt: number | null
    inflation_rate: number | null
    fx_rate: number
    terminal_method: 'gordon' | 'exit_multiple'
    exit_multiple: number | null
    full_inputs: Record<string, unknown>
    created_at: string
    updated_at: string
}

export interface Comparable {
    id: string
    asset_id: string
    user_id: string
    description: string
    sale_price: number | null
    sale_date: string | null
    metric_value: number | null
    metric_type: string | null
    source: string | null
    notes: string | null
    created_at: string
}

export interface Scenario {
    id: string
    asset_id: string
    user_id: string
    name: string
    scenario_type: ScenarioType
    horizon_years: number
    assumptions: Record<string, unknown>
    projected_values: Record<string, unknown>
    created_at: string
}

// Valuation engine types
export interface ValuationResult {
    low: number
    base: number
    high: number
    confidence: ConfidenceScore
    method: ValuationMethod
    drivers: string[]
    explanation: string
    assumptions: Record<string, unknown>
}

export interface DCFInputsEasy {
    revenue: number
    revenueGrowthRate: number
    ebitdaMargin: number
    capexLevel: 'low' | 'medium' | 'high'
    taxRate: number
    discountRate: number
    terminalGrowthRate: number
    horizonYears: number
    fxRate?: number
}

export interface RealEstateInputsEasy {
    grossRentalIncome: number
    expenses: number
    occupancyRate: number
    rentalGrowthRate: number
    capRate: number
    discountRate: number
    horizonYears: number
    debt: number
}
