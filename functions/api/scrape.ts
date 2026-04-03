export async function onRequestPost(context: { request: Request }) {
    try {
        const { request } = context;
        const body = (await request.json()) as { url: string };
        const url = body.url;

        if (!url) {
            return new Response(JSON.stringify({ error: 'URL is required' }), { status: 400 });
        }

        // Fetch URL as a modern browser
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
            }
        });

        if (!response.ok) {
            return new Response(JSON.stringify({ error: `La web devolvió status ${response.status}. Puede estar protegida.` }), { status: response.status });
        }

        const html = await response.text();

        // 1. Extraer Etiquetas OpenGraph Básicas
        const getMeta = (property: string) => {
            const regex = new RegExp(`<meta\\s+(?:property|name)=["']${property}["']\\s+content=["'](.*?)["']`, 'i');
            const match = html.match(regex);
            return match ? match[1] : '';
        };

        const title = getMeta('og:title') || html.match(/<title>(.*?)<\/title>/i)?.[1] || '';
        const description = getMeta('og:description') || getMeta('description') || '';
        const mainImage = getMeta('og:image');

        // 2. Extraer Todas las Imágenes (Busca src="http...jpg")
        let images: string[] = [];
        if (mainImage) images.push(mainImage);

        const imgRegex = /<img[^>]+src=["'](https?:\/\/[^"']+\.jpg[^"']*)["'][^>]*>/gi;
        let match;
        while ((match = imgRegex.exec(html)) !== null) {
            let src = match[1];
            if (src.includes('img.classistatic.de') || src.includes('pictures.autoscout24.net') || src.includes('m-oe-img')) {
                // Remove poor quality thumbnails
                let hdUrl = src.replace(/_\d+\.jpg$/, '_27.jpg').replace(/resize=\d+x\d+/, 'resize=1000x800');
                if (hdUrl.includes('pictures.autoscout24.net')) {
                    hdUrl = hdUrl.replace(/w=\d+/, 'w=1200').replace(/h=\d+/, 'h=900');
                }
                if (!images.includes(hdUrl)) {
                    images.push(hdUrl);
                }
            }
        }

        // 3. Extraer JSON-LD
        let price = 0;
        let brand = '';
        let model = '';
        let mileage = 0;
        let year = 0;

        const jsonLdRegex = /<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
        let jsonMatch;
        while ((jsonMatch = jsonLdRegex.exec(html)) !== null) {
            try {
                const rawData = JSON.parse(jsonMatch[1]);
                const dataArr = Array.isArray(rawData) ? rawData : [rawData];
                
                for (const data of dataArr) {
                    if (data['@type'] === 'Vehicle' || data['@type'] === 'Car' || data['@type'] === 'Product') {
                        if (data.brand?.name) brand = data.brand.name;
                        if (data.model) model = data.model;
                        if (data.mileageFromOdometer?.value) mileage = parseInt(data.mileageFromOdometer.value);
                        if (data.productionDate) year = parseInt(data.productionDate);
                        
                        const offer = data.offers || (Array.isArray(data.offers) ? data.offers[0] : null);
                        if (offer?.price) price = parseFloat(offer.price);
                    }
                }
            } catch(e) {}
        }

        // 4. Respaldo de precio en título
        if (!price) {
            const priceExt = title.match(/€?\s*(\d{1,3}(?:\.\d{3})*)[,.](\d{2})?\s*€?/i);
            if (priceExt) {
                price = parseFloat(priceExt[1].replace(/\./g, ''));
            }
        }

        // Validate that we found SOMETHING useful
        if (!price && !brand && images.length === 0) {
            return new Response(JSON.stringify({ error: 'Anuncio protegido contra bots. Descarga manual recomendada.' }), { status: 403 });
        }

        // Filtrar y limitar imágenes
        const uniqueImages = [...new Set(images)].slice(0, 6);

        return new Response(JSON.stringify({
            title,
            description,
            images: uniqueImages,
            price,
            brand,
            model,
            year,
            mileage
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
