// Puntos de la inspección de un coche (pestaña Checklist). Se guardan en car_checklists.data con la clave
// "<sección>-<índice>" y, al guardar, también su texto y sección, para que el área de clientes de la web los
// pueda enseñar aunque esta lista cambie.

export interface ChecklistEntry {
    checked: boolean
    note: string
    /** URLs públicas de las fotos de este punto (bucket car-images, carpeta checklists/<coche>/) */
    photos?: string[]
    /** Texto del punto y título de la sección (se rellenan al guardar) */
    label?: string
    section?: string
}

export type ChecklistData = Record<string, ChecklistEntry>

export const CHECKLIST_SECTIONS = {
    exterior: {
        title: "Exterior",
        items: [
            "Estado de la pintura (arañazos, golpes)",
            "Lunas y espejos",
            "Llantas y neumáticos (profundidad, marca)",
            "Luces y faros (funcionamiento, roturas)",
            "Ajuste de puertas y capó"
        ]
    },
    interior: {
        title: "Interior",
        items: [
            "Tapicería y asientos",
            "Volante y palanca de cambios",
            "Botones y mandos",
            "Aire acondicionado / Climatizador",
            "Cuadro de instrumentos (testigos)"
        ]
    },
    motor: {
        title: "Motor y Mecánica",
        items: [
            "Nivel de aceite",
            "Nivel de refrigerante",
            "Fugas visibles",
            "Ruidos extraños al arrancar",
            "Estado de correas (visual)"
        ]
    },
    prueba: {
        title: "Prueba Dinámica",
        items: [
            "Arranque en frío",
            "Frenada",
            "Dirección (holguras, ruidos)",
            "Cambio de marchas (suavidad)",
            "Suspensión (ruidos)"
        ]
    },
    documentacion: {
        title: "Documentación",
        items: [
            "Permiso de circulación",
            "Ficha técnica",
            "Libro de mantenimiento",
            "Número de llaves",
            "COC (Certificado de Conformidad)"
        ]
    },
    herramientas: {
        title: "Herramientas / Diagnóstico",
        items: [
            "Espesómetro (Pintura original)",
            "Lectura OBD (Códigos de error)"
        ]
    }
}

/** Añade a cada punto su texto y sección (para el área de clientes) */
export function withLabels(data: ChecklistData): ChecklistData {
    const out: ChecklistData = { ...data }
    for (const [key, section] of Object.entries(CHECKLIST_SECTIONS)) {
        section.items.forEach((label, idx) => {
            const k = `${key}-${idx}`
            if (out[k]) out[k] = { ...out[k], label, section: section.title }
        })
    }
    return out
}
