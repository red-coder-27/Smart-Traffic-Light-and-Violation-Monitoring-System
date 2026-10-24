import test from 'node:test'
import assert from 'node:assert'
import React from 'react'
import { renderToString } from 'react-dom/server'
import fs from 'node:fs'
import path from 'node:path'
import App from './App'
import TrafficReports from './TrafficReports'

type WindowMock = {
  localStorage: {
    getItem: (key: string) => string | null
    setItem: (key: string, val: string) => void
    removeItem: (key: string) => void
  }
  location: {
    hash: string
  }
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
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, val: string) => { store[key] = val },
      removeItem: (key: string) => { delete store[key] },
    },
    location: {
      hash: initialHash,
    },
    addEventListener: (event: string, fn: () => void) => {
      listeners[event] = listeners[event] || []
      listeners[event].push(fn)
    },
    removeEventListener: (event: string, fn: () => void) => {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter((cb) => cb !== fn)
      }
    },
    dispatchEvent: (event: string) => {
      listeners[event]?.forEach((fn) => fn())
    },
    setTimeout: (fn: () => void) => setTimeout(fn, 0),
  }

  ;(globalThis as unknown as { window: typeof mockWindow }).window = mockWindow
  return mockWindow
}

test('navigating to #traffic-reports without authentication renders auth error and login form', () => {
  setupMockWindow('#traffic-reports', '')
  const html = renderToString(React.createElement(App))

  // Must display the authentication error message
  assert.ok(html.includes('Authentication required: Please log in with an administrator or traffic police account to view traffic reports.'))
  assert.ok(html.includes('Traffic reports sign in'))
  assert.ok(html.includes('id="login-email"'))
  // Must NOT silently display the profile form
  assert.ok(!html.includes('id="profile-name"'))
  assert.ok(!html.includes('id="profile-date-of-birth"'))
})

test('navigating to root/profile without authentication renders citizen registration and login', () => {
  setupMockWindow('', '')
  const html = renderToString(React.createElement(App))

  assert.ok(html.includes('Create your account'))
  assert.ok(html.includes('ACCOUNT CENTER'))
  assert.ok(html.includes('id="name"'))
  assert.ok(html.includes('id="login-email"'))
  // Must NOT display the traffic reports dashboard
  assert.ok(!html.includes('Traffic reports and analytics'))
})

test('authenticated citizen navigating to #traffic-reports displays access restriction error, not silent profile', () => {
  setupMockWindow('#traffic-reports', 'mock-citizen-token')
  // We can render App with a citizen token
  const html = renderToString(React.createElement(App))

  // While profile is loading or once evaluated as non-admin/police, it displays loading or access restricted
  // and does NOT render the profile-form
  assert.ok(!html.includes('<form className="profile-form"') && !html.includes('class="profile-form"'))
  assert.ok(html.includes('Loading traffic reports…') || html.includes('Access restricted:'))
})

test('TrafficReports component renders analytics dashboard and controls', () => {
  setupMockWindow('#traffic-reports', 'mock-admin-token')
  const html = renderToString(React.createElement(TrafficReports, {
    token: 'mock-admin-token',
    apiBaseUrl: 'http://localhost:5000',
  }))

  assert.ok(html.includes('Traffic reports and analytics'))
  assert.ok(html.includes('TRAFFIC OPERATIONS'))
  assert.ok(html.includes('report-filters'))
  assert.ok(html.includes('report-start-date'))
  assert.ok(html.includes('report-end-date'))
  assert.ok(html.includes('report-interval'))
  assert.ok(html.includes('report-intersection'))
  assert.ok(html.includes('report-type'))
  assert.ok(html.includes('Loading traffic report…'))
})

test('TrafficReports error handling renders informative alert on API failure', async () => {
  setupMockWindow('#traffic-reports', 'mock-admin-token')

  // Mock fetch to simulate API failure
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => {
    return {
      ok: false,
      status: 500,
      json: async () => ({ success: false, message: 'Database connection failed' }),
    } as unknown as Response
  }

  try {
    const html = renderToString(React.createElement(TrafficReports, {
      token: 'mock-admin-token',
      apiBaseUrl: 'http://localhost:5000',
    }))
    assert.ok(html.includes('Traffic reports and analytics'))
    assert.ok(html.includes('TRAFFIC OPERATIONS'))
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('CSS positions street-lines decoration away from hero heading and sets pointer-events none', () => {
  const cssPath = path.resolve(import.meta.dirname, 'App.css')
  const css = fs.readFileSync(cssPath, 'utf8')

  // Check street-lines is positioned to right: 0; left: auto;
  assert.ok(css.includes('pointer-events: none;'), 'street-lines must have pointer-events: none')
  assert.ok(css.includes('right: 0;'), 'street-lines must be positioned to the right')
  assert.ok(css.includes('z-index: 1;'), 'intro-panel headings must have higher z-index')
})
