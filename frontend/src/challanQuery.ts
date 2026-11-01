export type ChallanFilterStatus = '' | 'UNPAID' | 'PAID' | 'CANCELLED'
export type AppealFilterStatus = '' | 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED'

export type ChallanFilters = {
  search: string
  status: ChallanFilterStatus
  violationType: string
  dateFrom: string
  dateTo: string
  appealStatus: AppealFilterStatus
  sortOrder: 'asc' | 'desc'
  page: number
}

export function buildChallanQuery(filters: ChallanFilters): string {
  const query = new URLSearchParams({
    page: String(filters.page),
    pageSize: '10',
    sortOrder: filters.sortOrder,
  })
  if (filters.search.trim()) query.set('search', filters.search.trim())
  if (filters.status) query.set('status', filters.status)
  if (filters.violationType.trim()) query.set('violationType', filters.violationType.trim())
  if (filters.dateFrom) query.set('dateFrom', filters.dateFrom)
  if (filters.dateTo) query.set('dateTo', filters.dateTo)
  if (filters.appealStatus) query.set('appealStatus', filters.appealStatus)
  return query.toString()
}
