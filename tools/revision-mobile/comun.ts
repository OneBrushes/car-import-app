/**
 * Piezas sin efectos del script de mobile.de (tools/revision-mobile/revisar.ts), separadas para poder probarlas.
 */

/** Lo que devuelve https://ipinfo.io/json (solo los campos que usamos) */
export interface IpInfo {
    ip?: string
    country?: string
    org?: string
    hostname?: string
    /** Solo con token de ipinfo; si viene, se usa */
    privacy?: { vpn?: boolean; proxy?: boolean; hosting?: boolean; tor?: boolean }
}

/** Proveedores de VPN y de hosting/centros de datos (una conexión de casa nunca sale por ellos) */
const VPN_OR_HOSTING = /vpn|proxy|hosting|servers?\b|cloud|datacenter|data center|colocation|M247|Datacamp|CDN77|Nord|Proton|Mullvad|Surfshark|Express|Private Internet Access|CyberGhost|Windscribe|IPVanish|Hide\.?me|Zenlayer|Clouvider|DigitalOcean|OVH|Hetzner|Amazon|AWS|Google|Microsoft|Azure|Oracle|Leaseweb|Choopa|Vultr|Linode|Akamai|Cloudflare|Contabo|Scaleway|Hostinger|IONOS|Tzulo|Packethub|Performive|xTom|Psychz/i

/**
 * ¿Parece una VPN o un servidor? Devuelve el motivo, o null si parece la conexión de casa.
 *  · país distinto del de casa (por defecto ES)
 *  · el proveedor (org) es de VPN, hosting o nube
 *  · ipinfo lo marca como vpn/proxy/hosting/tor (si se usa token)
 */
export function vpnSospechosa(info: IpInfo, paisCasa = "ES"): string | null {
    if (info.privacy && (info.privacy.vpn || info.privacy.proxy || info.privacy.hosting || info.privacy.tor)) return `ipinfo la marca como VPN/proxy/hosting (${info.org ?? "?"})`
    if (paisCasa && info.country && info.country.toUpperCase() !== paisCasa.toUpperCase()) return `la IP sale por ${info.country}, no por ${paisCasa} (${info.org ?? "?"})`
    const org = `${info.org ?? ""} ${info.hostname ?? ""}`
    // Las operadoras de casa (Movistar/Telefónica, Vodafone, Orange, Digi, MásMóvil, Jazztel, Lowi, O2, Pepephone…) no coinciden
    if (VPN_OR_HOSTING.test(org) && !/Telefonica|Movistar|Vodafone|Orange|Digi|MasMovil|Xfera|Jazztel|Lowi|Pepephone|Euskaltel|R Cable|Adamo|Avatel|Finetwork/i.test(org)) {
        return `el proveedor de la IP parece de VPN u hosting (${info.org})`
    }
    return null
}

/** Adaptadores de red activos que son de una VPN (Get-NetAdapter → Name / InterfaceDescription) */
export function adaptadorVpn(adaptadores: string[]): string | null {
    return adaptadores.find(a => /vpn|wireguard|nordlynx|openvpn|tap-windows|wintun|\btun\b|proton|mullvad|surfshark|expressvpn|cyberghost|windscribe|fortinet|forticlient|anyconnect|globalprotect|pangp|zerotier|tailscale/i.test(a)) ?? null
}

/** ¿Ya se hizo la revisión de hoy? Vale con el fichero local o con la tabla revisiones (por si se borró el fichero) */
export function yaRevisadoHoy(hoy: string, ultimaLocal: string | null | undefined, servidorDiceHecha: boolean): boolean {
    return ultimaLocal === hoy || servidorDiceHecha
}

/** Ritmo de reintentos sin internet / con VPN: cada 5 min hasta 1 h */
export const RED_REINTENTO_MS = 5 * 60_000
export const RED_MAX_ESPERA_MS = 60 * 60_000

/** Cuenta para el resumen (lo que se manda a /api/anuncios/fin) */
export interface Cuenta { revisados: number; activos: number; retirados: number; cambios_precio: number; errores: number }
export const cuentaVacia = (): Cuenta => ({ revisados: 0, activos: 0, retirados: 0, cambios_precio: 0, errores: 0 })
