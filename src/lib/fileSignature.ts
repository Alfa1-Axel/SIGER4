// Control del CONTENIDO de un archivo antes de subirlo (control de archivos,
// DEPLOYMENT.md sección 70). El nombre y el tipo que declara el navegador los
// controla quien sube; los primeros bytes del archivo no se pueden falsear sin
// romper el formato. Si un archivo dice ser una foto JPG pero empieza con otra
// cosa (un ejecutable, una página web, un script renombrado), no se sube.
//
// Solo se comprueban los formatos con una firma inequívoca (PDF, PNG, JPEG,
// WEBP y GIF). Word, Excel, HEIC y video quedan fuera: sus firmas son
// contenedores genéricos (ZIP, OLE, ISO) y una regla estricta rechazaría
// archivos buenos. En el servidor, el bucket vuelve a limitar tipo y tamaño.

export type DetectedFormat = 'pdf' | 'png' | 'jpeg' | 'webp' | 'gif'

const FORMAT_LABEL: Record<DetectedFormat, string> = {
  pdf: 'PDF',
  png: 'PNG',
  jpeg: 'JPG',
  webp: 'WEBP',
  gif: 'GIF',
}

const MIME_TO_FORMAT: Record<string, DetectedFormat> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpeg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false
  return signature.every((value, index) => bytes[offset + index] === value)
}

export function detectFormat(bytes: Uint8Array): DetectedFormat | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png'
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'jpeg'
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return 'gif'
  // RIFF....WEBP
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return 'webp'
  // Un PDF puede tener algunos bytes antes del encabezado; el estándar admite hasta 1024.
  const head = Array.from(bytes.slice(0, 1024))
  for (let i = 0; i + 4 < head.length; i += 1) {
    if (head[i] === 0x25 && head[i + 1] === 0x50 && head[i + 2] === 0x44 && head[i + 3] === 0x46 && head[i + 4] === 0x2d) return 'pdf'
  }
  return null
}

async function readHead(file: Blob): Promise<Uint8Array> {
  const slice = file.slice(0, 1100)
  return new Uint8Array(await slice.arrayBuffer())
}

// Lanza un Error con un mensaje para la persona si el contenido no corresponde
// al tipo declarado. Para los tipos sin firma comprobable no hace nada.
export async function assertFileSignature(file: File, resolvedMimeType: string): Promise<void> {
  const expected = MIME_TO_FORMAT[resolvedMimeType]
  if (!expected) return
  let detected: DetectedFormat | null
  try {
    detected = detectFormat(await readHead(file))
  } catch {
    // No se pudo leer el archivo (permiso del selector, archivo movido): lo dirá la subida.
    return
  }
  if (detected !== expected) {
    throw new Error(
      `"${file.name || 'El archivo'}" no parece ser un ${FORMAT_LABEL[expected]} válido: el contenido no coincide con su tipo. ` +
        'Elegí el archivo original (no uno renombrado).',
    )
  }
}
