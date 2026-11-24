// Genera todos los iconos de la app a partir de la N del logo (public/NorDrive.png).
//   node scripts/generar-iconos.mjs
// Dos versiones: "negro" (fondo negro, N blanca) y "blanco" (fondo blanco, N negra), en todos los tamaños:
// favicon, iPhone/iPad (apple-touch-icon), Android/ordenador (PWA), "maskable" (Android recorta en círculo) y la
// insignia monocroma de las notificaciones. La versión que usa la app por defecto se elige con DEFAULT.
import sharp from "sharp"
import { mkdirSync, writeFileSync } from "node:fs"

const SRC = "public/NorDrive.png"
const OUT = "public/icons"
const DEFAULT = "negro" // la que se ve en la pantalla de inicio del iPhone y al instalar en el ordenador
const INK = { r: 0x1f, g: 0x23, b: 0x26 } // gris casi negro del logo
const VERSIONS = {
    negro: { bg: { r: 0, g: 0, b: 0 }, fg: { r: 255, g: 255, b: 255 } },
    blanco: { bg: { r: 255, g: 255, b: 255 }, fg: INK },
}

mkdirSync(OUT, { recursive: true })

// Máscara de la N: lo oscuro del logo pasa a opaco, el fondo blanco a transparente (con bordes suaves)
const { data, info } = await sharp(SRC).greyscale().raw().toBuffer({ resolveWithObject: true })
const alpha = Buffer.alloc(data.length)
for (let i = 0; i < data.length; i++) {
    const v = 255 - data[i]
    alpha[i] = v < 40 ? 0 : v > 200 ? 255 : Math.round(((v - 40) / 160) * 255)
}
const trimmed = await sharp(alpha, { raw: { width: info.width, height: info.height, channels: 1 } }).png().trim({ threshold: 10 }).toBuffer({ resolveWithObject: true })
// Bordes limpios: se amplía ×3, se desenfoca y se vuelve a endurecer el borde (quita el dentado del PNG original)
const mask = await sharp(trimmed.data).resize(trimmed.info.width * 3, trimmed.info.height * 3, { kernel: "cubic" })
    .blur(4).linear(3, -1.5 * 255).png().toBuffer()
const markRatio = trimmed.info.width / trimmed.info.height

/** La N de color `fg` ocupando `scale` del lado (centrada) sobre `bg` (o transparente) */
async function icon(size, { bg, fg, scale }) {
    const h = Math.round(size * scale / Math.max(markRatio, 1))
    const w = Math.round(h * markRatio)
    const m = await sharp(mask).resize(w, h).extractChannel(0).raw().toBuffer()
    const rgba = Buffer.alloc(w * h * 4)
    for (let i = 0; i < w * h; i++) { rgba[i * 4] = fg.r; rgba[i * 4 + 1] = fg.g; rgba[i * 4 + 2] = fg.b; rgba[i * 4 + 3] = m[i] }
    const mark = await sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer()
    // la N tiene más peso visual arriba a la izquierda: se baja un pelo para que se vea centrada
    const left = Math.round((size - w) / 2), top = Math.round((size - h) / 2 + size * 0.01)
    return sharp({ create: { width: size, height: size, channels: 4, background: bg ? { ...bg, alpha: 1 } : { r: 0, g: 0, b: 0, alpha: 0 } } })
        .composite([{ input: mark, left, top }]).png({ compressionLevel: 9 }).toBuffer()
}

const files = []
async function save(name, buf) { writeFileSync(`${OUT}/${name}`, buf); files.push(name) }

for (const [v, { bg, fg }] of Object.entries(VERSIONS)) {
    for (const s of [16, 32, 48, 96]) await save(`favicon-${v}-${s}.png`, await icon(s, { bg, fg, scale: 0.78 }))
    for (const s of [120, 152, 167, 180]) await save(`apple-touch-icon-${v}-${s}.png`, await icon(s, { bg, fg, scale: 0.6 }))
    for (const s of [192, 512]) await save(`icon-${v}-${s}.png`, await icon(s, { bg, fg, scale: 0.6 }))
    for (const s of [192, 512]) await save(`maskable-${v}-${s}.png`, await icon(s, { bg, fg, scale: 0.46 }))
    await save(`logo-${v}-1024.png`, await icon(1024, { bg, fg, scale: 0.6 }))
}
// Insignia de las notificaciones (Android la pinta de un color: solo cuenta la forma)
await save("badge-96.png", await icon(96, { bg: null, fg: { r: 255, g: 255, b: 255 }, scale: 0.86 }))
// N sola sin fondo, por si hace falta en otro sitio
await save("n-negra.png", await icon(512, { bg: null, fg: INK, scale: 0.96 }))
await save("n-blanca.png", await icon(512, { bg: null, fg: { r: 255, g: 255, b: 255 }, scale: 0.96 }))

// Los nombres fijos que buscan los navegadores (copias de la versión por defecto)
writeFileSync("public/apple-icon.png", await icon(180, { ...VERSIONS[DEFAULT], scale: 0.6 }))
writeFileSync("public/apple-touch-icon.png", await icon(180, { ...VERSIONS[DEFAULT], scale: 0.6 }))
writeFileSync("public/favicon.png", await icon(48, { ...VERSIONS[DEFAULT], scale: 0.78 }))
writeFileSync("app/icon.png", await icon(48, { ...VERSIONS[DEFAULT], scale: 0.78 }))
// favicon.ico (PNG dentro de un ICO de 32 px)
const png32 = await icon(32, { ...VERSIONS[DEFAULT], scale: 0.78 })
const ico = Buffer.alloc(22)
ico.writeUInt16LE(0, 0); ico.writeUInt16LE(1, 2); ico.writeUInt16LE(1, 4)
ico.writeUInt8(32, 6); ico.writeUInt8(32, 7); ico.writeUInt8(0, 8); ico.writeUInt8(0, 9)
ico.writeUInt16LE(1, 10); ico.writeUInt16LE(32, 12); ico.writeUInt32LE(png32.length, 14); ico.writeUInt32LE(22, 18)
writeFileSync("public/favicon.ico", Buffer.concat([ico, png32]))

console.log(`${files.length} iconos en ${OUT} (por defecto: ${DEFAULT})`)
