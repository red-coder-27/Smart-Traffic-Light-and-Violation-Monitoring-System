import { useCallback, useEffect, useState } from 'react'

export type ChallanItem = {
  id: string
  challanNumber: string
  amount: number
  status: 'UNPAID' | 'PAID' | 'CANCELLED'
  paidAt: string | null
  paymentReference: string | null
  paymentMethod: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
  violationId: string
  citizenId: string
  violation?: {
    id: string
    occurredAt: string
    violationType: string
    description?: string | null
    intersection?: {
      id: string
      name: string
      location: string
    } | null
    trafficSignal?: {
      id: string
      status: string
    } | null
    evidence?: Array<{
      id: string
      originalName: string
      mimeType: string
      createdAt: string
    }>
  }
  citizen?: {
    id: string
    name: string
    email: string
    phone?: string | null
  }
}

export type ChallanPaymentProps = {
  token: string
  role?: string
  apiBaseUrl?: string
  onBackToProfile?: () => void
  onLogout?: () => void
}

type SimulationOutcome = 'SUCCESS' | 'FAILURE'
type PaymentMethod = 'SIMULATED_UPI' | 'SIMULATED_CARD' | 'SIMULATED_NETBANKING'

export default function ChallanPayment({
  token,
  role = 'CITIZEN',
  apiBaseUrl = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) || 'http://localhost:5000',
  onBackToProfile,
  onLogout,
}: ChallanPaymentProps) {
  const [challans, setChallans] = useState<ChallanItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'ALL' | 'UNPAID' | 'PAID'>('ALL')

  // Payment modal/drawer state
  const [selectedChallan, setSelectedChallan] = useState<ChallanItem | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('SIMULATED_UPI')
  const [simulationOutcome, setSimulationOutcome] = useState<SimulationOutcome>('SUCCESS')
  const [isProcessing, setIsProcessing] = useState(false)
  const [paymentFeedback, setPaymentFeedback] = useState<{
    kind: 'success' | 'error'
    text: string
    reference?: string
  } | null>(null)

  const fetchChallans = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`${apiBaseUrl}/api/challans`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      const data = await response.json() as {
        success?: boolean
        message?: string
        challans?: ChallanItem[]
      }

      if (!response.ok) {
        throw new Error(data.message || `Failed to fetch challans (${response.status})`)
      }

      setChallans(data.challans ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load challans.')
    } finally {
      setLoading(false)
    }
  }, [apiBaseUrl, token])

  useEffect(() => {
    void Promise.resolve().then(() => fetchChallans())
  }, [fetchChallans])

  const openPaymentModal = (challan: ChallanItem) => {
    setSelectedChallan(challan)
    setPaymentFeedback(null)
    setPaymentMethod('SIMULATED_UPI')
    setSimulationOutcome('SUCCESS')
  }

  const closePaymentModal = () => {
    if (isProcessing) return
    setSelectedChallan(null)
    setPaymentFeedback(null)
  }

  const handleSimulatedPayment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedChallan || isProcessing) return

    setIsProcessing(true)
    setPaymentFeedback(null)

    const idempotencyKey = `simpay_${selectedChallan.id}_${Date.now()}`

    try {
      const response = await fetch(`${apiBaseUrl}/api/challans/${selectedChallan.id}/pay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          paymentMethod,
          simulationOutcome,
          idempotencyKey,
        }),
      })

      const data = await response.json() as {
        success?: boolean
        message?: string
        challan?: ChallanItem
        transaction?: {
          id: string
          reference: string
          status: string
          amount: number
          failureReason?: string
        }
      }

      if (response.status === 409) {
        // Already paid
        setPaymentFeedback({
          kind: 'error',
          text: data.message || 'This challan has already been paid and settled.',
        })
        void fetchChallans()
        return
      }

      if (!response.ok || !data.success) {
        // Simulation failure or error
        setPaymentFeedback({
          kind: 'error',
          text: data.message || 'Simulated payment was declined or failed.',
          reference: data.transaction?.reference,
        })
        return
      }

      // Success
      setPaymentFeedback({
        kind: 'success',
        text: `Simulated payment processed successfully! Fine of ₹${selectedChallan.amount.toLocaleString()} has been settled.`,
        reference: data.transaction?.reference || data.challan?.paymentReference || 'N/A',
      })

      // Update local state
      if (data.challan) {
        const updated = data.challan
        setChallans((prev) =>
          prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c))
        )
        setSelectedChallan((prev) => (prev ? { ...prev, ...updated } : null))
      } else {
        void fetchChallans()
      }
    } catch (err) {
      setPaymentFeedback({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Network error during simulated payment.',
      })
    } finally {
      setIsProcessing(false)
    }
  }

  // Calculated summaries
  const totalChallans = challans.length
  const unpaidChallans = challans.filter((c) => c.status === 'UNPAID')
  const paidChallans = challans.filter((c) => c.status === 'PAID')
  const totalUnpaidAmount = unpaidChallans.reduce((sum, c) => sum + c.amount, 0)

  const displayedChallans = challans.filter((c) => {
    if (filter === 'UNPAID') return c.status === 'UNPAID'
    if (filter === 'PAID') return c.status === 'PAID'
    return true
  })

  return (
    <div className="challans-container" aria-labelledby="challans-title">
      {/* Top action header */}
      <div className="profile-header challans-nav-header">
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
        <div style={{ display: 'flex', gap: 10, marginLeft: 'auto' }}>
          <button
            type="button"
            className="secondary-button"
            onClick={() => void fetchChallans()}
            disabled={loading}
            title="Refresh challans"
          >
            {loading ? 'Refreshing…' : '↻ Refresh'}
          </button>
          {onLogout && (
            <button
              type="button"
              className="secondary-button"
              onClick={onLogout}
              id="challans-logout-btn"
            >
              Log out
            </button>
          )}
        </div>
      </div>

      {/* Main title banner */}
      <div className="report-heading" style={{ marginTop: 10, marginBottom: 16 }}>
        <div>
          <span className="form-kicker">TRAFFIC ENFORCEMENT & COMPLIANCE</span>
          <h2 id="challans-title" style={{ margin: '8px 0 4px', fontFamily: 'var(--display)', fontSize: '28px' }}>
            Digital Challans & Fine Payment
          </h2>
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: '13px' }}>
            Review official traffic citations, verify violation records, and complete simulated fine settlements.
          </p>
        </div>
      </div>

      {/* Simulation banner disclaimer */}
      <div className="simulation-notice" role="note">
        <div className="simulation-notice-badge">SIMULATION MODE</div>
        <p>
          This is a simulated payment gateway for demonstration and automated testing.
          <strong> No real money is charged</strong> and no banking credentials, UPI PINs, or card secrets are ever requested.
        </p>
      </div>

      {/* Error state */}
      {error && (
        <div className="report-error" role="alert" style={{ marginBottom: 16 }}>
          <span>{error}</span>
          <button
            type="button"
            className="secondary-button"
            onClick={() => void fetchChallans()}
            style={{ height: 32, fontSize: '11px' }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Summary statistics metrics */}
      <div className="report-summary" style={{ marginBottom: 20 }}>
        <div className="report-metric">
          <span>TOTAL CHALLANS</span>
          <strong id="stat-total-challans">{totalChallans}</strong>
          <span style={{ fontSize: '11px', color: 'var(--muted)' }}>Issued citations</span>
        </div>
        <div className="report-metric" style={{ borderColor: unpaidChallans.length > 0 ? '#f3b33d' : 'var(--line)' }}>
          <span>PENDING DUES</span>
          <strong id="stat-pending-amount" style={{ color: unpaidChallans.length > 0 ? '#b95000' : 'var(--ink)' }}>
            ₹{totalUnpaidAmount.toLocaleString()}
          </strong>
          <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
            {unpaidChallans.length} unpaid {unpaidChallans.length === 1 ? 'citation' : 'citations'}
          </span>
        </div>
        <div className="report-metric" style={{ borderColor: paidChallans.length > 0 ? 'var(--green)' : 'var(--line)' }}>
          <span>SETTLED CHALLANS</span>
          <strong id="stat-paid-count" style={{ color: 'var(--green)' }}>{paidChallans.length}</strong>
          <span style={{ fontSize: '11px', color: 'var(--muted)' }}>Paid in full</span>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="challan-filter-bar">
        <div className="challan-tabs" role="tablist" aria-label="Challan status filters">
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'ALL'}
            className={`challan-tab ${filter === 'ALL' ? 'active' : ''}`}
            onClick={() => setFilter('ALL')}
            id="tab-filter-all"
          >
            All Challans ({totalChallans})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'UNPAID'}
            className={`challan-tab ${filter === 'UNPAID' ? 'active' : ''}`}
            onClick={() => setFilter('UNPAID')}
            id="tab-filter-unpaid"
          >
            Unpaid ({unpaidChallans.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'PAID'}
            className={`challan-tab ${filter === 'PAID' ? 'active' : ''}`}
            onClick={() => setFilter('PAID')}
            id="tab-filter-paid"
          >
            Paid ({paidChallans.length})
          </button>
        </div>
      </div>

      {/* Challans list */}
      {loading && challans.length === 0 ? (
        <div className="profile-status" style={{ padding: '32px 0', textAlign: 'center' }} role="status">
          Loading challans and payment status…
        </div>
      ) : displayedChallans.length === 0 ? (
        <div className="report-empty" style={{ margin: '16px 0', padding: 32 }}>
          {filter === 'ALL'
            ? 'No traffic challans found on record for this account.'
            : filter === 'UNPAID'
            ? 'No pending unpaid challans. You are fully compliant!'
            : 'No paid challans recorded yet.'}
        </div>
      ) : (
        <div className="challan-cards-list">
          {displayedChallans.map((challan) => {
            const isPaid = challan.status === 'PAID'
            const isCancelled = challan.status === 'CANCELLED'
            const isUnpaid = challan.status === 'UNPAID'

            return (
              <article
                key={challan.id}
                className={`challan-card ${isPaid ? 'challan-card-paid' : 'challan-card-unpaid'}`}
                data-testid={`challan-card-${challan.id}`}
                aria-labelledby={`challan-num-${challan.id}`}
              >
                <div className="challan-card-header">
                  <div>
                    <span className="challan-number-tag" id={`challan-num-${challan.id}`}>
                      {challan.challanNumber}
                    </span>
                    <span className="challan-date-tag">
                      Issued: {new Date(challan.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div>
                    {isPaid && (
                      <span className="status-badge badge-paid" aria-label="Status: Paid">
                        ✓ PAID & SETTLED
                      </span>
                    )}
                    {isUnpaid && (
                      <span className="status-badge badge-unpaid" aria-label="Status: Unpaid">
                        ● PAYMENT DUE
                      </span>
                    )}
                    {isCancelled && (
                      <span className="status-badge badge-cancelled" aria-label="Status: Cancelled">
                        ✕ CANCELLED
                      </span>
                    )}
                  </div>
                </div>

                <div className="challan-card-body">
                  <div className="challan-violation-info">
                    <div className="violation-detail-row">
                      <span className="detail-label">Challan ID:</span>
                      <span>{challan.id}</span>
                    </div>
                    <div className="violation-detail-row">
                      <span className="detail-label">Violation ID:</span>
                      <span>{challan.violationId}</span>
                    </div>
                    <div className="violation-headline">
                      <strong>{challan.violation?.violationType || 'TRAFFIC_VIOLATION'}</strong>
                      {challan.violation?.intersection && (
                        <span> at {challan.violation.intersection.name}</span>
                      )}
                    </div>
                    {challan.violation?.occurredAt && (
                      <div className="violation-detail-row">
                        <span className="detail-label">Occurred:</span>
                        <span>{new Date(challan.violation.occurredAt).toLocaleString()}</span>
                      </div>
                    )}
                    {challan.violation?.intersection?.location && (
                      <div className="violation-detail-row">
                        <span className="detail-label">Location:</span>
                        <span>{challan.violation.intersection.location}</span>
                      </div>
                    )}
                    {challan.violation?.description && (
                      <div className="violation-detail-row">
                        <span className="detail-label">Details:</span>
                        <span style={{ fontStyle: 'italic' }}>{challan.violation.description}</span>
                      </div>
                    )}
                    {challan.violation?.evidence && challan.violation.evidence.length > 0 && (
                      <div className="violation-detail-row">
                        <span className="detail-label">Evidence:</span>
                        <span>
                          {challan.violation.evidence.map((item) => `${item.originalName} (${item.id})`).join(', ')}
                        </span>
                      </div>
                    )}
                    {challan.citizen && (
                      <div className="violation-detail-row">
                        <span className="detail-label">{role === 'CITIZEN' ? 'Issued to:' : 'Citizen:'}</span>
                        <span>
                          {challan.citizen.name} ({challan.citizen.email})
                          {challan.citizen.phone ? ` · ${challan.citizen.phone}` : ''}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="challan-amount-box">
                    <span className="amount-label">FINE AMOUNT</span>
                    <strong className="amount-value" data-testid={`challan-amount-${challan.id}`}>
                      ₹{challan.amount.toLocaleString()}
                    </strong>
                    <span className="amount-statutory">Statutory fine rate</span>
                  </div>
                </div>

                {/* Paid metadata receipt box */}
                {isPaid && (
                  <div className="challan-receipt-bar" data-testid={`receipt-${challan.id}`}>
                    <div className="receipt-item">
                      <span className="receipt-label">TRANSACTION REF</span>
                      <strong className="receipt-code" data-testid="payment-ref">
                        {challan.paymentReference || 'N/A'}
                      </strong>
                    </div>
                    {challan.paidAt && (
                      <div className="receipt-item">
                        <span className="receipt-label">PAID ON</span>
                        <span>{new Date(challan.paidAt).toLocaleString()}</span>
                      </div>
                    )}
                    {challan.paymentMethod && (
                      <div className="receipt-item">
                        <span className="receipt-label">METHOD</span>
                        <span>{challan.paymentMethod.replace(/_/g, ' ')}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Actions footer */}
                <div className="challan-card-footer">
                  {isUnpaid && (
                    <button
                      type="button"
                      className="pay-action-btn"
                      onClick={() => openPaymentModal(challan)}
                      data-testid={`pay-button-${challan.id}`}
                    >
                      Pay Fine (Simulation) →
                    </button>
                  )}
                  {isPaid && (
                    <span className="paid-status-note">
                      ✓ Citation cleared · No further action needed
                    </span>
                  )}
                  {isCancelled && (
                    <span className="paid-status-note" style={{ color: 'var(--muted)' }}>
                      Citation voided or dismissed
                    </span>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}

      {/* Simulated Payment Modal / Drawer */}
      {selectedChallan && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="payment-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) closePaymentModal()
          }}
        >
          <div className="modal-dialog">
            <div className="modal-header">
              <div>
                <span className="form-kicker">SIMULATED CHECKOUT</span>
                <h3 id="payment-modal-title" style={{ margin: '4px 0 0', fontFamily: 'var(--display)' }}>
                  Settle Traffic Citation
                </h3>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={closePaymentModal}
                disabled={isProcessing}
                aria-label="Close dialog"
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              {/* Citation summary */}
              <div className="checkout-summary-card">
                <div className="checkout-row">
                  <span className="checkout-label">Challan number</span>
                  <strong className="checkout-val">{selectedChallan.challanNumber}</strong>
                </div>
                <div className="checkout-row">
                  <span className="checkout-label">Violation</span>
                  <span className="checkout-val">{selectedChallan.violation?.violationType}</span>
                </div>
                <div className="checkout-row">
                  <span className="checkout-label">Verified fine amount</span>
                  <strong className="checkout-amount" data-testid="modal-fine-amount">
                    ₹{selectedChallan.amount.toLocaleString()}
                  </strong>
                </div>
                <p className="checkout-disclaimer">
                  * Note: The fine amount is calculated from the authoritative server-side record.
                  Client amounts cannot be submitted or altered.
                </p>
              </div>

              {/* Status / feedback message */}
              {paymentFeedback && (
                <div
                  className={`payment-feedback-banner feedback-${paymentFeedback.kind}`}
                  role="alert"
                  data-testid="payment-feedback"
                >
                  <p style={{ margin: 0 }}>{paymentFeedback.text}</p>
                  {paymentFeedback.reference && (
                    <div style={{ marginTop: 8, fontSize: '11px', fontFamily: 'monospace' }}>
                      Reference ID: <strong>{paymentFeedback.reference}</strong>
                    </div>
                  )}
                </div>
              )}

              {/* Only show form if not already paid in this dialog session */}
              {selectedChallan.status !== 'PAID' ? (
                <form onSubmit={handleSimulatedPayment} className="payment-form">
                  <div className="field-block">
                    <label htmlFor="sim-payment-method">Simulated Payment Method</label>
                    <select
                      id="sim-payment-method"
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                      disabled={isProcessing}
                    >
                      <option value="SIMULATED_UPI">Simulated UPI (Unified Payments)</option>
                      <option value="SIMULATED_CARD">Simulated Debit / Credit Card</option>
                      <option value="SIMULATED_NETBANKING">Simulated Net Banking</option>
                    </select>
                  </div>

                  <div className="field-block">
                    <label htmlFor="sim-outcome">Test Simulation Outcome</label>
                    <select
                      id="sim-outcome"
                      value={simulationOutcome}
                      onChange={(e) => setSimulationOutcome(e.target.value as SimulationOutcome)}
                      disabled={isProcessing}
                    >
                      <option value="SUCCESS">Success (Simulate Approved Settlement)</option>
                      <option value="FAILURE">Failure (Simulate Bank Decline / Error)</option>
                    </select>
                    <span style={{ fontSize: '11px', color: 'var(--muted)', marginTop: 4 }}>
                      Choose &quot;Failure&quot; to test error handling and decline verification deterministically.
                    </span>
                  </div>

                  <div className="modal-actions">
                    <button
                      type="submit"
                      className="confirm-pay-btn"
                      disabled={isProcessing}
                      id="confirm-pay-btn"
                      data-testid="confirm-payment-btn"
                    >
                      {isProcessing
                        ? 'Processing simulated payment…'
                        : `Authorize Simulated Payment of ₹${selectedChallan.amount.toLocaleString()}`}
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={closePaymentModal}
                      disabled={isProcessing}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={closePaymentModal}
                    style={{ minWidth: 120 }}
                  >
                    Done
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
