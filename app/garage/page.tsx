"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { LayoutDashboard, Loader2, Maximize2, Minus, Plus } from "lucide-react"
import { useAuth } from "@/components/auth-provider"
import { supabase } from "@/lib/supabase"
import {
    computeLayout, pointAlong, routeBetween, routeIn, routeLength, routeOut, spotsOfZone, streetEntry,
    truckCarPosition, zoneForStage, LABEL_BAND, TRUCK_CAPACITY, type GarageLayout, type Point, type Spot, type ZoneId,
} from "@/lib/garage/geometry"
import { iso, OFFICE_EXIT_PATH } from "@/lib/garage/world"
import { daylight } from "@/lib/garage/weather"
import { demoGarageData, fmtEur, loadGarageData, STAGE_LABEL, UNKNOWN, type GarageCar, type GarageData } from "@/lib/garage/data"
import { GarageScene, focusPoint, sceneBounds, type GarageTarget, type RenderedCar, type RenderedPerson } from "@/components/garage/scene"
import "@/components/garage/garage-styles.css"

/** Los coches de ejemplo solo existen en desarrollo, nunca en producción */
const DEV = process.env.NODE_ENV === "development"
/** Altura de la plataforma del camión portacoches sobre la calle (px) */
const DECK_Z = 18

const REFRESH_MS = 3 * 60 * 1000
const CAR_SPEED = 4.2        // baldosas por segundo
const WALK_SPEED = 1.6
const STAGGER_MS = 1100
const CAMERA_KEY = "garage-camera"
const RETURN_KEY = "nordrive-return-path"

interface Placed { stage: GarageCar["stage"]; x: number; y: number }
interface Motion { car: GarageCar; route: Point[]; start: number; leaving: boolean; z0?: number }
interface Walker { id: string; route: Point[]; start: number; pauseMs: number; seed: number }
interface ViewBox { x: number; y: number; w: number; h: number }

const TAB_FOR: Record<GarageTarget, string> = {
    dashboard: "dashboard", fiscal: "fiscal", customers: "customers", expenses: "expenses",
    reminders: "reminders", management: "management", import: "import",
}

function prefersReducedMotion() {
    return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

/** Dónde va cada coche según su etapa: plaza de su zona o hueco en un camión */
function placeCars(layout: GarageLayout, cars: GarageCar[]) {
    const positions = new Map<string, Point & { zone: ZoneId | "truck"; z: number; dir: "x" | "y"; spot?: Spot }>()
    const counters: Partial<Record<ZoneId, number>> = {}
    let truckIndex = 0
    for (const car of cars) {
        const zone = zoneForStage(car.stage)
        if (zone === "truck") {
            const p = truckCarPosition(layout, truckIndex++)
            positions.set(car.id, { x: p.x, y: p.y, zone, z: DECK_Z, dir: "x" })
        } else {
            const idx = counters[zone] ?? 0
            counters[zone] = idx + 1
            const spot = spotsOfZone(layout, zone)[idx]
            if (spot) positions.set(car.id, { x: spot.cx, y: spot.cy, zone, z: 0, dir: "y", spot })
        }
    }
    return positions
}

export default function GaragePage() {
    const router = useRouter()
    const { user, profile, isGodMode, loading: authLoading } = useAuth()
    const [demo, setDemo] = useState(false)
    const [demoCount, setDemoCount] = useState(14)
    const [data, setData] = useState<GarageData | null>(null)
    const [error, setError] = useState<string | null>(null)
    /** Solo en desarrollo: ?hora=23:30 simula otra hora (para ver la noche en las capturas) */
    const [timeOverride, setTimeOverride] = useState<string | null>(null)
    const [clock, setClock] = useState(() => new Date())
    const [now, setNow] = useState(() => performance.now())
    const [hover, setHover] = useState<{ car: GarageCar; x: number; y: number } | null>(null)

    const motionsRef = useRef<Map<string, Motion>>(new Map())
    const walkersRef = useRef<Walker[]>([])
    const placedRef = useRef<Map<string, Placed> | null>(null)
    const [, force] = useState(0)

    // --- Parámetros de la URL (demo para capturas, tema forzado) ---
    useEffect(() => {
        const params = new URLSearchParams(window.location.search)
        if (!DEV) return
        setDemo(params.get("demo") === "1")
        const count = Number(params.get("cars"))
        if (count > 0) setDemoCount(Math.min(400, count))
        const hora = params.get("hora")
        if (hora && /^\d{1,2}:\d{2}$/.test(hora)) setTimeOverride(hora)
    }, [])

    useEffect(() => {
        if (!demo && !authLoading && !user) router.push("/login")
    }, [demo, authLoading, user, router])

    // --- Carga de datos y refresco (intervalo + tiempo real) ---
    const load = useCallback(async () => {
        try {
            if (demo) {
                setData(demoGarageData(1, demoCount))
                return
            }
            if (!user) return
            const next = await loadGarageData({ userId: user.id, role: profile?.role ?? null, godMode: isGodMode })
            setData(next)
            setError(null)
        } catch (e: any) {
            setError(e.message || "No se pudieron cargar los datos")
        }
    }, [demo, demoCount, user, profile?.role, isGodMode])

    useEffect(() => {
        load()
        const timer = setInterval(load, REFRESH_MS)
        return () => clearInterval(timer)
    }, [load])

    useEffect(() => {
        if (demo || !user) return
        let debounce: ReturnType<typeof setTimeout> | null = null
        const schedule = () => { if (debounce) clearTimeout(debounce); debounce = setTimeout(load, 1500) }
        const channel = supabase
            .channel("garage-live")
            .on("postgres_changes", { event: "*", schema: "public", table: "inventory_cars" }, schedule)
            .on("postgres_changes", { event: "*", schema: "public", table: "imported_cars" }, schedule)
            .subscribe()
        return () => { if (debounce) clearTimeout(debounce); channel.unsubscribe() }
    }, [demo, user, load])

    useEffect(() => {
        const t = setInterval(() => setClock(new Date()), 30_000)
        return () => clearInterval(t)
    }, [])

    // --- Distribución ---
    const parkedCars = useMemo(() => (data?.cars ?? []).filter(c => c.stage !== "sold" || true), [data])
    const layout = useMemo(() => {
        const counts: Partial<Record<ZoneId, number>> = {}
        let transit = 0
        for (const car of parkedCars) {
            const zone = zoneForStage(car.stage)
            if (zone === "truck") transit++
            else counts[zone] = (counts[zone] ?? 0) + 1
        }
        return computeLayout({ counts, trucks: Math.ceil(transit / TRUCK_CAPACITY) })
    }, [parkedCars])
    const targets = useMemo(() => placeCars(layout, parkedCars), [layout, parkedCars])

    // --- Animaciones: comparar con lo que había antes (en esta visita o la anterior) ---
    useEffect(() => {
        if (!data) return
        const storageKey = `garage-last-seen-${demo ? "demo" : user?.id ?? "anon"}`
        let previous = placedRef.current
        if (!previous) {
            try {
                const raw = localStorage.getItem(storageKey)
                if (raw) previous = new Map(Object.entries(JSON.parse(raw)))
            } catch { }
        }
        const reduced = prefersReducedMotion()
        const start = performance.now()
        let order = 0

        if (previous && !reduced) {
            // Coches que se han ido (vendidos o ya no visibles): salen por la puerta
            for (const [id, old] of previous) {
                if (targets.has(id) || motionsRef.current.has(id)) continue
                const oldZone = zoneForStage(old.stage)
                const car: GarageCar = { ...(data.cars.find(c => c.id === id) ?? fallbackCar(id, old.stage)), stage: "sold" }
                const route = oldZone === "truck" ? [{ x: old.x, y: old.y }, streetEntry(layout)] : routeOut(layout, { x: old.x, y: old.y }, oldZone)
                motionsRef.current.set(id, { car, route, start: start + order++ * STAGGER_MS, leaving: true })
            }
            // Coches nuevos o que han cambiado de etapa
            for (const car of parkedCars) {
                const target = targets.get(car.id)
                if (!target || target.zone === "truck" || !target.spot) continue
                const old = previous.get(car.id)
                const spot = target.spot
                if (!old) {
                    motionsRef.current.set(car.id, { car, route: routeIn(layout, spot), start: start + order++ * STAGGER_MS, leaving: false })
                } else if (old.stage !== car.stage || Math.abs(old.x - target.x) > 0.01 || Math.abs(old.y - target.y) > 0.01) {
                    const oldZone = zoneForStage(old.stage)
                    const route = oldZone === "truck"
                        ? routeIn(layout, spot, { x: old.x, y: old.y })          // el camión lo descarga y entra
                        : old.stage === car.stage
                            ? [{ x: old.x, y: old.y }, { x: target.x, y: target.y }] // se recoloca en su zona
                            : routeBetween(layout, { x: old.x, y: old.y }, oldZone, spot)
                    motionsRef.current.set(car.id, { car, route, start: start + order++ * STAGGER_MS, leaving: false, z0: oldZone === "truck" ? DECK_Z : 0 })
                    // Alguien de la oficina va a ver el coche cuando cambia de etapa
                    if (old.stage !== car.stage && walkersRef.current.length < 3) {
                        // desde la oficina sale por su puerta, baja por el carril libre y se acerca al coche
                        const [inside, out] = OFFICE_EXIT_PATH
                        walkersRef.current.push({
                            id: `w-${car.id}-${start}`,
                            route: [inside, out, { x: layout.gate.x, y: out.y }, { x: layout.gate.x, y: spot.aisleY }, { x: target.x, y: spot.aisleY }],
                            start: start + order * STAGGER_MS + 600,
                            pauseMs: 3500,
                            seed: car.id.length * 7 + order,
                        })
                    }
                }
            }
        }

        const next = new Map<string, Placed>()
        for (const car of parkedCars) {
            const t = targets.get(car.id)
            if (t) next.set(car.id, { stage: car.stage, x: t.x, y: t.y })
        }
        placedRef.current = next
        try { localStorage.setItem(storageKey, JSON.stringify(Object.fromEntries(next))) } catch { }
        force(v => v + 1)
    }, [data, targets, layout, parkedCars, demo, user?.id])

    // Bucle de animación: solo corre mientras algo se mueve
    useEffect(() => {
        let frame = 0
        const tick = () => {
            const t = performance.now()
            setNow(t)
            for (const [id, m] of motionsRef.current) {
                const length = routeLength(m.route)
                if (t - m.start > (length / CAR_SPEED) * 1000) motionsRef.current.delete(id)
            }
            walkersRef.current = walkersRef.current.filter(w => {
                const leg = (routeLength(w.route) / WALK_SPEED) * 1000
                return t - w.start < leg * 2 + w.pauseMs
            })
            if (motionsRef.current.size > 0 || walkersRef.current.length > 0) frame = requestAnimationFrame(tick)
            else frame = 0
        }
        if (motionsRef.current.size > 0 || walkersRef.current.length > 0) frame = requestAnimationFrame(tick)
        return () => { if (frame) cancelAnimationFrame(frame) }
    })

    // --- Qué se dibuja en este instante ---
    const rendered: RenderedCar[] = []
    for (const car of parkedCars) {
        const motion = motionsRef.current.get(car.id)
        const target = targets.get(car.id)
        if (motion && !motion.leaving) {
            const elapsed = Math.max(0, now - motion.start) / 1000
            const p = pointAlong(motion.route, elapsed * CAR_SPEED)
            const started = now >= motion.start
            const from = motion.route[0]
            // Antes de arrancar: espera en su punto de partida (calle o plaza anterior)
            const pos = started ? p : { ...from, dir: (motion.z0 ? "x" : "y") as "x" | "y" }
            const firstLeg = routeLength(motion.route.slice(0, 2))
            const z = motion.z0 ? Math.max(0, motion.z0 * (1 - (elapsed * CAR_SPEED) / Math.max(firstLeg, 0.1))) : 0
            if (!started && motion.route[0].x > layout.width) continue // aún no ha llegado a la calle visible
            rendered.push({ car, x: pos.x, y: pos.y, z, dir: started ? p.dir : pos.dir, rev: started && p.rev, moving: true, leaving: false })
        } else if (target) {
            rendered.push({ car, x: target.x, y: target.y, z: target.z, dir: target.dir, moving: false, leaving: false })
        }
    }
    for (const [, m] of motionsRef.current) {
        if (!m.leaving) continue
        const started = now >= m.start
        const p = pointAlong(m.route, Math.max(0, now - m.start) / 1000 * CAR_SPEED)
        const pos = started ? p : { ...m.route[0], dir: "y" as const }
        rendered.push({ car: m.car, x: pos.x, y: pos.y, z: 0, dir: started ? p.dir : "y", rev: started && p.rev, moving: started, leaving: true })
    }

    const people: RenderedPerson[] = useMemo(() => {
        const list: RenderedPerson[] = []
        const workshop = layout.bands.find(b => b.zone === "workshop")!
        const itv = layout.bands.find(b => b.zone === "itv")!
        const showroom = layout.bands.find(b => b.zone === "showroom")!
        list.push({ id: "mechanic", x: workshop.x0 + 2.2, y: workshop.y0 + LABEL_BAND + 2.95, pose: "tool", role: "mechanic", seed: 8 })
        list.push({ id: "clerk", x: itv.x0 + 1.05, y: itv.y0 + LABEL_BAND + 1.85, pose: "papers", role: "clerk", seed: 15 })
        list.push({ id: "sales", x: showroom.x0 + 0.8, y: showroom.y0 + 1.0, pose: "chat", role: "sales", seed: 22 })
        list.push({ id: "coffee", x: 7.35, y: 1.45, pose: "cup", role: "office", seed: 46, flip: true })
        list.push({ id: "sofa-chat", x: 7.95, y: 6.7, pose: "chat", role: "office", seed: 17 })
        return list
    }, [layout])

    const walkers: RenderedPerson[] = walkersRef.current.map(w => {
        const leg = (routeLength(w.route) / WALK_SPEED) * 1000
        const t = now - w.start
        if (t < 0) return null
        let p: Point & { dir: "x" | "y" }
        let pose: RenderedPerson["pose"] = "walk"
        if (t < leg) p = pointAlong(w.route, (t / 1000) * WALK_SPEED)
        else if (t < leg + w.pauseMs) { p = { ...w.route[w.route.length - 1], dir: "y" }; pose = "papers" }
        else p = pointAlong([...w.route].reverse(), ((t - leg - w.pauseMs) / 1000) * WALK_SPEED)
        return { id: w.id, x: p.x, y: p.y, pose, role: "office" as const, seed: w.seed }
    }).filter(Boolean) as RenderedPerson[]

    // --- Día / noche: solo por la hora real (el modo oscuro de la app no cambia el garaje) ---
    const sceneNow = useMemo(() => {
        if (!timeOverride) return clock
        const [h, m] = timeOverride.split(":").map(Number)
        const d = new Date(clock); d.setHours(h, m, 0, 0); return d
    }, [clock, timeOverride])
    const light = daylight(sceneNow)
    const isNight = !light.isDay

    // --- Cámara ---
    const bounds = useMemo(() => sceneBounds(layout), [layout])
    const [vb, setVb] = useState<ViewBox | null>(null)
    const svgRef = useRef<SVGSVGElement>(null)
    const drag = useRef<{ x: number; y: number; vb: ViewBox; moved: boolean } | null>(null)
    // Mientras el usuario no mueva la cámara, se reencuadra al crecer el parking
    const userCamera = useRef(false)

    useEffect(() => {
        if (vb) return
        try {
            const saved = sessionStorage.getItem(CAMERA_KEY)
            if (saved) { userCamera.current = true; setVb(JSON.parse(saved)); return }
        } catch { }
        const phone = window.innerWidth < 640
        if (phone) {
            const f = focusPoint(layout)
            const c = iso(f.x, f.y)
            const w = 520
            const h = w * (window.innerHeight / window.innerWidth)
            setVb({ x: c[0] - w / 2, y: c[1] - h / 2, w, h })
        } else {
            setVb(fitView(bounds))
        }
    }, [bounds, layout, vb])

    useEffect(() => {
        if (!vb || !userCamera.current) return
        try { sessionStorage.setItem(CAMERA_KEY, JSON.stringify(vb)) } catch { }
    }, [vb])

    useEffect(() => {
        if (!vb || userCamera.current || !data) return
        if (window.innerWidth < 640) {
            const f = focusPoint(layout)
            const c = iso(f.x, f.y)
            setVb(prev => prev ? { ...prev, x: c[0] - prev.w / 2, y: c[1] - prev.h / 2 } : prev)
        } else {
            setVb(fitView(bounds))
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bounds.w, bounds.h, data ? 1 : 0])

    function fitView(b: ViewBox): ViewBox {
        const aspect = typeof window !== "undefined" ? window.innerWidth / window.innerHeight : 16 / 9
        let w = b.w + 80
        let h = w / aspect
        if (h < b.h + 80) { h = b.h + 80; w = h * aspect }
        return { x: b.x + b.w / 2 - w / 2, y: b.y + b.h / 2 - h / 2, w, h }
    }

    const zoom = useCallback((factor: number, center?: { x: number; y: number }) => {
        userCamera.current = true
        setVb(prev => {
            if (!prev) return prev
            const cx = center?.x ?? prev.x + prev.w / 2
            const cy = center?.y ?? prev.y + prev.h / 2
            const w = Math.min(Math.max(prev.w * factor, 180), bounds.w * 3)
            const h = prev.h * (w / prev.w)
            return { x: cx - (cx - prev.x) * (w / prev.w), y: cy - (cy - prev.y) * (h / prev.h), w, h }
        })
    }, [bounds.w])

    const toWorld = (clientX: number, clientY: number) => {
        const svg = svgRef.current
        if (!svg || !vb) return { x: 0, y: 0 }
        const rect = svg.getBoundingClientRect()
        const scale = Math.max(vb.w / rect.width, vb.h / rect.height)
        const offX = (rect.width * scale - vb.w) / 2
        const offY = (rect.height * scale - vb.h) / 2
        return { x: vb.x - offX + (clientX - rect.left) * scale, y: vb.y - offY + (clientY - rect.top) * scale }
    }

    useEffect(() => {
        const svg = svgRef.current
        if (!svg) return
        const onWheel = (e: WheelEvent) => {
            e.preventDefault()
            zoom(e.deltaY > 0 ? 1.12 : 1 / 1.12, toWorld(e.clientX, e.clientY))
        }
        svg.addEventListener("wheel", onWheel, { passive: false })
        return () => svg.removeEventListener("wheel", onWheel)
    })

    const onPointerDown = (e: React.PointerEvent) => {
        if (!vb) return
        drag.current = { x: e.clientX, y: e.clientY, vb, moved: false }
    }
    const onPointerMove = (e: React.PointerEvent) => {
        const d = drag.current
        if (!d || !svgRef.current) return
        const rect = svgRef.current.getBoundingClientRect()
        const scale = Math.max(d.vb.w / rect.width, d.vb.h / rect.height)
        const dx = (e.clientX - d.x) * scale
        const dy = (e.clientY - d.y) * scale
        if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 4) {
            if (!d.moved) (e.currentTarget as Element).setPointerCapture?.(e.pointerId)
            d.moved = true
        }
        if (d.moved) { userCamera.current = true; setVb({ ...d.vb, x: d.vb.x - dx, y: d.vb.y - dy }) }
    }
    const onPointerUp = () => { drag.current = null }
    const onClickCapture = (e: React.MouseEvent) => {
        // Si se ha arrastrado, no es un clic en un coche
        if (drag.current?.moved) { e.stopPropagation(); e.preventDefault() }
    }

    // --- Navegación (solo lectura: todo lleva a las páginas que ya existen) ---
    const goTo = useCallback((target: GarageTarget, car?: GarageCar) => {
        if (demo) return
        const tab = TAB_FOR[target]
        router.push(`/?tab=${tab}${car ? `&car=${car.id}&table=inventory_cars` : ""}`)
    }, [demo, router])

    const exit = useCallback(() => {
        let back = "/"
        try { back = sessionStorage.getItem(RETURN_KEY) || "/" } catch { }
        router.push(back)
    }, [router])

    const onHover = useCallback((car: GarageCar | null, e?: React.PointerEvent) => {
        if (!car) { setHover(null); return }
        setHover(prev => ({ car, x: e?.clientX ?? prev?.x ?? 0, y: e?.clientY ?? prev?.y ?? 0 }))
    }, [])

    if ((!demo && authLoading) || !vb) {
        return <div className="flex h-screen items-center justify-center bg-background"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
    }

    const trucks = layout.truckSlots.length

    return (
        <div className={`mhq-office fixed inset-0 select-none overflow-hidden ${isNight ? "mhq-night" : ""}`} style={{ background: isNight ? "#0b1330" : "#bfe3fb" }}>
            {data && (
                <GarageScene
                    svgRef={svgRef}
                    viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
                    svgHandlers={{
                        onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onClickCapture,
                        preserveAspectRatio: "xMidYMid meet",
                        style: { cursor: drag.current?.moved ? "grabbing" : "grab" },
                    }}
                    layout={layout}
                    cars={rendered}
                    trucks={trucks}
                    people={[...people, ...walkers]}
                    stats={data.stats}
                    board={data.board}
                    daylight={light}
                    now={sceneNow}
                    reduced={prefersReducedMotion()}
                    detail={vb.w < 1150}
                    onCar={car => goTo("management", car)}
                    onNavigate={t => goTo(t)}
                    onExit={exit}
                    onHover={onHover}
                />
            )}

            {/* HUD */}
            <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3 sm:p-4">
                <div className="pointer-events-auto flex items-center gap-2 whitespace-nowrap rounded-xl border bg-card/90 px-3 py-2 shadow-sm backdrop-blur">
                    <span className="text-xs font-semibold sm:text-sm"><span className="hidden sm:inline">Garaje </span>NorDrive</span>
                    <span className="tabular text-xs text-muted-foreground sm:text-sm">{sceneNow.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}</span>
                    {demo && <span className="rounded bg-warning/15 px-1.5 py-0.5 text-[11px] font-medium text-warning">ejemplo · solo en desarrollo</span>}
                </div>
                <button
                    onClick={exit}
                    className="pointer-events-auto flex items-center gap-2 whitespace-nowrap rounded-xl border bg-card/90 px-3 py-2 text-xs font-medium shadow-sm backdrop-blur hover:bg-accent sm:text-sm"
                >
                    <LayoutDashboard className="h-4 w-4" /> Vista clásica
                </button>
            </div>

            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-3 sm:p-4">
                <p className="pointer-events-auto max-w-[70%] rounded-xl border bg-card/90 px-3 py-2 text-xs text-muted-foreground shadow-sm backdrop-blur">
                    {error ? <span className="text-destructive">{error}</span> : (
                        <>
                            <span className="sm:hidden">Toca un coche, una mesa o una zona para abrirla.</span>
                            <span className="hidden sm:inline">Haz clic en un coche, una persona o una zona para abrirla. Arrastra para moverte y usa la rueda para acercarte.</span>
                        </>
                    )}
                </p>
                <div className="pointer-events-auto flex flex-col overflow-hidden rounded-xl border bg-card/90 shadow-sm backdrop-blur">
                    <button className="p-2 hover:bg-accent" onClick={() => zoom(1 / 1.25)} aria-label="Acercar"><Plus className="h-4 w-4" /></button>
                    <button className="border-t p-2 hover:bg-accent" onClick={() => zoom(1.25)} aria-label="Alejar"><Minus className="h-4 w-4" /></button>
                    <button className="border-t p-2 hover:bg-accent" onClick={() => { userCamera.current = true; setVb(fitView(bounds)) }} aria-label="Ver todo"><Maximize2 className="h-4 w-4" /></button>
                </div>
            </div>

            {!data && !error && (
                <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
            )}

            {hover && (
                <div
                    className="pointer-events-none fixed z-50 min-w-48 rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg"
                    style={{ left: Math.min(hover.x + 14, window.innerWidth - 220), top: Math.min(hover.y + 14, window.innerHeight - 150) }}
                >
                    <p className="text-sm font-semibold">{hover.car.brand} {hover.car.model}{hover.car.year ? ` (${hover.car.year})` : ""}</p>
                    <dl className="tabular mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                        <dt className="text-muted-foreground">Etapa</dt><dd>{STAGE_LABEL[hover.car.stage]}</dd>
                        <dt className="text-muted-foreground">Días en stock</dt><dd>{hover.car.daysInStock ?? UNKNOWN}</dd>
                        <dt className="text-muted-foreground">Coste total</dt><dd>{fmtEur(hover.car.totalCost)}</dd>
                        <dt className="text-muted-foreground">Precio venta</dt><dd>{fmtEur(hover.car.sellPrice)}</dd>
                        <dt className="text-muted-foreground">Margen</dt><dd>{fmtEur(hover.car.margin)}</dd>
                    </dl>
                    {hover.car.urgent && <p className="mt-1 font-medium text-warning">Tiene un aviso urgente</p>}
                </div>
            )}
        </div>
    )
}

function fallbackCar(id: string, stage: GarageCar["stage"]): GarageCar {
    return {
        id, brand: "", model: "", year: null, plate: null, stage, color: "#c3c8d0", colorKnown: false, body: "hatchback",
        daysInStock: null, totalCost: null, sellPrice: null, margin: null, dateSold: null, urgent: false,
    }
}
