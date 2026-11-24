import { describe, expect, it } from "vitest"
import { b64urlDecode, b64urlEncode, buildPushRequest, deriveContentKeys, encryptPayload, isGoneStatus, vapidAuthorization, type VapidKeys } from "./web-push"

async function receiver() {
    const keys = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair
    const pub = new Uint8Array((await crypto.subtle.exportKey("raw", keys.publicKey)) as ArrayBuffer)
    const auth = crypto.getRandomValues(new Uint8Array(16))
    return { keys, sub: { endpoint: "https://web.push.apple.com/QGuQyavXutnMH_abc", p256dh: b64urlEncode(pub), auth: b64urlEncode(auth) } }
}

/** Lo que hace el navegador al recibir: descifrar el registro aes128gcm */
async function decrypt(body: Uint8Array, uaKeys: CryptoKeyPair, sub: { p256dh: string; auth: string }) {
    const salt = body.slice(0, 16)
    const rs = new DataView(body.buffer, body.byteOffset).getUint32(16)
    const idlen = body[20]
    const asPublic = body.slice(21, 21 + idlen)
    const asKey = await crypto.subtle.importKey("raw", asPublic, { name: "ECDH", namedCurve: "P-256" }, false, [])
    const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: asKey } as unknown as { name: string }, uaKeys.privateKey, 256))
    const { cek, nonce } = await deriveContentKeys(ecdh, b64urlDecode(sub.auth), b64urlDecode(sub.p256dh), asPublic, salt)
    const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"])
    const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, key, body.slice(21 + idlen)))
    return { rs, idlen, plain }
}

async function vapidKeys(): Promise<{ vapid: VapidKeys; publicKey: CryptoKey }> {
    const kp = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair
    const jwk = await crypto.subtle.exportKey("jwk", kp.privateKey)
    const pub = new Uint8Array((await crypto.subtle.exportKey("raw", kp.publicKey)) as ArrayBuffer)
    return { vapid: { publicKey: b64urlEncode(pub), privateKey: jwk.d!, subject: "https://app.nordrivecars.com" }, publicKey: kp.publicKey }
}

describe("web push", () => {
    it("base64url ida y vuelta", () => {
        const bytes = crypto.getRandomValues(new Uint8Array(65))
        expect(b64urlDecode(b64urlEncode(bytes))).toEqual(bytes)
        expect(b64urlEncode(new Uint8Array([251, 255]))).toBe("-_8")
    })

    it("cifra el mensaje de forma que el navegador lo puede descifrar (RFC 8291)", async () => {
        const { keys, sub } = await receiver()
        const text = JSON.stringify({ title: "🚗 Nuevo coche", body: "BMW X3 (2021) · beneficio 4.200 €" })
        const body = await encryptPayload(new TextEncoder().encode(text), sub)
        const { rs, idlen, plain } = await decrypt(body, keys, sub)
        expect(rs).toBe(4096)
        expect(idlen).toBe(65)
        expect(plain[plain.length - 1]).toBe(2)
        expect(new TextDecoder().decode(plain.slice(0, -1))).toBe(text)
    })

    it("rechaza claves de suscripción mal formadas", async () => {
        await expect(encryptPayload(new Uint8Array([1]), { p256dh: "abc", auth: "def" })).rejects.toThrow(/no válidas/)
    })

    it("firma el JWT VAPID con la audiencia del servicio de push", async () => {
        const { vapid, publicKey } = await vapidKeys()
        const now = Date.UTC(2026, 10, 24, 6, 0, 0)
        const header = await vapidAuthorization("https://fcm.googleapis.com/fcm/send/xyz", vapid, now)
        const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header)!
        expect(m).toBeTruthy()
        expect(m[4]).toBe(vapid.publicKey)
        const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(m[2])))
        expect(claims).toEqual({ aud: "https://fcm.googleapis.com", exp: now / 1000 + 12 * 3600, sub: "https://app.nordrivecars.com" })
        const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, publicKey, b64urlDecode(m[3]), new TextEncoder().encode(`${m[1]}.${m[2]}`))
        expect(ok).toBe(true)
    })

    it("arma la petición con las cabeceras que piden Apple y Google", async () => {
        const { keys, sub } = await receiver()
        const { vapid } = await vapidKeys()
        const req = await buildPushRequest(sub, { title: "Prueba", body: "Hola", url: "/?tab=claude", tag: "revision-2026-11-24" }, vapid)
        expect(req.method).toBe("POST")
        expect(req.url).toBe(sub.endpoint)
        expect(req.headers.get("Content-Encoding")).toBe("aes128gcm")
        expect(req.headers.get("TTL")).toBe("86400")
        expect(req.headers.get("Topic")).toBe("revision-2026-11-24")
        expect(req.headers.get("Authorization")).toMatch(/^vapid t=.+, k=/)
        const { plain } = await decrypt(new Uint8Array(await req.arrayBuffer()), keys, sub)
        expect(JSON.parse(new TextDecoder().decode(plain.slice(0, -1)))).toMatchObject({ title: "Prueba", url: "/?tab=claude" })
    })

    it("404 y 410 = suscripción caducada", () => {
        expect(isGoneStatus(410)).toBe(true)
        expect(isGoneStatus(404)).toBe(true)
        expect(isGoneStatus(201)).toBe(false)
        expect(isGoneStatus(429)).toBe(false)
    })
})
