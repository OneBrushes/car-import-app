"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import { ResponsiveLine } from '@nivo/line'
import { ResponsiveBar } from '@nivo/bar'
import { ResponsivePie } from '@nivo/pie'
import { BarChart3 } from "lucide-react"

interface DashboardChartsProps {
    boughtCars: any[]
    importedCars: any[]
}

// SVG presentation attributes (fill/stroke) don't resolve CSS variables, so the
// design tokens are read from :root at runtime and re-read when the theme changes.
const TOKEN_NAMES = [
    'foreground', 'muted-foreground', 'border', 'card', 'popover', 'popover-foreground',
    'success', 'destructive', 'chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5',
] as const
type TokenName = typeof TOKEN_NAMES[number]
type Tokens = Record<TokenName, string>

const FALLBACK_TOKENS: Tokens = {
    'foreground': '#18181b',
    'muted-foreground': '#6b6b73',
    'border': '#e5e5e1',
    'card': '#ffffff',
    'popover': '#ffffff',
    'popover-foreground': '#18181b',
    'success': '#15803d',
    'destructive': '#dc2626',
    'chart-1': '#2b4acb',
    'chart-2': '#15803d',
    'chart-3': '#d97706',
    'chart-4': '#dc2626',
    'chart-5': '#7c3aed',
}

function readTokens(): Tokens {
    if (typeof window === 'undefined') return FALLBACK_TOKENS
    const styles = getComputedStyle(document.documentElement)
    const out = { ...FALLBACK_TOKENS }
    TOKEN_NAMES.forEach(name => {
        const value = styles.getPropertyValue(`--${name}`).trim()
        if (value) out[name] = value
    })
    return out
}

function useThemeTokens(): Tokens {
    const [tokens, setTokens] = useState<Tokens>(FALLBACK_TOKENS)

    useEffect(() => {
        const update = () => setTokens(readTokens())
        update()
        const observer = new MutationObserver(update)
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] })
        const media = window.matchMedia('(prefers-color-scheme: dark)')
        media.addEventListener('change', update)
        return () => {
            observer.disconnect()
            media.removeEventListener('change', update)
        }
    }, [])

    return tokens
}

const formatMoney = (value: number) =>
    `${Number(value).toLocaleString('es-ES', { maximumFractionDigits: 0 })} €`

const formatMoneyShort = (value: number) => {
    const n = Number(value)
    if (Math.abs(n) >= 1000) {
        return `${(n / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })}k €`
    }
    return formatMoney(n)
}

const truncate = (text: string, max = 14) =>
    text.length > max ? `${text.slice(0, max - 1)}…` : text

function ChartSection({
    title,
    description,
    className = "",
    children,
}: {
    title: string
    description: string
    className?: string
    children: ReactNode
}) {
    return (
        <section className={`rounded-xl border bg-card p-5 shadow-xs ${className}`}>
            <div className="mb-4">
                <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
                <p className="text-[13px] text-muted-foreground">{description}</p>
            </div>
            <div className="h-[300px]">{children}</div>
        </section>
    )
}

function ChartEmpty({ message }: { message: string }) {
    return (
        <div className="flex h-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed text-center">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">{message}</p>
        </div>
    )
}

function Tooltip({ color, label, value }: { color?: string; label: string; value: string }) {
    return (
        <div className="flex items-center gap-2 rounded-lg border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md">
            {color && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />}
            <span className="text-muted-foreground">{label}</span>
            <span className="tabular font-medium">{value}</span>
        </div>
    )
}

export function DashboardCharts({ boughtCars, importedCars }: DashboardChartsProps) {
    const tokens = useThemeTokens()

    const palette = [tokens['chart-1'], tokens['chart-2'], tokens['chart-3'], tokens['chart-4'], tokens['chart-5']]

    const nivoTheme = useMemo(() => ({
        background: 'transparent',
        text: { fill: tokens['muted-foreground'], fontSize: 11, fontFamily: 'inherit' },
        axis: {
            domain: { line: { stroke: 'transparent', strokeWidth: 0 } },
            ticks: {
                line: { stroke: tokens['border'], strokeWidth: 1 },
                text: { fill: tokens['muted-foreground'], fontSize: 11 },
            },
            legend: { text: { fill: tokens['muted-foreground'], fontSize: 11, fontWeight: 500 } },
        },
        grid: { line: { stroke: tokens['border'], strokeWidth: 1 } },
        labels: { text: { fill: tokens['foreground'], fontSize: 11 } },
        legends: { text: { fill: tokens['muted-foreground'], fontSize: 11 } },
        crosshair: { line: { stroke: tokens['muted-foreground'], strokeWidth: 1, strokeOpacity: 0.5 } },
        tooltip: {
            container: {
                background: tokens['popover'],
                color: tokens['popover-foreground'],
                fontSize: 12,
                borderRadius: 8,
                border: `1px solid ${tokens['border']}`,
                boxShadow: '0 4px 12px -2px rgb(0 0 0 / 0.12)',
                padding: '6px 10px',
            },
        },
    }), [tokens])

    // 1. Gráfico de Evolución Temporal (Coches añadidos por mes)
    const getMonthlyData = () => {
        const monthlyCount: Record<string, number> = {}

        boughtCars.forEach(car => {
            const date = new Date(car.datePurchased)
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
            monthlyCount[monthKey] = (monthlyCount[monthKey] || 0) + 1
        })

        return [{
            id: "Coches Comprados",
            data: Object.entries(monthlyCount)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([month, count]) => ({
                    x: month,
                    y: count
                }))
        }]
    }

    // 2. Gráfico de Rentabilidad por Coche
    const getProfitabilityData = () => {
        return boughtCars
            .filter(car => car.status === 'sold' && car.sellPrice)
            .slice(0, 10) // Top 10
            .map(car => {
                const totalCost = car.initialPrice + (car.initialExpenses || 0)
                const profit = (car.sellPrice || 0) - totalCost
                return {
                    car: `${car.brand} ${car.model}`,
                    profit: profit,
                    profitColor: profit >= 0 ? tokens['success'] : tokens['destructive']
                }
            })
            .sort((a, b) => b.profit - a.profit)
    }

    // 3. Gráfico de Distribución por País
    const getCountryDistribution = () => {
        const countryCount: Record<string, number> = {}

        importedCars.forEach(car => {
            const country = (car as any).origin || 'Desconocido'
            countryCount[country] = (countryCount[country] || 0) + 1
        })

        return Object.entries(countryCount).map(([country, count]) => ({
            id: country,
            label: country,
            value: count
        }))
    }

    // 4. Gráfico de Comparativa de Precios por Marca
    const getBrandPriceComparison = () => {
        const brandData: Record<string, { total: number, count: number }> = {}

        importedCars.forEach(car => {
            const brand = car.brand
            if (!brandData[brand]) {
                brandData[brand] = { total: 0, count: 0 }
            }
            brandData[brand].total += car.price
            brandData[brand].count += 1
        })

        return Object.entries(brandData)
            .map(([brand, data]) => ({
                brand,
                avgPrice: Math.round(data.total / data.count)
            }))
            .sort((a, b) => b.avgPrice - a.avgPrice)
            .slice(0, 8) // Top 8 marcas
    }

    const monthlyData = getMonthlyData()
    const profitabilityData = getProfitabilityData()
    const countryData = getCountryDistribution()
    const brandPriceData = getBrandPriceComparison()

    const formatMonth = (value: string) => {
        const [year, month] = String(value).split('-').map(Number)
        if (!year || !month) return String(value)
        return new Date(year, month - 1, 1).toLocaleDateString('es-ES', { month: 'short', year: '2-digit' })
    }

    return (
        <div className="grid gap-4 lg:grid-cols-2 mt-6">
            {/* Gráfico 1: Evolución Temporal */}
            <ChartSection
                title="Evolución de compras"
                description="Coches comprados cada mes"
                className="lg:col-span-2"
            >
                {monthlyData[0]?.data.length > 0 ? (
                    <ResponsiveLine
                        data={monthlyData}
                        margin={{ top: 16, right: 16, bottom: 36, left: 40 }}
                        xScale={{ type: 'point' }}
                        yScale={{ type: 'linear', min: 0, max: 'auto', stacked: false }}
                        curve="monotoneX"
                        axisBottom={{
                            tickSize: 0,
                            tickPadding: 10,
                            format: formatMonth,
                        }}
                        axisLeft={{
                            tickSize: 0,
                            tickPadding: 8,
                            tickValues: 5,
                            format: (v) => (Number.isInteger(Number(v)) ? String(v) : ''),
                        }}
                        enableGridX={false}
                        gridYValues={5}
                        colors={[tokens['chart-1']]}
                        lineWidth={2}
                        enableArea={true}
                        areaOpacity={0.08}
                        pointSize={6}
                        pointColor={tokens['card']}
                        pointBorderWidth={2}
                        pointBorderColor={{ from: 'seriesColor' }}
                        enablePointLabel={false}
                        useMesh={true}
                        enableCrosshair={true}
                        crosshairType="x"
                        tooltip={({ point }) => (
                            <Tooltip
                                color={point.seriesColor}
                                label={formatMonth(String(point.data.x))}
                                value={`${point.data.y} ${Number(point.data.y) === 1 ? 'coche' : 'coches'}`}
                            />
                        )}
                        theme={nivoTheme}
                    />
                ) : (
                    <ChartEmpty message="Aún no hay compras registradas" />
                )}
            </ChartSection>

            {/* Gráfico 2: Rentabilidad por Coche */}
            <ChartSection
                title="Rentabilidad por coche"
                description="Beneficio de los últimos 10 coches vendidos"
            >
                {profitabilityData.length > 0 ? (
                    <ResponsiveBar
                        data={profitabilityData}
                        keys={['profit']}
                        indexBy="car"
                        margin={{ top: 16, right: 16, bottom: 56, left: 56 }}
                        padding={0.55}
                        borderRadius={3}
                        colors={(bar) => (bar.data as any).profitColor}
                        valueFormat={(v) => formatMoney(Number(v))}
                        enableGridY={true}
                        gridYValues={5}
                        axisBottom={{
                            tickSize: 0,
                            tickPadding: 8,
                            tickRotation: -30,
                            format: (v) => truncate(String(v)),
                        }}
                        axisLeft={{
                            tickSize: 0,
                            tickPadding: 8,
                            tickValues: 5,
                            format: (v) => formatMoneyShort(Number(v)),
                        }}
                        enableLabel={false}
                        tooltip={({ indexValue, value, color }) => (
                            <Tooltip color={color} label={String(indexValue)} value={formatMoney(Number(value))} />
                        )}
                        theme={nivoTheme}
                    />
                ) : (
                    <ChartEmpty message="Todavía no hay coches vendidos" />
                )}
            </ChartSection>

            {/* Gráfico 3: Distribución por País */}
            <ChartSection
                title="Distribución por país"
                description="Origen de los coches importados"
            >
                {countryData.length > 0 ? (
                    <ResponsivePie
                        data={countryData}
                        margin={{ top: 24, right: 88, bottom: 24, left: 88 }}
                        innerRadius={0.62}
                        padAngle={1.2}
                        cornerRadius={3}
                        activeOuterRadiusOffset={4}
                        colors={palette}
                        borderWidth={0}
                        enableArcLabels={false}
                        arcLinkLabelsSkipAngle={10}
                        arcLinkLabelsTextColor={tokens['muted-foreground']}
                        arcLinkLabelsThickness={1}
                        arcLinkLabelsColor={tokens['border']}
                        arcLinkLabelsDiagonalLength={10}
                        arcLinkLabelsStraightLength={12}
                        tooltip={({ datum }) => (
                            <Tooltip
                                color={datum.color}
                                label={String(datum.label)}
                                value={`${datum.value} ${datum.value === 1 ? 'coche' : 'coches'}`}
                            />
                        )}
                        theme={nivoTheme}
                    />
                ) : (
                    <ChartEmpty message="No hay datos de países" />
                )}
            </ChartSection>

            {/* Gráfico 4: Precio Promedio por Marca */}
            <ChartSection
                title="Precio medio por marca"
                description="Las 8 marcas con mayor precio medio en importación"
                className="lg:col-span-2"
            >
                {brandPriceData.length > 0 ? (
                    <ResponsiveBar
                        data={brandPriceData}
                        keys={['avgPrice']}
                        indexBy="brand"
                        margin={{ top: 8, right: 24, bottom: 32, left: 96 }}
                        padding={0.5}
                        borderRadius={3}
                        layout="horizontal"
                        colors={[tokens['chart-1']]}
                        valueFormat={(v) => formatMoney(Number(v))}
                        enableGridX={true}
                        enableGridY={false}
                        gridXValues={5}
                        axisBottom={{
                            tickSize: 0,
                            tickPadding: 8,
                            tickValues: 5,
                            format: (v) => formatMoneyShort(Number(v)),
                        }}
                        axisLeft={{
                            tickSize: 0,
                            tickPadding: 10,
                            format: (v) => truncate(String(v)),
                        }}
                        enableLabel={false}
                        tooltip={({ indexValue, value, color }) => (
                            <Tooltip color={color} label={String(indexValue)} value={formatMoney(Number(value))} />
                        )}
                        theme={nivoTheme}
                    />
                ) : (
                    <ChartEmpty message="No hay datos de marcas" />
                )}
            </ChartSection>
        </div>
    )
}
