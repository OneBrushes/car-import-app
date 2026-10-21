// Mensajes para escribir al vendedor de un coche: primer contacto (corto, sin oferta) y negociación (con precio).
// Cada versión mezcla frases distintas para que no salgan mensajes idénticos (los portales y los filtros de correo
// marcan como spam los textos repetidos). Idioma según el portal / país del anuncio.

export type SellerLanguage = "de" | "en" | "fr" | "nl" | "it" | "es"
export type MessageKind = "first" | "offer"
export type QuestionKey = "defects" | "papers" | "service" | "inspection"

export const LANGUAGE_LABEL: Record<SellerLanguage, string> = {
  de: "Alemán", en: "Inglés", fr: "Francés", nl: "Neerlandés", it: "Italiano", es: "Español",
}

export const QUESTION_LABEL: Record<QuestionKey, string> = {
  defects: "Defectos o golpes",
  papers: "Papeles completos",
  service: "Libro de mantenimiento",
  inspection: "Última ITV",
}

export interface SellerCar {
  brand?: string | null
  model?: string | null
  year?: number | null
  month?: number | null
  mileage?: number | null
  price?: number | null
  location?: string | null
  url?: string | null
  platform?: string | null
  origin?: string | null
}

export interface MessageOptions {
  kind: MessageKind
  language: SellerLanguage
  /** Tu nombre para la firma */
  name?: string
  phone?: string
  /** Precio que ofreces (solo en negociación) */
  offer?: number | null
  questions: QuestionKey[]
  /** Cambia las frases elegidas: cada número da otra versión */
  seed: number
}

/** Idioma del vendedor según el enlace del anuncio o el país de origen */
export function detectLanguage(car: SellerCar): SellerLanguage {
  const url = (car.url || "").toLowerCase()
  let host = ""
  try { host = new URL(url.startsWith("http") ? url : `https://${url}`).hostname } catch { /* sin enlace */ }
  const tld = host.split(".").pop() || ""
  if (/leboncoin|lacentrale/.test(host) || tld === "fr") return "fr"
  if (/marktplaats|2dehands|gaspedaal/.test(host) || tld === "nl" || tld === "be") return "nl"
  if (/subito/.test(host) || tld === "it") return "it"
  if (/coches\.net|milanuncios|wallapop/.test(host) || tld === "es") return "es"
  if (/autotrader\.co\.uk/.test(host) || tld === "uk") return "en"
  if (/mobile\.de|kleinanzeigen/.test(host) || tld === "de" || tld === "at" || tld === "ch") return "de"
  const origin = (car.origin || "").toLowerCase()
  if (/franc/.test(origin)) return "fr"
  if (/holan|países bajos|paises bajos|bélgica|belgica/.test(origin)) return "nl"
  if (/itali/.test(origin)) return "it"
  if (/reino unido|inglat/.test(origin)) return "en"
  if (/españa|espana/.test(origin)) return "es"
  return "de"
}

// ---------------------------------------------------------------------------------------------------------------------

type Pools = {
  greet: string[]
  available: string[]          // {car} {details}
  intent: string[]             // {city}
  q: Record<QuestionKey, string[]>
  close: string[]
  phone: string                // {phone}
  sign: string[]
  // negociación
  thanks: string[]
  like: string[]               // {car}
  ask: string[]                // {offer} {city}
  closeOffer: string[]
  km: string
  ez: (m: string) => string
  priceWord: string
  cityPrefix: string           // " in " / " à "…
}

const P: Record<SellerLanguage, Pools> = {
  de: {
    greet: ["Guten Tag,", "Hallo,", "Sehr geehrte Damen und Herren,"],
    available: [
      "ist Ihr {car} ({details}) noch verfügbar?",
      "ich interessiere mich für Ihren {car} ({details}). Ist das Fahrzeug noch zu haben?",
      "Ihr Angebot für den {car} ({details}) hat mein Interesse geweckt. Ist er noch verfügbar?",
    ],
    intent: [
      "Ich würde ihn gerne kaufen und selbst{city} abholen.",
      "Ich suche genau so ein Fahrzeug und könnte es kurzfristig{city} abholen.",
      "Wenn alles passt, würde ich ihn gerne kaufen und persönlich{city} abholen.",
    ],
    q: {
      defects: ["Gibt es bekannte Mängel oder Unfallschäden?", "Hat das Fahrzeug Unfallschäden oder technische Mängel?"],
      papers: ["Sind beide Zulassungsbescheinigungen (Teil I und II) vorhanden?", "Liegen Fahrzeugbrief und Fahrzeugschein vollständig vor?"],
      service: ["Gibt es ein Scheckheft oder Wartungsnachweise?", "Wurde das Fahrzeug regelmäßig gewartet (Scheckheft/Rechnungen)?"],
      inspection: ["Wann war die letzte HU/TÜV?", "Bis wann ist die HU (TÜV) noch gültig?"],
    },
    close: [
      "Ich könnte kurzfristig vorbeikommen und per Überweisung oder bar bezahlen.",
      "Über eine kurze Rückmeldung würde ich mich freuen.",
      "Vielen Dank vorab für Ihre Antwort.",
    ],
    phone: "Sie erreichen mich auch telefonisch unter {phone}.",
    sign: ["Viele Grüße", "Mit freundlichen Grüßen", "Beste Grüße"],
    thanks: ["vielen Dank für Ihre Rückmeldung.", "danke für die schnelle Antwort und die Infos."],
    like: ["Der {car} gefällt mir und ich würde ihn gerne kaufen.", "Ich habe mir den {car} noch einmal angesehen und bin weiterhin interessiert."],
    ask: [
      "Da ich den Transport{city} selbst organisiere und den Wagen direkt abhole: Wäre ein Preis von {offer} für Sie in Ordnung?",
      "Könnten Sie mir beim Preis auf {offer} entgegenkommen? Ich hole das Fahrzeug selbst{city} ab.",
    ],
    closeOffer: [
      "Bei einer Einigung kann ich kurzfristig überweisen und die Abholung organisieren.",
      "Wenn das für Sie passt, können wir gerne einen Abholtermin vereinbaren.",
    ],
    km: "km", ez: (m) => `EZ ${m}`, priceWord: "für", cityPrefix: " in ",
  },
  en: {
    greet: ["Hello,", "Hi,", "Good afternoon,"],
    available: [
      "is your {car} ({details}) still available?",
      "I'm interested in your {car} ({details}). Is it still for sale?",
      "I came across your {car} ({details}) and wanted to ask if it is still available.",
    ],
    intent: [
      "I'd like to buy it and collect it myself{city}.",
      "I'm looking for exactly this car and could collect it{city} at short notice.",
      "If everything checks out, I'd buy it and pick it up in person{city}.",
    ],
    q: {
      defects: ["Are there any known faults or accident damage?", "Has the car had any accidents or does it have any mechanical issues?"],
      papers: ["Is the V5C logbook available?", "Are all the registration documents complete?"],
      service: ["Does it come with a service history?", "Has it been serviced regularly (service book or invoices)?"],
      inspection: ["When does the MOT expire?", "When was the last MOT?"],
    },
    close: ["I could come by soon and pay by bank transfer.", "I'd appreciate a quick reply.", "Thanks in advance for your answer."],
    phone: "You can also reach me on {phone}.",
    sign: ["Kind regards", "Best regards", "Many thanks"],
    thanks: ["thanks for getting back to me.", "thank you for the quick reply and the details."],
    like: ["I like the {car} and would like to buy it.", "I'm still very interested in the {car}."],
    ask: [
      "As I'm arranging the transport{city} myself and collecting it directly, would {offer} work for you?",
      "Could you meet me at {offer}? I'll collect the car myself{city}.",
    ],
    closeOffer: ["If we agree, I can transfer the money quickly and arrange collection.", "If that works for you, we can set a collection date."],
    km: "km", ez: (m) => `first reg. ${m}`, priceWord: "for", cityPrefix: " in ",
  },
  fr: {
    greet: ["Bonjour,", "Bonjour Madame, Monsieur,"],
    available: [
      "votre {car} ({details}) est-il toujours disponible ?",
      "je suis intéressé par votre {car} ({details}). Est-il toujours à vendre ?",
      "votre annonce pour le {car} ({details}) m'intéresse. Le véhicule est-il encore disponible ?",
    ],
    intent: [
      "Je souhaiterais l'acheter et venir le chercher moi-même{city}.",
      "Je cherche exactement ce modèle et je pourrais venir le récupérer rapidement{city}.",
      "Si tout est en ordre, je l'achèterais et viendrais le chercher en personne{city}.",
    ],
    q: {
      defects: ["Y a-t-il des défauts connus ou des dommages d'accident ?", "Le véhicule a-t-il été accidenté ou présente-t-il des problèmes mécaniques ?"],
      papers: ["La carte grise est-elle disponible ?", "Tous les documents du véhicule sont-ils complets ?"],
      service: ["Le carnet d'entretien est-il disponible ?", "L'entretien a-t-il été fait régulièrement (carnet ou factures) ?"],
      inspection: ["À quand remonte le dernier contrôle technique ?", "Jusqu'à quand le contrôle technique est-il valable ?"],
    },
    close: ["Je pourrais passer rapidement et payer par virement.", "Merci de me tenir au courant.", "Merci d'avance pour votre réponse."],
    phone: "Vous pouvez aussi me joindre au {phone}.",
    sign: ["Cordialement", "Bien cordialement", "Merci et bonne journée"],
    thanks: ["merci pour votre réponse.", "merci pour votre retour rapide et les informations."],
    like: ["Le {car} me plaît et je souhaiterais l'acheter.", "Je suis toujours très intéressé par le {car}."],
    ask: [
      "Comme j'organise moi-même le transport{city} et que je viens le chercher directement, un prix de {offer} vous conviendrait-il ?",
      "Pourriez-vous faire un geste et descendre à {offer} ? Je viens récupérer le véhicule moi-même{city}.",
    ],
    closeOffer: ["Si nous sommes d'accord, je peux faire le virement rapidement et organiser l'enlèvement.", "Si cela vous convient, nous pouvons fixer une date pour l'enlèvement."],
    km: "km", ez: (m) => `mise en circulation ${m}`, priceWord: "à", cityPrefix: " à ",
  },
  nl: {
    greet: ["Goedendag,", "Hallo,", "Beste verkoper,"],
    available: [
      "is uw {car} ({details}) nog beschikbaar?",
      "ik ben geïnteresseerd in uw {car} ({details}). Is de auto nog te koop?",
      "uw advertentie voor de {car} ({details}) sprak me aan. Is hij nog beschikbaar?",
    ],
    intent: [
      "Ik wil hem graag kopen en zelf ophalen{city}.",
      "Ik zoek precies deze auto en kan hem op korte termijn ophalen{city}.",
      "Als alles klopt, koop ik hem graag en haal ik hem persoonlijk op{city}.",
    ],
    q: {
      defects: ["Zijn er bekende gebreken of schade?", "Heeft de auto schade gehad of technische problemen?"],
      papers: ["Zijn alle kentekenpapieren aanwezig?", "Zijn de registratiedocumenten compleet?"],
      service: ["Is er een onderhoudsboekje of zijn er facturen?", "Is de auto regelmatig onderhouden?"],
      inspection: ["Tot wanneer is de APK geldig?", "Wanneer was de laatste APK-keuring?"],
    },
    close: ["Ik kan op korte termijn langskomen en per overschrijving betalen.", "Ik hoor graag van u.", "Alvast bedankt voor uw antwoord."],
    phone: "U kunt me ook bellen op {phone}.",
    sign: ["Met vriendelijke groet", "Vriendelijke groeten", "Groeten"],
    thanks: ["bedankt voor uw reactie.", "dank voor het snelle antwoord en de informatie."],
    like: ["De {car} bevalt me en ik wil hem graag kopen.", "Ik ben nog steeds erg geïnteresseerd in de {car}."],
    ask: [
      "Omdat ik het transport{city} zelf regel en de auto direct ophaal: zou {offer} voor u akkoord zijn?",
      "Kunt u mij tegemoetkomen tot {offer}? Ik haal de auto zelf op{city}.",
    ],
    closeOffer: ["Als we het eens worden, kan ik snel overmaken en het ophalen regelen.", "Als dat voor u goed is, spreken we graag een ophaalmoment af."],
    km: "km", ez: (m) => `bouwjaar ${m}`, priceWord: "voor", cityPrefix: " in ",
  },
  it: {
    greet: ["Buongiorno,", "Salve,", "Gentile venditore,"],
    available: [
      "la sua {car} ({details}) è ancora disponibile?",
      "sono interessato alla sua {car} ({details}). È ancora in vendita?",
      "ho visto il suo annuncio della {car} ({details}). L'auto è ancora disponibile?",
    ],
    intent: [
      "Vorrei acquistarla e ritirarla personalmente{city}.",
      "Cerco proprio questo modello e potrei ritirarla a breve{city}.",
      "Se è tutto in ordine, la comprerei e verrei a ritirarla di persona{city}.",
    ],
    q: {
      defects: ["Ci sono difetti noti o danni da incidente?", "L'auto ha avuto incidenti o problemi meccanici?"],
      papers: ["Sono disponibili libretto e certificato di proprietà?", "I documenti del veicolo sono completi?"],
      service: ["C'è il libretto dei tagliandi?", "I tagliandi sono stati fatti regolarmente?"],
      inspection: ["Quando è stata fatta l'ultima revisione?", "Fino a quando è valida la revisione?"],
    },
    close: ["Potrei passare a breve e pagare con bonifico.", "Resto in attesa di una sua risposta.", "Grazie in anticipo per la risposta."],
    phone: "Può contattarmi anche al {phone}.",
    sign: ["Cordiali saluti", "Distinti saluti", "Grazie e buona giornata"],
    thanks: ["grazie per la risposta.", "grazie per la risposta veloce e le informazioni."],
    like: ["La {car} mi piace e vorrei acquistarla.", "Sono ancora molto interessato alla {car}."],
    ask: [
      "Visto che organizzo io il trasporto{city} e la ritiro direttamente, un prezzo di {offer} le andrebbe bene?",
      "Potrebbe venirmi incontro a {offer}? Vengo a ritirare l'auto personalmente{city}.",
    ],
    closeOffer: ["Se siamo d'accordo, posso fare subito il bonifico e organizzare il ritiro.", "Se le va bene, possiamo fissare una data per il ritiro."],
    km: "km", ez: (m) => `immatricolazione ${m}`, priceWord: "a", cityPrefix: " a ",
  },
  es: {
    greet: ["Hola,", "Buenos días,", "Buenas tardes,"],
    available: [
      "¿sigue disponible su {car} ({details})?",
      "me interesa su {car} ({details}). ¿Sigue a la venta?",
      "he visto su anuncio del {car} ({details}). ¿Está todavía disponible?",
    ],
    intent: [
      "Me gustaría comprarlo e ir a recogerlo yo mismo{city}.",
      "Busco justo este coche y podría recogerlo en pocos días{city}.",
      "Si todo está bien, lo compraría y pasaría a recogerlo en persona{city}.",
    ],
    q: {
      defects: ["¿Tiene algún defecto conocido o golpes?", "¿Ha tenido algún accidente o problema mecánico?"],
      papers: ["¿Tiene toda la documentación en regla?", "¿Están completos el permiso de circulación y la ficha técnica?"],
      service: ["¿Tiene libro de mantenimiento o facturas?", "¿Se le ha hecho el mantenimiento al día?"],
      inspection: ["¿Cuándo pasó la última ITV?", "¿Hasta cuándo tiene la ITV en vigor?"],
    },
    close: ["Podría pasar pronto y pagar por transferencia.", "Quedo atento a su respuesta.", "Muchas gracias de antemano."],
    phone: "También puede llamarme al {phone}.",
    sign: ["Un saludo", "Saludos cordiales", "Gracias y un saludo"],
    thanks: ["gracias por su respuesta.", "gracias por contestar tan rápido y por la información."],
    like: ["El {car} me gusta y me gustaría comprarlo.", "Sigo muy interesado en el {car}."],
    ask: [
      "Como el transporte{city} lo organizo yo y lo recojo directamente, ¿le parecería bien un precio de {offer}?",
      "¿Podría dejármelo en {offer}? Paso a recogerlo yo mismo{city}.",
    ],
    closeOffer: ["Si llegamos a un acuerdo, puedo hacer la transferencia enseguida y organizar la recogida.", "Si le parece bien, quedamos un día para la recogida."],
    km: "km", ez: (m) => `matriculado ${m}`, priceWord: "por", cityPrefix: " en ",
  },
}

const LOCALE: Record<SellerLanguage, string> = { de: "de-DE", en: "en-GB", fr: "fr-FR", nl: "nl-NL", it: "it-IT", es: "es-ES" }

/** Elige una frase de la lista de forma estable según la versión y la posición */
const pick = (list: string[], seed: number, salt: number) => list[Math.abs((seed * 7 + salt * 13) % list.length)]

export function formatEuro(n: number, language: SellerLanguage) {
  return `${n.toLocaleString(LOCALE[language], { maximumFractionDigits: 0 })} €`
}

/** Ciudad del anuncio para "recogerlo en Berlín" (la primera parte de la ubicación) */
function cityOf(location?: string | null) {
  const city = (location || "").split(/[,·(]/)[0].replace(/\b\d{4,5}\b/g, "").trim()
  return city.length >= 2 && city.length <= 40 ? city : ""
}

export function carLabel(car: SellerCar) {
  return [car.brand, car.model].filter(Boolean).join(" ").trim() || "Fahrzeug"
}

export function buildMessage(car: SellerCar, opts: MessageOptions): string {
  const L = P[opts.language]
  const s = opts.seed
  const city = cityOf(car.location)
  const cityPart = city ? `${L.cityPrefix}${city}` : ""
  const name = carLabel(car)
  const fill = (t: string) => t
    .replace("{car}", name)
    .replace("{city}", cityPart)
    .replace("{offer}", opts.offer ? formatEuro(opts.offer, opts.language) : "—")
    .replace("{phone}", opts.phone || "")

  const lines: string[] = [pick(L.greet, s, 1), ""]

  if (opts.kind === "first") {
    const details = [
      car.year ? L.ez(car.month ? `${String(car.month).padStart(2, "0")}/${car.year}` : String(car.year)) : null,
      car.mileage ? `${car.mileage.toLocaleString(LOCALE[opts.language])} ${L.km}` : null,
      car.price ? `${L.priceWord} ${formatEuro(car.price, opts.language)}` : null,
    ].filter(Boolean).join(", ")
    const available = pick(L.available, s, 2).replace("{car}", name).replace(" ({details})", details ? ` (${details})` : "")
    const questions = opts.questions.map((k, i) => pick(L.q[k], s, 4 + i))
    lines.push(available, "", [fill(pick(L.intent, s, 3)), ...questions].join(" "), "", pick(L.close, s, 9))
  } else {
    lines.push(pick(L.thanks, s, 2), "", `${fill(pick(L.like, s, 3))} ${fill(pick(L.ask, s, 4))}`, "", pick(L.closeOffer, s, 5))
  }

  if (opts.phone) lines.push(fill(L.phone))
  lines.push("", pick(L.sign, s, 6))
  if (opts.name) lines.push(opts.name)
  // Tras "Hallo," la carta sigue en minúscula en alemán; en los demás idiomas empieza en mayúscula
  if (opts.language !== "de") lines[2] = lines[2].replace(/[a-zà-ÿ]/, (c) => c.toUpperCase())
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim()
}
