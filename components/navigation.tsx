"use client"

import {
  Car, MapPin, Scale, Archive, Home, FileText, TrendingUp, CheckSquare, Heart,
  Map as MapIcon, Network, Wallet, EyeOff, Eye, Shield, PanelLeftClose, PanelLeftOpen, Calculator, Users, Newspaper, Landmark, Warehouse,
  type LucideIcon,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useAuth } from "./auth-provider"
import { EasterEggs } from "./easter-eggs"
import { cn } from "@/lib/utils"

const ALL_ROLES = ['usuario', 'gestor', 'importador', 'admin', 'super_admin']
const MANAGER_ROLES = ['gestor', 'importador', 'admin', 'super_admin']
const IMPORTER_ROLES = ['importador', 'admin', 'super_admin']
const ADMIN_ROLES = ['admin', 'super_admin']

export interface NavItem {
  id: string
  label: string
  icon: LucideIcon
  roles: string[]
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

export function getNavGroups(role: string | null | undefined, donationsVisible: boolean): NavGroup[] {
  const isAdmin = role === 'admin' || role === 'super_admin'

  const groups: NavGroup[] = [
    {
      label: "General",
      items: [
        { id: "dashboard", label: "Dashboard", icon: Home, roles: ALL_ROLES },
      ],
    },
    {
      label: "Vehículos",
      items: [
        { id: "import", label: "Importación", icon: Car, roles: ALL_ROLES },
        { id: "spain", label: "España", icon: MapPin, roles: ALL_ROLES },
        { id: "comparison", label: "Comparativa", icon: Scale, roles: ALL_ROLES },
        { id: "calculator", label: "Calculadora", icon: Calculator, roles: ALL_ROLES },
        { id: "profitable", label: "Rentables", icon: TrendingUp, roles: ALL_ROLES },
        { id: "map", label: "Mapa", icon: MapIcon, roles: ALL_ROLES },
      ],
    },
    {
      label: "Operaciones",
      items: [
        { id: "management", label: "Comprados", icon: Archive, roles: MANAGER_ROLES },
        { id: "customers", label: "Clientes", icon: Users, roles: MANAGER_ROLES },
        { id: "expenses", label: "Gastos", icon: Wallet, roles: IMPORTER_ROLES },
        { id: "fiscal", label: "Fiscal", icon: Landmark, roles: IMPORTER_ROLES },
        { id: "checklist", label: "Checklist", icon: CheckSquare, roles: IMPORTER_ROLES },
        { id: "report", label: "Informe", icon: FileText, roles: IMPORTER_ROLES },
      ],
    },
    {
      label: "Empresa",
      items: [
        { id: "roadmap", label: "Roadmap", icon: Network, roles: IMPORTER_ROLES },
        ...(donationsVisible || isAdmin
          ? [{ id: "donations", label: "Donaciones", icon: Heart, roles: ALL_ROLES }]
          : []),
        { id: "admin", label: "Administración", icon: Shield, roles: ADMIN_ROLES },
      ],
    },
    {
      label: "Web",
      items: [
        { id: "blog", label: "Blog", icon: Newspaper, roles: MANAGER_ROLES },
      ],
    },
  ]

  return groups
    .map(group => ({ ...group, items: group.items.filter(item => !role || item.roles.includes(role)) }))
    .filter(group => group.items.length > 0)
}

interface NavigationProps {
  activeTab: string
  onTabChange: (tab: any) => void
  role?: string | null
  donationsVisible?: boolean
  collapsed?: boolean
  onToggleCollapsed?: () => void
}

export function Navigation({
  activeTab,
  onTabChange,
  role,
  donationsVisible = false,
  collapsed = false,
  onToggleCollapsed,
}: NavigationProps) {
  const { isGodMode, toggleGodMode, profile } = useAuth()
  const router = useRouter()
  const isSuperAdmin = profile?.role === 'super_admin'
  const groups = getNavGroups(role, donationsVisible)

  const openGarage = () => {
    // Al salir del garaje se vuelve exactamente a esta pestaña
    try { sessionStorage.setItem("nordrive-return-path", `/?tab=${activeTab}`) } catch { }
    router.push("/garage")
  }

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      {/* Marca */}
      <div className={cn("flex h-14 shrink-0 items-center gap-3 border-b border-sidebar-border", collapsed ? "justify-center px-2" : "px-4")}>
        <div className="shrink-0 cursor-pointer">
          <EasterEggs onLogoClick={() => { }} />
        </div>
        {!collapsed && (
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-semibold text-foreground">NorDrive</p>
            <p className="truncate text-xs text-muted-foreground">Gestión de importación</p>
          </div>
        )}
      </div>

      {/* Secciones */}
      <nav className="scrollbar-thin flex-1 overflow-y-auto px-2 py-3">
        {groups.map((group, index) => (
          <div key={group.label} className={cn(index > 0 && "mt-5")}>
            {collapsed ? (
              index > 0 && <div className="mx-2 mb-3 border-t border-sidebar-border" />
            ) : (
              <p className="mb-1 px-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">
                {group.label}
              </p>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon
                const isActive = activeTab === item.id
                return (
                  <li key={item.id}>
                    <button
                      onClick={() => onTabChange(item.id)}
                      title={collapsed ? item.label : undefined}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "group relative flex h-9 w-full items-center gap-3 rounded-md text-sm transition-colors",
                        collapsed ? "justify-center px-0" : "px-3",
                        isActive
                          ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                          : "hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                      )}
                    >
                      {isActive && (
                        <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-sidebar-primary" />
                      )}
                      <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-sidebar-primary" : "text-muted-foreground group-hover:text-sidebar-accent-foreground")} />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Pie */}
      <div className="shrink-0 space-y-1 border-t border-sidebar-border p-2">
        <button
          onClick={openGarage}
          title="Garaje virtual"
          className={cn(
            "flex h-9 w-full items-center gap-3 rounded-md text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
            collapsed ? "justify-center px-0" : "px-3"
          )}
        >
          <Warehouse className="h-4 w-4 shrink-0 text-sidebar-primary" />
          {!collapsed && <span>Garaje virtual</span>}
        </button>
        {isSuperAdmin && (
          <button
            onClick={toggleGodMode}
            title={isGodMode ? "Modo Dios activado (viendo toda la empresa)" : "Modo aislado (viendo solo tus datos)"}
            className={cn(
              "flex h-9 w-full items-center gap-3 rounded-md border text-xs font-medium transition-colors",
              collapsed ? "justify-center px-0" : "px-3",
              isGodMode
                ? "border-warning/40 bg-warning/10 text-warning"
                : "border-transparent text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
            )}
          >
            {isGodMode ? <Eye className="h-4 w-4 shrink-0" /> : <EyeOff className="h-4 w-4 shrink-0" />}
            {!collapsed && <span>{isGodMode ? "Modo Dios" : "Modo aislado"}</span>}
          </button>
        )}
        {onToggleCollapsed && (
          <button
            onClick={onToggleCollapsed}
            title={collapsed ? "Expandir menú" : "Contraer menú"}
            className={cn(
              "flex h-9 w-full items-center gap-3 rounded-md text-xs text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
              collapsed ? "justify-center px-0" : "px-3"
            )}
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            {!collapsed && <span>Contraer menú</span>}
          </button>
        )}
      </div>
    </div>
  )
}
