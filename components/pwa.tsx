"use client"

// App instalable (ordenador y móvil) y notificaciones push.
//   - Ordenador (Chrome/Edge) y Android: botón "Instalar app" con el aviso nativo del navegador.
//   - iPhone/iPad: Safari no tiene botón de instalar → se explican los pasos (Compartir → Añadir a pantalla de inicio).
//     Las notificaciones en iPhone solo funcionan con la app abierta DESDE la pantalla de inicio (iOS 16.4 o posterior).
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Share, SquarePlus, Bell } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"

const API = process.env.NEXT_PUBLIC_MCP_WORKER || "https://nordrive-mcp.infonordrive.workers.dev"

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

export type PushState = "cargando" | "no-soportado" | "instalar-primero" | "bloqueado" | "desactivado" | "activado"

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

function deviceName() {
  const ua = navigator.userAgent
  const os = /iphone/i.test(ua) ? "iPhone" : /ipad/i.test(ua) || isIos() ? "iPad" : /android/i.test(ua) ? "Android" : /windows/i.test(ua) ? "Windows" : /mac os/i.test(ua) ? "Mac" : "Otro"
  const browser = /edg\//i.test(ua) ? "Edge" : /chrome|crios/i.test(ua) ? "Chrome" : /firefox|fxios/i.test(ua) ? "Firefox" : /safari/i.test(ua) ? "Safari" : ""
  return `${os}${browser ? ` · ${browser}` : ""}${isStandalone() ? " (app)" : ""}`
}

function keyBytes(b64url: string) {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (b64url.length % 4)) % 4)
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0))
}

async function api(path: string, body?: unknown) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error("Inicia sesión de nuevo")
  const res = await fetch(`${API}/api/push/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || `Error ${res.status}`)
  return json
}

export function usePwa(pushEnabled: boolean) {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)
  const [ios, setIos] = useState(false)
  const [iosHelpOpen, setIosHelpOpen] = useState(false)
  const [push, setPush] = useState<PushState>("cargando")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setIos(isIos())
    setInstalled(isStandalone())
    const onPrompt = (e: Event) => { e.preventDefault(); setInstallEvent(e as BeforeInstallPromptEvent) }
    const onInstalled = () => { setInstalled(true); setInstallEvent(null); toast.success("NorDrive instalada") }
    window.addEventListener("beforeinstallprompt", onPrompt)
    window.addEventListener("appinstalled", onInstalled)
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled) }
  }, [])

  const refreshPush = useCallback(async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setPush(isIos() && !isStandalone() ? "instalar-primero" : "no-soportado")
      return
    }
    if (Notification.permission === "denied") { setPush("bloqueado"); return }
    const reg = await navigator.serviceWorker.getRegistration()
    const sub = await reg?.pushManager.getSubscription()
    setPush(sub ? "activado" : "desactivado")
  }, [])

  useEffect(() => { if (pushEnabled) refreshPush().catch(() => setPush("no-soportado")) }, [pushEnabled, refreshPush])

  /** Instalar: aviso nativo (Chrome/Edge/Android) o instrucciones (iPhone/iPad y Safari) */
  const install = useCallback(async () => {
    if (installEvent) {
      await installEvent.prompt()
      const { outcome } = await installEvent.userChoice
      if (outcome === "accepted") setInstallEvent(null)
      return
    }
    setIosHelpOpen(true)
  }, [installEvent])

  const enablePush = useCallback(async () => {
    if (push === "instalar-primero") { setIosHelpOpen(true); return }
    setBusy(true)
    try {
      // Hay que pedir el permiso directamente con el toque (el iPhone no lo deja después de un await)
      const permission = await Notification.requestPermission()
      if (permission !== "granted") { setPush(permission === "denied" ? "bloqueado" : "desactivado"); toast.error("No has dado permiso para las notificaciones"); return }
      const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"))
      await navigator.serviceWorker.ready
      const { publicKey } = await api("clave")
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }))
      await api("suscribir", { subscription: sub.toJSON(), dispositivo: deviceName() })
      setPush("activado")
      toast.success("Notificaciones activadas en este dispositivo")
    } catch (e) {
      toast.error(`No se pudieron activar: ${e instanceof Error ? e.message : String(e)}`)
      refreshPush().catch(() => { })
    } finally { setBusy(false) }
  }, [push, refreshPush])

  const disablePush = useCallback(async () => {
    setBusy(true)
    try {
      const reg = await navigator.serviceWorker.getRegistration()
      const sub = await reg?.pushManager.getSubscription()
      if (sub) { await api("baja", { endpoint: sub.endpoint }).catch(() => { }); await sub.unsubscribe() }
      setPush("desactivado")
      toast.success("Notificaciones desactivadas en este dispositivo")
    } finally { setBusy(false) }
  }, [])

  const testPush = useCallback(async () => {
    setBusy(true)
    try {
      const r = await api("prueba", {})
      toast.success(`Prueba enviada a ${r.enviados} de ${r.dispositivos} dispositivo(s)`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally { setBusy(false) }
  }, [])

  return {
    /** Se puede ofrecer "Instalar app" (no está ya instalada en este dispositivo) */
    canInstall: !installed && (Boolean(installEvent) || ios),
    ios, installed, install, iosHelpOpen, setIosHelpOpen,
    push, busy, enablePush, disablePush, testPush,
  }
}

export function IosInstallDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Añadir NorDrive a la pantalla de inicio</DialogTitle>
          <DialogDescription>En el iPhone o iPad, desde Safari:</DialogDescription>
        </DialogHeader>
        <ol className="space-y-3 text-sm">
          <li className="flex gap-3"><Share className="h-5 w-5 shrink-0 text-primary" /><span>Toca el botón <b>Compartir</b> (el cuadrado con la flecha hacia arriba, abajo en el iPhone).</span></li>
          <li className="flex gap-3"><SquarePlus className="h-5 w-5 shrink-0 text-primary" /><span>Baja y toca <b>Añadir a pantalla de inicio</b> → <b>Añadir</b>.</span></li>
          <li className="flex gap-3"><Bell className="h-5 w-5 shrink-0 text-primary" /><span>Abre NorDrive <b>desde el icono nuevo</b>, entra en tu cuenta y, en el menú de tu avatar, toca <b>Activar notificaciones</b>.</span></li>
        </ol>
        <p className="text-xs text-muted-foreground">Las notificaciones en iPhone necesitan iOS 16.4 o posterior y solo funcionan en la app abierta desde la pantalla de inicio, no en Safari.</p>
        <p className="text-xs text-muted-foreground">En un ordenador con Safari: menú <b>Archivo → Añadir al Dock</b>. Con Chrome o Edge: el icono de instalar de la barra de direcciones.</p>
      </DialogContent>
    </Dialog>
  )
}
