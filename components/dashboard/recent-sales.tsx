import { Receipt } from "lucide-react"

interface RecentSalesSectionProps {
  boughtCars: any[]
}

const formatMoney = (value: number) =>
  `${Number(value).toLocaleString("es-ES", { maximumFractionDigits: 0 })} €`

export function RecentSalesSection({ boughtCars }: RecentSalesSectionProps) {
  const recentSales = boughtCars
    .filter((car) => car.status === "sold" && car.sellPrice)
    .sort((a, b) => new Date(b.dateSold!).getTime() - new Date(a.dateSold!).getTime())
    .slice(0, 5)

  return (
    <section className="rounded-xl border bg-card p-5 shadow-xs">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
          <Receipt className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h3 className="text-sm font-semibold tracking-tight">Últimas ventas</h3>
          <p className="text-[13px] text-muted-foreground">Los 5 coches vendidos más recientes</p>
        </div>
      </div>

      {recentSales.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-10 text-center">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">Todavía no hay ventas registradas</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="pb-2 pr-4 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Coche</th>
                <th className="pb-2 pr-4 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Fecha</th>
                <th className="pb-2 pr-4 text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Venta</th>
                <th className="pb-2 text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Beneficio</th>
              </tr>
            </thead>
            <tbody>
              {recentSales.map((car) => {
                const totalInvested =
                  car.initialPrice +
                  car.initialExpenses +
                  (car.expenses?.reduce((sum: number, e: any) => sum + e.amount, 0) || 0)
                const profit = car.sellPrice - totalInvested
                const profitClass = profit > 0 ? "text-success" : "text-destructive"

                return (
                  <tr key={car.id} className="border-b last:border-0 transition-colors hover:bg-accent/50">
                    <td className="py-3 pr-4 font-medium">
                      {car.brand} {car.model}
                    </td>
                    <td className="py-3 pr-4 tabular whitespace-nowrap text-muted-foreground">
                      {new Date(car.dateSold).toLocaleDateString("es-ES")}
                    </td>
                    <td className="py-3 pr-4 text-right tabular whitespace-nowrap">{formatMoney(car.sellPrice)}</td>
                    <td className="py-3 text-right whitespace-nowrap">
                      <div className={`tabular font-medium ${profitClass}`}>
                        {profit > 0 ? "+" : ""}
                        {formatMoney(profit)}
                      </div>
                      <div className="tabular text-xs text-muted-foreground">
                        {((profit / totalInvested) * 100).toFixed(0)}%
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
