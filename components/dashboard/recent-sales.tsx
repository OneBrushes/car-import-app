interface RecentSalesSectionProps {
  boughtCars: any[]
}

export function RecentSalesSection({ boughtCars }: RecentSalesSectionProps) {
  const recentSales = boughtCars
    .filter((car) => car.status === "sold" && car.sellPrice)
    .sort((a, b) => new Date(b.dateSold!).getTime() - new Date(a.dateSold!).getTime())
    .slice(0, 5)

  if (recentSales.length === 0) {
    return null
  }

  return (
    <div className="bg-card border border-border rounded-lg p-6">
      <h3 className="text-xl font-semibold mb-4">Últimas Ventas</h3>
      <div className="space-y-3">
        {recentSales.map((car) => {
          const totalInvested =
            car.initialPrice +
            car.initialExpenses +
            (car.expenses?.reduce((sum: number, e: any) => sum + e.amount, 0) || 0)
          const profit = car.sellPrice - totalInvested

          return (
            <div
              key={car.id}
              className="flex items-center justify-between p-4 bg-background/50 rounded-lg hover:bg-background transition-colors border border-border/50"
            >
              <div className="flex-1">
                <p className="font-medium">
                  {car.brand} {car.model}
                </p>
                <p className="text-sm text-muted-foreground">{new Date(car.dateSold).toLocaleDateString()}</p>
              </div>
              <div className="text-right">
                <p className={`font-bold ${profit > 0 ? "text-accent" : "text-destructive"}`}>
                  {profit > 0 ? "+" : ""}
                  {profit}€
                </p>
                <p className="text-sm text-muted-foreground">{((profit / totalInvested) * 100).toFixed(0)}%</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
