import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './hooks/useAuth'
import { ProtectedRoute } from './components/layout/ProtectedRoute'
import { AdminRoute } from './components/layout/AdminRoute'
import { LoginPage } from './pages/LoginPage'
import { RegistroPage } from './pages/RegistroPage'
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
import { AuditoriaPage } from './pages/AuditoriaPage'
import { PersonalFormPage } from './pages/PersonalFormPage'

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/registro" element={<RegistroPage />} />
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
        <Route path="/usuarios" element={<AdminRoute><UsuariosPage /></AdminRoute>} />
        <Route path="/usuarios/nuevo" element={<AdminRoute><UsuarioFormPage /></AdminRoute>} />
        <Route path="/usuarios/:id" element={<AdminRoute><UsuarioDetallePage /></AdminRoute>} />
        <Route path="/notificaciones" element={<ProtectedRoute><NotificacionesPage /></ProtectedRoute>} />
        <Route path="/notificaciones/nueva" element={<ProtectedRoute><NotificacionFormPage /></ProtectedRoute>} />
        <Route path="/documentos" element={<ProtectedRoute><DocumentosPage /></ProtectedRoute>} />
        <Route path="/documentos/nuevo" element={<ProtectedRoute><DocumentoFormPage /></ProtectedRoute>} />
        <Route path="/documentos/:id/editar" element={<ProtectedRoute><DocumentoFormPage /></ProtectedRoute>} />
        <Route path="/auditoria" element={<ProtectedRoute><AuditoriaPage /></ProtectedRoute>} />
        <Route path="/cuarteles/:stationId/personal/nuevo" element={<ProtectedRoute><PersonalFormPage /></ProtectedRoute>} />
        <Route path="/personal/:id/editar" element={<ProtectedRoute><PersonalFormPage /></ProtectedRoute>} />
        <Route path="/" element={<Navigate to="/panel" replace />} />
        <Route path="*" element={<Navigate to="/panel" replace />} />
      </Routes>
    </AuthProvider>
  )
}
