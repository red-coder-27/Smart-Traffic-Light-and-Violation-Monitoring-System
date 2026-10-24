import test from 'node:test'
import assert from 'node:assert'
import React from 'react'
import { renderToString } from 'react-dom/server'
import fs from 'node:fs'
import path from 'node:path'
import ChallanPayment from './ChallanPayment'

test('ChallanPayment renders header, simulation disclaimer, metrics and tab filters', () => {
  const html = renderToString(
    React.createElement(ChallanPayment, {
      token: 'mock-citizen-token',
      apiBaseUrl: 'http://localhost:5000',
    })
  )

  // Title and subtitle
  assert.ok(html.includes('Digital Challans &amp; Fine Payment') || html.includes('Digital Challans & Fine Payment'))
  assert.ok(html.includes('TRAFFIC ENFORCEMENT &amp; COMPLIANCE') || html.includes('TRAFFIC ENFORCEMENT & COMPLIANCE'))

  // Simulation disclaimer
  assert.ok(html.includes('SIMULATION MODE'))
  assert.ok(html.includes('No real money is charged'))

  // Metric cards
  assert.ok(html.includes('TOTAL CHALLANS'))
  assert.ok(html.includes('PENDING DUES'))
  assert.ok(html.includes('SETTLED CHALLANS'))

  // Tab filters
  assert.ok(html.includes('tab-filter-all'))
  assert.ok(html.includes('tab-filter-unpaid'))
  assert.ok(html.includes('tab-filter-paid'))
})

test('ChallanPayment renders back to profile button when callback provided', () => {
  const onBack = () => {}
  const html = renderToString(
    React.createElement(ChallanPayment, {
      token: 'mock-citizen-token',
      apiBaseUrl: 'http://localhost:5000',
      onBackToProfile: onBack,
    })
  )

  assert.ok(html.includes('back-to-profile-btn'))
  assert.ok(html.includes('Back to profile'))
})

test('CSS includes styling rules for fine payment simulation, badges and checkout modal', () => {
  const cssPath = path.resolve(import.meta.dirname, 'App.css')
  const css = fs.readFileSync(cssPath, 'utf8')

  assert.ok(css.includes('.challans-container'), 'App.css should define .challans-container')
  assert.ok(css.includes('.simulation-notice'), 'App.css should define .simulation-notice')
  assert.ok(css.includes('.status-badge'), 'App.css should define .status-badge')
  assert.ok(css.includes('.badge-paid'), 'App.css should define .badge-paid')
  assert.ok(css.includes('.badge-unpaid'), 'App.css should define .badge-unpaid')
  assert.ok(css.includes('.modal-dialog'), 'App.css should define .modal-dialog')
  assert.ok(css.includes('.confirm-pay-btn'), 'App.css should define .confirm-pay-btn')
})
