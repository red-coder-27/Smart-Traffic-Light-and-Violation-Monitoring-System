import { useCallback, useEffect, useState } from 'react'

type Filters = {
  startDate: string
  endDate: string
  interval: 'day' | 'week'
  intersectionId: string
  violationType: string
}

type Report = {
  filters: {
    startDate: string
    endDate: string
    interval: 'day' | 'week'
    intersectionId: string | null
    violationType: string | null
  }
  summary: {
    totalViolations: number
    violationTypeCount: number
    intersectionCount: number
  }
  trend: Array<{ date: string; count: number }>
  byType: Array<{ type: string; count: number }>
  byIntersection: Array<{ intersectionId: string; name: string; count: number }>
  records: Array<{
    id: string
    occurredAt: string
    violationType: string
    intersection: { id: string; name: string }
  }>
  options: {
    intersections: Array<{ id: string; name: string }>
    violationTypes: string[]
  }
}

type TrafficReportsProps = {
  token: string
  apiBaseUrl: string
}

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10)
}

function defaultFilters(): Filters {
  const endDate = todayUTC()
  const start = new Date(`${endDate}T00:00:00.000Z`)
  start.setUTCDate(start.getUTCDate() - 29)
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate,
    interval: 'day',
    intersectionId: '',
    violationType: '',
  }
}

function csvValue(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

function downloadCsv(records: Report['records'], filters: Filters) {
  const rows = [
    ['Occurred at', 'Violation type', 'Intersection'],
    ...records.map((record) => [
      record.occurredAt,
      record.violationType,
      record.intersection.name,
    ]),
  ]
  const csv = rows.map((row) => row.map(csvValue).join(',')).join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `traffic-report-${filters.startDate}-${filters.endDate}.csv`
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

function TrafficReports({ token, apiBaseUrl }: TrafficReportsProps) {
  const [draftFilters, setDraftFilters] = useState<Filters>(defaultFilters)
  const [appliedFilters, setAppliedFilters] = useState<Filters>(defaultFilters)
  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadReport = useCallback(async (filters: Filters, signal: AbortSignal) => {
    try {
      const query = new URLSearchParams({
        startDate: filters.startDate,
        endDate: filters.endDate,
        interval: filters.interval,
      })
      if (filters.intersectionId) query.set('intersectionId', filters.intersectionId)
      if (filters.violationType) query.set('violationType', filters.violationType)

      const response = await fetch(`${apiBaseUrl}/api/violations/report?${query}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      })
      const result = await response.json() as Report & { success?: boolean; message?: string }
      if (!response.ok || !result.success) {
        throw new Error(result.message ?? 'Unable to load traffic reports.')
      }
      setReport(result)
    } catch (loadError) {
      if (!signal.aborted) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load traffic reports.')
      }
    } finally {
      if (!signal.aborted) setLoading(false)
    }
  }, [apiBaseUrl, token])

  useEffect(() => {
    const controller = new AbortController()
    void Promise.resolve().then(() => loadReport(appliedFilters, controller.signal))
    return () => controller.abort()
  }, [appliedFilters, loadReport])

  function applyFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError('')
    setReport(null)
    setAppliedFilters({ ...draftFilters })
  }

  function refreshReport() {
    setLoading(true)
    setError('')
    setReport(null)
    setAppliedFilters({ ...draftFilters })
  }

  const maxTrendCount = Math.max(1, ...(report?.trend.map((point) => point.count) ?? []))
  const trendPoints = report?.trend.map((point, index) => {
    const x = report.trend.length === 1 ? 300 : (index / (report.trend.length - 1)) * 580 + 10
    const y = 180 - (point.count / maxTrendCount) * 150
    return `${x},${y}`
  }).join(' ') ?? ''

  return (
    <section className="traffic-reports" aria-labelledby="traffic-reports-title">
      <div className="report-heading">
        <div>
          <span className="form-kicker">TRAFFIC OPERATIONS</span>
          <h3 id="traffic-reports-title">Traffic reports and analytics</h3>
          <p>Explore recorded violations by date, type, and intersection.</p>
        </div>
        <button
          type="button"
          className="secondary-button"
          onClick={refreshReport}
          disabled={loading}
        >
          {loading ? 'Refreshing…' : 'Refresh report'}
        </button>
      </div>

      <form className="report-filters" onSubmit={applyFilters}>
        <div className="field-block">
          <label htmlFor="report-start-date">Start date</label>
          <input
            id="report-start-date"
            type="date"
            value={draftFilters.startDate}
            max={draftFilters.endDate}
            onChange={(event) => setDraftFilters((current) => ({ ...current, startDate: event.target.value }))}
            required
          />
        </div>
        <div className="field-block">
          <label htmlFor="report-end-date">End date</label>
          <input
            id="report-end-date"
            type="date"
            value={draftFilters.endDate}
            min={draftFilters.startDate}
            max={todayUTC()}
            onChange={(event) => setDraftFilters((current) => ({ ...current, endDate: event.target.value }))}
            required
          />
        </div>
        <div className="field-block">
          <label htmlFor="report-interval">Trend interval</label>
          <select
            id="report-interval"
            value={draftFilters.interval}
            onChange={(event) => setDraftFilters((current) => ({
              ...current,
              interval: event.target.value as Filters['interval'],
            }))}
          >
            <option value="day">Daily</option>
            <option value="week">Weekly</option>
          </select>
        </div>
        <div className="field-block">
          <label htmlFor="report-intersection">Intersection</label>
          <select
            id="report-intersection"
            value={draftFilters.intersectionId}
            onChange={(event) => setDraftFilters((current) => ({ ...current, intersectionId: event.target.value }))}
          >
            <option value="">All intersections</option>
            {report?.options.intersections.map((intersection) => (
              <option key={intersection.id} value={intersection.id}>{intersection.name}</option>
            ))}
          </select>
        </div>
        <div className="field-block">
          <label htmlFor="report-type">Violation type</label>
          <select
            id="report-type"
            value={draftFilters.violationType}
            onChange={(event) => setDraftFilters((current) => ({ ...current, violationType: event.target.value }))}
          >
            <option value="">All types</option>
            {report?.options.violationTypes.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>
        <button type="submit" disabled={loading}>
          {loading ? 'Applying…' : 'Apply filters'}
        </button>
      </form>

      {error && (
        <div className="report-error" role="alert">
          <span>{error}</span>
          <button type="button" className="secondary-button" onClick={refreshReport} disabled={loading}>
            Try again
          </button>
        </div>
      )}

      {loading && !report ? (
        <p className="profile-status" role="status">Loading traffic report…</p>
      ) : report && (
        <>
          {loading && <p className="profile-status" role="status">Updating report…</p>}
          <div className="report-summary" aria-label="Report summary">
            <article className="report-metric">
              <span>Total violations</span>
              <strong>{report.summary.totalViolations.toLocaleString()}</strong>
            </article>
            <article className="report-metric">
              <span>Violation types</span>
              <strong>{report.summary.violationTypeCount.toLocaleString()}</strong>
            </article>
            <article className="report-metric">
              <span>Affected intersections</span>
              <strong>{report.summary.intersectionCount.toLocaleString()}</strong>
            </article>
          </div>

          {report.summary.totalViolations === 0 ? (
            <p className="report-empty">No violations were recorded for the selected filters.</p>
          ) : (
            <div className="report-charts">
              <section className="report-chart" aria-labelledby="trend-title">
                <div className="report-section-heading">
                  <h4 id="trend-title">{appliedFilters.interval === 'day' ? 'Daily' : 'Weekly'} violation trend</h4>
                  <span>{report.filters.startDate} — {report.filters.endDate}</span>
                </div>
                <svg className="trend-chart" viewBox="0 0 600 210" role="img" aria-label="Violation counts over time">
                  <line x1="10" y1="30" x2="590" y2="30" />
                  <line x1="10" y1="105" x2="590" y2="105" />
                  <line x1="10" y1="180" x2="590" y2="180" />
                  <polyline points={trendPoints} />
                </svg>
                <div className="trend-axis">
                  <span>{report.trend[0]?.date}</span>
                  <span>{report.trend.at(-1)?.date}</span>
                </div>
              </section>

              <section className="report-chart" aria-labelledby="type-breakdown-title">
                <div className="report-section-heading">
                  <h4 id="type-breakdown-title">By violation type</h4>
                </div>
                <ul className="report-breakdown">
                  {report.byType.map((entry) => (
                    <li key={entry.type}>
                      <div><span>{entry.type}</span><strong>{entry.count.toLocaleString()}</strong></div>
                      <span className="report-bar"><i style={{ width: `${(entry.count / Math.max(1, ...report.byType.map((item) => item.count))) * 100}%` }} /></span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="report-chart" aria-labelledby="intersection-breakdown-title">
                <div className="report-section-heading">
                  <h4 id="intersection-breakdown-title">By intersection</h4>
                </div>
                <ul className="report-breakdown">
                  {report.byIntersection.map((entry) => (
                    <li key={entry.intersectionId}>
                      <div><span>{entry.name}</span><strong>{entry.count.toLocaleString()}</strong></div>
                      <span className="report-bar"><i style={{ width: `${(entry.count / Math.max(1, ...report.byIntersection.map((item) => item.count))) * 100}%` }} /></span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          )}

          <section className="report-records" aria-labelledby="report-records-title">
            <div className="report-section-heading">
              <div>
                <h4 id="report-records-title">Filtered violation records</h4>
                <span>{report.records.length.toLocaleString()} records</span>
              </div>
              <button
                type="button"
                className="secondary-button"
                onClick={() => downloadCsv(report.records, appliedFilters)}
                disabled={!report.records.length}
              >
                Export CSV
              </button>
            </div>
            {report.records.length ? (
              <div className="report-table-wrap">
                <table className="report-table">
                  <thead>
                    <tr><th>Occurred at</th><th>Violation type</th><th>Intersection</th></tr>
                  </thead>
                  <tbody>
                    {report.records.map((record) => (
                      <tr key={record.id}>
                        <td>{new Date(record.occurredAt).toLocaleString()}</td>
                        <td>{record.violationType}</td>
                        <td>{record.intersection.name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="report-empty">No records are available to export.</p>}
          </section>
        </>
      )}
    </section>
  )
}

export default TrafficReports
