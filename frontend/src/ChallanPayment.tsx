import { useCallback, useEffect, useRef, useState } from 'react'
import { buildChallanQuery, type AppealFilterStatus, type ChallanFilters } from './challanQuery'

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
    appeal?: {
      id: string
      status: 'PENDING' | 'APPROVED' | 'REJECTED'
      reason?: string
      reviewNotes?: string | null
      reviewedAt?: string | null
      createdAt?: string
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
    email?: string
    phone?: string | null
  }
  transactions?: Array<{
    status: string
    id?: string
    amount?: number
    reference?: string
    paymentMethod?: string
    createdAt?: string
  }>
}

export type ChallanPaymentProps = {
  token: string
  role?: string
  apiBaseUrl?: string
  onBackToProfile?: () => void
  onViewAppeals?: () => void
  onLogout?: () => void
}

type SimulationOutcome = 'SUCCESS' | 'FAILURE'
type PaymentMethod = 'SIMULATED_UPI' | 'SIMULATED_CARD' | 'SIMULATED_NETBANKING'

const EMPTY_SUMMARY = { total: 0, pending: 0, paid: 0, cancelled: 0, appealed: 0, pendingAmount: 0 }

export default function ChallanPayment({
  token,
  role = 'CITIZEN',
  apiBaseUrl = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) || 'http://localhost:5000',
  onBackToProfile,
  onViewAppeals,
  onLogout,
}: ChallanPaymentProps) {
  const [challans, setChallans] = useState<ChallanItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState(EMPTY_SUMMARY)
  const [pagination, setPagination] = useState({ page: 1, pageSize: 10, totalRecords: 0, totalPages: 0 })
  const [filters, setFilters] = useState<ChallanFilters>({
    search: '',
    status: '',
    violationType: '',
    dateFrom: '',
    dateTo: '',
    appealStatus: '' as AppealFilterStatus,
    sortOrder: 'desc' as 'asc' | 'desc',
    page: 1,
  })
  const listRequest = useRef<AbortController | null>(null)
  const detailRequest = useRef<AbortController | null>(null)

  // Payment modal/drawer state
  const [selectedChallan, setSelectedChallan] = useState<ChallanItem | null>(null)
  const [detailChallan, setDetailChallan] = useState<ChallanItem | null>(null)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [detailsError, setDetailsError] = useState<string | null>(null)
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
    listRequest.current?.abort()
    const controller = new AbortController()
    listRequest.current = controller
    setLoading(true)
    setError(null)
    const query = buildChallanQuery(filters)

    try {
      const response = await fetch(`${apiBaseUrl}/api/challans?${query}`, {
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      const data = await response.json() as {
        success?: boolean
        message?: string
        challans?: ChallanItem[]
        pagination?: { page: number; pageSize: number; totalRecords: number; totalPages: number }
        summary?: typeof EMPTY_SUMMARY
      }

      if (!response.ok) {
        throw new Error(data.message || `Failed to fetch challans (${response.status})`)
      }

      setChallans(data.challans ?? [])
      setPagination(data.pagination ?? { page: filters.page, pageSize: 10, totalRecords: 0, totalPages: 0 })
      setSummary(data.summary ?? EMPTY_SUMMARY)
    } catch (err) {
      if (!(err instanceof Error && err.name === 'AbortError')) {
        setError(err instanceof Error ? err.message : 'Unable to load challans.')
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [apiBaseUrl, filters, token])

  useEffect(() => {
    const timeout = window.setTimeout(() => void fetchChallans(), filters.search ? 250 : 0)
    return () => window.clearTimeout(timeout)
  }, [fetchChallans, filters.search])

  useEffect(() => () => {
    listRequest.current?.abort()
    detailRequest.current?.abort()
  }, [])

  const updateFilters = (updates: Partial<typeof filters>) => {
    setFilters((current) => ({ ...current, ...updates, page: updates.page ?? 1 }))
  }

  const openDetails = async (challan: ChallanItem) => {
    detailRequest.current?.abort()
    const controller = new AbortController()
    detailRequest.current = controller
    setDetailChallan(challan)
    setDetailsLoading(true)
    setDetailsError(null)

    try {
      const response = await fetch(`${apiBaseUrl}/api/challans/${encodeURIComponent(challan.id)}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      })
      const data = await response.json() as { message?: string; challan?: ChallanItem }
      if (!response.ok || !data.challan) {
        throw new Error(data.message ?? 'Unable to load challan details.')
      }
      setDetailChallan(data.challan)
    } catch (err) {
      if (!(err instanceof Error && err.name === 'AbortError')) {
        setDetailsError(err instanceof Error ? err.message : 'Unable to load challan details.')
      }
    } finally {
      if (!controller.signal.aborted) setDetailsLoading(false)
    }
  }

  const closeDetails = () => {
    detailRequest.current?.abort()
    setDetailChallan(null)
    setDetailsError(null)
  }

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
        void fetchChallans()
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
      }
      void fetchChallans()
    } catch (err) {
      setPaymentFeedback({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Network error during simulated payment.',
      })
    } finally {
      setIsProcessing(false)
    }
  }

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
      <div className="report-summary challan-summary-grid" style={{ marginBottom: 20 }}>
        <div className="report-metric">
          <span>TOTAL CHALLANS</span>
          <strong id="stat-total-challans">{summary.total}</strong>
          <span style={{ fontSize: '11px', color: 'var(--muted)' }}>Issued citations</span>
        </div>
        <div className="report-metric" style={{ borderColor: summary.pending > 0 ? '#f3b33d' : 'var(--line)' }}>
          <span>PENDING DUES</span>
          <strong id="stat-pending-amount" style={{ color: summary.pending > 0 ? '#b95000' : 'var(--ink)' }}>
            ₹{summary.pendingAmount.toLocaleString()}
          </strong>
          <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
            {summary.pending} unpaid {summary.pending === 1 ? 'citation' : 'citations'}
          </span>
        </div>
        <div className="report-metric" style={{ borderColor: summary.paid > 0 ? 'var(--green)' : 'var(--line)' }}>
          <span>SETTLED CHALLANS</span>
          <strong id="stat-paid-count" style={{ color: 'var(--green)' }}>{summary.paid}</strong>
          <span style={{ fontSize: '11px', color: 'var(--muted)' }}>Paid in full</span>
        </div>
        <div className="report-metric">
          <span>APPEALED</span>
          <strong id="stat-appealed-count">{summary.appealed}</strong>
          <span style={{ fontSize: '11px', color: 'var(--muted)' }}>With an associated appeal</span>
        </div>
      </div>

      <div className="challan-query-controls" aria-label="Search and filter challans">
        <div className="field-block">
          <label htmlFor="challan-search">Search challan number</label>
          <input
            id="challan-search"
            type="search"
            value={filters.search}
            maxLength={100}
            onChange={(event) => updateFilters({ search: event.target.value })}
            placeholder="Enter a challan number"
          />
        </div>
        <div className="field-block">
          <label htmlFor="challan-violation-type">Violation type</label>
          <input
            id="challan-violation-type"
            value={filters.violationType}
            maxLength={80}
            onChange={(event) => updateFilters({ violationType: event.target.value })}
            placeholder="e.g. RED_LIGHT"
          />
        </div>
        <div className="field-block">
          <label htmlFor="challan-date-from">Issue date from</label>
          <input
            id="challan-date-from"
            type="date"
            value={filters.dateFrom}
            max={filters.dateTo || undefined}
            onChange={(event) => updateFilters({ dateFrom: event.target.value })}
          />
        </div>
        <div className="field-block">
          <label htmlFor="challan-date-to">Issue date to</label>
          <input
            id="challan-date-to"
            type="date"
            value={filters.dateTo}
            min={filters.dateFrom || undefined}
            onChange={(event) => updateFilters({ dateTo: event.target.value })}
          />
        </div>
        <div className="field-block">
          <label htmlFor="challan-appeal-status">Appeal status</label>
          <select
            id="challan-appeal-status"
            value={filters.appealStatus}
            onChange={(event) => updateFilters({ appealStatus: event.target.value as AppealFilterStatus })}
          >
            <option value="">All appeals</option>
            <option value="NONE">No appeal</option>
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </div>
        <div className="field-block">
          <label htmlFor="challan-sort-order">Issue date order</label>
          <select
            id="challan-sort-order"
            value={filters.sortOrder}
            onChange={(event) => updateFilters({ sortOrder: event.target.value as 'asc' | 'desc' })}
          >
            <option value="desc">Newest first</option>
            <option value="asc">Oldest first</option>
          </select>
        </div>
        <button
          type="button"
          className="secondary-button challan-clear-filters"
          onClick={() => setFilters({
            search: '',
            status: '',
            violationType: '',
            dateFrom: '',
            dateTo: '',
            appealStatus: '',
            sortOrder: 'desc',
            page: 1,
          })}
        >
          Clear filters
        </button>
      </div>

      {/* Filter tabs */}
      <div className="challan-filter-bar">
        <div className="challan-tabs" role="tablist" aria-label="Challan status filters">
          <button
            type="button"
            role="tab"
            aria-selected={!filters.status}
            className={`challan-tab ${!filters.status ? 'active' : ''}`}
            onClick={() => updateFilters({ status: '' })}
            id="tab-filter-all"
          >
            All Challans ({summary.total})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filters.status === 'UNPAID'}
            className={`challan-tab ${filters.status === 'UNPAID' ? 'active' : ''}`}
            onClick={() => updateFilters({ status: 'UNPAID' })}
            id="tab-filter-unpaid"
          >
            Unpaid ({summary.pending})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filters.status === 'PAID'}
            className={`challan-tab ${filters.status === 'PAID' ? 'active' : ''}`}
            onClick={() => updateFilters({ status: 'PAID' })}
            id="tab-filter-paid"
          >
            Paid ({summary.paid})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filters.status === 'CANCELLED'}
            className={`challan-tab ${filters.status === 'CANCELLED' ? 'active' : ''}`}
            onClick={() => updateFilters({ status: 'CANCELLED' })}
          >
            Cancelled ({summary.cancelled})
          </button>
        </div>
      </div>

      {/* Challans list */}
      {loading && challans.length === 0 ? (
        <div className="profile-status" style={{ padding: '32px 0', textAlign: 'center' }} role="status">
          Loading challans and payment status…
        </div>
      ) : challans.length === 0 ? (
        <div className="report-empty" style={{ margin: '16px 0', padding: 32 }}>
          {filters.search || filters.status || filters.violationType || filters.dateFrom || filters.dateTo || filters.appealStatus
            ? 'No challans match the selected search and filters.'
            : 'No traffic challans found on record for this account.'}
        </div>
      ) : (
        <div className="challan-cards-list">
          {challans.map((challan) => {
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
                    {isUnpaid && challan.transactions?.[0]?.status === 'FAILED' && (
                      <span className="status-badge payment-status-failed">
                        Latest payment attempt failed
                      </span>
                    )}
                    {challan.violation?.appeal && (
                      <span className={`status-badge appeal-status-${challan.violation.appeal.status.toLowerCase()}`}>
                        Appeal {challan.violation.appeal.status.toLowerCase()}
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
                      <strong>{challan.violation?.violationType || 'Violation details unavailable'}</strong>
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
                        <span>{challan.citizen.name}</span>
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
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => void openDetails(challan)}
                    aria-label={`View details for ${challan.challanNumber}`}
                    data-testid={`details-button-${challan.id}`}
                  >
                    View details
                  </button>
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

      <div className="challan-pagination" aria-label="Challan pages">
        <span>
          {pagination.totalRecords === 0
            ? '0 challans'
            : `${(pagination.page - 1) * pagination.pageSize + 1}-${Math.min(pagination.page * pagination.pageSize, pagination.totalRecords)} of ${pagination.totalRecords} challans`}
        </span>
        <div>
          <button
            type="button"
            className="secondary-button"
            disabled={loading || pagination.page <= 1}
            onClick={() => updateFilters({ page: Math.max(1, filters.page - 1) })}
          >
            Previous
          </button>
          <span aria-live="polite">Page {pagination.page} of {Math.max(1, pagination.totalPages)}</span>
          <button
            type="button"
            className="secondary-button"
            disabled={loading || pagination.page >= pagination.totalPages}
            onClick={() => updateFilters({ page: filters.page + 1 })}
          >
            Next
          </button>
        </div>
      </div>

      {detailChallan && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="challan-details-title"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeDetails()
          }}
        >
          <div className="modal-dialog challan-details-dialog">
            <div className="modal-header">
              <div>
                <span className="form-kicker">DIGITAL CHALLAN</span>
                <h3 id="challan-details-title" style={{ margin: '4px 0 0', fontFamily: 'var(--display)' }}>
                  {detailChallan.challanNumber}
                </h3>
              </div>
              <button type="button" className="modal-close-btn" onClick={closeDetails} aria-label="Close details">
                ✕
              </button>
            </div>
            <div className="modal-body challan-details-body">
              {detailsLoading && <p className="profile-status" role="status">Loading challan details…</p>}
              {detailsError && (
                <div className="report-error" role="alert">
                  <span>{detailsError}</span>
                  <button type="button" className="secondary-button" onClick={() => void openDetails(detailChallan)}>
                    Retry
                  </button>
                </div>
              )}
              {!detailsLoading && !detailsError && (
                <>
                  <dl className="challan-details-grid">
                    <div><dt>Database ID</dt><dd>{detailChallan.id}</dd></div>
                    <div><dt>Violation ID</dt><dd>{detailChallan.violationId}</dd></div>
                    <div><dt>Violation type</dt><dd>{detailChallan.violation?.violationType || 'Not available'}</dd></div>
                    <div><dt>Violation date</dt><dd>{detailChallan.violation?.occurredAt ? new Date(detailChallan.violation.occurredAt).toLocaleString() : 'Not available'}</dd></div>
                    <div><dt>Intersection</dt><dd>{detailChallan.violation?.intersection?.name || 'Not available'}</dd></div>
                    <div><dt>Location</dt><dd>{detailChallan.violation?.intersection?.location || 'Not available'}</dd></div>
                    <div><dt>Fine amount</dt><dd>₹{detailChallan.amount.toLocaleString()}</dd></div>
                    <div><dt>Issued</dt><dd>{new Date(detailChallan.createdAt).toLocaleString()}</dd></div>
                    <div><dt>Payment status</dt><dd>{detailChallan.status}</dd></div>
                    {detailChallan.citizen?.name && <div><dt>Citizen</dt><dd>{detailChallan.citizen.name}</dd></div>}
                    {detailChallan.paymentReference && <div><dt>Payment reference</dt><dd>{detailChallan.paymentReference}</dd></div>}
                    {detailChallan.paidAt && <div><dt>Paid at</dt><dd>{new Date(detailChallan.paidAt).toLocaleString()}</dd></div>}
                    {detailChallan.paymentMethod && <div><dt>Payment method</dt><dd>{detailChallan.paymentMethod.replace(/_/g, ' ')}</dd></div>}
                    {detailChallan.notes && <div><dt>Notes</dt><dd>{detailChallan.notes}</dd></div>}
                  </dl>

                  <section className="challan-detail-section" aria-labelledby="challan-appeal-heading">
                    <h4 id="challan-appeal-heading">Appeal</h4>
                    {detailChallan.violation?.appeal ? (
                      <div className="challan-appeal-detail">
                        <span className={`status-badge appeal-status-${detailChallan.violation.appeal.status.toLowerCase()}`}>
                          {detailChallan.violation.appeal.status}
                        </span>
                        {detailChallan.violation.appeal.reason && <p>{detailChallan.violation.appeal.reason}</p>}
                        {detailChallan.violation.appeal.reviewNotes && (
                          <p><strong>Decision notes:</strong> {detailChallan.violation.appeal.reviewNotes}</p>
                        )}
                        {detailChallan.violation.appeal.reviewedAt && (
                          <p><strong>Reviewed:</strong> {new Date(detailChallan.violation.appeal.reviewedAt).toLocaleString()}</p>
                        )}
                      </div>
                    ) : <p>No appeal has been submitted for this violation.</p>}
                    {onViewAppeals && (
                      <button type="button" className="secondary-button" onClick={() => { closeDetails(); onViewAppeals() }}>
                        Open appeals
                      </button>
                    )}
                  </section>

                  {detailChallan.transactions && detailChallan.transactions.length > 0 && (
                    <section className="challan-detail-section" aria-labelledby="challan-payments-heading">
                      <h4 id="challan-payments-heading">Payment attempts</h4>
                      <ul className="challan-transaction-list">
                        {detailChallan.transactions.map((transaction, index) => (
                          <li key={transaction.id ?? `${transaction.status}-${index}`}>
                            <span>
                              {transaction.status}
                              {transaction.amount !== undefined && ` · ₹${transaction.amount.toLocaleString()}`}
                            </span>
                            <span>
                              {[
                                transaction.reference,
                                transaction.createdAt ? new Date(transaction.createdAt).toLocaleString() : undefined,
                              ].filter(Boolean).join(' · ')}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                  {detailChallan.status === 'UNPAID' && (
                    <button
                      type="button"
                      className="pay-action-btn"
                      onClick={() => { closeDetails(); openPaymentModal(detailChallan) }}
                    >
                      Pay Fine (Simulation) →
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
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
