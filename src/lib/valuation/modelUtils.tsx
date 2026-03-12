/**
 * Shared DCF Model Utilities
 * Color standards: blue=inputs, gold=formulas, green=outputs
 */
import React from 'react'
import { Info } from 'lucide-react'

// ── Formatters ───────────────────────────────────────────────
export const fmtN = (n: number, d = 0) =>
    isNaN(n) ? '—' : n.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d })
export const fmtEur = (n: number) => `${fmtN(Math.round(n))} €`
export const fmtPct = (n: number, d = 1) => `${(n * 100).toFixed(d)}%`
export const num = (s: string) => parseFloat(String(s).replace(',', '.')) || 0
export const pct = (s: string) => num(s) / 100

// ── Color tokens ─────────────────────────────────────────────
export const BLUE_BG = 'rgba(59,130,246,0.10)'   // inputs
export const BLUE_BD = 'rgba(59,130,246,0.35)'
export const BLUE_CLR = '#93c5fd'
export const GOLD_BG = 'rgba(201,164,78,0.08)'   // formulas
export const GOLD_CLR = 'var(--text-gold)'
export const GREEN_BG = 'rgba(34,197,94,0.08)'    // outputs
export const GREEN_CLR = '#4ade80'
export const RED_CLR = '#f87171'

// ── Input cell (blue) ────────────────────────────────────────
export function InputCell({
    label, value, onChange, unit, hint, type = 'number', placeholder = '0', width
}: {
    label: string; value: string; onChange: (v: string) => void
    unit?: string; hint?: string; type?: string; placeholder?: string; width?: string
}) {
    const [sh, setSh] = React.useState(false)
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#93c5fd', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
                {unit && <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600 }}>[{unit}]</span>}
                {hint && (
                    <button type="button" onClick={() => setSh(s => !s)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#93c5fd', padding: 0, lineHeight: 1 }}>
                        <Info size={11} />
                    </button>
                )}
            </div>
            {sh && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 6, padding: '0.4rem 0.6rem', lineHeight: 1.5, marginBottom: 2 }}>{hint}</div>}
            <input
                type={type} value={value} placeholder={placeholder}
                onChange={e => onChange(e.target.value)}
                style={{
                    width: width ?? '100%', padding: '0.45rem 0.6rem',
                    background: BLUE_BG, border: `1px solid ${BLUE_BD}`,
                    borderRadius: 6, color: BLUE_CLR, fontWeight: 600, fontSize: '0.875rem',
                    outline: 'none', fontFamily: 'var(--font-display)',
                }}
                onFocus={e => (e.currentTarget.style.boxShadow = '0 0 0 2px rgba(59,130,246,0.35)')}
                onBlur={e => (e.currentTarget.style.boxShadow = 'none')}
            />
        </div>
    )
}

// ── Formula cell (gold) ──────────────────────────────────────
export function FormulaCell({ label, value, formula, subValue }: {
    label: string; value: string; formula?: string; subValue?: string
}) {
    return (
        <div style={{ background: GOLD_BG, border: `1px solid rgba(201,164,78,0.25)`, borderRadius: 6, padding: '0.5rem 0.75rem' }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1rem', color: GOLD_CLR }}>{value}</div>
            {formula && <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2, fontStyle: 'italic' }}>{formula}</div>}
            {subValue && <div style={{ fontSize: '0.75rem', color: '#d4ac5a' }}>{subValue}</div>}
        </div>
    )
}

// ── Output cell (green) ──────────────────────────────────────
export function OutputCell({ label, value, sub, large }: {
    label: string; value: string; sub?: string; large?: boolean
}) {
    return (
        <div style={{ background: GREEN_BG, border: `1px solid rgba(34,197,94,0.3)`, borderRadius: 6, padding: '0.6rem 0.75rem' }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'rgba(74,222,128,0.7)', marginBottom: 2 }}>{label}</div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: large ? '1.25rem' : '1rem', color: GREEN_CLR }}>{value}</div>
            {sub && <div style={{ fontSize: '0.72rem', color: 'rgba(74,222,128,0.7)', marginTop: 2 }}>{sub}</div>}
        </div>
    )
}

// ── Section header ───────────────────────────────────────────
export function SectionHeader({ title, color = 'var(--text-gold)' }: { title: string; color?: string }) {
    return (
        <div style={{ gridColumn: '1 / -1', borderBottom: `1px solid ${color}40`, paddingBottom: '0.4rem', marginTop: '0.75rem', marginBottom: '0.25rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color }}>{title}</span>
        </div>
    )
}

// ── Projection table ─────────────────────────────────────────
export function ProjTable({ headers, rows, footerRows }: {
    headers: string[]
    rows: { label: string; values: (number | string)[]; isFormula?: boolean; isOutput?: boolean; bold?: boolean; indent?: boolean; negative?: boolean }[]
    footerRows?: { label: string; values: (number | string)[]; isOutput?: boolean }[]
}) {
    const colWidth = `${Math.floor(80 / (headers.length - 1))}%`
    return (
        <div className="table-container" style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid var(--border-subtle)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                <thead>
                    <tr style={{ background: 'var(--black-850)' }}>
                        {headers.map((h, i) => (
                            <th key={i} style={{
                                padding: '0.5rem 0.75rem', textAlign: i === 0 ? 'left' : 'right',
                                fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.08em',
                                textTransform: 'uppercase', color: 'var(--text-muted)',
                                width: i === 0 ? '20%' : colWidth, borderBottom: '1px solid var(--border-subtle)',
                            }}>{h}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, ri) => {
                        const bg = row.isOutput ? GREEN_BG : row.isFormula ? GOLD_BG : 'transparent'
                        const clr = row.isOutput ? GREEN_CLR : row.isFormula ? GOLD_CLR : 'var(--text-secondary)'
                        return (
                            <tr key={ri} style={{ background: bg, borderBottom: '1px solid var(--border-muted)' }}>
                                <td style={{ padding: '0.45rem 0.75rem', paddingLeft: row.indent ? '1.5rem' : '0.75rem', color: clr, fontWeight: row.bold ? 700 : 500, fontSize: '0.8rem' }}>{row.label}</td>
                                {row.values.map((v, vi) => {
                                    const vNum = typeof v === 'number' ? v : num(String(v))
                                    const isNeg = row.negative || vNum < 0
                                    return (
                                        <td key={vi} style={{
                                            padding: '0.45rem 0.75rem', textAlign: 'right',
                                            fontWeight: row.bold ? 700 : 500,
                                            color: row.isOutput ? GREEN_CLR : row.isFormula ? GOLD_CLR : isNeg ? RED_CLR : 'var(--text-secondary)',
                                            fontFamily: 'var(--font-display)',
                                        }}>
                                            {typeof v === 'string' ? v : fmtEur(vNum)}
                                        </td>
                                    )
                                })}
                            </tr>
                        )
                    })}
                </tbody>
                {footerRows && (
                    <tfoot>
                        {footerRows.map((row, ri) => (
                            <tr key={ri} style={{ background: row.isOutput ? GREEN_BG : GOLD_BG, borderTop: '2px solid var(--border-subtle)' }}>
                                <td style={{ padding: '0.55rem 0.75rem', fontWeight: 800, fontSize: '0.8rem', color: row.isOutput ? GREEN_CLR : GOLD_CLR }}>{row.label}</td>
                                {row.values.map((v, vi) => (
                                    <td key={vi} style={{ padding: '0.55rem 0.75rem', textAlign: 'right', fontWeight: 800, fontFamily: 'var(--font-display)', color: row.isOutput ? GREEN_CLR : GOLD_CLR }}>
                                        {typeof v === 'string' ? v : fmtEur(typeof v === 'number' ? v : num(String(v)))}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tfoot>
                )}
            </table>
        </div>
    )
}

// ── Sensitivity 2D Table ─────────────────────────────────────
export function SensTable({
    rowLabel, colLabel, rowVals, colVals, matrix, baseRowIdx, baseColIdx
}: {
    rowLabel: string; colLabel: string
    rowVals: number[]; colVals: number[]
    matrix: number[][]
    baseRowIdx: number; baseColIdx: number
}) {
    return (
        <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: '0.8rem', width: '100%' }}>
                <thead>
                    <tr>
                        <th style={{ padding: '0.4rem 0.75rem', background: 'var(--black-850)', fontSize: '0.68rem', color: BLUE_CLR, whiteSpace: 'nowrap' }}>
                            {rowLabel} ↓ / {colLabel} →
                        </th>
                        {colVals.map((c, ci) => (
                            <th key={ci} style={{ padding: '0.4rem 0.5rem', background: ci === baseColIdx ? 'rgba(201,164,78,0.2)' : 'var(--black-850)', fontSize: '0.72rem', color: ci === baseColIdx ? GOLD_CLR : 'var(--text-muted)', textAlign: 'right' }}>
                                {fmtPct(c)}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rowVals.map((r, ri) => (
                        <tr key={ri}>
                            <td style={{ padding: '0.4rem 0.75rem', background: ri === baseRowIdx ? 'rgba(201,164,78,0.2)' : 'var(--black-850)', fontWeight: 700, color: ri === baseRowIdx ? GOLD_CLR : 'var(--text-muted)', fontSize: '0.72rem', whiteSpace: 'nowrap' }}>
                                {fmtPct(r)}
                            </td>
                            {colVals.map((_, ci) => {
                                const v = matrix[ri]?.[ci] ?? 0
                                const isBase = ri === baseRowIdx && ci === baseColIdx
                                const isHigh = v > (matrix[baseRowIdx]?.[baseColIdx] ?? 0) * 1.1
                                const isLow = v < (matrix[baseRowIdx]?.[baseColIdx] ?? 0) * 0.9
                                return (
                                    <td key={ci} style={{
                                        padding: '0.4rem 0.5rem', textAlign: 'right', fontWeight: isBase ? 800 : 500,
                                        fontFamily: 'var(--font-display)', fontSize: '0.8rem',
                                        background: isBase ? 'rgba(201,164,78,0.3)' : isHigh ? 'rgba(34,197,94,0.08)' : isLow ? 'rgba(239,68,68,0.08)' : 'transparent',
                                        color: isBase ? GOLD_CLR : isHigh ? GREEN_CLR : isLow ? RED_CLR : 'var(--text-secondary)',
                                        border: isBase ? '1px solid rgba(201,164,78,0.6)' : '1px solid transparent',
                                    }}>
                                        {fmtEur(v)}
                                    </td>
                                )
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}

// ── Scenario badges ──────────────────────────────────────────
export type Scenario = 'pessimistic' | 'base' | 'optimistic'
export const SCEN_LABELS: Record<Scenario, string> = { pessimistic: '🔴 Pesimista', base: '🟡 Base', optimistic: '🟢 Optimista' }
export const SCEN_COLORS: Record<Scenario, string> = { pessimistic: RED_CLR, base: GOLD_CLR, optimistic: GREEN_CLR }

// ── DCF core (reusable) ───────────────────────────────────────
export function discountCashFlows(fcfs: number[], wacc: number): number {
    return fcfs.reduce((sum, fcf, i) => sum + fcf / Math.pow(1 + wacc, i + 1), 0)
}

export function gordonTerminalValue(lastFCF: number, g: number, wacc: number): number {
    const gCapped = Math.min(g, wacc - 0.005)
    return (lastFCF * (1 + gCapped)) / (wacc - gCapped)
}

export function exitMultipleTerminalValue(ebitdaFinalYear: number, multiple: number): number {
    return ebitdaFinalYear * multiple
}
