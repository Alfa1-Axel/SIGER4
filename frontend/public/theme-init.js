// Aplica el tema guardado antes del primer paint para evitar el parpadeo
// claro->oscuro al recargar. Nunca sigue prefers-color-scheme: el tema es
// siempre una elección manual del usuario (ver src/hooks/useTheme.ts).
// Archivo separado (no inline en index.html) para poder mantener
// script-src 'self' sin 'unsafe-inline' en la Content-Security-Policy de
// vercel.json (ver auditoría de seguridad, Prioridad 11).
try {
  if (localStorage.getItem('siger4-theme') === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark')
  }
} catch {}
