import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

export async function POST(req: Request) {
  try {
    const { url } = await req.json();

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    // Fetch the URL with a realistic User-Agent to avoid basic bot blocks
    const response = await fetch(url, {
      method: "GET",
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache',
      },
    });

    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to fetch the URL. The site might be blocking the server.' }, { status: response.status });
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Extract Open Graph data
    const title = $('meta[property="og:title"]').attr('content') || $('title').text() || '';
    const description = $('meta[property="og:description"]').attr('content') || $('meta[name="description"]').attr('content') || '';
    
    // Extract primary image
    const mainImage = $('meta[property="og:image"]').attr('content') || '';

    // Extract other images based on common selectors (AutoScout and Mobile.de)
    const images: string[] = [];
    if (mainImage && !images.includes(mainImage)) images.push(mainImage);

    $('img').each((_, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src');
      if (src && (src.includes('img.classistatic.de') || src.includes('m-oe-img') || src.includes('pictures.autoscout24.net') || src.includes('autocasion'))) {
        // Many sites use query params to serve very low res thumbnails. Remove/adjust them if needed.
        let hdUrl = src.replace(/_\d+\.jpg$/, '_27.jpg').replace(/resize=\d+x\d+/, 'resize=1000x800');
        if (hdUrl.includes('pictures.autoscout24.net')) {
             hdUrl = hdUrl.replace(/w=\d+/, 'w=1200').replace(/h=\d+/, 'h=900');
        }

        if (!images.includes(hdUrl) && hdUrl.startsWith('http')) {
            images.push(hdUrl);
        }
      }
    });

    // Try extracting standard ecommerce JSON-LD markup
    let price = 0;
    let brand = '';
    let model = '';
    let year = 0;
    let mileage = 0;

    const jsonLdScripts = $('script[type="application/ld+json"]');
    jsonLdScripts.each((_, script) => {
      try {
        const rawJsonStr = $(script).html() || '{}';
        
        // Handle cases where ld+json is an array or object
        const rawData = JSON.parse(rawJsonStr);
        const dataArr = Array.isArray(rawData) ? rawData : [rawData];

        for (const data of dataArr) {
            // Find Product/Vehicle
            if (data['@type'] === 'Vehicle' || data['@type'] === 'Car' || data['@type'] === 'Product') {
                if (data.brand && data.brand.name) brand = data.brand.name;
                if (data.model) model = data.model;
                if (data.mileageFromOdometer && data.mileageFromOdometer.value) mileage = parseInt(data.mileageFromOdometer.value);
                if (data.productionDate || data.vehicleModelDate) year = parseInt(data.productionDate || data.vehicleModelDate);

                const offer = data.offers || (Array.isArray(data.offers) ? data.offers[0] : null);
                if (offer && offer.price) price = parseFloat(offer.price);
            }
        }
      } catch (e) {
          // Ignorar scripts inválidos
      }
    });

    // Fallback para Precio sacado del título (ej "Audi A3 - 34.000 €") si JSON no existe
    if (!price) {
        // Busca "34.000" o "34000"
        const priceRegex = /€?\s*(\d{1,3}(?:\.\d{3})*)[,.](\d{2})?\s*€?/i;
        const match = title.match(priceRegex) || description.match(priceRegex);
        if (match) {
           price = parseFloat(match[1].replace(/\./g, ''));
        }
    }

    // Filtrar fotos duplicadas y mantener hasta las 6 mejores
    const uniqueImages = [...new Set(images)].slice(0, 6);

    return NextResponse.json({
      title,
      description,
      images: uniqueImages,
      price,
      brand,
      model,
      year,
      mileage,
    });

  } catch (error: any) {
    console.error('Scraping error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
