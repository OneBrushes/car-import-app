import imageCompression from 'browser-image-compression'

export async function compressImage(file: File): Promise<File> {
    const options = {
        maxSizeMB: 0.5, // Máximo 500KB
        maxWidthOrHeight: 1920, // Máximo 1920px
        useWebWorker: true,
        fileType: 'image/webp' // Convertir a WebP (más ligero)
    }

    try {
        const compressedFile = await imageCompression(file, options)
        return compressedFile
    } catch (error) {
        console.error("Error compressing image:", error)
        return file // Si falla, devuelve la original
    }
}
