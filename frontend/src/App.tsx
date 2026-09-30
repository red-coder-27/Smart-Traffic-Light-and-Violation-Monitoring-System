import { useState } from 'react'
import './App.css'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000'

function App() {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [password, setPassword] = useState('')

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
          <p>Create your citizen account to get started.</p>
          <div className="street-lines" aria-hidden="true"><span /><span /><span /><span /><span /></div>
        </div>

        <div className="form-panel">
          <div className="form-heading">
            <span className="form-kicker">NEW ACCOUNT</span>
            <h2 id="form-title">Create your account</h2>
            <p>Enter your details below to register.</p>
          </div>
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
            <p className="form-feedback" aria-live="polite" data-kind={feedback?.kind ?? 'none'}>
              {feedback?.text ?? ''}
            </p>
          </form>
        </div>
      </section>
      <footer className="site-footer"><span>SMART TRAFFIC MONITORING</span><span>© 2026 CITY SERVICES</span></footer>
    </main>
  )
}

export default App
