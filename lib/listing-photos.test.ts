import { describe, expect, it } from "vitest"
import { extractListingPhotos } from "./listing-parser"

const id = (n: number) => `0000000${n}-aaaa-bbbb-cccc-dddddddddddd`
const mobile = (dir: string, n: number) => `https://img.classistatic.de/api/v1/mo-prod/images/${dir}/${id(n)}`

describe("extractListingPhotos", () => {
    it("saca todas las fotos de mobile.de, sin repetir y a 1024 px (también las escapadas en el JSON)", () => {
        const escapedU = mobile("ab", 1).replace(/\//g, "\\u002F")
        const escapedSlash = mobile("cd", 2).replace(/\//g, "\\/")
        const html = `<meta property="og:image" content="${mobile("ab", 1)}?rule=mo-640.jpg">
<script>window.__STATE__={"gallery":["${escapedU}","${escapedSlash}"]}</script>
<img src="${mobile("ef", 3)}?rule=mo-360.jpg">`
        expect(extractListingPhotos(html, "https://suchen.mobile.de/fahrzeuge/details.html?id=1")).toEqual([
            `${mobile("ab", 1)}?rule=mo-1600.jpg`,
            `${mobile("cd", 2)}?rule=mo-1600.jpg`,
            `${mobile("ef", 3)}?rule=mo-1600.jpg`,
        ])
    })

    it("saca las de AutoScout24 a 1280×960 y respeta el máximo", () => {
        const img = (n: number, size = "720x540.webp") => `https://prod.pictures.autoscout24.net/listing-images/1111-${n}_2222-${n}.jpg/${size}`
        const html = [img(1), img(1, "250x188.webp"), img(2), img(3)].map(u => `<img src="${u}">`).join("")
        expect(extractListingPhotos(html, "https://www.autoscout24.de/angebote/x", 2)).toEqual([
            "https://prod.pictures.autoscout24.net/listing-images/1111-1_2222-1.jpg/1280x960.webp",
            "https://prod.pictures.autoscout24.net/listing-images/1111-2_2222-2.jpg/1280x960.webp",
        ])
    })
})
