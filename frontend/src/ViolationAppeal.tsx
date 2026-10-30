import { useCallback, useEffect, useState } from 'react'

export type AppealStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

export type AppealItem = {
  id: string
  violationId: string
  citizenId: string
  reason: string
  status: AppealStatus
  reviewNotes: string | null
  reviewedBy: string | null
  reviewedAt: string | null
  createdAt: string
  updatedAt: string
  violation?: {
    id: string
    occurredAt: string
    violationType: string
    description?: string | null
    intersection?: { id: string; name: string; location: string } | null
    trafficSignal?: { id: string; status: string } | null
    challan?: {
      id: string
      challanNumber: string
      amount: number
      status: string
    } | null
  } | null
  citizen?: {
    id: string
    name: string
    email: string
    phone?: string | null
  } | null
}

export type EligibleViolation = {
  id: string
  occurredAt: string
  violationType: string
  description?: string | null
  intersection?: { name: string; location: string } | null
  challan?: {
    id: string
    challanNumber: string
    amount: number
    status: string
  } | null
  appeal?: { id: string; status: string } | null
}

export type ViolationAppealProps = {
  token: string
  role?: string
  apiBaseUrl?: string
  onBackToProfile?: () => void
  onLogout?: () => void
}

function statusBadgeClass(status: AppealStatus): string {
  if (status === 'APPROVED') return 'appeal-badge appeal-badge-approved'
  if (status === 'REJECTED') return 'appeal-badge appeal-badge-rejected'
  return 'appeal-badge appeal-badge-pending'
}

function statusLabel(status: AppealStatus): string {
  if (status === 'APPROVED') return '✓ APPROVED'
  if (status === 'REJECTED') return '✕ REJECTED'
  return '● UNDER REVIEW'
}

export default function ViolationAppeal({
  token,
  role = 'CITIZEN',
  apiBaseUrl = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) || 'http://localhost:5000',
  onBackToProfile,
  onLogout,
}: ViolationAppealProps) {
  // Tab: 'submit' | 'history'
  const [activeTab, setActiveTab] = useState<'submit' | 'history'>('submit')

  // Submit form state
  const [violations, setViolations] = useState<EligibleViolation[]>([])
  const [violationsLoading, setViolationsLoading] = useState(true)
  const [violationsError, setViolationsError] = useState<string | null>(null)
  const [selectedViolationId, setSelectedViolationId] = useState('')
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitFeedback, setSubmitFeedback] = useState<{
    kind: 'success' | 'error'
    text: string
    appealId?: string
  } | null>(null)

  // Appeal history state
  const [appeals, setAppeals] = useState<AppealItem[]>([])
  const [appealsLoading, setAppealsLoading] = useState(true)
  const [appealsError, setAppealsError] = useState<string | null>(null)

  const selectedViolation = violations.find((v) => v.id === selectedViolationId) ?? null

  const fetchViolations = useCallback(async () => {
    if (!token) return
    setViolationsLoading(true)
    setViolationsError(null)

    try {
      const response = await fetch(`${apiBaseUrl}/api/violations`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await response.json() as {
        success?: boolean
        message?: string
        violations?: EligibleViolation[]
      }
      if (!response.ok) {
        throw new Error(data.message || `Failed to fetch violations (${response.status})`)
      }
      setViolations(data.violations ?? [])
    } catch (err) {
      setViolationsError(err instanceof Error ? err.message : 'Unable to load your violations.')
    } finally {
      setViolationsLoading(false)
    }
  }, [apiBaseUrl, token])

  const fetchAppeals = useCallback(async () => {
    if (!token) return
    setAppealsLoading(true)
    setAppealsError(null)

    try {
      const response = await fetch(`${apiBaseUrl}/api/appeals`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await response.json() as {
        success?: boolean
        message?: string
        appeals?: AppealItem[]
      }
      if (!response.ok) {
        throw new Error(data.message || `Failed to fetch appeals (${response.status})`)
      }
      setAppeals(data.appeals ?? [])
    } catch (err) {
      setAppealsError(err instanceof Error ? err.message : 'Unable to load your appeal history.')
    } finally {
      setAppealsLoading(false)
    }
  }, [apiBaseUrl, token])

  useEffect(() => {
    void Promise.resolve().then(() => fetchViolations())
    void Promise.resolve().then(() => fetchAppeals())
  }, [fetchViolations, fetchAppeals])

  // Violations eligible for appeal: must have a violatingUserId = current user
  // and no existing appeal yet
  const appealableViolations = violations.filter((v) => !v.appeal)

  function validateReason(value: string): string | null {
    if (!value.trim()) return 'Appeal reason is required.'
    if (value.trim().length < 10) return 'Appeal reason must be at least 10 characters.'
    if (value.trim().length > 1000) return 'Appeal reason must not exceed 1000 characters.'
    return null
  }

  const handleReasonChange = (value: string) => {
    setReason(value)
    if (reasonError) {
      setReasonError(validateReason(value))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return

    const validationError = validateReason(reason)
    if (validationError) {
      setReasonError(validationError)
      return
    }
    if (!selectedViolationId) {
      return
    }

    setSubmitting(true)
    setSubmitFeedback(null)
    setReasonError(null)

    try {
      const response = await fetch(`${apiBaseUrl}/api/appeals`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ violationId: selectedViolationId, reason: reason.trim() }),
      })

      const data = await response.json() as {
        success?: boolean
        message?: string
        appeal?: AppealItem
      }

      if (!response.ok || !data.appeal) {
        throw new Error(data.message || 'Unable to submit the appeal.')
      }

      setSubmitFeedback({
        kind: 'success',
        text: 'Your appeal has been submitted and is under review. You will be notified of the outcome.',
        appealId: data.appeal.id,
      })
      setSelectedViolationId('')
      setReason('')
      // Refresh both lists
      void fetchViolations()
      void fetchAppeals()
    } catch (err) {
      setSubmitFeedback({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Unable to submit the appeal.',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const pendingAppeals = appeals.filter((a) => a.status === 'PENDING')
  const resolvedAppeals = appeals.filter((a) => a.status !== 'PENDING')

  return (
    <div className="appeals-container">
      {/* Header bar */}
      <div className="profile-header" style={{ marginBottom: 16 }}>
        {onBackToProfile && (
          <button
            type="button"
            className="secondary-button"
            onClick={onBackToProfile}
            id="back-to-profile-btn"
          >
            ← Back to profile
          </button>
        )}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {onLogout && (
            <button type="button" className="secondary-button" onClick={onLogout}>
              Log out
            </button>
          )}
        </div>
      </div>

      {/* Title */}
      <div className="report-heading" style={{ marginTop: 10, marginBottom: 16 }}>
        <div>
          <span className="form-kicker">CITIZEN COMPLIANCE</span>
          <h2 id="appeals-title" style={{ margin: '8px 0 4px', fontFamily: 'var(--display)', fontSize: '28px' }}>
            Violation Appeal Submission
          </h2>
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: '13px' }}>
            Submit a formal appeal for a traffic violation recorded against your account. Each violation allows one appeal.
          </p>
        </div>
      </div>

      {/* Info notice */}
      <div className="appeal-notice" role="note">
        <div className="appeal-notice-badge">IMPORTANT</div>
        <p>
          Submitting an appeal <strong>does not automatically cancel or pause</strong> any associated fine.
          The appeal will be reviewed by a traffic authority officer. You will be notified of the outcome.
        </p>
      </div>

      {/* Tabs */}
      <div className="challan-filter-bar">
        <div className="challan-tabs" role="tablist" aria-label="Appeal sections">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'submit'}
            className={`challan-tab ${activeTab === 'submit' ? 'active' : ''}`}
            onClick={() => setActiveTab('submit')}
            id="tab-submit-appeal"
          >
            Submit Appeal
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'history'}
            className={`challan-tab ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
            id="tab-appeal-history"
          >
            My Appeals ({appeals.length})
          </button>
        </div>
      </div>

      {/* Submit Tab */}
      {activeTab === 'submit' && (
        <div className="appeal-submit-panel">
          {/* Submission feedback */}
          {submitFeedback && (
            <div
              className={submitFeedback.kind === 'success' ? 'appeal-success-notice' : 'report-error'}
              role={submitFeedback.kind === 'error' ? 'alert' : 'status'}
              style={{ marginBottom: 16 }}
            >
              <span>{submitFeedback.text}</span>
              {submitFeedback.kind === 'error' && (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setSubmitFeedback(null)}
                  style={{ height: 32, fontSize: '11px' }}
                >
                  Dismiss
                </button>
              )}
            </div>
          )}

          {/* Violations loading / error */}
          {violationsLoading ? (
            <div className="profile-status" style={{ padding: '32px 0', textAlign: 'center' }} role="status">
              Loading your violations…
            </div>
          ) : violationsError ? (
            <div className="report-error" role="alert" style={{ marginBottom: 16 }}>
              <span>{violationsError}</span>
              <button
                type="button"
                className="secondary-button"
                onClick={() => void fetchViolations()}
                style={{ height: 32, fontSize: '11px' }}
              >
                Retry
              </button>
            </div>
          ) : appealableViolations.length === 0 ? (
            <div className="report-empty" style={{ margin: '16px 0', padding: 32 }}>
              {violations.length === 0
                ? 'No traffic violations are recorded against your account.'
                : 'All violations on your account already have an appeal submitted.'}
            </div>
          ) : (
            <form className="appeal-form" onSubmit={(e) => void handleSubmit(e)} noValidate>
              <fieldset className="appeal-fieldset">
                <legend className="appeal-legend">Select violation to appeal</legend>

                {/* Violation selector */}
                <div className="field-block full-width" style={{ marginBottom: 16 }}>
                  <label htmlFor="appeal-violation-select">
                    Violation <span aria-hidden="true" style={{ color: 'var(--red)' }}>*</span>
                  </label>
                  <select
                    id="appeal-violation-select"
                    value={selectedViolationId}
                    onChange={(e) => {
                      setSelectedViolationId(e.target.value)
                      setSubmitFeedback(null)
                    }}
                    required
                    aria-required="true"
                    disabled={submitting}
                  >
                    <option value="">— Choose a violation —</option>
                    {appealableViolations.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.violationType} · {new Date(v.occurredAt).toLocaleDateString()}
                        {v.intersection ? ` · ${v.intersection.name}` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Violation details preview */}
                {selectedViolation && (
                  <div className="appeal-violation-card" aria-label="Selected violation details">
                    <div className="appeal-violation-header">
                      <strong>{selectedViolation.violationType}</strong>
                      {selectedViolation.challan && (
                        <span className="appeal-challan-badge">
                          Challan {selectedViolation.challan.challanNumber} · ₹{selectedViolation.challan.amount.toLocaleString()} · {selectedViolation.challan.status}
                        </span>
                      )}
                    </div>
                    <div className="appeal-violation-details">
                      <div className="violation-detail-row">
                        <span className="detail-label">Date:</span>
                        <span>{new Date(selectedViolation.occurredAt).toLocaleString()}</span>
                      </div>
                      {selectedViolation.intersection && (
                        <div className="violation-detail-row">
                          <span className="detail-label">Location:</span>
                          <span>{selectedViolation.intersection.name} — {selectedViolation.intersection.location}</span>
                        </div>
                      )}
                      {selectedViolation.description && (
                        <div className="violation-detail-row">
                          <span className="detail-label">Details:</span>
                          <span style={{ fontStyle: 'italic' }}>{selectedViolation.description}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Reason textarea */}
                <div className="field-block full-width" style={{ marginTop: 16 }}>
                  <label htmlFor="appeal-reason">
                    Reason for appeal <span aria-hidden="true" style={{ color: 'var(--red)' }}>*</span>
                  </label>
                  <textarea
                    id="appeal-reason"
                    value={reason}
                    onChange={(e) => handleReasonChange(e.target.value)}
                    placeholder="Describe the circumstances of the violation and why you believe it should be reviewed. Be specific and factual. (Minimum 10 characters)"
                    rows={6}
                    maxLength={1000}
                    required
                    aria-required="true"
                    aria-describedby={reasonError ? 'appeal-reason-error' : 'appeal-reason-hint'}
                    disabled={submitting}
                    className={reasonError ? 'input-error' : ''}
                    style={{ resize: 'vertical', width: '100%' }}
                  />
                  {reasonError ? (
                    <p id="appeal-reason-error" className="field-error" role="alert">
                      {reasonError}
                    </p>
                  ) : (
                    <p id="appeal-reason-hint" style={{ fontSize: '12px', color: 'var(--muted)', marginTop: 4 }}>
                      {reason.trim().length}/1000 characters · minimum 10 required
                    </p>
                  )}
                </div>
              </fieldset>

              <button
                type="submit"
                disabled={submitting || !selectedViolationId || !reason.trim()}
                id="submit-appeal-btn"
                style={{ marginTop: 8 }}
              >
                {submitting ? 'Submitting appeal…' : 'Submit appeal'}
                {!submitting && <span aria-hidden="true">→</span>}
              </button>

              <p style={{ marginTop: 12, fontSize: '12px', color: 'var(--muted)' }}>
                By submitting this appeal you confirm that the information provided is accurate to the best of your knowledge.
                False declarations may result in additional penalties.
              </p>
            </form>
          )}
        </div>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <div className="appeal-history-panel">
          {/* Admin/Police management notice */}
          {(role === 'ADMIN' || role === 'TRAFFIC_POLICE') && (
            <div className="appeal-notice" role="note" style={{ marginBottom: 16 }}>
              <div className="appeal-notice-badge">OPERATOR</div>
              <p>As an operator you can view all submitted appeals. Status updates are made through the administrative interface.</p>
            </div>
          )}

          {appealsLoading ? (
            <div className="profile-status" style={{ padding: '32px 0', textAlign: 'center' }} role="status">
              Loading appeal history…
            </div>
          ) : appealsError ? (
            <div className="report-error" role="alert" style={{ marginBottom: 16 }}>
              <span>{appealsError}</span>
              <button
                type="button"
                className="secondary-button"
                onClick={() => void fetchAppeals()}
                style={{ height: 32, fontSize: '11px' }}
              >
                Retry
              </button>
            </div>
          ) : appeals.length === 0 ? (
            <div className="report-empty" style={{ margin: '16px 0', padding: 32 }}>
              No appeals have been submitted yet.
            </div>
          ) : (
            <>
              {pendingAppeals.length > 0 && (
                <section aria-labelledby="pending-appeals-heading" style={{ marginBottom: 24 }}>
                  <h3 id="pending-appeals-heading" style={{ fontSize: '14px', fontWeight: 700, marginBottom: 12, color: 'var(--muted)', letterSpacing: '1px', textTransform: 'uppercase' }}>
                    Under Review ({pendingAppeals.length})
                  </h3>
                  <ul className="appeal-cards-list">
                    {pendingAppeals.map((appeal) => (
                      <AppealCard key={appeal.id} appeal={appeal} role={role} />
                    ))}
                  </ul>
                </section>
              )}
              {resolvedAppeals.length > 0 && (
                <section aria-labelledby="resolved-appeals-heading">
                  <h3 id="resolved-appeals-heading" style={{ fontSize: '14px', fontWeight: 700, marginBottom: 12, color: 'var(--muted)', letterSpacing: '1px', textTransform: 'uppercase' }}>
                    Resolved ({resolvedAppeals.length})
                  </h3>
                  <ul className="appeal-cards-list">
                    {resolvedAppeals.map((appeal) => (
                      <AppealCard key={appeal.id} appeal={appeal} role={role} />
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

export function AppealCard({ appeal, role }: { appeal: AppealItem; role?: string }) {
  return (
    <li
      className={`appeal-card appeal-card-${appeal.status.toLowerCase()}`}
      data-testid={`appeal-card-${appeal.id}`}
      aria-labelledby={`appeal-id-${appeal.id}`}
    >
      <div className="appeal-card-header">
        <div>
          <span className="appeal-ref-tag" id={`appeal-id-${appeal.id}`}>
            Appeal — {appeal.violation?.violationType ?? 'Traffic Violation'}
          </span>
          <span className="challan-date-tag">
            Submitted: {new Date(appeal.createdAt).toLocaleDateString()}
          </span>
        </div>
        <span className={statusBadgeClass(appeal.status)} aria-label={`Status: ${appeal.status}`}>
          {statusLabel(appeal.status)}
        </span>
      </div>

      <div className="appeal-card-body">
        {appeal.violation && (
          <div className="appeal-violation-info">
            {appeal.violation.occurredAt && (
              <div className="violation-detail-row">
                <span className="detail-label">Occurred:</span>
                <span>{new Date(appeal.violation.occurredAt).toLocaleString()}</span>
              </div>
            )}
            {appeal.violation.intersection && (
              <div className="violation-detail-row">
                <span className="detail-label">Location:</span>
                <span>{appeal.violation.intersection.name}</span>
              </div>
            )}
            {appeal.violation.challan && (
              <div className="violation-detail-row">
                <span className="detail-label">Challan:</span>
                <span>{appeal.violation.challan.challanNumber} · ₹{appeal.violation.challan.amount.toLocaleString()}</span>
              </div>
            )}
          </div>
        )}

        <div className="appeal-reason-box">
          <span className="amount-label">APPEAL REASON</span>
          <p style={{ margin: '4px 0 0', fontSize: '13px', lineHeight: 1.5 }}>{appeal.reason}</p>
        </div>
      </div>

      {/* Review decision */}
      {(appeal.status === 'APPROVED' || appeal.status === 'REJECTED') && (
        <div className={`appeal-decision-bar appeal-decision-${appeal.status.toLowerCase()}`} data-testid={`appeal-decision-${appeal.id}`}>
          <div className="receipt-item">
            <span className="receipt-label">DECISION</span>
            <strong>{appeal.status}</strong>
          </div>
          {appeal.reviewNotes && (
            <div className="receipt-item">
              <span className="receipt-label">REVIEWER NOTES</span>
              <span>{appeal.reviewNotes}</span>
            </div>
          )}
          {appeal.reviewedAt && (
            <div className="receipt-item">
              <span className="receipt-label">REVIEWED ON</span>
              <span>{new Date(appeal.reviewedAt).toLocaleString()}</span>
            </div>
          )}
        </div>
      )}

      {/* Citizen info - admins/police only */}
      {(role === 'ADMIN' || role === 'TRAFFIC_POLICE') && appeal.citizen && (
        <div className="appeal-card-footer">
          <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
            Citizen: {appeal.citizen.name} ({appeal.citizen.email})
          </span>
        </div>
      )}
    </li>
  )
}

