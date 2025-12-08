"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { CarImport } from "@/components/tabs/car-import"
import { CarsSpain } from "@/components/tabs/cars-spain"
import { ComparativeAnalysis } from "@/components/tabs/comparative-analysis"
import { CarsManagement } from "@/components/tabs/cars-management"
import { ReportGenerator } from "@/components/tabs/report-generator"
import { AdminPanel } from "@/components/tabs/admin-panel"
import { ProfitableCars } from "@/components/tabs/profitable-cars"
import { Dashboard } from "@/components/dashboard"
import { Navigation } from "@/components/navigation"
import { ThemeToggle } from "@/components/theme-toggle"
import { ExportImportTools } from "@/components/export-import-tools"
import { useAuth } from "@/components/auth-provider"
import { Loader2, LogOut, User as UserIcon, Shield } from "lucide-react"
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

type TabType = "dashboard" | "import" | "spain" | "comparison" | "management" | "report" | "profitable" | "admin"

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabType>("dashboard")
  const [isDark, setIsDark] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [role, setRole] = useState<string | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
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

    return () => {
      observer.disconnect()
    }
  }, [])

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
    }
  }, [user, loading, router])

  if (!mounted || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!user) return null

  const handleToggleTheme = () => {
    setIsDark(!isDark)
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 glass border-b">
        <div className="max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <span className="text-lg font-bold text-primary">🚗</span>
            </div>
            <div className="hidden sm:block">
              <h1 className="text-lg font-semibold">NorDrive</h1>
              <p className="text-xs text-muted-foreground">Gestión de importación</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {role === 'admin' && (
              <Button
                variant={activeTab === 'admin' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setActiveTab('admin')}
                className="gap-2 hidden md:flex"
              >
                <Shield className="h-4 w-4" />
                Admin
              </Button>
            )}

            <ExportImportTools />
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
                    {role === 'admin' && (
                      <Badge variant="outline" className="mt-1 w-fit text-[10px] px-1 py-0 h-4">Admin</Badge>
                    )}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.push("/profile")}>
                  <UserIcon className="mr-2 h-4 w-4" />
                  <span>Perfil</span>
                </DropdownMenuItem>
                {role === 'admin' && (
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

      {/* Navigation - Desktop */}
      <div className="hidden md:block border-b sticky top-16 z-30 bg-background">
        <Navigation activeTab={activeTab} onTabChange={setActiveTab} role={role} />
      </div>

      {/* Navigation - Mobile */}
      <div className="md:hidden border-b sticky top-16 z-30 bg-background px-4 py-2">
        <Navigation activeTab={activeTab} onTabChange={setActiveTab} role={role} />
      </div>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-[1920px] mx-auto w-full">
          <div className="p-4 sm:p-6 lg:p-8">
            {activeTab === "dashboard" && <Dashboard />}
            {activeTab === "import" && <CarImport role={role} />}
            {activeTab === "spain" && <CarsSpain role={role} />}
            {activeTab === "comparison" && <ComparativeAnalysis />}
            {activeTab === "management" && (role === 'gestor' || role === 'importador' || role === 'admin') && <CarsManagement />}
            {activeTab === "report" && (role === 'importador' || role === 'admin') && <ReportGenerator />}
            {activeTab === "profitable" && <ProfitableCars role={role || 'usuario'} />}
            {activeTab === "admin" && role === 'admin' && <AdminPanel />}
          </div>
        </div>
      </main>
    </div>
  )
}
