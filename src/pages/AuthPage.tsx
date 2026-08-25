import { FormEvent, useEffect, useState } from 'react'
import { ArrowRight, KeyRound, ShieldCheck, Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function AuthPage({ signup = false }: { signup?: boolean }) {
  const { user, signIn, signUp, verifyMFA, mfaChallenge } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '', username: '', displayName: '' })
  const [mfaCode, setMfaCode] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { if (user) navigate('/chats', { replace: true }) }, [user, navigate])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true); setError(''); setNotice('')
    if (signup) {
      const result = await signUp(form.email, form.password, form.username, form.displayName)
      if (result.error) setError(result.error)
      else if (result.needsConfirmation) setNotice('Check your email to confirm your account.')
      else navigate('/chats')
    } else {
      const result = await signIn(form.email, form.password)
      if (result.error) setError(result.error)
      else if (result.mfaRequired) setNotice('')
      else navigate('/chats')
    }
    setBusy(false)
  }

  const submitMFA = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true); setError('')
    const result = await verifyMFA(mfaCode)
    if (result.error) setError(result.error)
    else navigate('/chats')
    setBusy(false)
  }

  if (mfaChallenge) {
    return (
      <main className="auth-shell">
        <aside className="auth-art">
          <div className="brand"><span className="brand-mark"><Sparkles size={17} /></span> tandem</div>
          <div>
            <p className="eyebrow">Two-step verification</p>
            <h1>Enter your verification code.</h1>
            <p>Open your authenticator app and enter the 6-digit code to continue.</p>
          </div>
          <small>Protected by 2FA · Built for trust</small>
        </aside>
        <section className="auth-panel">
          <div className="auth-form">
            <div className="mobile-brand brand"><span className="brand-mark"><Sparkles size={17} /></span> tandem</div>
            <p className="eyebrow">Security check</p>
            <h2>Verify it's you.</h2>
            <p className="muted">Enter the code from your authenticator app.</p>
            <form onSubmit={submitMFA}>
              <label>6-digit code
                <input
                  required
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  placeholder="000000"
                  className="mfa-input"
                  value={mfaCode}
                  onChange={e => setMfaCode(e.target.value)}
                  autoFocus
                />
              </label>
              {error && <p className="error">{error}</p>}
              <button className="primary-button" disabled={busy || mfaCode.length !== 6}>
                {busy ? 'Verifying...' : 'Verify'} <ShieldCheck size={17} />
              </button>
            </form>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="auth-shell">
      <aside className="auth-art">
        <div className="brand"><span className="brand-mark"><Sparkles size={17} /></span> tandem</div>
        <div>
          <p className="eyebrow">A quieter way to keep close</p>
          <h1>Make room for the conversations that matter.</h1>
          <p>Thoughtful messaging for your everyday people. No noise, just a little more together.</p>
        </div>
        <small>Private by design · Protected by 2FA &amp; Captcha</small>
      </aside>
      <section className="auth-panel">
        <div className="auth-form">
          <div className="mobile-brand brand"><span className="brand-mark"><Sparkles size={17} /></span> tandem</div>
          <p className="eyebrow">{signup ? 'Start a new rhythm' : 'Welcome back'}</p>
          <h2>{signup ? 'Create your space.' : 'Good to see you.'}</h2>
          <p className="muted">{signup ? 'Set up your profile and find your people.' : 'Sign in to pick up where you left off.'}</p>
          <form onSubmit={submit}>
            {signup && <>
              <label>Username
                <input required pattern="[A-Za-z0-9_]+" minLength={3} maxLength={24} placeholder="your_handle" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} />
              </label>
              <label>Display name
                <input required maxLength={60} placeholder="How should we call you?" value={form.displayName} onChange={e => setForm({ ...form, displayName: e.target.value })} />
              </label>
            </>}
            <label>Email address
              <input required type="email" placeholder="you@example.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            </label>
            <label>Password
              <input required minLength={6} type="password" placeholder="At least 6 characters" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
            </label>
            {error && <p className="error">{error}</p>}
            {notice && <p className="success">{notice}</p>}
            <button className="primary-button" disabled={busy}>
              {busy ? 'Working...' : signup ? 'Create account' : 'Sign in'} <ArrowRight size={17} />
            </button>
          </form>
          <div className="captcha-note">
            <KeyRound size={13} /> Protected by captcha to prevent automated sign-ups
          </div>
          <p className="auth-switch">
            {signup ? 'Already have an account?' : 'New to Tandem?'}{' '}
            <button onClick={() => navigate(signup ? '/login' : '/signup')}>{signup ? 'Sign in' : 'Create an account'}</button>
          </p>
        </div>
      </section>
    </main>
  )
}
