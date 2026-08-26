import { FormEvent, useEffect, useState } from 'react'
import { ArrowLeft, Cake, Check, KeyRound, LogOut, Plus, Repeat, ShieldCheck, Sparkles, Trash2, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useProfile } from '../hooks/useProfile'
import { useMFA } from '../hooks/useMFA'

const ADMIN_MODE_KEY = 'tandem-admin-mode'
const ADMIN_EMAIL = 'brody.levi@emanuelschool.nsw.edu.au'

export default function ProfilePage({ settings = false }: { settings?: boolean }) {
  const { user, signOut } = useAuth()
  const { profile, loading, updateProfile } = useProfile(user?.id)
  const [form, setForm] = useState({ username: '', display_name: '', avatar_url: '', private_name: '', birthday: '' })
  const [notice, setNotice] = useState('')
  const hasAdminRole = user?.app_metadata?.role === 'admin'
  const canSwitchAdmin = user?.email === ADMIN_EMAIL && hasAdminRole
  const [adminMode, setAdminMode] = useState(() => localStorage.getItem(ADMIN_MODE_KEY) !== 'user')
  const switchMode = () => {
    const next = !adminMode
    setAdminMode(next)
    localStorage.setItem(ADMIN_MODE_KEY, next ? 'admin' : 'user')
  }
  const nav = useNavigate()
  const { getStatus, enroll, verify, unenroll } = useMFA()
  const [mfaEnrolled, setMfaEnrolled] = useState(false)
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null)
  const [mfaStep, setMfaStep] = useState<'idle' | 'enrolling' | 'verifying'>('idle')
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [pendingFactorId, setPendingFactorId] = useState<string | null>(null)
  const [verifyCode, setVerifyCode] = useState('')
  const [mfaError, setMfaError] = useState('')

  useEffect(() => {
    if (profile) setForm({ username: profile.username, display_name: profile.display_name, avatar_url: profile.avatar_url || '', private_name: profile.private_name || '', birthday: profile.birthday || '' })
  }, [profile])

  useEffect(() => {
    if (settings) {
      getStatus().then(s => { setMfaEnrolled(s.enrolled); setMfaFactorId(s.factorId) })
    }
  }, [settings])

  if (loading || !profile) return <div className="loading-screen"><Sparkles /> Loading...</div>

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setNotice(await updateProfile(form) || 'Saved successfully.')
  }

  const startEnroll = async () => {
    setMfaError(''); setMfaStep('enrolling')
    const result = await enroll()
    if (result.error) { setMfaError(result.error); setMfaStep('idle'); return }
    setQrCode(result.qrCode); setPendingFactorId(result.factorId)
    setMfaStep('verifying')
  }

  const confirmEnroll = async (e: FormEvent) => {
    e.preventDefault()
    if (!pendingFactorId) return
    setMfaError('')
    const result = await verify(pendingFactorId, verifyCode)
    if (result.error) { setMfaError(result.error); return }
    setMfaEnrolled(true); setMfaFactorId(pendingFactorId)
    setMfaStep('idle'); setQrCode(null); setPendingFactorId(null); setVerifyCode('')
  }

  const cancelEnroll = () => {
    setMfaStep('idle'); setQrCode(null); setPendingFactorId(null); setVerifyCode(''); setMfaError('')
  }

  const removeMFA = async () => {
    if (!mfaFactorId) return
    const result = await unenroll(mfaFactorId)
    if (result.error) { setMfaError(result.error); return }
    setMfaEnrolled(false); setMfaFactorId(null)
  }

  return (
    <div className="settings-shell">
      <header className="settings-top">
        <button onClick={() => nav('/chats')}><ArrowLeft size={18} /> Back to chats</button>
        <div className="brand"><span className="brand-mark"><Sparkles size={16} /></span> tandem</div>
        <span />
      </header>
      <main className="settings-content">
        <p className="eyebrow">{settings ? 'Preferences' : 'Your identity'}</p>
        <h1>{settings ? 'Make Tandem yours.' : 'Your profile.'}</h1>
        <p className="muted">{settings ? 'A few simple choices for your space.' : 'This is how people find and recognize you.'}</p>
        <form className="settings-form" onSubmit={save}>
          <label>Display name
            <input value={form.display_name} onChange={e => setForm({ ...form, display_name: e.target.value })} />
          </label>
          <label>Username
            <input pattern="[A-Za-z0-9_]+" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} />
            <small>3–24 letters, numbers, or underscores.</small>
          </label>
          <label>Avatar URL
            <input type="url" value={form.avatar_url} onChange={e => setForm({ ...form, avatar_url: e.target.value })} placeholder="https://..." />
          </label>
          <label>Private name <small className="muted">Visible only to you and admins</small>
            <input maxLength={60} value={form.private_name} onChange={e => setForm({ ...form, private_name: e.target.value })} placeholder="Your real name" />
          </label>
          <label>Birthday <span className="input-with-icon"><Cake size={15} /></span>
            <input type="date" value={form.birthday} onChange={e => setForm({ ...form, birthday: e.target.value })} />
          </label>
          {settings && (
            <label>Theme
              <select defaultValue={localStorage.getItem('tandem-theme') || 'system'} onChange={e => { localStorage.setItem('tandem-theme', e.target.value); document.documentElement.dataset.theme = e.target.value }}>
                <option value="system">System</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </label>
          )}
          <button className="primary-button"><Check size={17} /> Save changes</button>
          {notice && <span className="success">{notice}</span>}
        </form>

        {settings && (
          <section className="mfa-section">
            <div className="mfa-header">
              <span className="mfa-icon"><ShieldCheck size={18} /></span>
              <div>
                <h2>Two-step verification</h2>
                <p className="muted">Add an extra layer of security with an authenticator app like Google Authenticator or 1Password.</p>
              </div>
            </div>

            {mfaError && <p className="error mfa-error">{mfaError}</p>}

            {mfaStep === 'idle' && (
              mfaEnrolled ? (
                <div className="mfa-status-row">
                  <span className="mfa-active"><ShieldCheck size={15} /> Enabled — your account is protected</span>
                  <button className="mfa-remove-btn" onClick={removeMFA}><Trash2 size={15} /> Remove 2FA</button>
                </div>
              ) : (
                <button className="primary-button mfa-enable-btn" onClick={startEnroll}><Plus size={17} /> Enable 2FA</button>
              )
            )}

            {mfaStep === 'verifying' && qrCode && (
              <div className="mfa-enroll-card">
                <div className="mfa-enroll-top">
                  <h3>Scan this QR code</h3>
                  <button onClick={cancelEnroll} aria-label="Cancel"><X size={18} /></button>
                </div>
                <div className="mfa-qr-wrap">
                  <img src={qrCode} alt="QR code for authenticator app" />
                </div>
                <p className="muted">Open your authenticator app, scan the code, then enter the 6-digit code it generates.</p>
                <form onSubmit={confirmEnroll} className="mfa-verify-form">
                  <label>6-digit code
                    <input inputMode="numeric" pattern="[0-9]{6}" maxLength={6} placeholder="000000" className="mfa-input" value={verifyCode} onChange={e => setVerifyCode(e.target.value)} autoFocus />
                  </label>
                  <button className="primary-button" disabled={verifyCode.length !== 6}><KeyRound size={16} /> Verify &amp; enable</button>
                </form>
              </div>
            )}
          </section>
        )}

        {canSwitchAdmin && (
          <section className="mfa-section" style={{ marginTop: '36px' }}>
            <div className="mfa-header">
              <span className="mfa-icon"><Repeat size={18} /></span>
              <div>
                <h2>Account mode</h2>
                <p className="muted">Switch between your admin and regular user view.</p>
              </div>
            </div>
            <div className="mfa-status-row">
              <span className="mfa-active"><ShieldCheck size={15} /> Currently in {adminMode ? 'Admin' : 'User'} mode</span>
              <button className="primary-button" style={{ minHeight: '40px', padding: '0 14px' }} onClick={switchMode}>
                <Repeat size={15} /> Switch to {adminMode ? 'User' : 'Admin'}
              </button>
            </div>
          </section>
        )}

        <button className="logout" onClick={async () => { await signOut(); nav('/login') }}><LogOut size={17} /> Log out of Tandem</button>
      </main>
    </div>
  )
}
