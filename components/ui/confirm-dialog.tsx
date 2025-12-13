"use client"

import { motion, AnimatePresence } from 'framer-motion'
import { AlertCircle, Save, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ConfirmDialogProps {
    isOpen: boolean
    title: string
    message: string
    confirmText?: string
    cancelText?: string
    onConfirm: () => void
    onCancel: () => void
    type?: 'warning' | 'info' | 'danger'
}

export function ConfirmDialog({
    isOpen,
    title,
    message,
    confirmText = 'Confirmar',
    cancelText = 'Cancelar',
    onConfirm,
    onCancel,
    type = 'warning'
}: ConfirmDialogProps) {
    if (!isOpen) return null

    const icons = {
        warning: <AlertCircle className="w-12 h-12 text-orange-500" />,
        info: <Save className="w-12 h-12 text-blue-500" />,
        danger: <Trash2 className="w-12 h-12 text-red-500" />
    }

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[100] flex items-center justify-center">
                {/* Backdrop */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onCancel}
                    className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                />

                {/* Dialog */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className="relative bg-background border border-border rounded-2xl shadow-2xl p-6 max-w-md w-full mx-4"
                >
                    {/* Icon */}
                    <div className="flex justify-center mb-4">
                        {icons[type]}
                    </div>

                    {/* Title */}
                    <h3 className="text-xl font-bold text-center mb-2">
                        {title}
                    </h3>

                    {/* Message */}
                    <p className="text-muted-foreground text-center mb-6">
                        {message}
                    </p>

                    {/* Actions */}
                    <div className="flex gap-3">
                        <Button
                            variant="outline"
                            onClick={onCancel}
                            className="flex-1"
                        >
                            {cancelText}
                        </Button>
                        <Button
                            onClick={onConfirm}
                            className="flex-1"
                        >
                            {confirmText}
                        </Button>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    )
}
