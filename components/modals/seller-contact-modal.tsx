"use client"

import { useEffect, useMemo, useState } from "react"
import { Check, Copy, Loader2, MessageSquare, RefreshCw, Reply, Trash2, User, Store } from "lucide-react"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  buildMessage, detectLanguage, KIND_LABEL, LANGUAGE_LABEL, QUESTION_LABEL,
  type MessageKind, type QuestionKey, type ReplyKind, type SellerCar, type SellerLanguage,
} from "@/lib/seller-messages"
import {
  daysUntilPurge, loadConversation, loadConversationForCar, saveConversation, snapshotOf, titleOf,
  type Conversation, type ConversationMessage,
} from "@/lib/conversations"

interface SellerContactModalProps {
  isOpen: boolean
  onClose: () => void
  /** Coche de la lista (si aún existe) */
  car?: any
  /** O una conversación guardada (también la de un coche ya borrado) */
  conversationId?: string
  /** Se llama al marcar un mensaje como enviado (para poner el coche como "contactado") */
  onSent?: (carId: string) => void
}

const PROFILE_KEY = "nordrive-seller-profile"
const ALL_QUESTIONS: QuestionKey[] = ["defects", "papers", "service", "inspection"]
const ALL_KINDS: MessageKind[] = ["first", "offer", "visit", "photos", "accept", "decline"]
/** Respuestas para cuando el vendedor ya ha contestado */
const REPLY_KINDS: (MessageKind & ("offer" | ReplyKind))[] = ["offer", "visit", "photos", "accept", "decline"]

function readProfile(): { name: string; phone: string } {
  try { return { name: "", phone: "", ...JSON.parse(localStorage.getItem(PROFILE_KEY) || "{}") } } catch { return { name: "", phone: "" } }
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success("Copiado. Pégalo en el mensaje al vendedor.")
  } catch {
    toast.error("No se pudo copiar. Selecciona el texto y cópialo a mano.")
  }
}

export function SellerContactModal({ isOpen, onClose, car, conversationId, onSent }: SellerContactModalProps) {
  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<"write" | "chat">("write")

  const snapshot: SellerCar = useMemo(() => (car ? snapshotOf(car) : conversation?.car_snapshot ?? {}), [car, conversation])
  // los datos del coche llegan como objeto nuevo en cada recarga: el borrador solo se rehace si cambian de verdad
  const snapshotKey = JSON.stringify(snapshot)
  const title = car ? titleOf(snapshot) : conversation?.car_title || "Conversación"
  const carExists = !!car || !!conversation?.car_id

  // escribir
  const [language, setLanguage] = useState<SellerLanguage>("de")
  const [kind, setKind] = useState<MessageKind>("first")
  const [questions, setQuestions] = useState<QuestionKey[]>(["defects", "papers"])
  const [offer, setOffer] = useState("")
  const [when, setWhen] = useState("")
  const [seed, setSeed] = useState(0)
  const [profile, setProfile] = useState({ name: "", phone: "" })
  const [draft, setDraft] = useState("")

  // conversación
  const [newText, setNewText] = useState("")
  const [newFrom, setNewFrom] = useState<"seller" | "me">("seller")
  const [saving, setSaving] = useState(false)

  // cargar la conversación al abrir
  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    setProfile(readProfile())
    setNewText(""); setWhen("")
    setLoading(true)
    const load = car?.id ? loadConversationForCar(car.id) : conversationId ? loadConversation(conversationId) : Promise.resolve(null)
    load
      .then((c) => {
        if (cancelled) return
        setConversation(c)
        const snap = car ? snapshotOf(car) : c?.car_snapshot ?? {}
        setLanguage((c?.language as SellerLanguage) || detectLanguage(snap))
        const hasReply = !!c?.messages.some((m) => m.from === "seller")
        setKind(hasReply ? "offer" : "first")
        setTab(c && c.messages.length > 0 ? "chat" : "write")
        if (snap.price) setOffer(String(Math.round((snap.price * 0.9) / 50) * 50))
      })
      .catch((e: Error) => { if (!cancelled) { setConversation(null); toast.error(e.message) } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [isOpen, car?.id, conversationId]) // eslint-disable-line react-hooks/exhaustive-deps

  // regenerar el borrador cuando cambian las opciones
  useEffect(() => {
    if (!isOpen) return
    setDraft(buildMessage(snapshot, {
      kind, language, questions, seed,
      name: profile.name.trim() || undefined,
      phone: profile.phone.trim() || undefined,
      offer: (kind === "offer" || kind === "accept") && Number(offer) > 0 ? Number(offer) : null,
      when: when.trim() || undefined,
    }))
  }, [isOpen, snapshotKey, kind, language, questions, seed, offer, when, profile]) // eslint-disable-line react-hooks/exhaustive-deps

  const updateProfile = (patch: Partial<typeof profile>) => {
    const next = { ...profile, ...patch }
    setProfile(next)
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(next)) } catch { /* sin almacenamiento */ }
  }

  const messages = conversation?.messages ?? []

  const persist = async (next: ConversationMessage[]) => {
    setSaving(true)
    try {
      const saved = await saveConversation({ conversation, car, language, messages: next })
      setConversation(saved)
      return true
    } catch (e: any) {
      toast.error(e.message || "No se pudo guardar la conversación")
      return false
    } finally {
      setSaving(false)
    }
  }

  const addMessage = async (from: "me" | "seller", text: string) => {
    const clean = text.trim()
    if (!clean) return false
    const ok = await persist([...messages, { from, text: clean, at: new Date().toISOString() }])
    if (ok && from === "me" && car?.id) onSent?.(car.id)
    return ok
  }

  const markDraftSent = async () => {
    if (await addMessage("me", draft)) {
      toast.success("Guardado en la conversación")
      setTab("chat")
    }
  }

  const removeMessage = async (index: number) => {
    await persist(messages.filter((_, i) => i !== index))
  }

  /** Desde la conversación: abre la pestaña de mensaje con la respuesta elegida */
  const replyWith = (k: MessageKind) => {
    setKind(k)
    setSeed((x) => x + 1)
    setTab("write")
  }

  const purgeDays = daysUntilPurge(car?.seller_sold_at ?? conversation?.seller_sold_at)

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="border-b p-5">
          <DialogTitle className="flex items-center gap-2"><MessageSquare className="h-5 w-5 text-primary" /> Escribir al vendedor</DialogTitle>
          <DialogDescription>
            {title}
            {!carExists && " · los datos del coche ya se han borrado; la conversación se conserva"}
            {carExists && purgeDays != null && ` · vendido por el vendedor: los datos del coche se borran en ${purgeDays} ${purgeDays === 1 ? "día" : "días"}`}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : (
          <Tabs value={tab} onValueChange={(v) => setTab(v as "write" | "chat")} className="flex min-h-0 flex-1 flex-col">
            <div className="flex flex-wrap items-center gap-3 border-b px-5 py-3">
              <TabsList>
                <TabsTrigger value="write">Mensaje</TabsTrigger>
                <TabsTrigger value="chat">Conversación{messages.length ? ` (${messages.length})` : ""}</TabsTrigger>
              </TabsList>
              <div className="ml-auto flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Idioma</span>
                <Select value={language} onValueChange={(v) => setLanguage(v as SellerLanguage)}>
                  <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(LANGUAGE_LABEL) as SellerLanguage[]).map((l) => <SelectItem key={l} value={l}>{LANGUAGE_LABEL[l]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* ---------------- Mensaje con plantilla ---------------- */}
            <TabsContent value="write" className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
              <div className="flex flex-wrap gap-2">
                {ALL_KINDS.map((k) => (
                  <Button key={k} type="button" size="sm" variant={kind === k ? "default" : "outline"} onClick={() => setKind(k)}>{KIND_LABEL[k]}</Button>
                ))}
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <label className="space-y-1 text-sm">
                  <span className="text-muted-foreground">Tu nombre (firma)</span>
                  <Input value={profile.name} onChange={(e) => updateProfile({ name: e.target.value })} placeholder="William" />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-muted-foreground">Teléfono (opcional)</span>
                  <Input value={profile.phone} onChange={(e) => updateProfile({ phone: e.target.value })} placeholder="+34 …" />
                </label>
                {(kind === "offer" || kind === "accept") && (
                  <label className="space-y-1 text-sm">
                    <span className="text-muted-foreground">{kind === "offer" ? "Precio que ofreces (€)" : "Precio acordado (€)"}</span>
                    <Input type="number" inputMode="numeric" value={offer} onChange={(e) => setOffer(e.target.value)} />
                  </label>
                )}
                {kind === "visit" && (
                  <label className="space-y-1 text-sm">
                    <span className="text-muted-foreground">Cuándo (en su idioma, opcional)</span>
                    <Input value={when} onChange={(e) => setWhen(e.target.value)} placeholder="am Samstag, 25.10., um 11 Uhr" />
                  </label>
                )}
              </div>

              {kind === "first" && (
                <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
                  {ALL_QUESTIONS.map((q) => (
                    <label key={q} className="flex cursor-pointer items-center gap-2">
                      <Checkbox
                        checked={questions.includes(q)}
                        onCheckedChange={(on) => setQuestions((prev) => (on ? ALL_QUESTIONS.filter((k) => k === q || prev.includes(k)) : prev.filter((k) => k !== q)))}
                      />
                      {QUESTION_LABEL[q]}
                    </label>
                  ))}
                </div>
              )}

              <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={12} className="font-[inherit] text-sm leading-relaxed" />
              <p className="text-xs text-muted-foreground">
                {kind === "first"
                  ? "Corto y sin oferta: los vendedores contestan más a un primer mensaje natural. El precio, mejor cuando te respondan."
                  : "Respuesta genérica para cuando el vendedor ya te ha contestado: revísala y edítala antes de copiarla. Lo que va entre corchetes, cámbialo tú."}
              </p>

              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => setSeed((s) => s + 1)}><RefreshCw className="mr-2 h-4 w-4" /> Otra versión</Button>
                <Button type="button" variant="outline" onClick={() => copy(draft)}><Copy className="mr-2 h-4 w-4" /> Copiar</Button>
                <Button type="button" onClick={markDraftSent} disabled={saving || !draft.trim()}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />} Lo he enviado
                </Button>
              </div>
            </TabsContent>

            {/* ---------------- Conversación + respuestas con plantilla ---------------- */}
            <TabsContent value="chat" className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
              {messages.length === 0 ? (
                <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                  Aún no hay mensajes. Pega aquí lo que te ha contestado el vendedor, o envía primero un mensaje desde la pestaña «Mensaje».
                </p>
              ) : (
                <div className="space-y-2">
                  {messages.map((m, i) => (
                    <div key={i} className={`group flex ${m.from === "me" ? "justify-end" : "justify-start"}`}>
                      <div className={`relative max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm ${m.from === "me" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                        <p className={`mb-1 text-[11px] font-medium ${m.from === "me" ? "text-primary-foreground/75" : "text-muted-foreground"}`}>
                          {m.from === "me" ? "Tú" : "Vendedor"} · {new Date(m.at).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        </p>
                        {m.text}
                        <button type="button" onClick={() => removeMessage(i)} title="Quitar este mensaje"
                          className="absolute -right-2 -top-2 hidden rounded-full border bg-background p-1 text-muted-foreground shadow-sm hover:text-destructive group-hover:block">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-2 rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Añadir mensaje de</span>
                  <Button type="button" size="sm" variant={newFrom === "seller" ? "default" : "outline"} onClick={() => setNewFrom("seller")}><Store className="mr-1.5 h-3.5 w-3.5" /> Vendedor</Button>
                  <Button type="button" size="sm" variant={newFrom === "me" ? "default" : "outline"} onClick={() => setNewFrom("me")}><User className="mr-1.5 h-3.5 w-3.5" /> Yo</Button>
                </div>
                <Textarea value={newText} onChange={(e) => setNewText(e.target.value)} rows={4}
                  placeholder={newFrom === "seller" ? "Pega aquí la respuesta del vendedor…" : "Pega aquí un mensaje que enviaste tú…"} />
                <div className="flex justify-end">
                  <Button type="button" size="sm" onClick={async () => { if (await addMessage(newFrom, newText)) setNewText("") }} disabled={saving || !newText.trim()}>
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Añadir a la conversación
                  </Button>
                </div>
              </div>

              <div className="space-y-2 rounded-lg border p-3">
                <p className="flex items-center gap-1.5 text-sm font-medium"><Reply className="h-4 w-4 text-primary" /> Responder con una plantilla</p>
                <div className="flex flex-wrap gap-2">
                  {REPLY_KINDS.map((k) => (
                    <Button key={k} type="button" size="sm" variant="outline" onClick={() => replyWith(k)}>{KIND_LABEL[k]}</Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">Se abre en la pestaña «Mensaje» en {LANGUAGE_LABEL[language].toLowerCase()}, lista para revisar y copiar.</p>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  )
}
