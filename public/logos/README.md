# Logos institucionales

- `logo-escuela.png` — sello general "SIGER4 · Bomberos Voluntarios" (reemplazado 2026-08-20,
  archivo original `SIGER4.png` provisto por el usuario). El nombre del archivo quedó igual a
  propósito (evita tocar cada referencia en el código, ver más abajo), pero desde este reemplazo
  YA NO es específico de la Escuela Regional de Bomberos — es el logo general del sistema. Los
  textos `alt`/copy que antes decían "Escuela Regional de Bomberos" en Login/Sidebar/Ajustes/
  CambiarPassword/EscuelaPage se actualizaron a "SIGER4" para reflejar esto. 400×400px, sin canal
  alfa (fondo blanco sólido en el original), 61 KB (optimizado 2026-08-20 desde 1.3 MB / 1254×1254px
  originales — el archivo nunca se usa a más de ~56px en pantalla ni más de ~18mm en PDF, así que
  1254px era muchísimo más grande de lo necesario sin ninguna ganancia visual).
- `logo-informatica.png` — Dpto. Informática y Estadística R4 (copia de `LG INFORMATICA Y ESTADÍSTICA.png`).
  400×400px, con transparencia preservada, 47 KB (optimizado 2026-08-20 desde 338 KB / 1254×1254px,
  mismo criterio que arriba).

Estos archivos se usan en el login, sidebar, header, escuela, ajustes, reportes PDF y precache del
service worker (PWA) — el favicon y el manifest de PWA en sí usan un set aparte en `public/icons/`,
no estos archivos. Si el logo original cambia, reemplazar el archivo correspondiente en esta
carpeta manteniendo el mismo nombre (y misma extensión — si el nuevo logo cambia de formato,
también hay que actualizar las referencias en el código, no solo el archivo). Al reemplazar, redimensionar
a un tamaño razonable (400×400px alcanza de sobra para todos los usos actuales) antes de subirlo acá
— evita repetir el problema de subir un archivo de varios MB sin necesidad.

Nota (2026-08-20): en `reportBuilder.ts` (reportes PDF) el `theme: 'escuela'` sigue existiendo y
sigue decidiendo cuál logo va a la izquierda vs. derecha del encabezado — pero como ambos archivos
institucionales (`logo-escuela.png`/`logo-informatica.png`) ahora podrían visualmente parecerse más
entre sí (uno es el sello general de SIGER4, el otro el del Dpto. Informática), la distinción de
"qué logo representa Escuela" quedó debilitada a nivel visual hasta que se cargue un logo específico
de Escuela de nuevo bajo otro nombre de archivo, si se decide mantener esa distinción a futuro.
