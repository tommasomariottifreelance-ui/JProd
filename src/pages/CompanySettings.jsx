import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../components/AuthContext'

export default function CompanySettings() {
  const { profile } = useAuth()
  const [form, setForm] = useState({
    name: '', vat_number: '', address: '', phone: '', email: ''
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)

  useEffect(() => {
    async function load() {
      if (!profile?.client_id) return
      const { data } = await supabase
        .from('clients')
        .select('*')
        .eq('id', profile.client_id)
        .single()
      if (data) setForm({
        name:       data.name        ?? '',
        vat_number: data.vat_number  ?? '',
        address:    data.address     ?? '',
        phone:      data.phone       ?? '',
        email:      data.email       ?? '',
      })
      setLoading(false)
    }
    load()
  }, [profile])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    setSaving(true)
    const { error } = await supabase.from('clients').update({
      name:       form.name,
      vat_number: form.vat_number,
      address:    form.address,
      phone:      form.phone,
      email:      form.email,
    }).eq('id', profile.client_id)
    setSaving(false)
    if (error) {
      alert('Errore nel salvataggio: ' + error.message + '\nVerifica che la policy RLS UPDATE sia configurata su Supabase.')
    } else {
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    }
  }

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="topbar-title">Dati azienda</div>
          <div className="topbar-sub">Informazioni sulla tua organizzazione</div>
        </div>
      </div>

      <div className="page-content">
        {loading ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--gray-500)' }}>Caricamento...</div>
        ) : (
          <div className="card card-body" style={{ maxWidth: 560 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div className="form-group">
                <label className="form-label">Ragione sociale</label>
                <input className="form-input" value={form.name}
                  onChange={e => set('name', e.target.value)}
                  placeholder="es. Group Jet Srl" />
              </div>
              <div className="form-group">
                <label className="form-label">Partita IVA</label>
                <input className="form-input" value={form.vat_number}
                  onChange={e => set('vat_number', e.target.value)}
                  placeholder="es. IT12345678901" />
              </div>
              <div className="form-group">
                <label className="form-label">Indirizzo</label>
                <input className="form-input" value={form.address}
                  onChange={e => set('address', e.target.value)}
                  placeholder="es. Via Roma 1, 20100 Milano" />
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Telefono</label>
                  <input className="form-input" value={form.phone}
                    onChange={e => set('phone', e.target.value)}
                    placeholder="es. +39 02 1234567" />
                </div>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input className="form-input" type="email" value={form.email}
                    onChange={e => set('email', e.target.value)}
                    placeholder="es. info@azienda.it" />
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
                <button className="btn btn-primary" onClick={save} disabled={saving}>
                  {saving ? 'Salvataggio...' : 'Salva dati azienda'}
                </button>
                {saved && (
                  <span style={{ fontSize: 13, color: 'var(--success)', fontWeight: 500 }}>
                    ✓ Salvato correttamente
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
