"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { CarImport } from "@/components/tabs/car-import"
import { CarsSpain } from "@/components/tabs/cars-spain"
import { ComparativeAnalysis } from "@/components/tabs/comparative-analysis"
import { CarsManagement } from "@/components/tabs/cars-management"
import { ReportGenerator } from "@/components/tabs/report-generator"
import { Dashboard } from "@/components/dashboard"
import { Navigation } from "@/components/navigation"
import { ThemeToggle } from "@/components/theme-toggle"
import { ExportImportTools } from "@/components/export-import-tools"
import { useAuth } from "@/components/auth-provider"
import { Loader2, LogOut, User as UserIcon } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"

type TabType = "dashboard" | "import" | "spain" | "comparison" | "management" | "report"

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabType>("dashboard")
  const [isDark, setIsDark] = useState(false)
  const [mounted, setMounted] = useState(false)
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
              <h1 className="text-lg font-semibold">AutoImport Pro</h1>
              <p className="text-xs text-muted-foreground">Gestión de importación</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <ExportImportTools />
            <ThemeToggle isDark={isDark} onToggle={handleToggleTheme} />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="relative h-8 w-8 rounded-full overflow-hidden border border-border hover:opacity-80 transition-opacity">
                  <Avatar className="h-full w-full">
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
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.push("/profile")}>
                  <UserIcon className="mr-2 h-4 w-4" />
                  <span>Perfil</span>
                </DropdownMenuItem>
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
        <Navigation activeTab={activeTab} onTabChange={setActiveTab} />
      </div>

      {/* Navigation - Mobile */}
      <div className="md:hidden border-b sticky top-16 z-30 bg-background px-4 py-2">
        <Navigation activeTab={activeTab} onTabChange={setActiveTab} />
      </div>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-[1920px] mx-auto w-full">
          <div className="p-4 sm:p-6 lg:p-8">
            {activeTab === "dashboard" && <Dashboard />}
            {activeTab === "import" && <CarImport />}
            {activeTab === "spain" && <CarsSpain />}
            {activeTab === "comparison" && <ComparativeAnalysis />}
            {activeTab === "management" && <CarsManagement />}
            {activeTab === "report" && <ReportGenerator />}
          </div>
        </div>
      </main>
    </div>
  )
}
