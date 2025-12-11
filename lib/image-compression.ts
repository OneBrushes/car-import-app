import imageCompression from 'browser-image-compression'

/**
 * Comprime una imagen y la convierte a WebP
 * @param file - Archivo de imagen original
 * @param maxSizeMB - Tamaño máximo en MB (por defecto 0.05 = 50KB para avatares)
 * @param maxWidthOrHeight - Dimensión máxima (por defecto 800px)
 * @returns Promise<File> - Archivo comprimido en formato WebP
 */
export async function compressImage(
    file: File,
    maxSizeMB: number = 0.05, // 50KB por defecto
    maxWidthOrHeight: number = 800
): Promise<File> {
    const options = {
        maxSizeMB,
        maxWidthOrHeight,
        useWebWorker: true,
        fileType: 'image/webp', // Convertir a WebP
        initialQuality: 0.8,
    }

    try {
        const compressedFile = await imageCompression(file, options)

        // Renombrar el archivo con extensión .webp
        const newFileName = file.name.replace(/\.[^/.]+$/, '.webp')
        const webpFile = new File([compressedFile], newFileName, {
            type: 'image/webp',
            lastModified: Date.now(),
        })

        return webpFile
    } catch (error) {
        console.error('Error compressing image:', error)
        throw new Error('No se pudo comprimir la imagen')
    }
}

/**
 * Comprime una imagen de perfil (máx 50KB)
 */
export async function compressProfileImage(file: File): Promise<File> {
    return compressImage(file, 0.05, 400) // 50KB, 400x400px
}

/**
 * Comprime una imagen de coche (máx 100KB)
 */
export async function compressCarImage(file: File): Promise<File> {
    return compressImage(file, 0.1, 1200) // 100KB, 1200px
}
