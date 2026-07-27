import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './hooks/useAuth'
import { ProtectedRoute } from './components/layout/ProtectedRoute'
import { LoginPage } from './pages/LoginPage'
import { PanelPage } from './pages/PanelPage'
import { CuartelesPage } from './pages/CuartelesPage'
import { CuartelDetallePage } from './pages/CuartelDetallePage'
import { CuartelFormPage } from './pages/CuartelFormPage'
import { EscuelaPage } from './pages/EscuelaPage'
import { ReportesPage } from './pages/ReportesPage'
import { AjustesPage } from './pages/AjustesPage'

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/panel" element={<ProtectedRoute><PanelPage /></ProtectedRoute>} />
        <Route path="/cuarteles" element={<ProtectedRoute><CuartelesPage /></ProtectedRoute>} />
        <Route path="/cuarteles/nuevo" element={<ProtectedRoute><CuartelFormPage /></ProtectedRoute>} />
        <Route path="/cuarteles/:id/editar" element={<ProtectedRoute><CuartelFormPage /></ProtectedRoute>} />
        <Route path="/cuarteles/:id" element={<ProtectedRoute><CuartelDetallePage /></ProtectedRoute>} />
        <Route path="/escuela" element={<ProtectedRoute><EscuelaPage /></ProtectedRoute>} />
        <Route path="/reportes" element={<ProtectedRoute><ReportesPage /></ProtectedRoute>} />
        <Route path="/ajustes" element={<ProtectedRoute><AjustesPage /></ProtectedRoute>} />
        <Route path="/" element={<Navigate to="/panel" replace />} />
        <Route path="*" element={<Navigate to="/panel" replace />} />
      </Routes>
    </AuthProvider>
  )
}
