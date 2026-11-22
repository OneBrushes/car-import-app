// Tipos de la búsqueda automática de coches (tools/buscador). Sin dependencias: lo usan el script y los tests.

export interface Busqueda {
    id: string
    nombre: string
    marca: string
    modelos: string[]
    /** Palabras que debe tener la versión (p. ej. ["R"] para Golf R, ["VZ"] para León VZ) */
    palabras_version: string[]
    anio_min: number | null
    anio_max: number | null
    km_max: number | null
    precio_max: number | null
    cv_min: number | null
    combustibles: string[]
    carrocerias_excluidas: string[]
    activa: boolean
    ultima_ejecucion?: string | null
}

export type PortalDE = "autoscout24" | "kleinanzeigen" | "mobile.de"

/** Un anuncio alemán ya leído (lista + ficha) */
export interface Anuncio {
    portal: PortalDE
    id: string
    url: string
    titulo: string
    marca: string
    modelo: string
    version: string
    precio: number | null
    /** Precio neto si el anuncio lo da (IVA deducible) */
    precio_neto: number | null
    km: number | null
    anio: number | null
    mes: number | null
    cv: number | null
    cc: number | null
    co2: number | null
    combustible: string | null
    carroceria: string | null
    cambio: string | null
    descripcion: string
    vendedor_tipo: "particular" | "concesionario" | null
    vendedor_nombre: string | null
    ciudad: string | null
    pais: string | null
    fotos: string[]
    /** Mediana de precio del portal para ese coche (AutoScout24 la da), si la hay */
    mediana_portal: number | null
}

/** Un anuncio de España para calcular el precio de venta */
export interface Comparable {
    fuente: "wallapop" | "autoscout24.es"
    url: string
    titulo: string
    precio: number
    anio: number | null
    km: number | null
    cv: number | null
    particular: boolean
    /** Días que lleva publicado (si la fuente lo da) */
    dias_publicado: number | null
}
