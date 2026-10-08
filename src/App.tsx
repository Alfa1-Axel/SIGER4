import { Navigate, Route, Routes } from 'react-router-dom'
import { Suspense, lazy } from 'react'
import { AuthProvider } from './hooks/useAuth'
import { NotificationPushBridge } from './components/NotificationPushBridge'
import { SwUpdateBanner } from './components/SwUpdateBanner'
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
import { CuartelesPage } from './pages/CuartelesPage'
import { CuartelDetallePage } from './pages/CuartelDetallePage'
import { CuartelFormPage } from './pages/CuartelFormPage'
// Lazy: Leaflet (mapa) es una librería pesada usada solo en esta pantalla --
// cargarla en el bundle principal infla el chunk inicial para todos los
// usuarios aunque nunca visiten /mapa. React.lazy + Suspense la separa en su
// propio chunk, descargado solo al navegar ahí.
const MapaRegionalPage = lazy(() => import('./pages/MapaRegionalPage').then((m) => ({ default: m.MapaRegionalPage })))
import { VehiculoFormPage } from './pages/VehiculoFormPage'
import { AsistenciaFormPage } from './pages/AsistenciaFormPage'
import { IntervencionFormPage } from './pages/IntervencionFormPage'
import { EscuelaPage } from './pages/EscuelaPage'
import { CursoFormPage } from './pages/CursoFormPage'
import { AvalesPage } from './pages/AvalesPage'
import { AvalFormPage } from './pages/AvalFormPage'
import { ReportesPage } from './pages/ReportesPage'
import { AjustesPage } from './pages/AjustesPage'
import { UsuariosPage } from './pages/UsuariosPage'
import { UsuarioFormPage } from './pages/UsuarioFormPage'
import { UsuarioDetallePage } from './pages/UsuarioDetallePage'
import { NotificacionesPage } from './pages/NotificacionesPage'
import { NotificacionFormPage } from './pages/NotificacionFormPage'
import { DocumentosPage } from './pages/DocumentosPage'
import { DocumentoFormPage } from './pages/DocumentoFormPage'
import { CarpetaDetallePage } from './pages/CarpetaDetallePage'
import { CarpetaFormPage } from './pages/CarpetaFormPage'
import { PapeleraDocumentosPage } from './pages/PapeleraDocumentosPage'
import { AuditoriaPage } from './pages/AuditoriaPage'
import { PersonalFormPage } from './pages/PersonalFormPage'
import { EventoHistoricoFormPage } from './pages/EventoHistoricoFormPage'
import { CalendarioPage } from './pages/CalendarioPage'
import { EventoCalendarioFormPage } from './pages/EventoCalendarioFormPage'
import { EventoCalendarioDetallePage } from './pages/EventoCalendarioDetallePage'
import { InventarioPage } from './pages/InventarioPage'
import { InventarioFormPage } from './pages/InventarioFormPage'
import { InventarioDetallePage } from './pages/InventarioDetallePage'
import { SolicitudesPrestamoPage } from './pages/SolicitudesPrestamoPage'
import { SolicitudPrestamoFormPage } from './pages/SolicitudPrestamoFormPage'
import { SolicitudPrestamoDetallePage } from './pages/SolicitudPrestamoDetallePage'
import { DepartamentosPage } from './pages/DepartamentosPage'
import { DepartamentoFormPage } from './pages/DepartamentoFormPage'
import { DepartamentoDetallePage } from './pages/DepartamentoDetallePage'
import { InformeDepartamentoFormPage } from './pages/InformeDepartamentoFormPage'
import { DepartamentoInformeFormPage } from './pages/DepartamentoInformeFormPage'
import { DepartamentoInformeDetallePage } from './pages/DepartamentoInformeDetallePage'

export default function App() {
  return (
    <>
      <SwUpdateBanner />
      <AuthProvider>
        <NotificationPushBridge />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/cambiar-password" element={<CambiarPasswordPage />} />
        <Route path="/panel" element={<ProtectedRoute><PanelPage /></ProtectedRoute>} />
        <Route path="/cuarteles" element={<ModuleRoute module="cuarteles" title="Cuarteles"><CuartelesPage /></ModuleRoute>} />
        <Route path="/cuarteles/nuevo" element={<ModuleRoute module="cuarteles" title="Cuarteles"><CuartelFormPage /></ModuleRoute>} />
        <Route path="/cuarteles/:id/editar" element={<ModuleRoute module="cuarteles" title="Cuarteles"><CuartelFormPage /></ModuleRoute>} />
        <Route path="/cuarteles/:id" element={<ModuleRoute module="cuarteles" title="Cuarteles"><CuartelDetallePage /></ModuleRoute>} />
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
        <Route path="/cuarteles/:stationId/vehiculos/nuevo" element={<ModuleRoute module="cuarteles" title="Cuarteles"><VehiculoFormPage /></ModuleRoute>} />
        <Route path="/vehiculos/:id/editar" element={<ModuleRoute module="cuarteles" title="Cuarteles"><VehiculoFormPage /></ModuleRoute>} />
        <Route path="/cuarteles/:stationId/asistencia/nueva" element={<ModuleRoute module="cuarteles" title="Cuarteles"><AsistenciaFormPage /></ModuleRoute>} />
        <Route path="/asistencia/:id/editar" element={<ModuleRoute module="cuarteles" title="Cuarteles"><AsistenciaFormPage /></ModuleRoute>} />
        <Route path="/cuarteles/:stationId/intervenciones/nueva" element={<ModuleRoute module="cuarteles" title="Cuarteles"><IntervencionFormPage /></ModuleRoute>} />
        <Route path="/intervenciones/:id/editar" element={<ModuleRoute module="cuarteles" title="Cuarteles"><IntervencionFormPage /></ModuleRoute>} />
        <Route path="/escuela" element={<ModuleRoute module="escuela" title="Escuela"><EscuelaPage /></ModuleRoute>} />
        <Route path="/escuela/nuevo" element={<ModuleRoute module="escuela" title="Escuela"><CursoFormPage /></ModuleRoute>} />
        <Route path="/escuela/:id/editar" element={<ModuleRoute module="escuela" title="Escuela"><CursoFormPage /></ModuleRoute>} />
        <Route path="/escuela/avales" element={<SchoolAvalesRoute><AvalesPage /></SchoolAvalesRoute>} />
        <Route path="/escuela/avales/nuevo" element={<SchoolAvalesRoute><AvalFormPage /></SchoolAvalesRoute>} />
        {/* Rutas viejas de administración de departamentos/coordinadores de
            Escuela: ahora se administran solo en la sección Departamentos. */}
        <Route path="/escuela/avales/coordinadores" element={<Navigate to="/escuela/avales" replace />} />
        <Route path="/escuela/avales/departamentos" element={<Navigate to="/escuela/avales" replace />} />
        <Route path="/escuela/avales/:id/editar" element={<SchoolAvalesRoute><AvalFormPage /></SchoolAvalesRoute>} />
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
        <Route path="/auditoria" element={<SuperAdminRoute title="Auditoría"><AuditoriaPage /></SuperAdminRoute>} />
        <Route path="/cuarteles/:stationId/personal/nuevo" element={<ModuleRoute module="cuarteles" title="Cuarteles"><PersonalFormPage /></ModuleRoute>} />
        <Route path="/personal/:id/editar" element={<ModuleRoute module="cuarteles" title="Cuarteles"><PersonalFormPage /></ModuleRoute>} />
        <Route path="/cuarteles/:stationId/historial/nuevo" element={<ModuleRoute module="cuarteles" title="Cuarteles"><EventoHistoricoFormPage /></ModuleRoute>} />
        <Route path="/historial/:id/editar" element={<ModuleRoute module="cuarteles" title="Cuarteles"><EventoHistoricoFormPage /></ModuleRoute>} />
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
        <Route path="/departamentos/:id" element={<ProtectedRoute><DepartamentoDetallePage /></ProtectedRoute>} />
        {/* Pantallas retiradas: Ayuda, Novedades y la guía de Roles y permisos
            ya no existen. Si alguien entra por un enlace viejo, va al Inicio. */}
        <Route path="/ayuda/*" element={<Navigate to="/panel" replace />} />
        <Route path="/novedades/*" element={<Navigate to="/panel" replace />} />
        <Route path="/roles/*" element={<Navigate to="/panel" replace />} />
        <Route path="/" element={<Navigate to="/panel" replace />} />
        <Route path="*" element={<Navigate to="/panel" replace />} />
      </Routes>
      </AuthProvider>
    </>
  )
}
