"use client"

import { useEffect, useState } from "react"
import { Car, Archive, MapPin, Search } from "lucide-react"
import { supabase } from "@/lib/supabase"
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut,
} from "@/components/ui/command"
import type { NavGroup } from "@/components/navigation"

interface SearchableCar {
  id: string
  brand: string
  model: string
  year: number | null
}

interface CommandPaletteProps {
  navGroups: NavGroup[]
  onNavigate: (tab: string) => void
}

/** Evento para abrir un coche concreto desde fuera de su pestaña. */
export const OPEN_CAR_EVENT = "openCar"
export type OpenCarDetail = { table: "imported_cars" | "inventory_cars" | "spain_cars"; id: string }

export function CommandPalette({ navGroups, onNavigate }: CommandPaletteProps) {
  const [open, setOpen] = useState(false)
  const [imported, setImported] = useState<SearchableCar[]>([])
  const [inventory, setInventory] = useState<SearchableCar[]>([])
  const [spain, setSpain] = useState<SearchableCar[]>([])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setOpen(prev => !prev)
      }
    }
    const onOpenRequest = () => setOpen(true)
    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("openCommandPalette", onOpenRequest)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("openCommandPalette", onOpenRequest)
    }
  }, [])

  // Cargar los coches al abrir para que la búsqueda esté siempre al día
  useEffect(() => {
    if (!open) return
    const columns = "id, brand, model, year"
    supabase.from("imported_cars").select(columns).then(({ data }) => setImported((data as SearchableCar[]) || []))
    supabase.from("inventory_cars").select(columns).then(({ data }) => setInventory((data as SearchableCar[]) || []))
    supabase.from("spain_cars").select(columns).then(({ data }) => setSpain((data as SearchableCar[]) || []))
  }, [open])

  const go = (tab: string) => {
    setOpen(false)
    onNavigate(tab)
  }

  const openCar = (tab: string, detail: OpenCarDetail) => {
    go(tab)
    // Esperar a que la pestaña esté visible antes de pedirle que abra el coche
    setTimeout(() => window.dispatchEvent(new CustomEvent<OpenCarDetail>(OPEN_CAR_EVENT, { detail })), 50)
  }

  const carLabel = (car: SearchableCar) => `${car.brand} ${car.model}${car.year ? ` (${car.year})` : ""}`
  const tabAllowed = (tab: string) => navGroups.some(group => group.items.some(item => item.id === tab))

  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="Buscar" description="Busca coches o secciones">
      <CommandInput placeholder="Buscar coches, secciones…" />
      <CommandList>
        <CommandEmpty>Sin resultados.</CommandEmpty>

        <CommandGroup heading="Secciones">
          {navGroups.flatMap(group => group.items).map(item => {
            const Icon = item.icon
            return (
              <CommandItem key={item.id} value={`seccion ${item.label}`} onSelect={() => go(item.id)}>
                <Icon className="text-muted-foreground" />
                {item.label}
              </CommandItem>
            )
          })}
        </CommandGroup>

        {imported.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Importación">
              {imported.map(car => (
                <CommandItem key={car.id} value={`importacion ${carLabel(car)} ${car.id}`} onSelect={() => openCar("import", { table: "imported_cars", id: car.id })}>
                  <Car className="text-muted-foreground" />
                  {carLabel(car)}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {inventory.length > 0 && tabAllowed("management") && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Comprados">
              {inventory.map(car => (
                <CommandItem key={car.id} value={`comprado ${carLabel(car)} ${car.id}`} onSelect={() => openCar("management", { table: "inventory_cars", id: car.id })}>
                  <Archive className="text-muted-foreground" />
                  {carLabel(car)}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {spain.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="España">
              {spain.map(car => (
                <CommandItem key={car.id} value={`espana ${carLabel(car)} ${car.id}`} onSelect={() => openCar("spain", { table: "spain_cars", id: car.id })}>
                  <MapPin className="text-muted-foreground" />
                  {carLabel(car)}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  )
}

export function CommandPaletteTrigger() {
  return (
    <button
      onClick={() => window.dispatchEvent(new Event("openCommandPalette"))}
      className="hidden h-8 w-56 items-center gap-2 rounded-md border bg-background px-2.5 text-sm text-muted-foreground shadow-xs transition-colors hover:bg-accent lg:flex"
    >
      <Search className="h-4 w-4" />
      <span className="flex-1 text-left">Buscar…</span>
      <CommandShortcut className="rounded border bg-muted px-1.5 py-0.5 text-[10px] tracking-normal">Ctrl K</CommandShortcut>
    </button>
  )
}
