import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext'

const nav = [
  { label: 'Economia',       icon: '€', path: '/' },
  { label: 'Produzione',     icon: '≡', path: '/production' },
  { label: 'Log produzione', icon: '◎', path: '/log' },
  { label: 'Analisi',        icon: '↗', path: '/analysis' },
  { label: 'Import Excel',   icon: '⊕', path: '/import' },
]
const settings = [
  { label: 'Prodotti',         icon: '◈', path: '/products' },
  { label: 'Linee produzione', icon: '⚙', path: '/lines' },
  { label: 'Brand',            icon: '◈', path: '/brands' },
]
const bottom = [
  { label: 'Dati azienda', icon: '🏢', path: '/company' },
]

export default function Sidebar() {
  const location  = useLocation()
  const navigate  = useNavigate()
  const { user, profile, signOut } = useAuth()
  const initials   = user?.email?.slice(0,2).toUpperCase() ?? 'JP'
  const emailShort = user?.email?.split('@')[0] ?? 'utente'
  const roleLabel  = profile?.role === 'admin' ? 'Admin' : profile?.role === 'viewer' ? 'Viewer' : 'Operatore'

  const NavBtn = ({ item }) => (
    <button className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
      onClick={() => navigate(item.path)}>
      <span className="nav-icon" style={{ fontSize: 15 }}>{item.icon}</span>
      {item.label}
    </button>
  )

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="logo-mark">
          <div className="logo-icon">JP</div>
          <div>
            <div className="logo-text">JProd</div>
            <div className="logo-sub">MES</div>
          </div>
        </div>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section-label">Principale</div>
        {nav.map(item => <NavBtn key={item.path} item={item} />)}
        <div className="nav-section-label" style={{ marginTop: 8 }}>Anagrafiche</div>
        {settings.map(item => <NavBtn key={item.path} item={item} />)}
        <div style={{ flex: 1 }} />
        <div className="nav-section-label" style={{ marginTop: 8 }}>Impostazioni</div>
        {bottom.map(item => <NavBtn key={item.path} item={item} />)}
      </nav>

      <div className="sidebar-footer">
        <div className="user-card">
          <div className="user-avatar">{initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="user-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{emailShort}</div>
            <div className="user-role">{roleLabel}</div>
          </div>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={signOut}
            style={{ color: 'var(--gray-500)', padding: 4 }} title="Esci">✕</button>
        </div>
      </div>
    </aside>
  )
}
