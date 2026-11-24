"use client"

import type React from "react"
import { Geist, Geist_Mono } from "next/font/google"
import { useState, useEffect } from "react"
import "./globals.css"

const geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans" })
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" })

import { AuthProvider } from "@/components/auth-provider"
import { Toaster } from "@/components/ui/sonner"

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const [isDark, setIsDark] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    // Verificar preferencia guardada o sistema
    const saved = localStorage.getItem("theme")
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
    const shouldBeDark = saved ? saved === "dark" : prefersDark
    setIsDark(shouldBeDark)
    if (shouldBeDark) {
      document.documentElement.classList.add("dark")
    }
    // Service worker: permite instalar la app y recibir notificaciones push
    if ("serviceWorker" in navigator && window.location.hostname !== "localhost") {
      navigator.serviceWorker.register("/sw.js").catch(() => { })
    }
  }, [])

  const toggleDarkMode = () => {
    const newIsDark = !isDark
    setIsDark(newIsDark)
    localStorage.setItem("theme", newIsDark ? "dark" : "light")
    if (newIsDark) {
      document.documentElement.classList.add("dark")
    } else {
      document.documentElement.classList.remove("dark")
    }
  }

  return (
    <html lang="es" className={`${geist.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <head>
        <title>NorDrive - Gestión de Importación</title>
        {/* App instalable (PWA): iconos generados con scripts/generar-iconos.mjs */}
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="theme-color" content="#000000" />
        <meta name="application-name" content="NorDrive" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="NorDrive" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon-negro-180.png" />
        <link rel="apple-touch-icon" sizes="120x120" href="/icons/apple-touch-icon-negro-120.png" />
        <link rel="apple-touch-icon" sizes="152x152" href="/icons/apple-touch-icon-negro-152.png" />
        <link rel="apple-touch-icon" sizes="167x167" href="/icons/apple-touch-icon-negro-167.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon-negro-180.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-negro-32.png" media="(prefers-color-scheme: light)" />
        <link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-blanco-32.png" media="(prefers-color-scheme: dark)" />
        <link rel="icon" type="image/png" sizes="96x96" href="/icons/favicon-negro-96.png" />
      </head>
      <body className={`font-sans antialiased`} suppressHydrationWarning>
        {mounted ? (
          <AuthProvider>
            {children}
            <Toaster />
          </AuthProvider>
        ) : (
          <div className="min-h-screen bg-background" />
        )}
      </body>
    </html>
  )
}


