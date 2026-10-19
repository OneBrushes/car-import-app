'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/components/auth-provider'
import { Bell, Check, Trash2, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'

interface Notification {
    id: string
    type: string
    title: string
    message: string
    link?: string
    read: boolean
    created_at: string
    metadata?: any
}

export function NotificationsCenter() {
    const [notifications, setNotifications] = useState<Notification[]>([])
    const [unreadCount, setUnreadCount] = useState(0)
    const [isOpen, setIsOpen] = useState(false)
    const { user } = useAuth()
    const router = useRouter()

    useEffect(() => {
        if (!user) return

        // Cargar notificaciones iniciales
        loadNotifications()

        // Suscribirse a nuevas notificaciones en tiempo real
        const channel = supabase
            .channel('notifications')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'notifications',
                    filter: `user_id=eq.${user.id}`,
                },
                (payload) => {
                    const newNotification = payload.new as Notification
                    setNotifications((prev) => [newNotification, ...prev])
                    setUnreadCount((prev) => prev + 1)

                    // Mostrar toast para notificación nueva
                    toast.info(newNotification.title, {
                        description: newNotification.message,
                        action: newNotification.link ? {
                            label: 'Ver',
                            onClick: () => router.push(newNotification.link!)
                        } : undefined
                    })
                }
            )
            .subscribe()

        return () => {
            channel.unsubscribe()
        }
    }, [user, router])

    const loadNotifications = async () => {
        if (!user) return

        const { data, error } = await supabase
            .from('notifications')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(20)

        if (error) {
            console.error('Error loading notifications:', error)
            return
        }

        setNotifications(data || [])
        setUnreadCount(data?.filter((n) => !n.read).length || 0)
    }

    const markAsRead = async (notificationId: string) => {
        const { error } = await supabase
            .from('notifications')
            .update({ read: true })
            .eq('id', notificationId)

        if (error) {
            toast.error('Error al marcar como leída')
            return
        }

        setNotifications((prev) =>
            prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
        )
        setUnreadCount((prev) => Math.max(0, prev - 1))
    }

    const markAllAsRead = async () => {
        if (!user) return

        const { error } = await supabase
            .from('notifications')
            .update({ read: true })
            .eq('user_id', user.id)
            .eq('read', false)

        if (error) {
            toast.error('Error al marcar todas como leídas')
            return
        }

        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
        setUnreadCount(0)
        toast.success('Todas las notificaciones marcadas como leídas')
    }

    const deleteNotification = async (notificationId: string) => {
        const { error } = await supabase
            .from('notifications')
            .delete()
            .eq('id', notificationId)

        if (error) {
            toast.error('Error al eliminar notificación')
            return
        }

        setNotifications((prev) => prev.filter((n) => n.id !== notificationId))
        setUnreadCount((prev) => {
            const notification = notifications.find((n) => n.id === notificationId)
            return notification && !notification.read ? prev - 1 : prev
        })
    }

    const handleNotificationClick = async (notification: Notification) => {
        // Marcar como leída
        if (!notification.read) {
            await markAsRead(notification.id)
        }

        setIsOpen(false)

        // Si es una notificación de coche compartido, cambiar al tab de importación
        if (notification.type === 'car_shared') {
            // Disparar evento personalizado para cambiar el tab
            window.dispatchEvent(new CustomEvent('changeTab', { detail: { tab: 'import' } }))
        } else if (notification.link) {
            // Navegar si tiene link
            router.push(notification.link)
        }
    }

    if (!user) return null

    return (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
                <button className="relative inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" aria-label="Notificaciones">
                    <Bell className="h-4 w-4" />
                    {unreadCount > 0 && (
                        <Badge variant="destructive" className="h-5 px-1.5 text-xs absolute -top-1 -right-1">
                            {unreadCount > 9 ? '9+' : unreadCount}
                        </Badge>
                    )}
                </button>
            </PopoverTrigger>
            <PopoverContent className="w-96 p-0" align="end">
                <div className="flex h-12 items-center justify-between border-b px-4">
                    <div className="flex items-center gap-2">
                        <h4 className="text-sm font-semibold">Notificaciones</h4>
                        {unreadCount > 0 && (
                            <Badge variant="secondary" className="tabular h-5 px-1.5 text-[11px]">
                                {unreadCount} sin leer
                            </Badge>
                        )}
                    </div>
                    {unreadCount > 0 && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={markAllAsRead}
                            className="-mr-2 text-xs text-muted-foreground hover:text-foreground"
                        >
                            <Check className="h-3.5 w-3.5" />
                            Marcar todas como leídas
                        </Button>
                    )}
                </div>

                <ScrollArea className="h-[400px]">
                    {notifications.length === 0 ? (
                        <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                                <Bell className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <p className="text-sm font-medium">Todo al día</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">No tienes notificaciones</p>
                        </div>
                    ) : (
                        <div className="divide-y">
                            {notifications.map((notification) => (
                                <div
                                    key={notification.id}
                                    className={`group cursor-pointer px-4 py-3 transition-colors hover:bg-accent ${!notification.read ? 'bg-primary/5' : ''
                                        }`}
                                    onClick={() => handleNotificationClick(notification)}
                                >
                                    <div className="flex items-start gap-3">
                                        <span
                                            className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${!notification.read ? 'bg-primary' : 'bg-transparent'}`}
                                            aria-hidden="true"
                                        />
                                        <div className="flex-1 min-w-0">
                                            <p className={`text-sm truncate ${!notification.read ? 'font-semibold' : 'font-medium'}`}>
                                                {notification.title}
                                            </p>
                                            <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                                                {notification.message}
                                            </p>
                                            <p className="mt-1.5 text-[11px] text-muted-foreground/80">
                                                {formatDistanceToNow(new Date(notification.created_at), {
                                                    addSuffix: true,
                                                    locale: es,
                                                })}
                                            </p>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="icon-sm"
                                            aria-label="Eliminar notificación"
                                            className="h-7 w-7 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                deleteNotification(notification.id)
                                            }}
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </ScrollArea>
            </PopoverContent>
        </Popover>
    )
}
