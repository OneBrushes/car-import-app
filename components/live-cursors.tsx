"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth-provider";
import { motion, AnimatePresence } from "framer-motion";

interface Cursor {
    id: string;
    x: number;
    y: number;
    name: string;
    color: string;
}

export const stringToColor = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const c = (hash & 0x00FFFFFF)
        .toString(16)
        .toUpperCase();
    return '#' + '00000'.substring(0, 6 - c.length) + c;
}

export function LiveCursors() {
    const { user, profile } = useAuth();
    const [cursors, setCursors] = useState<{ [key: string]: Cursor }>({});
    const [showLiveCursors, setShowLiveCursors] = useState(true);
    const channelRef = useRef<any>(null);
    const isLocalUpdateRef = useRef(false);

    useEffect(() => {
        // Read local preference
        const saved = localStorage.getItem("showLiveCursors");
        if (saved !== null) {
            setShowLiveCursors(JSON.parse(saved));
        }

        const handleStorage = () => {
            const current = localStorage.getItem("showLiveCursors");
            if (current !== null) setShowLiveCursors(JSON.parse(current));
        };

        window.addEventListener("storage", handleStorage);
        // Custom event for internal toggles without full reload
        window.addEventListener("live-cursors-toggled", handleStorage);

        return () => {
            window.removeEventListener("storage", handleStorage);
            window.removeEventListener("live-cursors-toggled", handleStorage);
        };
    }, []);

    useEffect(() => {
        if (!user || (!showLiveCursors && profile?.role === 'super_admin')) {
            if (channelRef.current) {
                channelRef.current.unsubscribe();
                channelRef.current = null;
            }
            return;
        }

        if (!channelRef.current) {
            const channel = supabase.channel("live_cursors", {
                config: { broadcast: { self: false } },
            });

            channel
                .on("broadcast", { event: "cursor_move" }, (payload: any) => {
                    setCursors((prev) => ({
                        ...prev,
                        [payload.payload.id]: payload.payload,
                    }));
                })
                .subscribe();

            channelRef.current = channel;

            // Cleanup cursors over time
            const interval = setInterval(() => {
                setCursors((prev) => {
                    // Logic to maybe remove idle cursors could go here
                    // Due to simplicity, we map over active only or use presence if we wanted perfect removal. 
                    // To prevent memory leak, we clear all after 5 mins of no movement from a user.
                    // But in a simple POC we'll keep them as they override their position.
                    return prev;
                });
            }, 1000 * 60);

            return () => {
                clearInterval(interval);
                channel.unsubscribe();
                channelRef.current = null;
            };
        }
    }, [user, showLiveCursors]);

    useEffect(() => {
        if (!user) return; // All users must broadcast, but we respect if they want to pause (if we add such feature). Currently we just let everyone broadcast quietly.

        let frame: number;
        let lastSend = 0;

        const handleMouseMove = (e: MouseEvent) => {
            const now = Date.now();
            // Throttle to 50ms (approx 20fps) to save compute & latency
            if (now - lastSend > 50) {
                lastSend = now;
                const name = profile?.first_name  
                    ? `${profile.first_name} ${profile.last_name ? profile.last_name[0] + '.' : ''}`
                    : (user.email?.split('@')[0] || "User");
                const color = stringToColor(user.id);
                
                // We send percentage based coordinates so it works across different screen sizes
                const payload = {
                    id: user.id,
                    x: (e.clientX / window.innerWidth) * 100,
                    y: (e.clientY / window.innerHeight) * 100,
                    name,
                    color
                };

                if (channelRef.current) {
                    channelRef.current.send({
                        type: "broadcast",
                        event: "cursor_move",
                        payload,
                    });
                }
            }
        };

        window.addEventListener("mousemove", handleMouseMove);
        return () => window.removeEventListener("mousemove", handleMouseMove);
    }, [user, profile, showLiveCursors]);

    if (!showLiveCursors || profile?.role !== 'super_admin') return null;

    return (
        <div className="pointer-events-none fixed inset-0 z-[9999] overflow-hidden">
            <AnimatePresence>
                {Object.values(cursors).map((cursor) => (
                    <motion.div
                        key={cursor.id}
                        initial={{ opacity: 0 }}
                        animate={{
                            opacity: 1,
                            x: `${cursor.x}vw`,
                            y: `${cursor.y}vh`,
                        }}
                        exit={{ opacity: 0 }}
                        transition={{
                            type: "spring",
                            damping: 40,
                            stiffness: 400,
                            mass: 0.8,
                        }}
                        className="absolute top-0 left-0 flex flex-col"
                        style={{
                            translateX: "-3px",
                            translateY: "-3px"
                        }}
                    >
                        {/* Cursor SVG */}
                        <svg
                            width="24"
                            height="24"
                            viewBox="0 0 24 24"
                            fill={cursor.color}
                            className="drop-shadow-md"
                            xmlns="http://www.w3.org/2000/svg"
                        >
                            <path
                                d="M5.5 3.5L18 12.5L13 14.5L16.5 20.5L13.5 22L10 16L6 20.5V3.5Z"
                                stroke="white"
                                strokeWidth="2"
                                strokeLinejoin="round"
                            />
                        </svg>

                        {/* Name Tag */}
                        <div
                            className="bg-white/90 text-neutral-900 border font-bold text-[10px] px-2 py-0.5 rounded-full shadow-lg ml-3 mt-1 pointer-events-none uppercase tracking-widest whitespace-nowrap"
                            style={{ 
                                borderColor: cursor.color,
                                color: cursor.color
                            }}
                        >
                            {cursor.name}
                        </div>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
}
