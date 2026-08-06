// La carga/edición de archivos de Documentos quedó pausada temporalmente en
// mobile/PWA (ver DEPLOYMENT.md) — el input de archivo no es confiable en
// ciertos Android dentro de React, y no se encontró una causa aislable ni
// una vía alternativa que valiera la pena mantener. Heurística simple por
// userAgent, no 100% confiable, pero suficiente para ocultar la carga en
// mobile y mostrar un aviso claro en vez de un flujo roto.
export function isMobileUserAgent(): boolean {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
}
