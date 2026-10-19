import { describe, expect, it } from "vitest"
import { parseListing } from "./listing-parser"

describe("parseListing", () => {
    it("lee el texto de un anuncio de mobile.de copiado desde el navegador", () => {
        const html = `<meta property="og:image" content="https://img.classistatic.de/api/v1/mo-prod/images/ab/abc?rule=mo-1024.jpg">
<title>BMW 330e Touring M Sport für 29.990 € bei mobile.de</title>
<main>BMW 330e Touring M Sport
29.990 €
Brutto
Kilometerstand
25.200 km
Leistung
135 kW (184 PS)
Kraftstoffart
Hybrid (Benzin/Elektro)
Getriebe
Automatik
Erstzulassung
03/2020</main>`
        const car = parseListing(html, "https://suchen.mobile.de/fahrzeuge/details.html?id=1")
        expect(car.brand).toBe("BMW")
        expect(car.model).toBe("330e Touring")
        expect(car.price).toBe(29990)
        expect(car.mileage).toBe(25200)
        expect(car.cv).toBe(184)
        expect(car.year).toBe(2020)
        expect(car.month).toBe(3)
        expect(car.fuelType).toBe("Hybrid")
        expect(car.transmission).toBe("Automatik")
        expect(car.images).toHaveLength(1)
    })

    it("lee un anuncio en español", () => {
        const car = parseListing(`<main>Seat León FR
Matriculación: 06/2019
Kilometraje: 48.000 km
110 kW (150 CV)
Combustible: Gasolina
Cambio: Manual
18.500 €</main>`, "https://www.coches.net/x")
        expect(car).toMatchObject({ year: 2019, month: 6, mileage: 48000, cv: 150, price: 18500, fuelType: "Gasolina", transmission: "Manual" })
    })
})
