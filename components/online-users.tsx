'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/components/auth-provider'
import { Users } from 'lucide-react'
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
}

export function OnlineUsers() {
    const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([])
    const [role, setRole] = useState<string | null>(null)
    const { user } = useAuth()
    const [channel, setChannel] = useState<any>(null)

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
                                })
                            }
                        }
                    })
                })

                setOnlineUsers(Array.from(usersMap.values()))
            })
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    // Get user profile data
                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('email, avatar_url, first_name, last_name')
                        .eq('id', user.id)
                        .single()

                    // Track presence
                    await presenceChannel.track({
                        user_id: user.id,
                        email: profile?.email || user.email,
                        first_name: profile?.first_name || user.user_metadata?.first_name,
                        last_name: profile?.last_name || user.user_metadata?.last_name,
                        avatar_url: profile?.avatar_url,
                        online_at: new Date().toISOString(),
                    })
                }
            })

        setChannel(presenceChannel)

        // Cleanup
        return () => {
            if (presenceChannel) {
                presenceChannel.unsubscribe()
            }
        }
    }, [user])

    if (!user || onlineUsers.length === 0) return null

    // For usuario and gestor roles, only show the badge without popover
    const canViewList = role === 'admin' || role === 'importador'

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
                    <div className="flex items-center justify-between">
                        <h4 className="font-semibold text-sm">Usuarios Online</h4>
                        <Badge variant="outline" className="text-xs">
                            {onlineUsers.length} {onlineUsers.length === 1 ? 'usuario' : 'usuarios'}
                        </Badge>
                    </div>
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
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
                                    <p className="text-sm font-medium truncate">
                                        {onlineUser.first_name && onlineUser.last_name
                                            ? `${onlineUser.first_name} ${onlineUser.last_name.charAt(0)}.`
                                            : onlineUser.email}
                                    </p>
                                    {onlineUser.id === user.id && (
                                        <p className="text-xs text-muted-foreground">Tú</p>
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
