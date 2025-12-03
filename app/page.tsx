"use client"

import { useState, useEffect } from "react"
import { CarImport } from "@/components/tabs/car-import"
import { CarsSpain } from "@/components/tabs/cars-spain"
import { ComparativeAnalysis } from "@/components/tabs/comparative-analysis"
import { CarsManagement } from "@/components/tabs/cars-management"
import { ReportGenerator } from "@/components/tabs/report-generator"
import { Dashboard } from "@/components/dashboard"
import { Navigation } from "@/components/navigation"
import { ThemeToggle } from "@/components/theme-toggle"
import { ExportImportTools } from "@/components/export-import-tools"

type TabType = "dashboard" | "import" | "spain" | "comparison" | "management" | "report"

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabType>("dashboard")
  const [isDark, setIsDark] = useState(false)
  const [mounted, setMounted] = useState(false)

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

  if (!mounted) return null

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
