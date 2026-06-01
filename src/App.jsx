import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './components/AuthContext'
import Login from './components/Login'
import Sidebar from './components/Sidebar'
import Economy from './pages/Economy'
import Production from './pages/Production'
import ProductionLog from './pages/ProductionLog'
import Analysis from './pages/Analysis'
import Import from './pages/Import'
import Lines from './pages/Lines'
import Brands from './pages/Brands'
import Products from './pages/Products'

function Shell() {
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-content">
        <Routes>
          <Route path="/"           element={<Economy />} />
          <Route path="/production" element={<Production />} />
          <Route path="/log"        element={<ProductionLog />} />
          <Route path="/analysis"   element={<Analysis />} />
          <Route path="/import"     element={<Import />} />
          <Route path="/lines"      element={<Lines />} />
          <Route path="/brands"     element={<Brands />} />
          <Route path="/products"   element={<Products />} />
          <Route path="*"           element={<Navigate to="/" />} />
        </Routes>
      </div>
    </div>
  )
}

function Guard() {
  const { user, loading } = useAuth()
  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--navy)' }}>
      <div style={{ color: 'var(--celeste)', fontSize: 14 }}>Caricamento...</div>
    </div>
  )
  return user ? <Shell /> : <Login />
}

export default function App() {
  return <AuthProvider><Guard /></AuthProvider>
}
