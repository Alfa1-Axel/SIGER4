// SIGER4 - raw-upload-test.html: script externo a propósito.
//
// La CSP de vercel.json (ver vercel.json y DEPLOYMENT.md, auditoría de
// seguridad Prioridad 11) usa "script-src 'self'" SIN 'unsafe-inline' —
// mismo motivo que theme-init.js. Un <script> inline en el HTML queda
// bloqueado por el navegador (confirmado en producción: "Executing inline
// script violates Content Security Policy directive script-src 'self'"),
// así que TODO el JS de esta página de diagnóstico tiene que vivir en un
// archivo .js servido aparte, cargado con <script src="...">. No se debilitó
// la CSP (nada de 'unsafe-inline', nonce ni hash) — este archivo es la
// forma correcta de mantenerla intacta y que la página igual funcione.
(function () {
  'use strict';

  var logEl = document.getElementById('log');
  var statusEl = document.getElementById('status');
  var envEl = document.getElementById('env');
  var entries = [];

  function nowStamp() {
    var d = new Date();
    return d.toTimeString().split(' ')[0] + '.' + String(d.getMilliseconds()).padStart(3, '0');
  }

  function render() {
    logEl.textContent = entries.length ? entries.join('\n\n') : '(vacío)';
  }

  function log(label, detailObj) {
    var line = '[' + nowStamp() + '] ' + label;
    if (detailObj) {
      try { line += '\n' + JSON.stringify(detailObj, null, 2); } catch (e) { line += '\n(no serializable)'; }
    }
    entries.push(line);
    render();
  }

  function detectStandalone() {
    try {
      if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
      if (window.navigator && window.navigator.standalone === true) return true;
    } catch (e) {}
    return false;
  }

  // Heurística simple de "es un celular" a partir del userAgent — no hay
  // forma 100% confiable de detectar mobile, pero alcanza para el aviso
  // "esta prueba debe hacerse en el celular que falla" cuando alguien la
  // abre sin querer desde una PC.
  function detectMobile() {
    return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  }

  var isMobile = detectMobile();
  var isStandalone = detectStandalone();

  // build-info.json lo genera vite.config.ts en cada build (ver
  // buildInfoPlugin) — este archivo estático no pasa por el bundler, así
  // que no puede leer la constante inyectada que usa el resto de la app
  // (Ajustes); pedirla por fetch es la única forma de mostrar el mismo
  // build real acá. Si falla (ej. build viejo sin este archivo todavía),
  // se muestra "no disponible" en vez de romper el resto de la página.
  fetch('/build-info.json', { cache: 'no-store' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (info) {
      var versionEl = document.getElementById('buildVersion');
      var timeEl = document.getElementById('buildTime');
      if (info) {
        if (versionEl) versionEl.textContent = info.version;
        if (timeEl) timeEl.textContent = new Date(info.time).toLocaleString('es-AR');
        log('build-info', info);
      } else {
        if (versionEl) versionEl.textContent = 'no disponible';
        if (timeEl) timeEl.textContent = 'no disponible';
      }
    })
    .catch(function (err) {
      log('build-info ERROR', { message: String(err) });
    });

  // Entorno se muestra una sola vez al cargar, no depende de ningún evento.
  // userAgent completo primero y bien visible — es el dato que más hace
  // falta poder copiar/leer entero desde el celular real.
  var envHtml = ''
    + '<div class="row" style="word-break:break-all;"><b>userAgent:</b><br />' + navigator.userAgent + '</div>'
    + '<div class="row"><b>mobile (heurística):</b> <span class="' + (isMobile ? 'ok' : 'bad') + '">' + String(isMobile) + '</span></div>'
    + '<div class="row"><b>standalone/PWA:</b> ' + String(isStandalone) + '</div>'
    + '<div class="row"><b>platform:</b> ' + (navigator.platform || '(no disponible)') + '</div>'
    + '<div class="row"><b>URL actual:</b> ' + window.location.href + '</div>'
    + '<div class="row"><b>Service worker en este scope:</b> ' + ('serviceWorker' in navigator ? 'soportado' : 'no soportado') + '</div>'
    + '<div class="row"><b>timestamp de carga:</b> ' + new Date().toISOString() + '</div>';
  envEl.innerHTML = envHtml;

  if (!isMobile) {
    var warnEl = document.getElementById('desktopWarning');
    if (warnEl) warnEl.style.display = 'block';
  }

  log('page-load', { href: window.location.href, userAgent: navigator.userAgent, isMobile: isMobile, isStandalone: isStandalone });

  // Si hay un service worker controlando esta página, es una señal real:
  // este archivo debería servirse directo desde red/precache estático, no
  // pasar por ningún router de la SPA. Se deja constancia en el log.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistration().then(function (reg) {
      log('serviceWorker.getRegistration', {
        hasRegistration: !!reg,
        active: !!(reg && reg.active),
        scriptURL: reg && reg.active ? reg.active.scriptURL : null,
        controller: !!navigator.serviceWorker.controller,
        controllerScriptURL: navigator.serviceWorker.controller ? navigator.serviceWorker.controller.scriptURL : null,
      });
    }).catch(function (err) {
      log('serviceWorker.getRegistration ERROR', { message: String(err) });
    });
  }

  function wireInput(input, sourceLabel) {
    input.addEventListener('click', function () {
      log('click (' + sourceLabel + ')', {});
    });

    input.addEventListener('change', function (e) {
      var files = e.target.files;
      var n = files ? files.length : 0;
      if (!n) {
        statusEl.innerHTML = '<span class="bad">change disparó, pero sin archivos (files.length = 0)</span>';
        log('change (' + sourceLabel + ') — SIN ARCHIVO', { filesLength: 0 });
        return;
      }
      var f = files[0];
      var detail = {
        filesLength: n,
        name: f.name,
        type: f.type || '(vacío)',
        size: f.size,
        lastModified: f.lastModified,
        lastModifiedISO: new Date(f.lastModified).toISOString(),
      };
      statusEl.innerHTML = '<span class="ok">change disparó correctamente</span> — ver detalle abajo';
      log('change (' + sourceLabel + ') — ARCHIVO DETECTADO', detail);
      e.target.value = '';
    });
  }

  wireInput(document.getElementById('rawFile'), 'elegir archivo');
  wireInput(document.getElementById('rawCamera'), 'tomar foto');

  document.getElementById('clearBtn').addEventListener('click', function () {
    entries = [];
    statusEl.textContent = 'Esperando selección…';
    render();
  });
})();
