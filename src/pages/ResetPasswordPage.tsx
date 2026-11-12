import { FormEvent, useEffect, useState } from 'react'
import { ArrowRight, Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) navigate('/login', { replace: true })
    })
  }, [navigate])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }
    setBusy(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (updateError) { setError(updateError.message); return }
    setNotice('Your password has been updated. Redirecting to login...')
    await supabase.auth.signOut()
    setTimeout(() => navigate('/login', { replace: true }), 2000)
  }

  return (
    <main className="auth-shell">
      <aside className="auth-art">
        <div className="brand"><span className="brand-mark"><Sparkles size={17} /></span> tandem</div>
        <div>
          <p className="eyebrow">Account recovery</p>
          <h1>Set a new password.</h1>
          <p>Choose a strong password to secure your account and get back to your conversations.</p>
        </div>
        <small>Private by design · Protected by 2FA &amp; Captcha</small>
      </aside>
      <section className="auth-panel">
        <div className="auth-form">
          <div className="mobile-brand brand"><span className="brand-mark"><Sparkles size={17} /></span> tandem</div>
          <p className="eyebrow">Reset password</p>
          <h2>Choose a new password.</h2>
          <p className="muted">Enter your new password below to finish recovering your account.</p>
          <form onSubmit={submit}>
            <label>New password
              <input required minLength={6} type="password" placeholder="At least 6 characters" value={password} onChange={e => setPassword(e.target.value)} autoFocus />
            </label>
            <label>Confirm new password
              <input required minLength={6} type="password" placeholder="Re-enter your password" value={confirm} onChange={e => setConfirm(e.target.value)} />
            </label>
            {error && <p className="error">{error}</p>}
            {notice && <p className="success">{notice}</p>}
            <button className="primary-button" disabled={busy}>
              {busy ? 'Updating...' : 'Update password'} <ArrowRight size={17} />
            </button>
          </form>
          <p className="auth-switch">
            Remember your password?{' '}
            <button onClick={() => navigate('/login')}>Sign in</button>
          </p>
        </div>
      </section>
    </main>
  )
}
