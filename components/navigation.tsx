"use client"

import { Car, MapPin, Scale, Archive, Home, Menu, X, FileText, TrendingUp } from "lucide-react"
import { useState } from "react"

interface NavigationProps {
  activeTab: string
  onTabChange: (tab: any) => void
  role?: string | null
}

export function Navigation({ activeTab, onTabChange, role }: NavigationProps) {
  const [menuOpen, setMenuOpen] = useState(false)

  const allTabs = [
    { id: "dashboard", label: "Dashboard", icon: Home, roles: ['usuario', 'gestor', 'importador', 'admin'] },
    { id: "import", label: "Importación", icon: Car, roles: ['usuario', 'gestor', 'importador', 'admin'] },
    { id: "spain", label: "España", icon: MapPin, roles: ['usuario', 'gestor', 'importador', 'admin'] },
    { id: "comparison", label: "Comparativa", icon: Scale, roles: ['usuario', 'gestor', 'importador', 'admin'] },
    { id: "management", label: "Comprados", icon: Archive, roles: ['gestor', 'importador', 'admin'] },
    { id: "profitable", label: "Rentables", icon: TrendingUp, roles: ['usuario', 'gestor', 'importador', 'admin'] },
    { id: "report", label: "Informe", icon: FileText, roles: ['importador', 'admin'] },
  ]

  const tabs = allTabs.filter(tab => !role || tab.roles.includes(role))

  return (
    <>
      {/* Desktop Navigation */}
      <nav className="hidden md:flex gap-1 px-4 sm:px-6 lg:px-8 py-4 overflow-x-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors whitespace-nowrap ${isActive
                ? "bg-primary/10 text-primary font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                }`}
            >
              <Icon className="w-4 h-4" />
              <span className="text-sm">{tab.label}</span>
            </button>
          )
        })}
      </nav>

      {/* Mobile Menu Button */}
      <button
        onClick={() => setMenuOpen(!menuOpen)}
        className="md:hidden p-2 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
        aria-label="Toggle menu"
      >
        {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* Mobile Menu */}
      {menuOpen && (
        <div className="md:hidden fixed top-16 left-0 right-0 bg-background border-b border-border shadow-lg z-50">
          <nav className="flex flex-col">
            {tabs.map((tab) => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    onTabChange(tab.id)
                    setMenuOpen(false)
                  }}
                  className={`flex items-center gap-3 px-4 py-3 border-b border-border/50 transition-colors ${isActive
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                    }`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{tab.label}</span>
                </button>
              )
            })}
          </nav>
        </div>
      )}
    </>
  )
}
