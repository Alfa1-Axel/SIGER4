# Logos institucionales

- `logo-escuela.png` — sello general "SIGER4 · Bomberos Voluntarios" (reemplazado 2026-08-20,
  archivo original `SIGER4.png` provisto por el usuario). El nombre del archivo quedó igual a
  propósito (evita tocar cada referencia en el código, ver más abajo), pero desde este reemplazo
  YA NO es específico de la Escuela Regional de Bomberos — es el logo general del sistema. Los
  textos `alt`/copy que antes decían "Escuela Regional de Bomberos" en Login/Sidebar/Ajustes/
  CambiarPassword/EscuelaPage se actualizaron a "SIGER4" para reflejar esto.
- `logo-informatica.png` — Dpto. Informática y Estadística R4 (copia de `LG INFORMATICA Y ESTADÍSTICA.png`, fondo transparente).

Estos archivos se usan en el login, sidebar, header, escuela, ajustes, reportes PDF, favicon y
manifest de la PWA. Si el logo original cambia, reemplazar el archivo correspondiente en esta
carpeta manteniendo el mismo nombre (y misma extensión — si el nuevo logo cambia de formato,
también hay que actualizar las referencias en el código, no solo el archivo).

Nota (2026-08-20): en `reportBuilder.ts` (reportes PDF) el `theme: 'escuela'` sigue existiendo y
sigue decidiendo cuál logo va a la izquierda vs. derecha del encabezado — pero como ambos archivos
institucionales (`logo-escuela.png`/`logo-informatica.png`) ahora podrían visualmente parecerse más
entre sí (uno es el sello general de SIGER4, el otro el del Dpto. Informática), la distinción de
"qué logo representa Escuela" quedó debilitada a nivel visual hasta que se cargue un logo específico
de Escuela de nuevo bajo otro nombre de archivo, si se decide mantener esa distinción a futuro.
