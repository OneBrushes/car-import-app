"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { User, Session } from "@supabase/supabase-js"
import { supabase } from "@/lib/supabase"

interface AuthContextType {
    user: User | null
    session: Session | null
    loading: boolean
    signOut: () => Promise<void>
    isGodMode: boolean
    toggleGodMode: () => void
    profile: any | null
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    session: null,
    loading: true,
    signOut: async () => { },
    isGodMode: false,
    toggleGodMode: () => {},
    profile: null
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null)
    const [session, setSession] = useState<Session | null>(null)
    const [loading, setLoading] = useState(true)
    const [isGodMode, setIsGodMode] = useState(false)
    const [profile, setProfile] = useState<any | null>(null)

    const toggleGodMode = () => setIsGodMode(prev => !prev)

    useEffect(() => {
        const initAuth = async () => {
            try {
                const { data: { session }, error } = await supabase.auth.getSession()
                if (error) throw error

                setSession(session)
                setUser(session?.user ?? null)
                
                if (session?.user) {
                    const { data: profileData } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
                    setProfile(profileData)
                }
            } catch (error) {
                console.error("Error checking auth session:", error)
            } finally {
                setLoading(false)
            }
        }

        initAuth()

        // Escuchar cambios en la autenticación (login, logout, etc.)
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange(async (_event, session) => {
            if (session?.user) {
                // Check if banned
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('role')
                    .eq('id', session.user.id)
                    .single()

                if (profile?.role === 'banned') {
                    await supabase.auth.signOut()
                    setSession(null)
                    setUser(null)
                    // alert("Tu cuenta ha sido suspendida.") // Opcional
                    return
                }

                setProfile(profile)
            } else {
                setProfile(null)
                setIsGodMode(false)
            }

            setSession(session)
            setUser(session?.user ?? null)
            setLoading(false)
        })

        return () => subscription.unsubscribe()
    }, [])

    const signOut = async () => {
        await supabase.auth.signOut()
    }

    return (
        <AuthContext.Provider value={{ user, session, loading, signOut, isGodMode, toggleGodMode, profile }}>
            {children}
        </AuthContext.Provider>
    )
}

export const useAuth = () => useContext(AuthContext)
