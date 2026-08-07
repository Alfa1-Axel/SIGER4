import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './hooks/useAuth'
import { NotificationPushBridge } from './components/NotificationPushBridge'
import { AppUpdateBanner } from './components/AppUpdateBanner'
import { ProtectedRoute } from './components/layout/ProtectedRoute'
import { UserManagerRoute } from './components/layout/UserManagerRoute'
import { UserCreatorRoute } from './components/layout/UserCreatorRoute'
import { LoginPage } from './pages/LoginPage'
import { CambiarPasswordPage } from './pages/CambiarPasswordPage'
import { PanelPage } from './pages/PanelPage'
import { CuartelesPage } from './pages/CuartelesPage'
import { CuartelDetallePage } from './pages/CuartelDetallePage'
import { CuartelFormPage } from './pages/CuartelFormPage'
import { VehiculoFormPage } from './pages/VehiculoFormPage'
import { AsistenciaFormPage } from './pages/AsistenciaFormPage'
import { IntervencionFormPage } from './pages/IntervencionFormPage'
import { EscuelaPage } from './pages/EscuelaPage'
import { CursoFormPage } from './pages/CursoFormPage'
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

export default function App() {
  return (
    <AuthProvider>
      <NotificationPushBridge />
      <AppUpdateBanner />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/cambiar-password" element={<CambiarPasswordPage />} />
        <Route path="/panel" element={<ProtectedRoute><PanelPage /></ProtectedRoute>} />
        <Route path="/cuarteles" element={<ProtectedRoute><CuartelesPage /></ProtectedRoute>} />
        <Route path="/cuarteles/nuevo" element={<ProtectedRoute><CuartelFormPage /></ProtectedRoute>} />
        <Route path="/cuarteles/:id/editar" element={<ProtectedRoute><CuartelFormPage /></ProtectedRoute>} />
        <Route path="/cuarteles/:id" element={<ProtectedRoute><CuartelDetallePage /></ProtectedRoute>} />
        <Route path="/cuarteles/:stationId/vehiculos/nuevo" element={<ProtectedRoute><VehiculoFormPage /></ProtectedRoute>} />
        <Route path="/vehiculos/:id/editar" element={<ProtectedRoute><VehiculoFormPage /></ProtectedRoute>} />
        <Route path="/cuarteles/:stationId/asistencia/nueva" element={<ProtectedRoute><AsistenciaFormPage /></ProtectedRoute>} />
        <Route path="/asistencia/:id/editar" element={<ProtectedRoute><AsistenciaFormPage /></ProtectedRoute>} />
        <Route path="/cuarteles/:stationId/intervenciones/nueva" element={<ProtectedRoute><IntervencionFormPage /></ProtectedRoute>} />
        <Route path="/intervenciones/:id/editar" element={<ProtectedRoute><IntervencionFormPage /></ProtectedRoute>} />
        <Route path="/escuela" element={<ProtectedRoute><EscuelaPage /></ProtectedRoute>} />
        <Route path="/escuela/nuevo" element={<ProtectedRoute><CursoFormPage /></ProtectedRoute>} />
        <Route path="/escuela/:id/editar" element={<ProtectedRoute><CursoFormPage /></ProtectedRoute>} />
        <Route path="/reportes" element={<ProtectedRoute><ReportesPage /></ProtectedRoute>} />
        <Route path="/ajustes" element={<ProtectedRoute><AjustesPage /></ProtectedRoute>} />
        <Route path="/usuarios" element={<UserManagerRoute><UsuariosPage /></UserManagerRoute>} />
        <Route path="/usuarios/nuevo" element={<UserCreatorRoute><UsuarioFormPage /></UserCreatorRoute>} />
        <Route path="/usuarios/:id" element={<UserManagerRoute><UsuarioDetallePage /></UserManagerRoute>} />
        <Route path="/notificaciones" element={<ProtectedRoute><NotificacionesPage /></ProtectedRoute>} />
        <Route path="/notificaciones/nueva" element={<ProtectedRoute><NotificacionFormPage /></ProtectedRoute>} />
        <Route path="/documentos" element={<ProtectedRoute><DocumentosPage /></ProtectedRoute>} />
        <Route path="/documentos/nuevo" element={<ProtectedRoute><DocumentoFormPage /></ProtectedRoute>} />
        <Route path="/documentos/:id/editar" element={<ProtectedRoute><DocumentoFormPage /></ProtectedRoute>} />
        <Route path="/documentos/carpetas/nueva" element={<ProtectedRoute><CarpetaFormPage /></ProtectedRoute>} />
        <Route path="/documentos/papelera" element={<ProtectedRoute><PapeleraDocumentosPage /></ProtectedRoute>} />
        <Route path="/documentos/carpetas/:id" element={<ProtectedRoute><CarpetaDetallePage /></ProtectedRoute>} />
        <Route path="/auditoria" element={<ProtectedRoute><AuditoriaPage /></ProtectedRoute>} />
        <Route path="/cuarteles/:stationId/personal/nuevo" element={<ProtectedRoute><PersonalFormPage /></ProtectedRoute>} />
        <Route path="/personal/:id/editar" element={<ProtectedRoute><PersonalFormPage /></ProtectedRoute>} />
        <Route path="/cuarteles/:stationId/historial/nuevo" element={<ProtectedRoute><EventoHistoricoFormPage /></ProtectedRoute>} />
        <Route path="/historial/:id/editar" element={<ProtectedRoute><EventoHistoricoFormPage /></ProtectedRoute>} />
        <Route path="/calendario" element={<ProtectedRoute><CalendarioPage /></ProtectedRoute>} />
        <Route path="/calendario/nuevo" element={<ProtectedRoute><EventoCalendarioFormPage /></ProtectedRoute>} />
        <Route path="/calendario/:id/editar" element={<ProtectedRoute><EventoCalendarioFormPage /></ProtectedRoute>} />
        <Route path="/calendario/:id" element={<ProtectedRoute><EventoCalendarioDetallePage /></ProtectedRoute>} />
        <Route path="/inventario" element={<ProtectedRoute><InventarioPage /></ProtectedRoute>} />
        <Route path="/inventario/nuevo" element={<ProtectedRoute><InventarioFormPage /></ProtectedRoute>} />
        <Route path="/inventario/solicitudes" element={<ProtectedRoute><SolicitudesPrestamoPage /></ProtectedRoute>} />
        <Route path="/inventario/solicitudes/:id" element={<ProtectedRoute><SolicitudPrestamoDetallePage /></ProtectedRoute>} />
        <Route path="/inventario/:itemId/solicitudes/nueva" element={<ProtectedRoute><SolicitudPrestamoFormPage /></ProtectedRoute>} />
        <Route path="/inventario/:id/editar" element={<ProtectedRoute><InventarioFormPage /></ProtectedRoute>} />
        <Route path="/inventario/:id" element={<ProtectedRoute><InventarioDetallePage /></ProtectedRoute>} />
        <Route path="/departamentos" element={<ProtectedRoute><DepartamentosPage /></ProtectedRoute>} />
        <Route path="/departamentos/nuevo" element={<ProtectedRoute><DepartamentoFormPage /></ProtectedRoute>} />
        <Route path="/departamentos/:departmentId/informes/nuevo" element={<ProtectedRoute><InformeDepartamentoFormPage /></ProtectedRoute>} />
        <Route path="/informes/:id/editar" element={<ProtectedRoute><InformeDepartamentoFormPage /></ProtectedRoute>} />
        <Route path="/departamentos/:id" element={<ProtectedRoute><DepartamentoDetallePage /></ProtectedRoute>} />
        <Route path="/" element={<Navigate to="/panel" replace />} />
        <Route path="*" element={<Navigate to="/panel" replace />} />
      </Routes>
    </AuthProvider>
  )
}
