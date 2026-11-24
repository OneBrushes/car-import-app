// Notificaciones Web Push sin dependencias (solo WebCrypto): sirve en el Worker de Cloudflare y en Node (tests).
//   - Cifrado del mensaje: RFC 8291 (aes128gcm), obligatorio para que el iPhone muestre el texto.
//   - Firma VAPID: RFC 8292 (JWT ES256).
// Las claves VAPID se generan una vez con `node scripts/generar-vapid.mjs`.

export interface PushSubscriptionKeys {
    endpoint: string
    /** Clave pública del navegador (base64url, 65 bytes sin comprimir) */
    p256dh: string
    /** Secreto de autenticación del navegador (base64url, 16 bytes) */
    auth: string
}

export interface VapidKeys {
    /** Clave pública (base64url, 65 bytes sin comprimir). La usa también la app para suscribirse */
    publicKey: string
    /** Clave privada (base64url, 32 bytes: el valor "d") */
    privateKey: string
    /** mailto: o https: de contacto para el servicio de push (Apple lo exige) */
    subject: string
}

export interface PushMessage {
    title: string
    body: string
    /** Página que se abre al tocar la notificación */
    url?: string
    /** Notificaciones con el mismo tag se sustituyen en vez de acumularse */
    tag?: string
}

const enc = new TextEncoder()
/** Bytes sobre un ArrayBuffer normal (lo que pide WebCrypto en los tipos de TS 5.7+) */
type Bytes = Uint8Array<ArrayBuffer>
const utf8 = (text: string): Bytes => new Uint8Array(enc.encode(text))

export function b64urlEncode(bytes: Uint8Array | ArrayBuffer): string {
    const arr: Uint8Array = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
    let bin = ""
    for (const b of arr) bin += String.fromCharCode(b)
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

export function b64urlDecode(value: string): Bytes {
    const b64 = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4)
    const bin = atob(b64)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
}

function concat(...parts: Bytes[]): Bytes {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
    let off = 0
    for (const p of parts) { out.set(p, off); off += p.length }
    return out
}

async function hkdf(salt: Bytes, ikm: Bytes, info: Bytes, bytes: number): Promise<Bytes> {
    const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"])
    return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, bytes * 8))
}

/** Claves de contenido según RFC 8291 §3.4 (las usan el cifrado y, en los tests, el descifrado) */
export async function deriveContentKeys(ecdhSecret: Bytes, authSecret: Bytes, uaPublic: Bytes, asPublic: Bytes, salt: Bytes) {
    const keyInfo = concat(utf8("WebPush: info\0"), uaPublic, asPublic)
    const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32)
    const cek = await hkdf(salt, ikm, utf8("Content-Encoding: aes128gcm\0"), 16)
    const nonce = await hkdf(salt, ikm, utf8("Content-Encoding: nonce\0"), 12)
    return { cek, nonce }
}

/** Cifra el mensaje para una suscripción (un único registro aes128gcm) */
export async function encryptPayload(payload: Bytes, sub: Pick<PushSubscriptionKeys, "p256dh" | "auth">): Promise<Bytes> {
    const uaPublic = b64urlDecode(sub.p256dh)
    const authSecret = b64urlDecode(sub.auth)
    if (uaPublic.length !== 65 || authSecret.length < 16) throw new Error("Suscripción push con claves no válidas")
    const asKeys = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair
    const asPublic = new Uint8Array((await crypto.subtle.exportKey("raw", asKeys.publicKey)) as ArrayBuffer)
    const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, [])
    const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey } as unknown as { name: string }, asKeys.privateKey, 256))
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const { cek, nonce } = await deriveContentKeys(ecdhSecret, authSecret, uaPublic, asPublic, salt)
    const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"])
    // 0x02 = delimitador del último (y único) registro
    const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, concat(payload, new Uint8Array([2]))))
    const header = new Uint8Array(16 + 4 + 1 + asPublic.length)
    header.set(salt, 0)
    new DataView(header.buffer).setUint32(16, 4096)
    header[20] = asPublic.length
    header.set(asPublic, 21)
    return concat(header, cipher)
}

/** Cabecera Authorization "vapid t=<JWT>, k=<clave pública>" para el servicio de push del endpoint */
export async function vapidAuthorization(endpoint: string, vapid: VapidKeys, now = Date.now()): Promise<string> {
    const pub = b64urlDecode(vapid.publicKey)
    if (pub.length !== 65) throw new Error("VAPID_PUBLIC_KEY no válida")
    const jwk: JsonWebKey = { kty: "EC", crv: "P-256", d: vapid.privateKey, x: b64urlEncode(pub.slice(1, 33)), y: b64urlEncode(pub.slice(33, 65)), ext: true }
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"])
    const header = b64urlEncode(utf8(JSON.stringify({ typ: "JWT", alg: "ES256" })))
    const claims = b64urlEncode(utf8(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: vapid.subject })))
    const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, utf8(`${header}.${claims}`))
    return `vapid t=${header}.${claims}.${b64urlEncode(signature)}, k=${vapid.publicKey}`
}

/** Petición lista para enviar al servicio de push (Apple, Google, Mozilla, Microsoft…) */
export async function buildPushRequest(sub: PushSubscriptionKeys, message: PushMessage, vapid: VapidKeys, ttlSeconds = 86400): Promise<Request> {
    const body = await encryptPayload(utf8(JSON.stringify(message)), sub)
    return new Request(sub.endpoint, {
        method: "POST",
        headers: {
            Authorization: await vapidAuthorization(sub.endpoint, vapid),
            "Content-Encoding": "aes128gcm",
            "Content-Type": "application/octet-stream",
            TTL: String(ttlSeconds),
            Urgency: "normal",
            ...(message.tag ? { Topic: message.tag.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) || "nordrive" } : {}),
        },
        body,
    })
}

/** 404/410: la suscripción ya no existe (app desinstalada o permiso quitado) → hay que borrarla */
export const isGoneStatus = (status: number) => status === 404 || status === 410
