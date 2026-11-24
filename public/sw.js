// Service worker de NorDrive: solo para poder instalar la app y recibir notificaciones push.
// No guarda nada en caché (la app siempre carga la última versión de la red).
self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()))

self.addEventListener("push", event => {
    let msg = { title: "NorDrive", body: "" }
    try { if (event.data) msg = { ...msg, ...event.data.json() } } catch { if (event.data) msg.body = event.data.text() }
    event.waitUntil(self.registration.showNotification(msg.title, {
        body: msg.body,
        icon: "/icons/icon-negro-192.png",
        badge: "/icons/badge-96.png",
        tag: msg.tag || undefined,
        renotify: Boolean(msg.tag),
        data: { url: msg.url || "/?tab=claude" },
    }))
})

self.addEventListener("notificationclick", event => {
    event.notification.close()
    const url = new URL(event.notification.data?.url || "/", self.location.origin).href
    event.waitUntil((async () => {
        const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true })
        for (const win of wins) {
            if (new URL(win.url).origin !== self.location.origin) continue
            await win.focus()
            try { await win.navigate(url) } catch { }
            return
        }
        await self.clients.openWindow(url)
    })())
})
