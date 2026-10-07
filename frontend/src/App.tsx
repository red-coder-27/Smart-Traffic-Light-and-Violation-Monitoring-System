import { useCallback, useEffect, useState } from 'react'
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

type ChangePasswordForm = {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}

type Intersection = {
  id: string
  name: string
  location: string
  latitude: number | null
  longitude: number | null
  status: 'ACTIVE' | 'INACTIVE'
}

type IntersectionForm = {
  name: string
  location: string
  latitude: string
  longitude: string
  status: 'ACTIVE' | 'INACTIVE'
}

type Signal = {
  id: string
  intersectionId: string
  status: 'RED' | 'YELLOW' | 'GREEN'
  greenDuration: number
  yellowDuration: number
  redDuration: number
  intersection?: {
    id: string
    name: string
    location: string
    status: 'ACTIVE' | 'INACTIVE'
  } | null
}

type SignalConfigForm = {
  status: 'RED' | 'YELLOW' | 'GREEN'
  greenDuration: string
  yellowDuration: string
  redDuration: string
}

const emptyIntersection: IntersectionForm = {
  name: '',
  location: '',
  latitude: '',
  longitude: '',
  status: 'ACTIVE',
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
  const [role, setRole] = useState('')
  const [loginForm, setLoginForm] = useState({ email: '', password: '' })
  const [profile, setProfile] = useState<ProfileForm>(emptyProfile)
  const [changePasswordForm, setChangePasswordForm] = useState<ChangePasswordForm>({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [changePasswordLoading, setChangePasswordLoading] = useState(false)
  const [intersections, setIntersections] = useState<Intersection[]>([])
  const [intersectionForm, setIntersectionForm] = useState<IntersectionForm>(emptyIntersection)
  const [editingIntersectionId, setEditingIntersectionId] = useState<string | null>(null)
  const [intersectionLoading, setIntersectionLoading] = useState(false)
  const [intersectionSaving, setIntersectionSaving] = useState(false)
  const [signals, setSignals] = useState<Signal[]>([])
  const [signalLoading, setSignalLoading] = useState(false)
  const [signalSaving, setSignalSaving] = useState(false)
  const [signalForm, setSignalForm] = useState<SignalConfigForm>({
    status: 'RED',
    greenDuration: '30',
    yellowDuration: '5',
    redDuration: '30',
  })
  const [selectedSignalId, setSelectedSignalId] = useState<string>('')

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
          profile?: (Partial<ProfileForm> & { role?: string }) | null
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
        setRole(String(safeProfile.role ?? ''))
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

  useEffect(() => {
    if (!token || role !== 'ADMIN') {
      return
    }

    const fetchIntersections = async () => {
      setIntersectionLoading(true)
      try {
        const response = await fetch(`${API_BASE_URL}/api/intersections`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        const result = await response.json() as { message?: string; intersections?: Intersection[] }
        if (!response.ok) throw new Error(result.message ?? 'Unable to load intersections.')
        setIntersections(result.intersections ?? [])
      } catch (error) {
        setFeedback({ kind: 'error', text: error instanceof Error ? error.message : 'Unable to load intersections.' })
      } finally {
        setIntersectionLoading(false)
      }
    }

    void fetchIntersections()
  }, [role, token])

  const syncSignalForm = useCallback((selected: Signal | null) => {
    if (!selected) {
      setSignalForm({
        status: 'RED',
        greenDuration: '30',
        yellowDuration: '5',
        redDuration: '30',
      })
      return
    }

    setSignalForm({
      status: selected.status,
      greenDuration: String(selected.greenDuration),
      yellowDuration: String(selected.yellowDuration),
      redDuration: String(selected.redDuration),
    })
  }, [])

  const loadSignals = useCallback(async () => {
    if (!token || role !== 'ADMIN') {
      setSignals([])
      setSelectedSignalId('')
      syncSignalForm(null)
      return
    }

    setSignalLoading(true)
    try {
      const response = await fetch(`${API_BASE_URL}/api/traffic-signals`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const result = await response.json() as { success?: boolean; message?: string; signals?: Signal[] }
      if (!response.ok) throw new Error(result.message ?? 'Unable to load traffic signals.')

      const nextSignals = result.signals ?? []
      setSignals(nextSignals)
      if (!nextSignals.length) {
        setSelectedSignalId('')
        syncSignalForm(null)
        return
      }

      const nextSelectedSignalId = selectedSignalId && nextSignals.some((signal) => signal.id === selectedSignalId)
        ? selectedSignalId
        : nextSignals[0].id

      setSelectedSignalId(nextSelectedSignalId)
      syncSignalForm(nextSignals.find((signal) => signal.id === nextSelectedSignalId) ?? nextSignals[0])
    } catch (error) {
      setFeedback({ kind: 'error', text: error instanceof Error ? error.message : 'Unable to load traffic signals.' })
    } finally {
      setSignalLoading(false)
    }
  }, [role, selectedSignalId, syncSignalForm, token])

  useEffect(() => {
    if (!token || role !== 'ADMIN') {
      return
    }

    const controller = new AbortController()

    const fetchSignals = async () => {
      setSignalLoading(true)
      try {
        const response = await fetch(`${API_BASE_URL}/api/traffic-signals`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        })

        if (controller.signal.aborted) {
          return
        }

        const result = await response.json() as { success?: boolean; message?: string; signals?: Signal[] }
        if (!response.ok) throw new Error(result.message ?? 'Unable to load traffic signals.')

        const nextSignals = result.signals ?? []
        setSignals(nextSignals)
        if (!nextSignals.length) {
          setSelectedSignalId('')
          syncSignalForm(null)
          return
        }

        const nextSelectedSignalId = selectedSignalId && nextSignals.some((signal) => signal.id === selectedSignalId)
          ? selectedSignalId
          : nextSignals[0].id

        setSelectedSignalId(nextSelectedSignalId)
        syncSignalForm(nextSignals.find((signal) => signal.id === nextSelectedSignalId) ?? nextSignals[0])
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          return
        }

        setFeedback({ kind: 'error', text: error instanceof Error ? error.message : 'Unable to load traffic signals.' })
      } finally {
        if (!controller.signal.aborted) {
          setSignalLoading(false)
        }
      }
    }

    void fetchSignals()
    return () => controller.abort()
  }, [role, selectedSignalId, syncSignalForm, token])

  function beginIntersectionEdit(intersection: Intersection) {
    setEditingIntersectionId(intersection.id)
    setIntersectionForm({
      name: intersection.name,
      location: intersection.location,
      latitude: intersection.latitude?.toString() ?? '',
      longitude: intersection.longitude?.toString() ?? '',
      status: intersection.status,
    })
  }

  async function handleIntersectionSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token || role !== 'ADMIN') return
    setIntersectionSaving(true)
    setFeedback(null)

    const payload = {
      name: intersectionForm.name,
      location: intersectionForm.location,
      latitude: intersectionForm.latitude ? Number(intersectionForm.latitude) : undefined,
      longitude: intersectionForm.longitude ? Number(intersectionForm.longitude) : undefined,
      status: intersectionForm.status,
    }

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/intersections${editingIntersectionId ? `/${editingIntersectionId}` : ''}`,
        {
          method: editingIntersectionId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload),
        },
      )
      const result = await response.json() as { message?: string; intersection?: Intersection }
      if (!response.ok) throw new Error(result.message ?? 'Unable to save the intersection.')

      setIntersectionForm(emptyIntersection)
      setEditingIntersectionId(null)
      const listResponse = await fetch(`${API_BASE_URL}/api/intersections`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const listResult = await listResponse.json() as { intersections?: Intersection[] }
      if (!listResponse.ok) throw new Error('Intersection saved, but the list could not be refreshed.')
      setIntersections(listResult.intersections ?? [])
      setFeedback({ kind: 'success', text: editingIntersectionId ? 'Intersection updated successfully.' : 'Intersection created successfully.' })
    } catch (error) {
      setFeedback({ kind: 'error', text: error instanceof Error ? error.message : 'Unable to save the intersection.' })
    } finally {
      setIntersectionSaving(false)
    }
  }

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

  async function handleChangePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)

    if (changePasswordForm.newPassword.length < 8) {
      setFeedback({ kind: 'error', text: 'New password does not meet the password requirements' })
      return
    }

    if (changePasswordForm.newPassword !== changePasswordForm.confirmPassword) {
      setFeedback({ kind: 'error', text: 'New passwords do not match.' })
      return
    }

    setChangePasswordLoading(true)

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/change-password`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          currentPassword: changePasswordForm.currentPassword,
          newPassword: changePasswordForm.newPassword,
        }),
      })
      const result = await response.json() as { message?: string }

      if (!response.ok) {
        setFeedback({
          kind: 'error',
          text: typeof result.message === 'string' ? result.message : 'Unable to change your password.',
        })
        return
      }

      setChangePasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
      setFeedback({ kind: 'success', text: 'Password changed successfully.' })
    } catch {
      setFeedback({ kind: 'error', text: 'Unable to reach the password service. Please try again.' })
    } finally {
      setChangePasswordLoading(false)
    }
  }

  async function handleSignalSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token || role !== 'ADMIN' || !selectedSignalId) {
      setFeedback({ kind: 'error', text: 'Select a traffic signal before updating its timing.' })
      return
    }

    setSignalSaving(true)
    setFeedback(null)

    try {
      const response = await fetch(`${API_BASE_URL}/api/traffic-signals/${selectedSignalId}/config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          status: signalForm.status,
          greenDuration: Number(signalForm.greenDuration),
          yellowDuration: Number(signalForm.yellowDuration),
          redDuration: Number(signalForm.redDuration),
        }),
      })

      const result = await response.json() as { success?: boolean; message?: string; signal?: Signal }
      if (!response.ok) {
        setFeedback({
          kind: 'error',
          text: typeof result.message === 'string' ? result.message : 'Signal configuration is invalid.',
        })
        return
      }

      await loadSignals()
      setFeedback({ kind: 'success', text: result.message ?? 'Signal configuration updated successfully.' })
    } catch (error) {
      setFeedback({ kind: 'error', text: error instanceof Error ? error.message : 'Unable to update the signal configuration.' })
    } finally {
      setSignalSaving(false)
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
                    setRole('')
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

              {role === 'ADMIN' && (
                <>
                  <section className="intersection-panel" aria-labelledby="intersection-heading">
                    <div className="profile-header">
                      <h3 id="intersection-heading">Intersection management</h3>
                    </div>
                    <form className="profile-form" onSubmit={handleIntersectionSave}>
                      <div className="profile-grid">
                        <div className="field-block">
                          <label htmlFor="intersection-name">Intersection name</label>
                          <input id="intersection-name" value={intersectionForm.name} onChange={(event) => setIntersectionForm((current) => ({ ...current, name: event.target.value }))} required />
                        </div>
                        <div className="field-block">
                          <label htmlFor="intersection-location">Location</label>
                          <input id="intersection-location" value={intersectionForm.location} onChange={(event) => setIntersectionForm((current) => ({ ...current, location: event.target.value }))} required />
                        </div>
                        <div className="field-block">
                          <label htmlFor="intersection-latitude">Latitude</label>
                          <input id="intersection-latitude" type="number" step="any" value={intersectionForm.latitude} onChange={(event) => setIntersectionForm((current) => ({ ...current, latitude: event.target.value }))} />
                        </div>
                        <div className="field-block">
                          <label htmlFor="intersection-longitude">Longitude</label>
                          <input id="intersection-longitude" type="number" step="any" value={intersectionForm.longitude} onChange={(event) => setIntersectionForm((current) => ({ ...current, longitude: event.target.value }))} />
                        </div>
                        <div className="field-block">
                          <label htmlFor="intersection-status">Status</label>
                          <select id="intersection-status" value={intersectionForm.status} onChange={(event) => setIntersectionForm((current) => ({ ...current, status: event.target.value as IntersectionForm['status'] }))}>
                            <option value="ACTIVE">Active</option>
                            <option value="INACTIVE">Inactive</option>
                          </select>
                        </div>
                      </div>
                      <button type="submit" disabled={intersectionSaving}>
                        {intersectionSaving ? 'Saving intersection…' : editingIntersectionId ? 'Update intersection' : 'Add intersection'}
                      </button>
                      {editingIntersectionId && <button type="button" className="secondary-button" onClick={() => { setEditingIntersectionId(null); setIntersectionForm(emptyIntersection) }}>Cancel</button>}
                    </form>
                    {intersectionLoading ? <p className="profile-status">Loading intersections…</p> : (
                      <ul className="intersection-list">
                        {intersections.map((intersection) => (
                          <li key={intersection.id}>
                            <span><strong>{intersection.name}</strong><small>{intersection.location} · {intersection.status}</small></span>
                            <button type="button" className="secondary-button" onClick={() => beginIntersectionEdit(intersection)}>Edit</button>
                          </li>
                        ))}
                        {!intersections.length && <li><span>No intersections registered yet.</span></li>}
                      </ul>
                    )}
                  </section>

                  <section className="signal-panel" aria-labelledby="signal-heading">
                    <div className="profile-header">
                      <h3 id="signal-heading">Traffic signal management</h3>
                    </div>

                    {signalLoading ? (
                      <p className="profile-status">Loading traffic signals…</p>
                    ) : (
                      <>
                        <div className="field-block">
                          <label htmlFor="signal-select">Signal</label>
                          <select id="signal-select" value={selectedSignalId} onChange={(event) => setSelectedSignalId(event.target.value)}>
                            {signals.length ? signals.map((signal) => (
                              <option key={signal.id} value={signal.id}>
                                {signal.intersection?.name ?? 'Signal'} · {signal.status}
                              </option>
                            )) : <option value="">No signals available</option>}
                          </select>
                        </div>

                        {signals.length ? (
                          <form className="profile-form" onSubmit={handleSignalSave}>
                            <div className="profile-grid">
                              <div className="field-block">
                                <label htmlFor="signal-status">Current signal status</label>
                                <select id="signal-status" value={signalForm.status} onChange={(event) => setSignalForm((current) => ({ ...current, status: event.target.value as SignalConfigForm['status'] }))}>
                                  <option value="RED">RED</option>
                                  <option value="YELLOW">YELLOW</option>
                                  <option value="GREEN">GREEN</option>
                                </select>
                              </div>

                              <div className="field-block">
                                <label htmlFor="signal-green">Green duration (s)</label>
                                <input id="signal-green" type="number" min="1" step="1" value={signalForm.greenDuration} onChange={(event) => setSignalForm((current) => ({ ...current, greenDuration: event.target.value }))} />
                              </div>

                              <div className="field-block">
                                <label htmlFor="signal-yellow">Yellow duration (s)</label>
                                <input id="signal-yellow" type="number" min="1" step="1" value={signalForm.yellowDuration} onChange={(event) => setSignalForm((current) => ({ ...current, yellowDuration: event.target.value }))} />
                              </div>

                              <div className="field-block">
                                <label htmlFor="signal-red">Red duration (s)</label>
                                <input id="signal-red" type="number" min="1" step="1" value={signalForm.redDuration} onChange={(event) => setSignalForm((current) => ({ ...current, redDuration: event.target.value }))} />
                              </div>
                            </div>

                            <button type="submit" disabled={signalSaving}>
                              {signalSaving ? 'Updating signal…' : 'Update signal timing'}
                            </button>
                          </form>
                        ) : (
                          <p className="profile-status">No traffic signals are registered for this intersection.</p>
                        )}
                      </>
                    )}
                  </section>
                </>
              )}

              <div className="change-password">
                <div className="profile-header">
                  <h3>Change password</h3>
                </div>
                <form onSubmit={handleChangePassword}>
                  <label htmlFor="current-password">Current password</label>
                  <input
                    id="current-password"
                    type="password"
                    autoComplete="current-password"
                    value={changePasswordForm.currentPassword}
                    onChange={(event) => setChangePasswordForm((current) => ({ ...current, currentPassword: event.target.value }))}
                    required
                  />

                  <label htmlFor="new-password">New password</label>
                  <input
                    id="new-password"
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    value={changePasswordForm.newPassword}
                    onChange={(event) => setChangePasswordForm((current) => ({ ...current, newPassword: event.target.value }))}
                    required
                  />

                  <label htmlFor="confirm-password">Confirm new password</label>
                  <input
                    id="confirm-password"
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    value={changePasswordForm.confirmPassword}
                    onChange={(event) => setChangePasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))}
                    required
                  />

                  <button type="submit" disabled={changePasswordLoading}>
                    {changePasswordLoading ? 'Changing password…' : 'Change password'}
                    {!changePasswordLoading && <span aria-hidden="true">→</span>}
                  </button>
                </form>
              </div>
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
