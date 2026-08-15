const imageCache = new Map<string, string>()

// jsPDF necesita las imágenes como dataURL; los logos institucionales viven en
// /public/logos y los logos de cuartel en Supabase Storage (station-media,
// ver storage.ts) -- ambos son una URL http normal, mismo fetch para los dos.
// Se cachean en memoria una sola vez por sesión.
export async function loadImageAsDataUrl(url: string): Promise<string> {
  const cached = imageCache.get(url)
  if (cached) return cached

  const response = await fetch(url)
  if (!response.ok) throw new Error(`No se pudo cargar la imagen (${response.status}): ${url}`)
  const blob = await response.blob()
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })

  imageCache.set(url, dataUrl)
  return dataUrl
}

// jsPDF necesita el formato de imagen explícito (addImage(..., format, ...)) y
// no lo infiere solo -- los logos de cuartel pueden subirse como PNG/JPEG/WEBP
// (ImagePicker/storage.ts no restringe el tipo), a diferencia de los logos
// institucionales fijos que siempre son PNG. Se detecta del propio dataURL en
// vez de asumir. WEBP no es soportado por jsPDF (ni siquiera todas las
// versiones de navegador lo decodifican igual) -- se trata como "sin logo
// usable" para que el caller caiga al fallback en vez de romper el PDF.
export function detectImageFormatForPdf(dataUrl: string): 'PNG' | 'JPEG' | null {
  const match = dataUrl.match(/^data:image\/(\w+);base64,/i)
  const mime = match?.[1]?.toLowerCase()
  if (mime === 'png') return 'PNG'
  if (mime === 'jpeg' || mime === 'jpg') return 'JPEG'
  return null
}
