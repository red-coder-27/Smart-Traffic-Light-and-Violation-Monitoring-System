import { useEffect, useState } from 'react'
import './App.css'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000'

type Feedback = { kind: 'success' | 'error'; text: string }

type ProfileForm = {
  name: string
  phone: string
  address: string
  city: string
  state: string
  postalCode: string
  dateOfBirth: string
}

const emptyProfile: ProfileForm = {
  name: '',
  phone: '',
  address: '',
  city: '',
  state: '',
  postalCode: '',
  dateOfBirth: '',
}

function readStoredToken() {
  if (typeof window === 'undefined') {
    return ''
  }

  return window.localStorage.getItem('trafficAuthToken') ?? ''
}

function App() {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [loginLoading, setLoginLoading] = useState(false)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileSaving, setProfileSaving] = useState(false)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [password, setPassword] = useState('')
  const [token, setToken] = useState(readStoredToken)
  const [loginForm, setLoginForm] = useState({ email: '', password: '' })
  const [profile, setProfile] = useState<ProfileForm>(emptyProfile)

  useEffect(() => {
    if (!token) {
      return
    }

    const fetchProfile = async () => {
      setProfileLoading(true)

      try {
        const response = await fetch(`${API_BASE_URL}/api/profile`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

        const result = await response.json() as {
          success?: boolean
          message?: string
          profile?: Partial<ProfileForm> | null
        }

        if (!response.ok) {
          throw new Error(typeof result.message === 'string' ? result.message : 'Unable to load profile')
        }

        const safeProfile = result.profile ?? {}
        setProfile({
          name: String(safeProfile.name ?? ''),
          phone: String(safeProfile.phone ?? ''),
          address: String(safeProfile.address ?? ''),
          city: String(safeProfile.city ?? ''),
          state: String(safeProfile.state ?? ''),
          postalCode: String(safeProfile.postalCode ?? ''),
          dateOfBirth: String(safeProfile.dateOfBirth ?? ''),
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to load your profile.'
        setFeedback({ kind: 'error', text: message })
        setToken('')
        window.localStorage.removeItem('trafficAuthToken')
      } finally {
        setProfileLoading(false)
      }
    }

    void fetchProfile()
  }, [token])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    setFeedback(null)
    setIsSubmitting(true)

    const formData = new FormData(form)
    const registration = {
      name: String(formData.get('name') ?? ''),
      email: String(formData.get('email') ?? ''),
      password,
      phone: String(formData.get('phone') ?? ''),
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registration),
      })
      const result = await response.json() as { message?: unknown }

      if (!response.ok) {
        const message = typeof result.message === 'string'
          ? result.message
          : response.status === 409
            ? 'An account with this email already exists.'
            : 'Please check your details and try again.'
        setFeedback({ kind: 'error', text: message })
        return
      }

      setPassword('')
      form.reset()
      setFeedback({ kind: 'success', text: 'Your citizen account has been created.' })
    } catch {
      setFeedback({ kind: 'error', text: 'Unable to reach the registration service. Please try again.' })
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)
    setLoginLoading(true)

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginForm),
      })

      const result = await response.json() as { success?: boolean; message?: string; token?: string }

      if (!response.ok || typeof result.token !== 'string') {
        setFeedback({
          kind: 'error',
          text: typeof result.message === 'string' ? result.message : 'Login failed. Please check your email and password.',
        })
        return
      }

      window.localStorage.setItem('trafficAuthToken', result.token)
      setToken(result.token)
      setLoginForm({ email: '', password: '' })
      setFeedback({ kind: 'success', text: 'Signed in successfully.' })
    } catch {
      setFeedback({ kind: 'error', text: 'Unable to reach the authentication service. Please try again.' })
    } finally {
      setLoginLoading(false)
    }
  }

  async function handleProfileSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token) {
      setFeedback({ kind: 'error', text: 'Please log in before saving your profile.' })
      return
    }

    setProfileSaving(true)
    setFeedback(null)

    try {
      const response = await fetch(`${API_BASE_URL}/api/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: profile.name,
          phone: profile.phone,
          address: profile.address,
          city: profile.city,
          state: profile.state,
          postalCode: profile.postalCode,
          dateOfBirth: profile.dateOfBirth,
        }),
      })

      const result = await response.json() as {
        success?: boolean
        message?: string
        profile?: Partial<ProfileForm> | null
      }

      if (!response.ok) {
        setFeedback({
          kind: 'error',
          text: typeof result.message === 'string' ? result.message : 'Please check the profile details and try again.',
        })
        return
      }

      const safeProfile = result.profile ?? {}
      setProfile({
        name: String(safeProfile.name ?? ''),
        phone: String(safeProfile.phone ?? ''),
        address: String(safeProfile.address ?? ''),
        city: String(safeProfile.city ?? ''),
        state: String(safeProfile.state ?? ''),
        postalCode: String(safeProfile.postalCode ?? ''),
        dateOfBirth: String(safeProfile.dateOfBirth ?? ''),
      })
      setFeedback({ kind: 'success', text: 'Profile updated successfully.' })
    } catch {
      setFeedback({ kind: 'error', text: 'Unable to save your profile right now. Please try again.' })
    } finally {
      setProfileSaving(false)
    }
  }

  return (
    <main className="page-shell">
      <header className="site-header">
        <a className="wordmark" href="/" aria-label="Smart Traffic home">
          <span className="signal-mark" aria-hidden="true"><i /><i /><i /></span>
          <span>SMART<span className="wordmark-light">TRAFFIC</span></span>
        </a>
        <span className="header-note">CITIZEN ACCESS</span>
      </header>

      <section className="registration-layout" aria-labelledby="form-title">
        <div className="intro-panel">
          <div className="eyebrow"><span /> COMMUNITY PORTAL</div>
          <h1>Move with<br />the city.</h1>
          <p>Register, sign in, and keep your profile current.</p>
          <div className="street-lines" aria-hidden="true"><span /><span /><span /><span /><span /></div>
        </div>

        <div className="form-panel">
          <div className="form-heading">
            <span className="form-kicker">ACCOUNT CENTER</span>
            <h2 id="form-title">{token ? 'Your profile' : 'Create your account'}</h2>
            <p>{token ? 'Update your personal details below.' : 'Enter your details below to register or log in.'}</p>
          </div>

          {token ? (
            <div className="profile-panel">
              <div className="profile-header">
                <h3>My profile</h3>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    window.localStorage.removeItem('trafficAuthToken')
                    setToken('')
                    setProfile(emptyProfile)
                    setFeedback({ kind: 'success', text: 'You have been signed out.' })
                  }}
                >
                  Log out
                </button>
              </div>

              {profileLoading ? (
                <p className="profile-status">Loading profile…</p>
              ) : (
                <form className="profile-form" onSubmit={handleProfileSave}>
                  <div className="profile-grid">
                    <div className="field-block full-width">
                      <label htmlFor="profile-name">Full name</label>
                      <input id="profile-name" value={profile.name} onChange={(event) => setProfile((current) => ({ ...current, name: event.target.value }))} type="text" maxLength={120} required />
                    </div>

                    <div className="field-block">
                      <label htmlFor="profile-phone">Phone</label>
                      <input id="profile-phone" value={profile.phone} onChange={(event) => setProfile((current) => ({ ...current, phone: event.target.value }))} type="tel" inputMode="tel" placeholder="9876543210" />
                    </div>

                    <div className="field-block">
                      <label htmlFor="profile-date-of-birth">Date of birth</label>
                      <input id="profile-date-of-birth" value={profile.dateOfBirth} onChange={(event) => setProfile((current) => ({ ...current, dateOfBirth: event.target.value }))} type="date" />
                    </div>

                    <div className="field-block full-width">
                      <label htmlFor="profile-address">Address</label>
                      <input id="profile-address" value={profile.address} onChange={(event) => setProfile((current) => ({ ...current, address: event.target.value }))} type="text" placeholder="123 Main Street" />
                    </div>

                    <div className="field-block">
                      <label htmlFor="profile-city">City</label>
                      <input id="profile-city" value={profile.city} onChange={(event) => setProfile((current) => ({ ...current, city: event.target.value }))} type="text" placeholder="Coimbatore" />
                    </div>

                    <div className="field-block">
                      <label htmlFor="profile-state">State</label>
                      <input id="profile-state" value={profile.state} onChange={(event) => setProfile((current) => ({ ...current, state: event.target.value }))} type="text" placeholder="Tamil Nadu" />
                    </div>

                    <div className="field-block">
                      <label htmlFor="profile-postal-code">Postal code</label>
                      <input id="profile-postal-code" value={profile.postalCode} onChange={(event) => setProfile((current) => ({ ...current, postalCode: event.target.value }))} type="text" placeholder="641001" />
                    </div>
                  </div>

                  <button type="submit" disabled={profileSaving}>
                    {profileSaving ? 'Saving profile…' : 'Save profile'}
                    {!profileSaving && <span aria-hidden="true">→</span>}
                  </button>
                </form>
              )}
            </div>
          ) : (
            <div className="auth-stack">
              <form onSubmit={handleLogin}>
                <label htmlFor="login-email">Email address</label>
                <input id="login-email" type="email" value={loginForm.email} onChange={(event) => setLoginForm((current) => ({ ...current, email: event.target.value }))} autoComplete="email" placeholder="you@example.com" required />

                <label htmlFor="login-password">Password</label>
                <input id="login-password" type="password" value={loginForm.password} onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))} autoComplete="current-password" placeholder="Enter your password" required />

                <button type="submit" disabled={loginLoading}>
                  {loginLoading ? 'Signing in…' : 'Log in'}
                  {!loginLoading && <span aria-hidden="true">→</span>}
                </button>
              </form>

              <div className="divider" aria-hidden="true">or</div>

              <form onSubmit={handleSubmit}>
                <label htmlFor="name">Full name</label>
                <input id="name" name="name" type="text" autoComplete="name" placeholder="e.g. Jordan Lee" required maxLength={120} />

                <label htmlFor="email">Email address</label>
                <input id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required />

                <label htmlFor="password">Password</label>
                <input id="password" name="password" type="password" autoComplete="new-password" placeholder="At least 8 characters" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} />

                <label htmlFor="phone">Phone number</label>
                <input id="phone" name="phone" type="tel" autoComplete="tel" inputMode="tel" placeholder="+1 555 123 4567" pattern="[+0-9(). -]{7,25}" title="Enter a phone number with 7 to 15 digits." required />

                <button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Creating account…' : 'Register'}
                  {!isSubmitting && <span aria-hidden="true">→</span>}
                </button>
              </form>
            </div>
          )}

          <p className="form-feedback" aria-live="polite" data-kind={feedback?.kind ?? 'none'}>
            {feedback?.text ?? ''}
          </p>
        </div>
      </section>
      <footer className="site-footer"><span>SMART TRAFFIC MONITORING</span><span>© 2026 CITY SERVICES</span></footer>
    </main>
  )
}

export default App
