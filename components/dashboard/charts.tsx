"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ResponsiveLine } from '@nivo/line'
import { ResponsiveBar } from '@nivo/bar'
import { ResponsivePie } from '@nivo/pie'

interface DashboardChartsProps {
    boughtCars: any[]
    importedCars: any[]
}

export function DashboardCharts({ boughtCars, importedCars }: DashboardChartsProps) {
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
                    profitColor: profit >= 0 ? 'hsl(142, 76%, 36%)' : 'hsl(0, 84%, 60%)'
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

    return (
        <div className="grid gap-6 lg:grid-cols-2 mt-6">
            {/* Gráfico 1: Evolución Temporal */}
            <Card className="lg:col-span-2">
                <CardHeader>
                    <CardTitle>Evolución de Compras</CardTitle>
                    <CardDescription>Coches comprados por mes</CardDescription>
                </CardHeader>
                <CardContent>
                    <div style={{ height: '350px' }}>
                        {monthlyData[0]?.data.length > 0 ? (
                            <ResponsiveLine
                                data={monthlyData}
                                margin={{ top: 20, right: 20, bottom: 70, left: 60 }}
                                xScale={{ type: 'point' }}
                                yScale={{ type: 'linear', min: 'auto', max: 'auto', stacked: false }}
                                curve="monotoneX"
                                axisBottom={{
                                    tickRotation: -45,
                                    legend: 'Mes',
                                    legendOffset: 50,
                                    legendPosition: 'middle'
                                }}
                                axisLeft={{
                                    legend: 'Cantidad',
                                    legendOffset: -50,
                                    legendPosition: 'middle'
                                }}
                                colors={{ scheme: 'nivo' }}
                                pointSize={8}
                                pointColor={{ theme: 'background' }}
                                pointBorderWidth={2}
                                pointBorderColor={{ from: 'serieColor' }}
                                enablePointLabel={true}
                                pointLabel="y"
                                pointLabelYOffset={-12}
                                useMesh={true}
                                theme={{
                                    axis: {
                                        ticks: {
                                            text: { fill: 'hsl(var(--muted-foreground))' }
                                        },
                                        legend: {
                                            text: { fill: 'hsl(var(--foreground))' }
                                        }
                                    },
                                    grid: {
                                        line: { stroke: 'hsl(var(--border))' }
                                    }
                                }}
                            />
                        ) : (
                            <div className="flex items-center justify-center h-full text-muted-foreground">
                                No hay datos suficientes
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Gráfico 2: Rentabilidad por Coche */}
            <Card>
                <CardHeader>
                    <CardTitle>Top 10 Rentabilidad</CardTitle>
                    <CardDescription>Beneficio por coche vendido</CardDescription>
                </CardHeader>
                <CardContent>
                    <div style={{ height: '350px' }}>
                        {profitabilityData.length > 0 ? (
                            <ResponsiveBar
                                data={profitabilityData}
                                keys={['profit']}
                                indexBy="car"
                                margin={{ top: 20, right: 20, bottom: 100, left: 60 }}
                                padding={0.3}
                                colors={(bar) => (bar.data as any).profitColor}
                                axisBottom={{
                                    tickRotation: -45,
                                    legend: 'Coche',
                                    legendPosition: 'middle',
                                    legendOffset: 70
                                }}
                                axisLeft={{
                                    legend: 'Beneficio (€)',
                                    legendPosition: 'middle',
                                    legendOffset: -50
                                }}
                                labelSkipWidth={12}
                                labelSkipHeight={12}
                                theme={{
                                    axis: {
                                        ticks: {
                                            text: { fill: 'hsl(var(--muted-foreground))' }
                                        },
                                        legend: {
                                            text: { fill: 'hsl(var(--foreground))' }
                                        }
                                    },
                                    grid: {
                                        line: { stroke: 'hsl(var(--border))' }
                                    }
                                }}
                            />
                        ) : (
                            <div className="flex items-center justify-center h-full text-muted-foreground">
                                No hay coches vendidos
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Gráfico 3: Distribución por País */}
            <Card>
                <CardHeader>
                    <CardTitle>Distribución por País</CardTitle>
                    <CardDescription>Origen de los coches importados</CardDescription>
                </CardHeader>
                <CardContent>
                    <div style={{ height: '350px' }}>
                        {countryData.length > 0 ? (
                            <ResponsivePie
                                data={countryData}
                                margin={{ top: 20, right: 80, bottom: 20, left: 80 }}
                                innerRadius={0.5}
                                padAngle={0.7}
                                cornerRadius={3}
                                activeOuterRadiusOffset={8}
                                colors={{ scheme: 'nivo' }}
                                borderWidth={1}
                                borderColor={{ from: 'color', modifiers: [['darker', 0.2]] }}
                                arcLinkLabelsSkipAngle={10}
                                arcLinkLabelsTextColor="hsl(var(--foreground))"
                                arcLinkLabelsThickness={2}
                                arcLinkLabelsColor={{ from: 'color' }}
                                arcLabelsSkipAngle={10}
                                arcLabelsTextColor="#ffffff"
                                theme={{
                                    labels: {
                                        text: { fill: 'hsl(var(--foreground))' }
                                    },
                                    tooltip: {
                                        container: {
                                            background: 'hsl(var(--background))',
                                            color: 'hsl(var(--foreground))',
                                            fontSize: '12px',
                                            borderRadius: '6px',
                                            boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                                            border: '1px solid hsl(var(--border))'
                                        }
                                    }
                                }}
                            />
                        ) : (
                            <div className="flex items-center justify-center h-full text-muted-foreground">
                                No hay datos de países
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Gráfico 4: Precio Promedio por Marca */}
            <Card className="lg:col-span-2">
                <CardHeader>
                    <CardTitle>Precio Promedio por Marca</CardTitle>
                    <CardDescription>Top 8 marcas más caras</CardDescription>
                </CardHeader>
                <CardContent>
                    <div style={{ height: '350px' }}>
                        {brandPriceData.length > 0 ? (
                            <ResponsiveBar
                                data={brandPriceData}
                                keys={['avgPrice']}
                                indexBy="brand"
                                margin={{ top: 20, right: 20, bottom: 60, left: 80 }}
                                padding={0.3}
                                layout="horizontal"
                                colors={{ scheme: 'category10' }}
                                axisBottom={{
                                    legend: 'Precio Promedio (€)',
                                    legendPosition: 'middle',
                                    legendOffset: 50
                                }}
                                axisLeft={{
                                    legend: 'Marca',
                                    legendPosition: 'middle',
                                    legendOffset: -70
                                }}
                                labelSkipWidth={12}
                                labelSkipHeight={12}
                                theme={{
                                    axis: {
                                        ticks: {
                                            text: { fill: 'hsl(var(--muted-foreground))' }
                                        },
                                        legend: {
                                            text: { fill: 'hsl(var(--foreground))' }
                                        }
                                    },
                                    grid: {
                                        line: { stroke: 'hsl(var(--border))' }
                                    }
                                }}
                            />
                        ) : (
                            <div className="flex items-center justify-center h-full text-muted-foreground">
                                No hay datos de marcas
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
