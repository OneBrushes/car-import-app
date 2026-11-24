// Genera un par de claves VAPID para las notificaciones push (una sola vez).
//   node scripts/generar-vapid.mjs
// - La PÚBLICA va en workers/nordrive-mcp/wrangler.toml → [vars] VAPID_PUBLIC_KEY
// - La PRIVADA es un secreto del Worker:  cd workers/nordrive-mcp && npx wrangler secret put VAPID_PRIVATE_KEY
// Si cambias las claves, todos los dispositivos tienen que volver a activar las notificaciones.
const { publicKey, privateKey } = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])
const pub = Buffer.from(await crypto.subtle.exportKey("raw", publicKey)).toString("base64url")
const { d } = await crypto.subtle.exportKey("jwk", privateKey)
console.log(`VAPID_PUBLIC_KEY=${pub}`)
console.log(`VAPID_PRIVATE_KEY=${d}`)
