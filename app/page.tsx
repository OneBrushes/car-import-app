"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { CarImport } from "@/components/tabs/car-import"
import { CarsSpain } from "@/components/tabs/cars-spain"
import { ComparativeAnalysis } from "@/components/tabs/comparative-analysis"
import { CarsManagement } from "@/components/tabs/cars-management"
import { ReportGenerator } from "@/components/tabs/report-generator"
import { AdminPanel } from "@/components/tabs/admin-panel"
import { ProfitableCars } from "@/components/tabs/profitable-cars"
import { ChecklistTab } from "@/components/tabs/checklist-tab"
import { Dashboard } from "@/components/dashboard"
import { CarsMap } from "@/components/tabs/cars-map"
import { Navigation } from "@/components/navigation"
import { OnlineUsers } from "@/components/online-users"
import { NotificationsCenter } from "@/components/notifications-center"
import { ThemeToggle } from "@/components/theme-toggle"
import { CompanyRoadmap } from "@/components/tabs/company-roadmap"
import { GlobalExpenses } from "@/components/tabs/global-expenses"
import { getNavGroups } from "@/components/navigation"
import { ImportCalculator } from "@/components/tabs/import-calculator"
import { CustomersTab } from "@/components/tabs/customers-tab"
import { FiscalSummary } from "@/components/tabs/fiscal-summary"
import { DonationsTab } from "@/components/tabs/donations-tab"
import { RemindersTab } from "@/components/tabs/reminders-tab"
import { BlogTab } from "@/components/tabs/blog-tab"
import { exportToExcel } from "@/lib/excel-export"
import { toast } from "sonner"
import { CommandPalette, CommandPaletteTrigger, OPEN_CAR_EVENT } from "@/components/command-palette"
import { ConnectionStatus } from "@/components/connection-status"
import { LiveCursors } from "@/components/live-cursors"
import { useAuth } from "@/components/auth-provider"
import { Loader2, LogOut, User as UserIcon, Shield, Menu, FileSpreadsheet } from "lucide-react"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

type TabType = "dashboard" | "import" | "spain" | "comparison" | "calculator" | "customers" | "fiscal" | "reminders" | "management" | "report" | "profitable" | "admin" | "checklist" | "donations" | "map" | "roadmap" | "expenses" | "blog"

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabType>("dashboard")
  const [isDark, setIsDark] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [role, setRole] = useState<string | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [donationsEnabled, setDonationsEnabled] = useState(false)
  const [cursorsVisible, setCursorsVisible] = useState(true)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const { user, loading, signOut } = useAuth()
  const router = useRouter()

  useEffect(() => {
    setMounted(true)
    const isDarkMode = document.documentElement.classList.contains("dark")
    setIsDark(isDarkMode)

    const observer = new MutationObserver(() => {
      const isDarkNow = document.documentElement.classList.contains("dark")
      setIsDark(isDarkNow)
    })
    observer.observe(document.documentElement, { attributes: true })

    const savedCursors = localStorage.getItem("showLiveCursors")
    if (savedCursors !== null) setCursorsVisible(JSON.parse(savedCursors))

    try {
      setSidebarCollapsed(localStorage.getItem("sidebarCollapsed") === "true")
    } catch { }

    return () => {
      observer.disconnect()
    }
  }, [])

  // ?tab=…&car=…&table=… (enlaces desde el garaje virtual)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const tab = params.get("tab")
    const valid: TabType[] = ["dashboard", "import", "spain", "comparison", "calculator", "customers", "fiscal", "reminders", "management", "report", "profitable", "admin", "checklist", "donations", "map", "roadmap", "expenses", "blog"]
    if (tab && (valid as string[]).includes(tab)) setActiveTab(tab as TabType)
    const car = params.get("car")
    const table = params.get("table")
    if (car && (table === "inventory_cars" || table === "imported_cars" || table === "spain_cars")) {
      pendingCarRef.current = { table, id: car }
    }
    if (tab || car) window.history.replaceState(null, "", window.location.pathname)
  }, [])

  // El coche se abre cuando las pestañas ya están montadas (tras comprobar la sesión)
  const pendingCarRef = useRef<{ table: string; id: string } | null>(null)
  useEffect(() => {
    if (loading || !user || !pendingCarRef.current) return
    const detail = pendingCarRef.current
    pendingCarRef.current = null
    const timer = setTimeout(() => window.dispatchEvent(new CustomEvent(OPEN_CAR_EVENT, { detail })), 300)
    return () => clearTimeout(timer)
  }, [loading, user])

  useEffect(() => {
    try { sessionStorage.setItem("nordrive-return-path", `/?tab=${activeTab}`) } catch { }
  }, [activeTab])

  const toggleSidebar = () => {
    setSidebarCollapsed(prev => {
      try { localStorage.setItem("sidebarCollapsed", String(!prev)) } catch { }
      return !prev
    })
  }

  const handleTabSelect = (tab: TabType) => {
    setActiveTab(tab)
    setMobileNavOpen(false)
  }

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login")
    } else if (user) {
      // Cargar rol y avatar
      supabase
        .from('profiles')
        .select('role, avatar_url')
        .eq('id', user.id)
        .single()
        .then(({ data }) => {
          if (data) {
            setRole(data.role)
            setAvatarUrl(data.avatar_url)
          }
        })

      // Cargar configuración global (donaciones)
      const loadDonationsConfig = async () => {
        const { data, error } = await supabase
          .from('app_settings')
          .select('value')
          .eq('key', 'donations_enabled')
          .single()

        console.log('Donations config:', { data, error })

        if (data) {
          setDonationsEnabled(data.value)
        } else {
          // Si no existe, por defecto false
          setDonationsEnabled(false)
        }
      }

      loadDonationsConfig()

      // Subscribe to realtime changes in app_settings
      const channel = supabase
        .channel('app_settings_changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'app_settings',
            filter: 'key=eq.donations_enabled'
          },
          (payload) => {
            if (payload.new && 'value' in payload.new) {
              setDonationsEnabled(payload.new.value)
            }
          }
        )
        .subscribe()

      return () => {
        channel.unsubscribe()
      }
    }
  }, [user, loading, router])

  // Listen for tab change events from notifications
  useEffect(() => {
    const handleTabChange = (event: CustomEvent) => {
      const { tab } = event.detail
      setActiveTab(tab as TabType)
    }

    window.addEventListener('changeTab', handleTabChange as EventListener)

    return () => {
      window.removeEventListener('changeTab', handleTabChange as EventListener)
    }
  }, [])

  if (!mounted || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!user) return null

  // Cuenta creada sin invitación: no ve nada hasta que un admin le dé un rol
  if (role === 'pendiente') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md space-y-4 rounded-2xl border bg-card p-8 text-center shadow-sm">
          <h1 className="text-xl font-semibold">Tu cuenta está pendiente de aprobación</h1>
          <p className="text-sm text-muted-foreground">
            Un administrador de NorDrive tiene que darte acceso. En cuanto lo haga, podrás entrar con tu correo y contraseña.
          </p>
          <button onClick={() => signOut()} className="text-sm font-medium text-primary hover:underline">Cerrar sesión</button>
        </div>
      </div>
    )
  }

  const handleToggleTheme = () => {
    setIsDark(!isDark)
  }

  const navGroups = getNavGroups(role, donationsEnabled)
  const currentGroup = navGroups.find(group => group.items.some(item => item.id === activeTab))
  const currentItem = currentGroup?.items.find(item => item.id === activeTab)

  return (
    <div className="min-h-screen bg-background text-foreground flex relative w-full overflow-x-clip">
      <LiveCursors />
      <CommandPalette navGroups={navGroups} onNavigate={(tab) => handleTabSelect(tab as TabType)} />
      {/* Connection Status Indicator */}
      <ConnectionStatus />

      {/* Sidebar - Desktop */}
      <aside
        className={cn(
          "hidden md:block sticky top-0 h-screen shrink-0 border-r border-sidebar-border transition-[width] duration-200",
          sidebarCollapsed ? "w-[64px]" : "w-60"
        )}
      >
        <Navigation
          activeTab={activeTab}
          onTabChange={handleTabSelect}
          role={role}
          donationsVisible={donationsEnabled}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={toggleSidebar}
        />
      </aside>

      {/* Sidebar - Mobile */}
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="w-64 p-0 gap-0 [&>button]:hidden">
          <SheetTitle className="sr-only">Menú de navegación</SheetTitle>
          <Navigation
            activeTab={activeTab}
            onTabChange={handleTabSelect}
            role={role}
            donationsVisible={donationsEnabled}
          />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 h-14 border-b bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-full max-w-[1600px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              variant="ghost"
              size="icon-sm"
              className="md:hidden"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Abrir menú"
            >
              <Menu className="h-5 w-5" />
            </Button>
            <div className="flex min-w-0 items-center gap-1.5 text-sm">
              {currentGroup && (
                <>
                  <span className="hidden text-muted-foreground sm:inline">{currentGroup.label}</span>
                  <span className="hidden text-muted-foreground/50 sm:inline">/</span>
                </>
              )}
              <span className="truncate font-medium">{currentItem?.label ?? "NorDrive"}</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <CommandPaletteTrigger />
            <OnlineUsers activeTab={activeTab} />
            <NotificationsCenter />
            <ThemeToggle isDark={isDark} onToggle={handleToggleTheme} />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="relative h-8 w-8 rounded-full overflow-hidden border border-border hover:opacity-80 transition-opacity">
                  <Avatar className="h-full w-full">
                    <AvatarImage src={avatarUrl || ""} />
                    <AvatarFallback className="bg-primary/10 text-primary">
                      {user.email?.substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">Mi Cuenta</p>
                    <p className="text-xs leading-none text-muted-foreground truncate">
                      {user.email}
                    </p>
                    {(role === 'admin' || role === 'super_admin') && (
                      <Badge variant="outline" className="mt-1 w-fit text-[10px] px-1 py-0 h-4">Admin</Badge>
                    )}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    const promise = exportToExcel({ includeGlobalExpenses: role === 'importador' || role === 'admin' || role === 'super_admin' })
                    toast.promise(promise, { loading: "Preparando Excel…", success: "Excel descargado", error: "No se pudo exportar" })
                  }}
                >
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                  <span>Exportar a Excel</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push("/profile")}>
                  <UserIcon className="mr-2 h-4 w-4" />
                  <span>Perfil</span>
                </DropdownMenuItem>
                {(role === 'admin' || role === 'super_admin') && (
                  <DropdownMenuItem onClick={() => setActiveTab('admin')}>
                    <Shield className="mr-2 h-4 w-4" />
                    <span>Panel Admin</span>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => signOut()}>
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Cerrar sesión</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">
        <div className="max-w-[1600px] mx-auto w-full">
          <div className="p-4 sm:p-6 lg:p-8 relative">
            <div className={activeTab === "dashboard" ? "block animate-in fade-in duration-300" : "hidden"}>
              <Dashboard isActive={activeTab === "dashboard"} />
            </div>
            <div className={activeTab === "import" ? "block animate-in fade-in duration-300" : "hidden"}>
              <CarImport role={role} />
            </div>
            <div className={activeTab === "spain" ? "block animate-in fade-in duration-300" : "hidden"}>
              <CarsSpain role={role} />
            </div>
            <div className={activeTab === "map" ? "block animate-in fade-in duration-300" : "hidden"}>
              <CarsMap />
            </div>
            <div className={activeTab === "comparison" ? "block animate-in fade-in duration-300" : "hidden"}>
              <ComparativeAnalysis />
            </div>
            <div className={activeTab === "calculator" ? "block animate-in fade-in duration-300" : "hidden"}>
              <ImportCalculator />
            </div>
            <div className={activeTab === "customers" && (role === 'gestor' || role === 'importador' || role === 'admin' || role === 'super_admin') ? "block animate-in fade-in duration-300" : "hidden"}>
              <CustomersTab role={role} />
            </div>
            <div className={activeTab === "fiscal" && (role === 'importador' || role === 'admin' || role === 'super_admin') ? "block animate-in fade-in duration-300" : "hidden"}>
              <FiscalSummary isActive={activeTab === "fiscal"} />
            </div>
            <div className={activeTab === "blog" && (role === 'gestor' || role === 'importador' || role === 'admin' || role === 'super_admin') ? "block animate-in fade-in duration-300" : "hidden"}>
              <BlogTab isActive={activeTab === "blog"} />
            </div>
            <div className={activeTab === "reminders" ? "block animate-in fade-in duration-300" : "hidden"}>
              <RemindersTab isActive={activeTab === "reminders"} />
            </div>
            <div className={activeTab === "management" && (role === 'gestor' || role === 'importador' || role === 'admin' || role === 'super_admin') ? "block animate-in fade-in duration-300" : "hidden"}>
              <CarsManagement isActive={activeTab === "management"} />
            </div>
            <div className={activeTab === "report" && (role === 'importador' || role === 'admin' || role === 'super_admin') ? "block animate-in fade-in duration-300" : "hidden"}>
              <ReportGenerator />
            </div>
            <div className={activeTab === "profitable" ? "block animate-in fade-in duration-300" : "hidden"}>
              <ProfitableCars role={role || 'usuario'} />
            </div>
            <div className={activeTab === "checklist" && (role === 'importador' || role === 'admin' || role === 'super_admin') ? "block animate-in fade-in duration-300" : "hidden"}>
              <ChecklistTab />
            </div>
            <div className={activeTab === "donations" ? "block animate-in fade-in duration-300" : "hidden"}>
              {(donationsEnabled || role === "admin" || role === "super_admin") && <DonationsTab />}
            </div>
            <div className={activeTab === "roadmap" ? "block animate-in fade-in duration-300" : "hidden"}>
              <CompanyRoadmap role={role} />
            </div>
            <div className={activeTab === "expenses" ? "block animate-in fade-in duration-300" : "hidden"}>
              <GlobalExpenses role={role} />
            </div>
            <div className={activeTab === "admin" && (role === 'admin' || role === 'super_admin') ? "block animate-in fade-in duration-300" : "hidden"}>
              <AdminPanel />
            </div>
          </div>
        </div>
      </main>
      </div>
    </div>
  )
}
