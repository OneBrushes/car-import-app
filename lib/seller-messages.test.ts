import { describe, expect, it } from "vitest"
import { buildMessage, detectLanguage } from "./seller-messages"

const up = { brand: "Volkswagen", model: "up! 1.0", year: 2012, month: 9, mileage: 105932, price: 1999, location: "Berlin", url: "https://suchen.mobile.de/fahrzeuge/details.html?id=1" }

describe("seller messages", () => {
    it("detecta el idioma por el portal", () => {
        expect(detectLanguage(up)).toBe("de")
        expect(detectLanguage({ url: "https://www.leboncoin.fr/voitures/1" })).toBe("fr")
        expect(detectLanguage({ url: "https://www.autoscout24.nl/aanbod/x" })).toBe("nl")
        expect(detectLanguage({ url: "https://www.autoscout24.it/annunci/x" })).toBe("it")
    })

    it("primer contacto: corto, con los datos y sin oferta", () => {
        const text = buildMessage(up, { kind: "first", language: "de", name: "William", questions: ["defects", "papers"], seed: 0 })
        expect(text).toContain("Volkswagen up! 1.0 (EZ 09/2012, 105.932 km, für 1.999 €)")
        expect(text).toContain(" in Berlin")
        expect(text).not.toMatch(/Festpreis|Export/)
        expect(text.trim().endsWith("William")).toBe(true)
    })

    it("cada versión cambia frases", () => {
        const a = buildMessage(up, { kind: "first", language: "de", questions: ["defects"], seed: 0 })
        const b = buildMessage(up, { kind: "first", language: "de", questions: ["defects"], seed: 1 })
        expect(a).not.toBe(b)
    })

    it("negociación con el precio ofrecido", () => {
        const text = buildMessage(up, { kind: "offer", language: "en", offer: 1700, questions: [], seed: 2 })
        expect(text).toContain("1,700 €")
        expect(text.split("\n")[2][0]).toBe(text.split("\n")[2][0].toUpperCase())
    })
})
