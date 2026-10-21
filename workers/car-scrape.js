// Generado con `npm run build:workers` desde workers/src/car-scrape.ts. No editar a mano.

// lib/listing-parser.ts
function parseListing(html, url) {
  const car = { url, images: [] };
  for (const node of extractJsonLd(html)) {
    const types = [].concat(node["@type"] || []).map(String);
    if (!types.some((t) => /^(Car|Vehicle|Product|Offer|MotorizedBicycle)$/i.test(t))) continue;
    car.title ??= str(node.name);
    car.brand ??= str(node.brand?.name ?? node.brand ?? node.manufacturer?.name ?? node.manufacturer);
    car.model ??= str(node.model?.name ?? node.model);
    car.color ??= str(node.color);
    car.fuelType ??= str(node.fuelType ?? node.vehicleEngine?.fuelType);
    car.transmission ??= str(node.vehicleTransmission);
    car.mileage ??= num(node.mileageFromOdometer?.value ?? node.mileageFromOdometer);
    car.co2 ??= num(node.emissionsCO2);
    const date = str(node.dateVehicleFirstRegistered ?? node.productionDate ?? node.vehicleModelDate ?? node.modelDate);
    if (date && !car.year) {
      const match = date.match(/(\d{4})(?:-(\d{1,2}))?/);
      if (match) {
        car.year = Number(match[1]);
        if (match[2]) car.month = Number(match[2]);
      }
    }
    const power = node.vehicleEngine?.enginePower;
    const powerValue = num(power?.value ?? power);
    if (powerValue && !car.cv) {
      const unit = String(power?.unitCode ?? power?.unitText ?? "").toUpperCase();
      car.cv = unit.includes("KW") || unit === "KWT" ? Math.round(powerValue * 1.35962) : Math.round(powerValue);
    }
    const offer = Array.isArray(node.offers) ? node.offers[0] : node.offers;
    car.price ??= num(offer?.price ?? offer?.priceSpecification?.price ?? node.price);
    car.currency ??= str(offer?.priceCurrency ?? node.priceCurrency);
    const images = [].concat(node.image || []).map((img) => typeof img === "string" ? img : img?.url || img?.contentUrl).filter(Boolean);
    car.images.push(...images);
  }
  car.title ??= meta(html, "og:title") ?? html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();
  const ogImage = meta(html, "og:image");
  if (ogImage) car.images.push(ogImage);
  car.price ??= num(meta(html, "product:price:amount") ?? meta(html, "og:price:amount"));
  car.currency ??= meta(html, "product:price:currency") ?? meta(html, "og:price:currency");
  if (car.title && (!car.brand || !car.model)) {
    const words = decodeEntities(car.title).split(/[\s|·,–-]+/).filter(Boolean);
    car.brand ??= words[0];
    car.model ??= words.slice(1, 3).join(" ") || void 0;
  }
  if (!car.year && car.title) {
    const year = car.title.match(/\b(19[89]\d|20[0-4]\d)\b/);
    if (year) car.year = Number(year[1]);
  }
  const text = decodeEntities(html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " "));
  const after = (labels, value) => text.match(new RegExp(`(?:${labels})\\s*:?\\s*${value}`, "i"));
  if (!car.year) {
    const reg = after("Erstzulassung|Primera matriculaci[o\xF3]n|Matriculaci[o\xF3]n|Fecha de matriculaci[o\xF3]n|Mise en circulation|First registration|Immatricolazione|Bouwjaar|EZ", "(\\d{1,2})\\s*[/.-]\\s*((?:19|20)\\d{2})");
    if (reg) {
      car.month = Number(reg[1]);
      car.year = Number(reg[2]);
    }
  }
  if (!car.mileage) {
    const km = after("Kilometerstand|Kilometraje|Kilom[e\xE9]trage|Mileage|Chilometraggio|Kilometers?", "(\\d{1,3}(?:[.\\s,]\\d{3})+|\\d{1,6})\\s*km");
    if (km) car.mileage = Number(km[1].replace(/[.\s,]/g, ""));
  }
  if (!car.cv) {
    const kwPs = text.match(/(\d{2,4})\s*kW\s*\(\s*(\d{2,4})\s*(?:PS|CV|ch|HP|pk)\s*\)/i);
    if (kwPs) car.cv = Number(kwPs[2]);
  }
  if (!car.price) {
    const price = text.match(/(\d{1,3}(?:[.,\s]\d{3})+)\s*(?:€|EUR)/);
    if (price) {
      car.price = Number(price[1].replace(/[.,\s]/g, ""));
      car.currency ??= "EUR";
    }
  }
  if (!car.fuelType) {
    const fuel = after("Kraftstoffart|Kraftstoff|Combustible|Carburant|Energie|Fuel type|Alimentazione|Brandstof", "([A-Za-z\xC0-\xFF][A-Za-z\xC0-\xFF/ -]{2,24})");
    if (fuel) car.fuelType = fuel[1].trim().split(/\s{2,}|\n/)[0];
  }
  if (!car.transmission) {
    const gear = after("Getriebe|Cambio|Bo[i\xEE]te de vitesses?|Transmission|Gearbox|Transmissie", "([A-Za-z\xC0-\xFF][A-Za-z\xC0-\xFF -]{2,24})");
    if (gear) car.transmission = gear[1].trim().split(/\s{2,}|\n/)[0];
  }
  if (!car.mileage) {
    const km = text.match(/(\d{1,3}(?:[.\s,]\d{3})+|\d{4,6})\s*km\b/i);
    if (km) car.mileage = Number(km[1].replace(/[.\s,]/g, ""));
  }
  if (!car.cv) {
    const cv = text.match(/(\d{2,4})\s*(?:CV|PS|HP|ch)\b/);
    if (cv) car.cv = Number(cv[1]);
  }
  car.images = Array.from(new Set(car.images.map((i) => absolute(i, url)).filter(Boolean))).slice(0, 20);
  if (car.title) car.title = decodeEntities(car.title);
  return car;
}
function extractJsonLd(html) {
  const nodes = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while (m = re.exec(html)) {
    try {
      const parsed = JSON.parse(m[1].trim());
      const walk = (value) => {
        if (Array.isArray(value)) value.forEach(walk);
        else if (value && typeof value === "object") {
          nodes.push(value);
          if (value["@graph"]) walk(value["@graph"]);
          if (value.itemOffered) walk(value.itemOffered);
        }
      };
      walk(parsed);
    } catch {
    }
  }
  return nodes;
}
function meta(html, property) {
  const escaped = property.replace(/[.:]/g, (m) => "\\" + m);
  const a = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, "i"));
  const b = html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`, "i"));
  const value = a?.[1] ?? b?.[1];
  return value ? decodeEntities(value) : void 0;
}
function str(value) {
  if (value == null) return void 0;
  if (typeof value === "object") return void 0;
  const s = String(value).trim();
  return s ? s : void 0;
}
function num(value) {
  if (value == null) return void 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : void 0;
  const cleaned = String(value).replace(/[^\d.,]/g, "");
  if (!cleaned) return void 0;
  const normalized = /[.,]\d{1,2}$/.test(cleaned) ? cleaned.replace(/[.,](?=\d{3})/g, "").replace(",", ".") : cleaned.replace(/[.,]/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : void 0;
}
function absolute(src, base) {
  try {
    return new URL(src, base).toString();
  } catch {
    return null;
  }
}
function decodeEntities(s) {
  return s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d))).trim();
}

// functions/api/scrape.ts
var ALLOWED_HOSTS = [
  "autoscout24.",
  "mobile.de",
  "kleinanzeigen.de",
  "leboncoin.fr",
  "lacentrale.fr",
  "marktplaats.nl",
  "2dehands.be",
  "gaspedaal.nl",
  "autotrader.co.uk",
  "subito.it",
  "autohero.com",
  "carvago.com",
  "coches.net",
  "wallapop.com",
  "milanuncios.com",
  "willhaben.at",
  "otomoto.pl",
  "bytbil.com",
  "blocket.se",
  "finn.no"
];
var json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
});
async function handleScrape(request, env) {
  const target = new URL(request.url).searchParams.get("url");
  if (!target) return json({ error: "Falta el par\xE1metro url" }, 400);
  let listing;
  try {
    listing = new URL(target);
  } catch {
    return json({ error: "URL no v\xE1lida" }, 400);
  }
  if (listing.protocol !== "https:" && listing.protocol !== "http:") {
    return json({ error: "Solo se admiten enlaces http(s)" }, 400);
  }
  const host = listing.hostname.toLowerCase();
  const platform = ALLOWED_HOSTS.find((h) => host === h || host.endsWith("." + h) || host.includes(h));
  if (!platform) {
    return json({ error: "Portal no soportado todav\xEDa", supported: ALLOWED_HOSTS }, 400);
  }
  const authHeader = request.headers.get("Authorization") || "";
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return json({ error: "Faltan SUPABASE_URL / SUPABASE_ANON_KEY en Cloudflare" }, 500);
  }
  const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: authHeader }
  });
  if (!userRes.ok) return json({ error: "Sesi\xF3n no v\xE1lida" }, 401);
  let html;
  try {
    const res = await fetch(listing.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "Accept-Language": "es-ES,es;q=0.9,en;q=0.8,de;q=0.7,fr;q=0.6",
        Accept: "text/html,application/xhtml+xml"
      },
      redirect: "follow"
    });
    if (!res.ok) return json({ error: `El portal respondi\xF3 ${res.status}. Puede estar bloqueando lecturas autom\xE1ticas.` }, 502);
    html = (await res.text()).slice(0, 3e6);
  } catch {
    return json({ error: "No se pudo descargar el anuncio" }, 502);
  }
  const car = parseListing(html, listing.toString());
  car.platform = platform.replace(/\.$/, "");
  return json(car);
}

// workers/src/cors.ts
var DEFAULT_ORIGINS = ["https://app.nordrivecars.com", "http://localhost:3000"];
function cors(request, env, methods) {
  const origin = request.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(",") : DEFAULT_ORIGINS).map((o) => o.trim());
  return {
    "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : allowed[0],
    "Access-Control-Allow-Methods": `${methods}, OPTIONS`,
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin"
  };
}

// workers/src/car-scrape.ts
var car_scrape_default = {
  async fetch(request, env) {
    const headers = cors(request, env, "GET");
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method !== "GET") return new Response(JSON.stringify({ error: "M\xE9todo no permitido" }), { status: 405, headers: { ...headers, "Content-Type": "application/json" } });
    const res = await handleScrape(request, env);
    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(headers)) out.headers.set(k, v);
    return out;
  }
};
export {
  car_scrape_default as default
};
