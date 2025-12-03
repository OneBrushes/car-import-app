"use client"

import { Moon, Sun } from "lucide-react"

interface ThemeToggleProps {
  isDark: boolean
  onToggle?: () => void
}

export function ThemeToggle({ isDark, onToggle }: ThemeToggleProps) {
  const handleToggle = () => {
    const newIsDark = !isDark
    localStorage.setItem("theme", newIsDark ? "dark" : "light")

    if (newIsDark) {
      document.documentElement.classList.add("dark")
    } else {
      document.documentElement.classList.remove("dark")
    }

    // Notificar al padre para actualizar el estado
    if (onToggle) {
      onToggle()
    }
  }

  return (
    <button
      onClick={handleToggle}
      className="p-2 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
      aria-label="Toggle theme"
    >
      {isDark ? <Sun className="w-5 h-5 text-primary" /> : <Moon className="w-5 h-5 text-muted-foreground" />}
    </button>
  )
}
