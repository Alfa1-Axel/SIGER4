# Pruebas de pantalla (tests/ui)

Recorren la aplicación como lo haría cada variante de rol, en celular y en escritorio, en claro y en oscuro, y fallan si
una pantalla se rompe. **No usan ningún servidor real**: todo el tráfico a Supabase lo contesta un backend simulado, con datos
ficticios, dentro del navegador (`backend/`). No se corren en el build ni en Vercel: son una verificación manual antes de
subir cambios de interfaz.

## Qué comprueban

Por cada variante de rol, pantalla, ancho y tema:

| Control | Falla si |
|---|---|
| La pantalla abre | no carga, o queda en blanco |
| Sin desplazamiento horizontal | la página o el contenido principal son más anchos que la ventana (una tabla puede ser más ancha dentro de su propio contenedor) |
| Accesibilidad (axe-core, WCAG 2.0 y 2.1 A y AA) | hay una falla de gravedad seria o crítica, contraste incluido |
| Título | la pantalla no tiene `<h1>` o tiene más de uno |
| Tamaño táctil (celular y tablet, hasta 768 px) | un control mide menos de 40 px de alto o de ancho (se exceptúan los que agrandan su área de toque sin cambiar el diseño: marcadores del mapa, logo y foto del encabezado) |

Que una variante de rol vea "No tenés permiso" en una pantalla no es una falla: estas pruebas miran la interfaz, no los
permisos. La seguridad real está en la base (RLS), que se prueba con las suites SQL.

## Cómo correrlas

Hace falta Node 20 o más y Google Chrome instalado (se usa el navegador del sistema; no se descarga ninguno). Si Chrome está en
otro lugar: `CHROME_PATH="C:\ruta\chrome.exe" npm run test:ui`.

```
npm run test:ui                         # corto: 4 variantes de rol, celular claro (360) y escritorio oscuro (1366)
npm run test:ui -- --full               # las 16 variantes, 6 anchos, claro y oscuro (lleva horas)
npm run test:ui -- --personas informatica,invitado --viewports 320,360 --themes dark
npm run test:ui -- --routes calendario,mapa
npm run test:ui -- --noaxe              # sin accesibilidad (más rápido)
npm run test:ui -- --url http://localhost:5173   # app ya levantada CONTRA EL SIMULADO
```

El comando levanta Vite en el puerto 5199 apuntando al simulado (`VITE_SUPABASE_URL=https://mock.supabase.local`) y lo apaga
al terminar. Si ese puerto está ocupado, se detiene sin tocar nada: nunca se reutiliza un servidor que pudiera estar
conectado a la base real. Termina con código 1 si hay alguna falla, y lista cada una (variante · pantalla · ancho · tema).

Variantes de rol: `informatica`, `integrante`, `sec_regional`, `presidente_cd`, `jefe_cuerpo`, `usuario_carga`,
`sec_comision`, `invitado`, `director_escuela`, `instructor`, `coord_escuela`, `sec_escuela`, `coord_depto`,
`miembro_depto`, `varios_roles`, `sin_rol` (ver `personas.mjs`). Anchos: 320, 360, 390, 768, 1366, 1920.

## Qué hay adentro

- `check.mjs`: el recorrido y los controles.
- `personas.mjs`: las variantes de rol y las pantallas (con ids reales del simulado).
- `backend/`: el Supabase simulado. `fixtures.mjs` son los datos ficticios; `mock.mjs`, `mock70.mjs` y `mock71.mjs` contestan
  REST, RPC, Auth y Storage con las reglas de visibilidad de cada rol que necesitan las pantallas.

## Dependencias de desarrollo

- `playwright-core`: maneja el Chrome instalado. Sin esto no se pueden medir anchos, foco ni tamaños reales.
- `axe-core`: el verificador de accesibilidad estándar (el mismo motor de Lighthouse y de las herramientas de los
  navegadores).

Ninguna de las dos entra en el sitio publicado.

## Cuando una pantalla nueva necesita datos

Si una pantalla nueva consulta una tabla o una función que el simulado no conoce, devuelve una lista vacía y la prueba lo
muestra como una pantalla vacía, no como una falla. Para probarla con datos, sumá las filas en `backend/fixtures.mjs` y, si
hace falta una función nueva, su respuesta en `backend/mock.mjs`.
