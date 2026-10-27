import { useCallback, useEffect, useState } from 'react'

type Direction = 'NORTH' | 'EAST' | 'SOUTH' | 'WEST'
type VehicleType = 'AMBULANCE' | 'FIRE_ENGINE' | 'POLICE_VEHICLE'
type PriorityStatus = 'REQUESTED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'TIMED_OUT'

type SignalOption = {
  id: string
  direction: Direction
  status: 'RED' | 'YELLOW' | 'GREEN'
}

type IntersectionOption = {
  id: string
  name: string
  location: string
  signals: SignalOption[]
}

export type PriorityRequest = {
  id: string
  intersectionId: string
  direction: Direction
  vehicleType: VehicleType
  status: PriorityStatus
  requestedAt: string
  validatedAt: string | null
  activatedAt: string | null
  endedAt: string | null
  restorationError: string | null
  intersection: { id: string; name: string; location: string }
  signal: { id: string; status: 'RED' | 'YELLOW' | 'GREEN' }
  requestedBy?: { id: string; name: string }
  controlledBy?: { id: string; name: string } | null
}

type EmergencyPriorityProps = {
  token: string
  apiBaseUrl: string
}

type ApiResult<T> = T & { success?: boolean; message?: string }
type PriorityAction = 'activate' | 'complete' | 'cancel'

const VEHICLE_LABELS: Record<VehicleType, string> = {
  AMBULANCE: 'Ambulance',
  FIRE_ENGINE: 'Fire engine',
  POLICE_VEHICLE: 'Police vehicle',
}

const DIRECTION_LABELS: Record<Direction, string> = {
  NORTH: 'Northbound',
  EAST: 'Eastbound',
  SOUTH: 'Southbound',
  WEST: 'Westbound',
}

async function readResponse<T>(response: Response): Promise<ApiResult<T>> {
  let result: ApiResult<T>
  try {
    result = await response.json() as ApiResult<T>
  } catch {
    throw new Error('The emergency priority service returned an unreadable response.')
  }
  if (!response.ok || result.success === false) {
    throw new Error(result.message ?? 'Unable to complete the emergency priority operation.')
  }
  return result
}

function formatTime(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Unknown time' : date.toLocaleString()
}

export function EmergencyPriorityMessage({
  kind,
  message,
}: {
  kind: 'error' | 'success'
  message: string
}) {
  return kind === 'error'
    ? <div className="report-error" role="alert">{message}</div>
    : <div className="priority-feedback" role="status">{message}</div>
}

export function PriorityRequestRow({
  request,
  saving,
  onAction,
}: {
  request: PriorityRequest
  saving: boolean
  onAction: (request: PriorityRequest, action: PriorityAction) => void
}) {
  return (
    <li className={request.status === 'ACTIVE' ? 'priority-request-active' : ''}>
      <div className="priority-request-summary">
        <span className={`priority-status priority-status-${request.status.toLowerCase()}`}>{request.status}</span>
        <strong>{VEHICLE_LABELS[request.vehicleType]} · {request.intersection.name}</strong>
        <span>{DIRECTION_LABELS[request.direction]} · Signal {request.signal.status}</span>
        <small>Requested {formatTime(request.requestedAt)}{request.requestedBy ? ` by ${request.requestedBy.name}` : ''}</small>
        {request.activatedAt && <small>Activated {formatTime(request.activatedAt)}</small>}
        {request.endedAt && <small>Ended {formatTime(request.endedAt)}</small>}
        {request.restorationError && (
          <span className="priority-restoration-error" role="alert">
            Signal restoration failed: {request.restorationError}. Priority remains active; operator intervention is required.
          </span>
        )}
      </div>
      <div className="priority-actions">
        {request.status === 'REQUESTED' && (
          <>
            <button type="button" onClick={() => onAction(request, 'activate')} disabled={saving}>
              {saving ? 'Working…' : 'Activate simulation'}
            </button>
            <button type="button" className="secondary-button" onClick={() => onAction(request, 'cancel')} disabled={saving}>
              Cancel request
            </button>
          </>
        )}
        {request.status === 'ACTIVE' && (
          <>
            <button type="button" onClick={() => onAction(request, 'complete')} disabled={saving}>
              {saving ? 'Restoring…' : 'Vehicle passed · restore'}
            </button>
            <button type="button" className="secondary-button" onClick={() => onAction(request, 'cancel')} disabled={saving}>
              Cancel priority
            </button>
          </>
        )}
      </div>
    </li>
  )
}

function EmergencyPriority({ token, apiBaseUrl }: EmergencyPriorityProps) {
  const [intersections, setIntersections] = useState<IntersectionOption[]>([])
  const [requests, setRequests] = useState<PriorityRequest[]>([])
  const [selectedIntersectionId, setSelectedIntersectionId] = useState('')
  const [direction, setDirection] = useState<Direction | ''>('')
  const [vehicleType, setVehicleType] = useState<VehicleType>('AMBULANCE')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')

  const loadData = useCallback(async (showLoading: boolean) => {
    if (showLoading) setLoading(true)
    try {
      const headers = { Authorization: `Bearer ${token}` }
      const [optionsResponse, requestsResponse] = await Promise.all([
        fetch(`${apiBaseUrl}/api/emergency-priorities/options`, { headers }),
        fetch(`${apiBaseUrl}/api/emergency-priorities`, { headers }),
      ])
      const [optionsResult, requestsResult] = await Promise.all([
        readResponse<{ intersections?: IntersectionOption[] }>(optionsResponse),
        readResponse<{ requests?: PriorityRequest[] }>(requestsResponse),
      ])
      const nextIntersections = optionsResult.intersections ?? []
      setIntersections(nextIntersections)
      setRequests(requestsResult.requests ?? [])
      setSelectedIntersectionId((current) => (
        nextIntersections.some((intersection) => intersection.id === current)
          ? current
          : nextIntersections[0]?.id ?? ''
      ))
      setError('')
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load emergency priority data.')
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [apiBaseUrl, token])

  useEffect(() => {
    void Promise.resolve().then(() => loadData(true))
    const timer = window.setInterval(() => { void loadData(false) }, 15_000)
    return () => window.clearInterval(timer)
  }, [loadData])

  const selectedIntersection = intersections.find((item) => item.id === selectedIntersectionId)
  const availableSignals = selectedIntersection?.signals ?? []

  async function performAction(request: PriorityRequest, action: PriorityAction) {
    setSaving(true)
    setError('')
    setFeedback('')
    try {
      const response = await fetch(
        `${apiBaseUrl}/api/emergency-priorities/${request.id}/${action}`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        },
      )
      const result = await readResponse<{ message?: string }>(response)
      setFeedback(result.message ?? 'Emergency priority request updated.')
      await loadData(false)
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Unable to update emergency priority.')
    } finally {
      setSaving(false)
    }
  }

  async function createRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedIntersectionId || !direction) {
      setError('Select an active intersection and a configured approach.')
      return
    }
    setSaving(true)
    setError('')
    setFeedback('')
    try {
      const response = await fetch(`${apiBaseUrl}/api/emergency-priorities`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ intersectionId: selectedIntersectionId, direction, vehicleType }),
      })
      const result = await readResponse<{ message?: string }>(response)
      setFeedback(result.message ?? 'Validated simulation request recorded.')
      await loadData(false)
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Unable to create emergency priority request.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="emergency-priority" aria-labelledby="emergency-priority-title">
      <div className="report-heading emergency-priority-heading">
        <div>
          <span className="form-kicker">SIMULATED TRAFFIC CONTROL</span>
          <h3 id="emergency-priority-title">Emergency vehicle priority</h3>
          <p>Operator-triggered simulation for a configured approach. No vehicle detection or hardware connection is active.</p>
        </div>
        <button type="button" className="secondary-button" onClick={() => { void loadData(true) }} disabled={loading || saving}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      <div className="priority-simulation-note">
        <strong>Simulation only</strong>
        <span>Confirm the approach manually. Priority is timed out after two minutes; the server checks every 15 seconds.</span>
      </div>

      {error && <EmergencyPriorityMessage kind="error" message={error} />}
      {feedback && <EmergencyPriorityMessage kind="success" message={feedback} />}

      {loading ? (
        <p className="profile-status" role="status">Loading intersections and priority history…</p>
      ) : (
        <>
          <form className="priority-request-form" onSubmit={(event) => { void createRequest(event) }}>
            <div className="field-block">
              <label htmlFor="priority-vehicle-type">Emergency vehicle</label>
              <select
                id="priority-vehicle-type"
                value={vehicleType}
                onChange={(event) => setVehicleType(event.target.value as VehicleType)}
              >
                {Object.entries(VEHICLE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div className="field-block">
              <label htmlFor="priority-intersection">Intersection</label>
              <select
                id="priority-intersection"
                value={selectedIntersectionId}
                onChange={(event) => {
                  setSelectedIntersectionId(event.target.value)
                  const nextIntersection = intersections.find((item) => item.id === event.target.value)
                  setDirection(nextIntersection?.signals[0]?.direction ?? '')
                }}
                required
              >
                <option value="">Select an intersection</option>
                {intersections.map((intersection) => (
                  <option key={intersection.id} value={intersection.id}>{intersection.name} · {intersection.location}</option>
                ))}
              </select>
            </div>
            <div className="field-block">
              <label htmlFor="priority-direction">Configured approach</label>
              <select
                id="priority-direction"
                value={direction}
                onChange={(event) => setDirection(event.target.value as Direction | '')}
                required
                disabled={!availableSignals.length}
              >
                <option value="">Select a configured approach</option>
                {availableSignals.map((signal) => (
                  <option key={signal.id} value={signal.direction}>
                    {DIRECTION_LABELS[signal.direction]} · Signal {signal.status}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" disabled={saving || !availableSignals.length}>
              {saving ? 'Submitting…' : 'Create validated request'}
            </button>
            {!availableSignals.length && (
              <p className="profile-status priority-empty-approach">
                No signal approach is mapped. An administrator must assign directions in Traffic signal management first.
              </p>
            )}
          </form>

          <section className="priority-history" aria-labelledby="priority-history-title">
            <div className="report-section-heading">
              <div>
                <h4 id="priority-history-title">Priority request history</h4>
                <span>Recent requests, affected approaches, and controller state.</span>
              </div>
            </div>
            {requests.length ? (
              <ul className="priority-request-list">
                {requests.map((request) => (
                  <PriorityRequestRow
                    key={request.id}
                    request={request}
                    saving={saving}
                    onAction={(item, action) => { void performAction(item, action) }}
                  />
                ))}
              </ul>
            ) : (
              <p className="report-empty">No emergency priority requests have been recorded.</p>
            )}
          </section>
        </>
      )}
    </section>
  )
}

export default EmergencyPriority
