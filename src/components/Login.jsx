import { useState } from 'react'
import { useAuth } from './AuthContext'

export default function Login() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handle = async (e) => {
    e.preventDefault()
    setLoading(true); setError('')
    const { error } = await signIn(email, password)
    if (error) setError(error.message)
    setLoading(false)
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="logo-icon">JP</div>
          <div className="auth-logo-name">JProd</div>
          <div className="auth-logo-sub">MES Pelletteria</div>
        </div>
        <form className="auth-form" onSubmit={handle}>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input className="form-input" type="email" value={email}
              onChange={e => setEmail(e.target.value)} placeholder="nome@azienda.it" required />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input className="form-input" type="password" value={password}
              onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
          </div>
          {error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</p>}
          <button className="btn btn-primary auth-submit" type="submit" disabled={loading}>
            {loading ? 'Accesso...' : 'Accedi'}
          </button>
        </form>
      </div>
    </div>
  )
}
