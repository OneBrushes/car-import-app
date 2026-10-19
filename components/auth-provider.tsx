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
        } = supabase.auth.onAuthStateChange((event, session) => {
            // IMPORTANTE: este callback debe ser síncrono. Supabase lo ejecuta con el
            // lock de auth tomado; un `await supabase...` aquí dentro provoca un deadlock
            // al volver a la pestaña y deja colgadas todas las peticiones siguientes.
            // Por eso la consulta del perfil se difiere con setTimeout.
            setSession(session)
            setUser(session?.user ?? null)
            setLoading(false)

            if (!session?.user) {
                setProfile(null)
                setIsGodMode(false)
                return
            }

            // Un refresco de token no cambia el perfil
            if (event === 'TOKEN_REFRESHED') return

            const userId = session.user.id
            setTimeout(async () => {
                const { data: profileData } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', userId)
                    .single()

                if (profileData?.role === 'banned') {
                    await supabase.auth.signOut()
                    return
                }

                setProfile(profileData)
            }, 0)
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
