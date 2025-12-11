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
                <button className="relative flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-secondary transition-colors">
                    <Bell className="w-5 h-5 text-muted-foreground" />
                    {unreadCount > 0 && (
                        <Badge variant="destructive" className="h-5 px-1.5 text-xs absolute -top-1 -right-1">
                            {unreadCount > 9 ? '9+' : unreadCount}
                        </Badge>
                    )}
                </button>
            </PopoverTrigger>
            <PopoverContent className="w-96 p-0" align="end">
                <div className="flex items-center justify-between p-4 border-b">
                    <h4 className="font-semibold text-sm">Notificaciones</h4>
                    <div className="flex items-center gap-2">
                        {unreadCount > 0 && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={markAllAsRead}
                                className="h-8 text-xs"
                            >
                                <Check className="w-3 h-3 mr-1" />
                                Marcar todas
                            </Button>
                        )}
                    </div>
                </div>

                <ScrollArea className="h-[400px]">
                    {notifications.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                            <Bell className="w-12 h-12 text-muted-foreground/30 mb-3" />
                            <p className="text-sm text-muted-foreground">No tienes notificaciones</p>
                        </div>
                    ) : (
                        <div className="divide-y">
                            {notifications.map((notification) => (
                                <div
                                    key={notification.id}
                                    className={`p-4 hover:bg-secondary/50 transition-colors cursor-pointer group ${!notification.read ? 'bg-primary/5' : ''
                                        }`}
                                    onClick={() => handleNotificationClick(notification)}
                                >
                                    <div className="flex items-start gap-3">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-start justify-between gap-2 mb-1">
                                                <p className="text-sm font-medium truncate">
                                                    {notification.title}
                                                </p>
                                                {!notification.read && (
                                                    <div className="w-2 h-2 bg-primary rounded-full flex-shrink-0 mt-1.5" />
                                                )}
                                            </div>
                                            <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                                                {notification.message}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {formatDistanceToNow(new Date(notification.created_at), {
                                                    addSuffix: true,
                                                    locale: es,
                                                })}
                                            </p>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 p-0"
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                deleteNotification(notification.id)
                                            }}
                                        >
                                            <Trash2 className="w-3 h-3 text-muted-foreground" />
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
