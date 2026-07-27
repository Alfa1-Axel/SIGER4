const imageCache = new Map<string, string>()

// jsPDF necesita las imágenes como dataURL; los logos institucionales viven en
// /public/logos y se cargan una sola vez por sesión (se cachean en memoria).
export async function loadImageAsDataUrl(url: string): Promise<string> {
  const cached = imageCache.get(url)
  if (cached) return cached

  const response = await fetch(url)
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
