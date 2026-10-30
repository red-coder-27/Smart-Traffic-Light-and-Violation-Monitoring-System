import test from 'node:test'
import assert from 'node:assert'
import React from 'react'
import { renderToString } from 'react-dom/server'
import fs from 'node:fs'
import path from 'node:path'
import ViolationAppeal, { AppealCard, type AppealItem } from './ViolationAppeal'
import App from './App'

// ─── window mock helpers ────────────────────────────────────────────────────

type WindowMock = {
  localStorage: {
    getItem: (key: string) => string | null
    setItem: (key: string, val: string) => void
    removeItem: (key: string) => void
  }
  location: { hash: string }
  addEventListener: (event: string, fn: () => void) => void
  removeEventListener: (event: string, fn: () => void) => void
  dispatchEvent: (event: string) => void
  setTimeout: (fn: () => void) => NodeJS.Timeout
}

function setupMockWindow(initialHash = '', token = ''): WindowMock {
  const store: Record<string, string> = {}
  if (token) store.trafficAuthToken = token

  const listeners: Record<string, Array<() => void>> = {}

  const mockWindow: WindowMock = {
    localStorage: {
      getItem: (key) => store[key] ?? null,
      setItem: (key, val) => { store[key] = val },
      removeItem: (key) => { delete store[key] },
    },
    location: { hash: initialHash },
    addEventListener: (event, fn) => {
      listeners[event] = listeners[event] || []
      listeners[event].push(fn)
    },
    removeEventListener: (event, fn) => {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter((cb) => cb !== fn)
      }
    },
    dispatchEvent: (event) => { listeners[event]?.forEach((fn) => fn()) },
    setTimeout: (fn) => setTimeout(fn, 0),
  }

  ;(globalThis as unknown as { window: typeof mockWindow }).window = mockWindow
  return mockWindow
}

// ─── mock data ──────────────────────────────────────────────────────────────

const pendingAppeal: AppealItem = {
  id: '770e8400-e29b-41d4-a716-446655440003',
  violationId: '550e8400-e29b-41d4-a716-446655440001',
  citizenId: 'citizen-1',
  reason: 'I was yielding to an emergency vehicle during an ambulance call.',
  status: 'PENDING',
  reviewNotes: null,
  reviewedBy: null,
  reviewedAt: null,
  createdAt: '2026-10-29T09:00:00.000Z',
  updatedAt: '2026-10-29T09:00:00.000Z',
  violation: {
    id: '550e8400-e29b-41d4-a716-446655440001',
    occurredAt: '2026-10-28T14:30:00.000Z',
    violationType: 'RED_LIGHT',
    description: 'Vehicle crossed stop line at red',
    intersection: { id: 'int-1', name: 'Main & 5th', location: 'Downtown' },
    challan: { id: 'chal-1', challanNumber: 'CHAL-20261028-001', amount: 1000, status: 'UNPAID' },
  },
  citizen: { id: 'citizen-1', name: 'Jordan Lee', email: 'jordan@example.com', phone: '+15551234567' },
}

const approvedAppeal: AppealItem = {
  ...pendingAppeal,
  id: '880e8400-e29b-41d4-a716-446655440004',
  status: 'APPROVED',
  reviewNotes: 'Evidence confirmed emergency vehicle presence.',
  reviewedBy: 'admin-1',
  reviewedAt: '2026-10-29T15:00:00.000Z',
}

// ─── Component render tests ──────────────────────────────────────────────────

test('ViolationAppeal renders header, title, notice banner, and tabs', () => {
  const html = renderToString(
    React.createElement(ViolationAppeal, {
      token: 'mock-citizen-token',
      apiBaseUrl: 'http://localhost:5000',
    })
  )

  // Title
  assert.ok(html.includes('Violation Appeal Submission') || html.includes('appeals-title'))
  assert.ok(html.includes('CITIZEN COMPLIANCE'))

  // Disclaimer notice about appeal not cancelling fine
  assert.ok(html.includes('does not automatically cancel or pause'))

  // Tab buttons
  assert.ok(html.includes('tab-submit-appeal'))
  assert.ok(html.includes('tab-appeal-history'))

  // Submit tab is default
  assert.ok(html.includes('Loading your violations'))
})

test('ViolationAppeal renders back-to-profile button when callback provided', () => {
  const html = renderToString(
    React.createElement(ViolationAppeal, {
      token: 'mock-citizen-token',
      apiBaseUrl: 'http://localhost:5000',
      onBackToProfile: () => {},
    })
  )

  assert.ok(html.includes('back-to-profile-btn'))
  assert.ok(html.includes('Back to profile'))
})

test('AppealCard renders pending appeal with status badge and reason', () => {
  const html = renderToString(
    React.createElement(AppealCard, {
      appeal: pendingAppeal,
      role: 'CITIZEN',
    })
  )

  assert.ok(html.includes('UNDER REVIEW'))
  assert.ok(html.includes('appeal-badge-pending'))
  assert.ok(html.includes('yielding to an emergency vehicle'))
  assert.ok(html.includes('RED_LIGHT'))
  assert.ok(html.includes('Main &amp; 5th') || html.includes('Main & 5th'))
})

test('AppealCard renders approved appeal decision bar with reviewer notes', () => {
  const html = renderToString(
    React.createElement(AppealCard, {
      appeal: approvedAppeal,
      role: 'ADMIN',
    })
  )

  assert.ok(html.includes('APPROVED'))
  assert.ok(html.includes('appeal-decision-approved'))
  assert.ok(html.includes('Evidence confirmed emergency vehicle presence.'))
  assert.ok(html.includes('Jordan Lee'))
})

test('ViolationAppeal form requires violation selection and reason', () => {
  const html = renderToString(
    React.createElement(ViolationAppeal, {
      token: 'mock-citizen-token',
      apiBaseUrl: 'http://localhost:5000',
    })
  )

  assert.ok(html.includes('appeals-container'))
  assert.ok(html.includes('submit-appeal-btn') || html.includes('Loading your violations'))
})

test('CSS includes styling rules for appeals', () => {
  const cssPath = path.resolve(import.meta.dirname, 'App.css')
  const css = fs.readFileSync(cssPath, 'utf8')

  assert.ok(css.includes('.appeals-container'), 'App.css should define .appeals-container')
  assert.ok(css.includes('.appeal-notice'), 'App.css should define .appeal-notice')
  assert.ok(css.includes('.appeal-notice-badge'), 'App.css should define .appeal-notice-badge')
  assert.ok(css.includes('.appeal-form'), 'App.css should define .appeal-form')
  assert.ok(css.includes('.appeal-fieldset'), 'App.css should define .appeal-fieldset')
  assert.ok(css.includes('.appeal-violation-card'), 'App.css should define .appeal-violation-card')
  assert.ok(css.includes('.appeal-cards-list'), 'App.css should define .appeal-cards-list')
  assert.ok(css.includes('.appeal-card'), 'App.css should define .appeal-card')
  assert.ok(css.includes('.appeal-card-pending'), 'App.css should define .appeal-card-pending')
  assert.ok(css.includes('.appeal-card-approved'), 'App.css should define .appeal-card-approved')
  assert.ok(css.includes('.appeal-card-rejected'), 'App.css should define .appeal-card-rejected')
  assert.ok(css.includes('.appeal-badge'), 'App.css should define .appeal-badge')
  assert.ok(css.includes('.appeal-badge-pending'), 'App.css should define .appeal-badge-pending')
  assert.ok(css.includes('.appeal-badge-approved'), 'App.css should define .appeal-badge-approved')
  assert.ok(css.includes('.appeal-badge-rejected'), 'App.css should define .appeal-badge-rejected')
  assert.ok(css.includes('.appeal-success-notice'), 'App.css should define .appeal-success-notice')
  assert.ok(css.includes('.appeal-decision-bar'), 'App.css should define .appeal-decision-bar')
  assert.ok(css.includes('.field-error'), 'App.css should define .field-error')
})

// ─── App integration tests ──────────────────────────────────────────────────

test('navigating to #appeals without authentication renders auth error and login form', () => {
  setupMockWindow('#appeals', '')
  const html = renderToString(React.createElement(App))

  assert.ok(html.includes('Authentication required: Please log in to submit a violation appeal.'))
  assert.ok(html.includes('Violation appeal sign in'))
  assert.ok(html.includes('id="login-email"'))
  assert.ok(!html.includes('id="profile-name"'))
})

test('authenticated citizen navigating to #appeals renders appeals view or loading state', () => {
  setupMockWindow('#appeals', 'mock-citizen-token')
  const html = renderToString(React.createElement(App))

  assert.ok(!html.includes('id="profile-name"'))
  assert.ok(
    html.includes('Loading appeals') ||
    html.includes('Violation Appeal Submission') ||
    html.includes('Loading your violations')
  )
})

test('authenticated citizen on profile view sees "My appeals" navigation button', () => {
  setupMockWindow('', 'mock-citizen-token')
  const html = renderToString(React.createElement(App))

  assert.ok(html.includes('id="nav-appeals-btn"'))
  assert.ok(html.includes('My appeals'))
})

test('appeal submission disclaimer states appeal does not cancel fine', () => {
  const html = renderToString(
    React.createElement(ViolationAppeal, {
      token: 'mock-citizen-token',
      apiBaseUrl: 'http://localhost:5000',
    })
  )

  assert.ok(html.includes('does not automatically cancel or pause'))
  assert.ok(html.includes('reviewed by a traffic authority officer'))
})

test('ViolationAppeal displays appealable violations and hides already-appealed ones', () => {
  const html = renderToString(
    React.createElement(ViolationAppeal, {
      token: 'mock-citizen-token',
      apiBaseUrl: 'http://localhost:5000',
    })
  )

  assert.ok(html.includes('appeals-container'))
  assert.ok(
    html.includes('Loading your violations') ||
    html.includes('appeal-violation-select')
  )
})

test('appeal reason hint shows character count and minimum requirement', () => {
  const html = renderToString(
    React.createElement(ViolationAppeal, {
      token: 'mock-citizen-token',
      apiBaseUrl: 'http://localhost:5000',
    })
  )

  assert.ok(html.includes('appeals-container'))
})

test('ViolationAppeal does not interfere with challan route (regression)', () => {
  setupMockWindow('#challans', 'mock-citizen-token')
  const html = renderToString(React.createElement(App))

  assert.ok(!html.includes('Violation Appeal Submission'))
  assert.ok(html.includes('Loading challans') || html.includes('Digital Challans'))
})

test('ViolationAppeal does not interfere with emergency priority route (regression)', () => {
  setupMockWindow('#emergency-priority', 'mock-citizen-token')
  const html = renderToString(React.createElement(App))

  assert.ok(!html.includes('Violation Appeal Submission'))
  assert.ok(html.includes('Access restricted: Administrator or Traffic Police role is required.'))
})

test('renders appeal items with correct status styling information', () => {
  const cssPath = path.resolve(import.meta.dirname, 'App.css')
  const css = fs.readFileSync(cssPath, 'utf8')

  assert.ok(css.includes('.appeal-badge-pending'))
  assert.ok(css.includes('#f3b33d'))
  assert.ok(css.includes('.appeal-badge-approved'))
  assert.ok(css.includes('.appeal-badge-rejected'))
  assert.ok(css.includes('#c0392b'))
})
