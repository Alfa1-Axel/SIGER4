import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Suspense, lazy, type ReactNode } from 'react'
import { AuthProvider } from './hooks/useAuth'
import { NotificationPushBridge } from './components/NotificationPushBridge'
import { SwUpdateBanner } from './components/SwUpdateBanner'
import { ConfirmProvider } from './components/ui/ConfirmDialog'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ProtectedRoute } from './components/layout/ProtectedRoute'
import { UserManagerRoute } from './components/layout/UserManagerRoute'
import { ReportsRoute } from './components/layout/ReportsRoute'
import { ModuleRoute } from './components/layout/ModuleRoute'
import { UserCreatorRoute } from './components/layout/UserCreatorRoute'
import { SchoolAvalesRoute } from './components/layout/SchoolAvalesRoute'
import { SuperAdminRoute } from './components/layout/SuperAdminRoute'
import { LoginPage } from './pages/LoginPage'
import { CambiarPasswordPage } from './pages/CambiarPasswordPage'
import { PanelPage } from './pages/PanelPage'

// Cada pantalla (salvo el ingreso y el Inicio) es su propio archivo y se baja cuando se entra por primera vez: el archivo
// principal queda mucho más chico y la primera pantalla aparece antes. Leaflet (mapa) y jsPDF (reportes) van aparte aún
// dentro de sus pantallas. Si un archivo no se puede bajar (versión nueva del sistema), el límite de errores recarga una vez
// (components/ErrorBoundary.tsx, lib/clientErrors.ts).
const NotFoundPage = lazy(() => import('./pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })))
const CuartelesPage = lazy(() => import('./pages/CuartelesPage').then((m) => ({ default: m.CuartelesPage })))
const CuartelDetalleEntrada = lazy(() => import('./pages/CuartelDetalleEntrada').then((m) => ({ default: m.CuartelDetalleEntrada })))
const CuartelFormPage = lazy(() => import('./pages/CuartelFormPage').then((m) => ({ default: m.CuartelFormPage })))
const VehiculoFormPage = lazy(() => import('./pages/VehiculoFormPage').then((m) => ({ default: m.VehiculoFormPage })))
const AsistenciaFormPage = lazy(() => import('./pages/AsistenciaFormPage').then((m) => ({ default: m.AsistenciaFormPage })))
const IntervencionFormPage = lazy(() => import('./pages/IntervencionFormPage').then((m) => ({ default: m.IntervencionFormPage })))
const EscuelaPage = lazy(() => import('./pages/EscuelaPage').then((m) => ({ default: m.EscuelaPage })))
const CursoFormPage = lazy(() => import('./pages/CursoFormPage').then((m) => ({ default: m.CursoFormPage })))
const AvalesPage = lazy(() => import('./pages/AvalesPage').then((m) => ({ default: m.AvalesPage })))
const AvalFormPage = lazy(() => import('./pages/AvalFormPage').then((m) => ({ default: m.AvalFormPage })))
const AvalRenovarPage = lazy(() => import('./pages/AvalRenovarPage').then((m) => ({ default: m.AvalRenovarPage })))
const AvalMovimientosPage = lazy(() => import('./pages/AvalMovimientosPage').then((m) => ({ default: m.AvalMovimientosPage })))
const ReportesPage = lazy(() => import('./pages/ReportesPage').then((m) => ({ default: m.ReportesPage })))
const AjustesPage = lazy(() => import('./pages/AjustesPage').then((m) => ({ default: m.AjustesPage })))
const UsuariosPage = lazy(() => import('./pages/UsuariosPage').then((m) => ({ default: m.UsuariosPage })))
const UsuarioFormPage = lazy(() => import('./pages/UsuarioFormPage').then((m) => ({ default: m.UsuarioFormPage })))
const UsuarioDetallePage = lazy(() => import('./pages/UsuarioDetallePage').then((m) => ({ default: m.UsuarioDetallePage })))
const NotificacionesPage = lazy(() => import('./pages/NotificacionesPage').then((m) => ({ default: m.NotificacionesPage })))
const NotificacionFormPage = lazy(() => import('./pages/NotificacionFormPage').then((m) => ({ default: m.NotificacionFormPage })))
const DocumentosPage = lazy(() => import('./pages/DocumentosPage').then((m) => ({ default: m.DocumentosPage })))
const DocumentoFormPage = lazy(() => import('./pages/DocumentoFormPage').then((m) => ({ default: m.DocumentoFormPage })))
const CarpetaDetallePage = lazy(() => import('./pages/CarpetaDetallePage').then((m) => ({ default: m.CarpetaDetallePage })))
const DocumentosDepartamentoPage = lazy(() => import('./pages/DocumentosDepartamentoPage').then((m) => ({ default: m.DocumentosDepartamentoPage })))
const CarpetaFormPage = lazy(() => import('./pages/CarpetaFormPage').then((m) => ({ default: m.CarpetaFormPage })))
const PapeleraDocumentosPage = lazy(() => import('./pages/PapeleraDocumentosPage').then((m) => ({ default: m.PapeleraDocumentosPage })))
const AuditoriaPage = lazy(() => import('./pages/AuditoriaPage').then((m) => ({ default: m.AuditoriaPage })))
const PersonalFormPage = lazy(() => import('./pages/PersonalFormPage').then((m) => ({ default: m.PersonalFormPage })))
const EventoHistoricoFormPage = lazy(() => import('./pages/EventoHistoricoFormPage').then((m) => ({ default: m.EventoHistoricoFormPage })))
const CalendarioPage = lazy(() => import('./pages/CalendarioPage').then((m) => ({ default: m.CalendarioPage })))
const EventoCalendarioFormPage = lazy(() => import('./pages/EventoCalendarioFormPage').then((m) => ({ default: m.EventoCalendarioFormPage })))
const EventoCalendarioDetallePage = lazy(() => import('./pages/EventoCalendarioDetallePage').then((m) => ({ default: m.EventoCalendarioDetallePage })))
const InventarioPage = lazy(() => import('./pages/InventarioPage').then((m) => ({ default: m.InventarioPage })))
const InventarioFormPage = lazy(() => import('./pages/InventarioFormPage').then((m) => ({ default: m.InventarioFormPage })))
const InventarioDetallePage = lazy(() => import('./pages/InventarioDetallePage').then((m) => ({ default: m.InventarioDetallePage })))
const SolicitudesPrestamoPage = lazy(() => import('./pages/SolicitudesPrestamoPage').then((m) => ({ default: m.SolicitudesPrestamoPage })))
const SolicitudPrestamoFormPage = lazy(() => import('./pages/SolicitudPrestamoFormPage').then((m) => ({ default: m.SolicitudPrestamoFormPage })))
const SolicitudPrestamoDetallePage = lazy(() => import('./pages/SolicitudPrestamoDetallePage').then((m) => ({ default: m.SolicitudPrestamoDetallePage })))
const DepartamentosPage = lazy(() => import('./pages/DepartamentosPage').then((m) => ({ default: m.DepartamentosPage })))
const DepartamentoFormPage = lazy(() => import('./pages/DepartamentoFormPage').then((m) => ({ default: m.DepartamentoFormPage })))
const DepartamentoDetalleEntrada = lazy(() => import('./pages/DepartamentoDetalleEntrada').then((m) => ({ default: m.DepartamentoDetalleEntrada })))
const DepartamentoMiembroFormPage = lazy(() => import('./pages/DepartamentoMiembroFormPage').then((m) => ({ default: m.DepartamentoMiembroFormPage })))
const InformeDepartamentoFormPage = lazy(() => import('./pages/InformeDepartamentoFormPage').then((m) => ({ default: m.InformeDepartamentoFormPage })))
const DepartamentoInformeFormPage = lazy(() => import('./pages/DepartamentoInformeFormPage').then((m) => ({ default: m.DepartamentoInformeFormPage })))
const DepartamentoInformeDetallePage = lazy(() => import('./pages/DepartamentoInformeDetallePage').then((m) => ({ default: m.DepartamentoInformeDetallePage })))
const PendientesPage = lazy(() => import('./pages/PendientesPage').then((m) => ({ default: m.PendientesPage })))
const PuntoMapaPage = lazy(() => import('./pages/PuntoMapaPage').then((m) => ({ default: m.PuntoMapaPage })))
const PuntoMapaFichaFormPage = lazy(() => import('./pages/PuntoMapaFichaFormPage').then((m) => ({ default: m.PuntoMapaFichaFormPage })))
const PuntoMapaVerificacionFormPage = lazy(() => import('./pages/PuntoMapaVerificacionFormPage').then((m) => ({ default: m.PuntoMapaVerificacionFormPage })))
const MapaRegionalPage = lazy(() => import('./pages/MapaRegionalPage').then((m) => ({ default: m.MapaRegionalPage })))

function RouteFallback() {
  return (
    <div className="login-page">
      <div className="spinner" role="status" aria-label="Cargando" />
    </div>
  )
}

// Un error de una pantalla no tira abajo toda la app, e ir a otra pantalla vuelve a intentar.
function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  return <ErrorBoundary resetKey={pathname}>{children}</ErrorBoundary>
}

export default function App() {
  return (
    <>
      <SwUpdateBanner />
      <AuthProvider>
        <ConfirmProvider>
        <NotificationPushBridge />
      <RoutedErrorBoundary>
      <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/cambiar-password" element={<CambiarPasswordPage />} />
        <Route path="/panel" element={<ProtectedRoute><PanelPage /></ProtectedRoute>} />
        {/* Pendientes: se llega desde el Inicio ("Ver todos"); no está en el menú. */}
        <Route path="/pendientes" element={<ProtectedRoute><PendientesPage /></ProtectedRoute>} />
        <Route path="/cuarteles" element={<ModuleRoute module="cuarteles" title="Cuarteles"><CuartelesPage /></ModuleRoute>} />
        <Route path="/cuarteles/nuevo" element={<ModuleRoute module="cuarteles_gestion" title="Cuarteles"><CuartelFormPage /></ModuleRoute>} />
        <Route path="/cuarteles/:id/editar" element={<ModuleRoute module="cuarteles_gestion" title="Cuarteles"><CuartelFormPage /></ModuleRoute>} />
        <Route path="/cuarteles/:id" element={<ModuleRoute module="cuarteles" title="Cuarteles"><CuartelDetalleEntrada /></ModuleRoute>} />
        <Route
          path="/mapa"
          element={
            <ModuleRoute module="mapa" title="Mapa Regional">
              <Suspense fallback={<div className="loading-state" role="status">Cargando mapa…</div>}>
                <MapaRegionalPage />
              </Suspense>
            </ModuleRoute>
          }
        />
        <Route path="/mapa/puntos/:id" element={<ModuleRoute module="mapa_puntos" title="Mapa Regional"><PuntoMapaPage /></ModuleRoute>} />
        <Route path="/mapa/puntos/:id/editar" element={<ModuleRoute module="mapa_puntos" title="Mapa Regional"><PuntoMapaFichaFormPage /></ModuleRoute>} />
        <Route path="/mapa/puntos/:id/verificaciones/nueva" element={<ModuleRoute module="mapa_puntos" title="Mapa Regional"><PuntoMapaVerificacionFormPage /></ModuleRoute>} />
        <Route path="/cuarteles/:stationId/vehiculos/nuevo" element={<ModuleRoute module="cuarteles_gestion" title="Cuarteles"><VehiculoFormPage /></ModuleRoute>} />
        <Route path="/vehiculos/:id/editar" element={<ModuleRoute module="cuarteles_gestion" title="Cuarteles"><VehiculoFormPage /></ModuleRoute>} />
        <Route path="/cuarteles/:stationId/asistencia/nueva" element={<ModuleRoute module="cuarteles_gestion" title="Cuarteles"><AsistenciaFormPage /></ModuleRoute>} />
        <Route path="/asistencia/:id/editar" element={<ModuleRoute module="cuarteles_gestion" title="Cuarteles"><AsistenciaFormPage /></ModuleRoute>} />
        <Route path="/cuarteles/:stationId/intervenciones/nueva" element={<ModuleRoute module="cuarteles_gestion" title="Cuarteles"><IntervencionFormPage /></ModuleRoute>} />
        <Route path="/intervenciones/:id/editar" element={<ModuleRoute module="cuarteles_gestion" title="Cuarteles"><IntervencionFormPage /></ModuleRoute>} />
        <Route path="/escuela" element={<ModuleRoute module="escuela" title="Escuela"><EscuelaPage /></ModuleRoute>} />
        <Route path="/escuela/nuevo" element={<ModuleRoute module="escuela" title="Escuela"><CursoFormPage /></ModuleRoute>} />
        <Route path="/escuela/:id/editar" element={<ModuleRoute module="escuela" title="Escuela"><CursoFormPage /></ModuleRoute>} />
        <Route path="/escuela/avales" element={<SchoolAvalesRoute><AvalesPage /></SchoolAvalesRoute>} />
        <Route path="/escuela/avales/nuevo" element={<SchoolAvalesRoute><AvalFormPage /></SchoolAvalesRoute>} />
        <Route path="/escuela/avales/movimientos" element={<SchoolAvalesRoute authorityOnly><AvalMovimientosPage /></SchoolAvalesRoute>} />
        {/* Rutas viejas de administración de departamentos/coordinadores de
            Escuela: ahora se administran solo en la sección Departamentos. */}
        <Route path="/escuela/avales/coordinadores" element={<Navigate to="/escuela/avales" replace />} />
        <Route path="/escuela/avales/departamentos" element={<Navigate to="/escuela/avales" replace />} />
        <Route path="/escuela/avales/:id/editar" element={<SchoolAvalesRoute><AvalFormPage /></SchoolAvalesRoute>} />
        <Route path="/escuela/avales/:id/renovar" element={<SchoolAvalesRoute><AvalRenovarPage /></SchoolAvalesRoute>} />
        <Route path="/reportes" element={<ReportsRoute><ReportesPage /></ReportsRoute>} />
        <Route path="/ajustes" element={<ProtectedRoute><AjustesPage /></ProtectedRoute>} />
        <Route path="/usuarios" element={<UserManagerRoute><UsuariosPage /></UserManagerRoute>} />
        <Route path="/usuarios/nuevo" element={<UserCreatorRoute><UsuarioFormPage /></UserCreatorRoute>} />
        <Route path="/usuarios/:id" element={<UserManagerRoute><UsuarioDetallePage /></UserManagerRoute>} />
        <Route path="/notificaciones" element={<ProtectedRoute><NotificacionesPage /></ProtectedRoute>} />
        <Route path="/notificaciones/nueva" element={<ProtectedRoute><NotificacionFormPage /></ProtectedRoute>} />
        <Route path="/documentos" element={<ModuleRoute module="documentos" title="Documentos"><DocumentosPage /></ModuleRoute>} />
        <Route path="/documentos/nuevo" element={<ModuleRoute module="documentos" title="Documentos"><DocumentoFormPage /></ModuleRoute>} />
        <Route path="/documentos/:id/editar" element={<ModuleRoute module="documentos" title="Documentos"><DocumentoFormPage /></ModuleRoute>} />
        <Route path="/documentos/carpetas/nueva" element={<ModuleRoute module="documentos" title="Documentos"><CarpetaFormPage /></ModuleRoute>} />
        <Route path="/documentos/papelera" element={<ModuleRoute module="documentos" title="Documentos"><PapeleraDocumentosPage /></ModuleRoute>} />
        <Route path="/documentos/carpetas/:id" element={<ModuleRoute module="documentos" title="Documentos"><CarpetaDetallePage /></ModuleRoute>} />
        <Route path="/documentos/departamentos/:id" element={<ModuleRoute module="documentos" title="Documentos"><DocumentosDepartamentoPage /></ModuleRoute>} />
        <Route path="/auditoria" element={<SuperAdminRoute title="Auditoría"><AuditoriaPage /></SuperAdminRoute>} />
        <Route path="/cuarteles/:stationId/personal/nuevo" element={<ModuleRoute module="cuarteles_gestion" title="Cuarteles"><PersonalFormPage /></ModuleRoute>} />
        <Route path="/personal/:id/editar" element={<ModuleRoute module="cuarteles_gestion" title="Cuarteles"><PersonalFormPage /></ModuleRoute>} />
        <Route path="/cuarteles/:stationId/historial/nuevo" element={<ModuleRoute module="cuarteles_gestion" title="Cuarteles"><EventoHistoricoFormPage /></ModuleRoute>} />
        <Route path="/historial/:id/editar" element={<ModuleRoute module="cuarteles_gestion" title="Cuarteles"><EventoHistoricoFormPage /></ModuleRoute>} />
        <Route path="/calendario" element={<ProtectedRoute><CalendarioPage /></ProtectedRoute>} />
        <Route path="/calendario/nuevo" element={<ProtectedRoute><EventoCalendarioFormPage /></ProtectedRoute>} />
        <Route path="/calendario/:id/editar" element={<ProtectedRoute><EventoCalendarioFormPage /></ProtectedRoute>} />
        <Route path="/calendario/:id" element={<ProtectedRoute><EventoCalendarioDetallePage /></ProtectedRoute>} />
        <Route path="/inventario" element={<ModuleRoute module="inventario" title="Inventario"><InventarioPage /></ModuleRoute>} />
        <Route path="/inventario/nuevo" element={<ModuleRoute module="inventario" title="Inventario"><InventarioFormPage /></ModuleRoute>} />
        <Route path="/inventario/solicitudes" element={<ModuleRoute module="inventario" title="Inventario"><SolicitudesPrestamoPage /></ModuleRoute>} />
        <Route path="/inventario/solicitudes/:id" element={<ModuleRoute module="inventario" title="Inventario"><SolicitudPrestamoDetallePage /></ModuleRoute>} />
        <Route path="/inventario/:itemId/solicitudes/nueva" element={<ModuleRoute module="inventario" title="Inventario"><SolicitudPrestamoFormPage /></ModuleRoute>} />
        <Route path="/inventario/:id/editar" element={<ModuleRoute module="inventario" title="Inventario"><InventarioFormPage /></ModuleRoute>} />
        <Route path="/inventario/:id" element={<ModuleRoute module="inventario" title="Inventario"><InventarioDetallePage /></ModuleRoute>} />
        <Route path="/departamentos" element={<ProtectedRoute><DepartamentosPage /></ProtectedRoute>} />
        <Route path="/departamentos/nuevo" element={<ProtectedRoute><DepartamentoFormPage /></ProtectedRoute>} />
        {/* Informes y actas de un departamento (0098). */}
        <Route path="/departamentos/informes/nuevo" element={<ProtectedRoute><DepartamentoInformeFormPage /></ProtectedRoute>} />
        <Route path="/departamentos/informes/:reportId" element={<ProtectedRoute><DepartamentoInformeDetallePage /></ProtectedRoute>} />
        <Route path="/departamentos/informes/:reportId/editar" element={<ProtectedRoute><DepartamentoInformeFormPage /></ProtectedRoute>} />
        <Route path="/departamentos/:departmentId/informes/nuevo" element={<ProtectedRoute><InformeDepartamentoFormPage /></ProtectedRoute>} />
        <Route path="/informes/:id/editar" element={<ProtectedRoute><InformeDepartamentoFormPage /></ProtectedRoute>} />
        <Route path="/departamentos/:id" element={<ProtectedRoute><DepartamentoDetalleEntrada /></ProtectedRoute>} />
        {/* Alta de Miembros de Departamento por el coordinador de su departamento (0120). */}
        <Route path="/departamentos/miembros/nuevo" element={<ProtectedRoute><DepartamentoMiembroFormPage /></ProtectedRoute>} />
        {/* Pantallas retiradas: Ayuda, Novedades y la guía de Roles y permisos
            ya no existen. Si alguien entra por un enlace viejo, va al Inicio. */}
        <Route path="/ayuda/*" element={<Navigate to="/panel" replace />} />
        <Route path="/novedades/*" element={<Navigate to="/panel" replace />} />
        <Route path="/roles/*" element={<Navigate to="/panel" replace />} />
        <Route path="/" element={<Navigate to="/panel" replace />} />
        <Route path="*" element={<ProtectedRoute><NotFoundPage /></ProtectedRoute>} />
      </Routes>
      </Suspense>
      </RoutedErrorBoundary>
        </ConfirmProvider>
      </AuthProvider>
    </>
  )
}
