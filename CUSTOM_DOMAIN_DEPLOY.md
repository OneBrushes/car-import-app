# 🚀 DEPLOYMENT EN DOMINIO PERSONALIZADO

## ✅ **Cambio realizado:**

He **eliminado el `basePath`** de `next.config.mjs` para que funcione con tu dominio personalizado `app.nordrivecars.com`.

---

## 📋 **PASOS PARA DESPLEGAR:**

### **Opción 1: Cloudflare Pages (RECOMENDADO)**

1. **Ve a Cloudflare Pages**
   - https://dash.cloudflare.com/
   - Selecciona tu proyecto

2. **Configura el dominio personalizado**
   - Settings → Custom domains
   - Añade: `app.nordrivecars.com`
   - Cloudflare configurará automáticamente el DNS

3. **Deploy automático**
   - Cada push a `main` desplegará automáticamente
   - Espera 2-3 minutos

4. **Verifica**
   - Visita: https://app.nordrivecars.com
   - Debería cargar correctamente

---

### **Opción 2: GitHub Pages con dominio personalizado**

1. **Ve a GitHub**
   - Repositorio → Settings → Pages

2. **Configura Custom domain**
   - En "Custom domain" pon: `app.nordrivecars.com`
   - Click "Save"

3. **Configura DNS en tu proveedor**
   - Añade un registro CNAME:
     ```
     Tipo: CNAME
     Nombre: app
     Valor: onebrushes.github.io
     ```

4. **Espera propagación DNS** (5-30 minutos)

5. **Verifica**
   - Visita: https://app.nordrivecars.com

---

## ⚠️ **IMPORTANTE:**

### **NO uses `GITHUB_PAGES=true`**
Cuando despliegas en dominio personalizado, **NO** debes usar la variable de entorno `GITHUB_PAGES=true` porque eso añade el `/car-import-app` al path.

### **Archivos estáticos**
Los archivos ahora se buscan en:
- ✅ `https://app.nordrivecars.com/_next/...`
- ❌ ~~`https://app.nordrivecars.com/car-import-app/_next/...`~~

---

## 🔧 **Si quieres volver a GitHub Pages (subdirectorio):**

1. Descomenta estas líneas en `next.config.mjs`:
   ```javascript
   basePath: process.env.GITHUB_PAGES === 'true' ? '/car-import-app' : '',
   assetPrefix: process.env.GITHUB_PAGES === 'true' ? '/car-import-app' : '',
   ```

2. En `.github/workflows/deploy.yml` asegúrate de tener:
   ```yaml
   env:
     GITHUB_PAGES: 'true'
   ```

---

## 🎯 **Recomendación:**

**Usa Cloudflare Pages** porque:
- ✅ Deploy automático con cada push
- ✅ Más rápido (CDN global)
- ✅ SSL automático
- ✅ Mejor rendimiento
- ✅ Configuración DNS automática

---

## 📊 **Verificar deployment:**

Después de desplegar, verifica que estos archivos cargan:
- `https://app.nordrivecars.com/_next/static/...`
- `https://app.nordrivecars.com/NorDrive.png`
- `https://app.nordrivecars.com/icon.png`

Si ves errores 404, espera unos minutos y recarga con **Ctrl+Shift+R** (hard refresh).
