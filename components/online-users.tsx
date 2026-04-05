'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/components/auth-provider'
import { stringToColor } from '@/components/live-cursors'
import { Users, MousePointerClick } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

interface OnlineUser {
    id: string
    email: string
    first_name?: string
    last_name?: string
    avatar_url?: string
    presence_ref: string
    active_tab?: string
}

interface OnlineUsersProps {
    activeTab?: string
}

export function OnlineUsers({ activeTab }: OnlineUsersProps) {
    const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([])
    const [role, setRole] = useState<string | null>(null)
    const [cursorsVisible, setCursorsVisible] = useState(true)
    const { user } = useAuth()
    const [channel, setChannel] = useState<any>(null)

    useEffect(() => {
        const savedCursors = localStorage.getItem("showLiveCursors")
        if (savedCursors !== null) setCursorsVisible(JSON.parse(savedCursors))
    }, [])

    useEffect(() => {
        if (!user) return

        // Get user role
        supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single()
            .then(({ data }) => {
                if (data) setRole(data.role)
            })

        // Create a channel for presence
        const presenceChannel = supabase.channel('online-users', {
            config: {
                presence: {
                    key: user.id,
                },
            },
        })

        // Subscribe to presence state changes
        presenceChannel
            .on('presence', { event: 'sync' }, () => {
                const state = presenceChannel.presenceState()
                const usersMap = new Map<string, OnlineUser>()

                Object.keys(state).forEach((key) => {
                    const presences = state[key] as any[]
                    presences.forEach((presence) => {
                        if (presence.user_id && presence.email) {
                            // Only add if not already in map (avoid duplicates from multiple connections)
                            if (!usersMap.has(presence.user_id)) {
                                usersMap.set(presence.user_id, {
                                    id: presence.user_id,
                                    email: presence.email,
                                    first_name: presence.first_name,
                                    last_name: presence.last_name,
                                    avatar_url: presence.avatar_url,
                                    presence_ref: presence.presence_ref,
                                    active_tab: presence.active_tab,
                                })
                            }
                        }
                    })
                })

                setOnlineUsers(Array.from(usersMap.values()))
            })
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('email, avatar_url, first_name, last_name, role')
                        .eq('id', user.id)
                        .single()

                    // Track presence
                    await presenceChannel.track({
                        user_id: user.id,
                        email: profile?.email || user.email,
                        first_name: profile?.first_name || user.user_metadata?.first_name,
                        last_name: profile?.last_name || user.user_metadata?.last_name,
                        avatar_url: profile?.avatar_url,
                        active_tab: activeTab || "dashboard",
                        online_at: new Date().toISOString(),
                    })

                    // Update last_sign_in_at in profiles
                    await supabase.rpc('update_user_last_seen')
                }
            })

        setChannel(presenceChannel)

        // Cleanup
        return () => {
            if (presenceChannel) {
                presenceChannel.unsubscribe()
            }
        }
    }, [user]) // Eliminamos activeTab de dependencias para no resetear toda la conexión al cambiar de tab

    // Actualizar el estado de la presencia al cambiar de pestaña
    useEffect(() => {
        if (channel && user) {
            const updatePresence = async () => {
                const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
                
                channel.track({
                    user_id: user.id,
                    email: profile?.email || user.email,
                    first_name: profile?.first_name,
                    last_name: profile?.last_name,
                    avatar_url: profile?.avatar_url,
                    active_tab: activeTab || "dashboard",
                    online_at: new Date().toISOString(),
                })
            }
            updatePresence()
        }
    }, [activeTab, channel, user])

    if (!user || onlineUsers.length === 0) return null

    // Admins and Super Admins can see the list. But only Super Admins will see the active tab
    const canViewList = role === 'admin' || role === 'super_admin' || role === 'importador'

    const toggleCursors = () => {
        const newState = !cursorsVisible;
        setCursorsVisible(newState);
        localStorage.setItem("showLiveCursors", JSON.stringify(newState));
        window.dispatchEvent(new Event("live-cursors-toggled"));
    }

    const badgeContent = (
        <button className="relative flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-secondary transition-colors">
            <Users className="w-4 h-4 text-muted-foreground" />
            <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                {onlineUsers.length}
            </Badge>
            <span className="absolute top-1 right-1 w-2 h-2 bg-green-500 rounded-full animate-pulse" />
        </button>
    )

    if (!canViewList) {
        return badgeContent
    }

    return (
        <Popover>
            <PopoverTrigger asChild>
                {badgeContent}
            </PopoverTrigger>
            <PopoverContent className="w-72 p-3" align="end">
                <div className="space-y-3">
                    <div className="flex items-center justify-between border-b pb-2">
                        <div className="flex items-center gap-2">
                            <h4 className="font-semibold text-sm">Usuarios Online</h4>
                            <Badge variant="outline" className="text-xs">
                                {onlineUsers.length} {onlineUsers.length === 1 ? 'usuario' : 'usuarios'}
                            </Badge>
                        </div>
                        {role === 'super_admin' && (
                            <button
                                onClick={toggleCursors}
                                title={cursorsVisible ? "Ocultar radares" : "Mostrar radares"}
                                className={`p-1.5 rounded-md transition-colors ${cursorsVisible ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground"}`}
                            >
                                <MousePointerClick className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                    <div className="space-y-2 max-h-[300px] overflow-y-auto pt-1">
                        {onlineUsers.map((onlineUser) => (
                            <div
                                key={onlineUser.id}
                                className="flex items-center gap-3 p-2 rounded-lg hover:bg-secondary/50 transition-colors"
                            >
                                <div className="relative">
                                    <Avatar className="h-8 w-8">
                                        <AvatarImage src={onlineUser.avatar_url || ''} />
                                        <AvatarFallback className="text-xs bg-primary/10 text-primary">
                                            {onlineUser.email.substring(0, 2).toUpperCase()}
                                        </AvatarFallback>
                                    </Avatar>
                                    <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-background" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate" style={{ color: stringToColor(onlineUser.id) }}>
                                        {onlineUser.first_name && onlineUser.last_name
                                            ? `${onlineUser.first_name} ${onlineUser.last_name.charAt(0)}.`
                                            : onlineUser.email}
                                    </p>
                                    {onlineUser.id === user.id ? (
                                        <p className="text-xs text-muted-foreground">Tú</p>
                                    ) : (
                                        role === 'super_admin' && (
                                            <p className="text-[10px] text-accent font-semibold">{onlineUser.active_tab ? `Pestaña: ${onlineUser.active_tab.toUpperCase()}` : "Navegando..."}</p>
                                        )
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    )
}
