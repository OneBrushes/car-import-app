"use client"

import { useEffect, useState } from "react"
import { Loader2, MessageSquare, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { daysUntilPurge, deleteConversation, listConversations, type Conversation } from "@/lib/conversations"

interface ConversationsModalProps {
  isOpen: boolean
  onClose: () => void
  /** Abre una conversación (la del coche si aún existe, o solo la conversación) */
  onOpen: (conversation: Conversation) => void
}

/** Todas las conversaciones con vendedores, también las de coches que ya se han borrado */
export function ConversationsModal({ isOpen, onClose, onOpen }: ConversationsModalProps) {
  const [items, setItems] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setLoading(true)
    listConversations()
      .then(setItems)
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setLoading(false))
  }, [isOpen])

  const remove = async (c: Conversation) => {
    if (!confirm(`¿Borrar la conversación de ${c.car_title || "este coche"}? No se puede deshacer.`)) return
    try {
      await deleteConversation(c.id)
      setItems((prev) => prev.filter((x) => x.id !== c.id))
      toast.success("Conversación borrada")
    } catch (e: any) {
      toast.error(e.message || "No se pudo borrar")
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col gap-0 p-0">
        <DialogHeader className="border-b p-5">
          <DialogTitle className="flex items-center gap-2"><MessageSquare className="h-5 w-5 text-primary" /> Conversaciones con vendedores</DialogTitle>
          <DialogDescription>Se guardan aunque el coche se borre.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : items.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">Todavía no hay conversaciones. Ábrelas desde el botón «Escribir al vendedor» de cada coche.</p>
          ) : (
            <ul className="divide-y">
              {items.map((c) => {
                const last = c.messages[c.messages.length - 1]
                const days = daysUntilPurge(c.seller_sold_at)
                return (
                  <li key={c.id} className="flex items-start gap-3 rounded-lg p-3 hover:bg-accent/50">
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onOpen(c)}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium">{c.car_title || "Coche"}</span>
                        {!c.car_id && <Badge variant="secondary">Coche borrado</Badge>}
                        {c.car_id && days != null && <Badge variant="secondary">Vendido · se borra en {days} d</Badge>}
                        <span className="text-xs text-muted-foreground">{c.messages.length} {c.messages.length === 1 ? "mensaje" : "mensajes"}</span>
                      </div>
                      {last && (
                        <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                          <span className="font-medium">{last.from === "me" ? "Tú" : "Vendedor"}:</span> {last.text}
                        </p>
                      )}
                    </button>
                    <span className="shrink-0 text-xs text-muted-foreground">{new Date(c.updated_at).toLocaleDateString("es-ES")}</span>
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => remove(c)} title="Borrar conversación">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
