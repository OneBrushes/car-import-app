# Car Import App 🚗

Aplicación web para gestión de importación de vehículos.

## 🚀 Características

- ✅ Gestión de coches importados
- ✅ Comparativas con coches de España
- ✅ Generación de informes PDF
- ✅ Gestión de inventario
- ✅ Sistema de gastos y rentabilidad
- ✅ Análisis comparativo

## 🛠️ Tecnologías

- **Framework**: Next.js 16
- **UI**: React 19 + Tailwind CSS
- **Componentes**: Radix UI
- **Iconos**: Lucide React
- **PDF**: react-to-print

## 📦 Instalación

```bash
# Instalar dependencias
npm install

# Ejecutar en desarrollo
npm run dev

# Compilar para producción
npm run build

# Iniciar servidor de producción
npm start
```

## 🌐 Deploy

Este proyecto está optimizado para **Cloudflare Pages**.

### Configuración de Cloudflare Pages:
- **Framework preset**: Next.js
- **Build command**: `npm run build`
- **Build output directory**: `.next`
- **Node version**: 18 o superior

## 📝 Variables de Entorno

Crear archivo `.env.local` para desarrollo local:

```env
# Añadir aquí las variables de entorno cuando se integre Supabase y Cloudinary
```

## 🔒 Seguridad

- No subir archivos `.env` al repositorio
- Mantener el repositorio privado
- Configurar variables de entorno en Cloudflare Pages

## 📄 Licencia

Privado - Todos los derechos reservados
