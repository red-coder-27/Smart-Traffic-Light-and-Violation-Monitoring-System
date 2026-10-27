import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToString } from 'react-dom/server'
import EmergencyPriority, {
  EmergencyPriorityMessage,
  PriorityRequestRow,
  type PriorityRequest,
} from './EmergencyPriority'

const activeRequest: PriorityRequest = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  intersectionId: '660e8400-e29b-41d4-a716-446655440001',
  direction: 'NORTH',
  vehicleType: 'AMBULANCE',
  status: 'ACTIVE',
  requestedAt: '2026-10-27T12:00:00.000Z',
  validatedAt: '2026-10-27T12:00:01.000Z',
  activatedAt: '2026-10-27T12:00:02.000Z',
  endedAt: null,
  restorationError: null,
  intersection: {
    id: '660e8400-e29b-41d4-a716-446655440001',
    name: 'Central Junction',
    location: 'Main Road',
  },
  signal: { id: '770e8400-e29b-41d4-a716-446655440002', status: 'GREEN' },
}

test('shows a loading state while options and request history are being fetched', () => {
  const html = renderToString(React.createElement(EmergencyPriority, {
    token: 'operator-token',
    apiBaseUrl: 'http://localhost:5000',
  }))

  assert.ok(html.includes('Loading intersections and priority history'))
  assert.ok(html.includes('No vehicle detection or hardware connection is active'))
})

test('renders active-priority controls and the affected signal status', () => {
  const html = renderToString(React.createElement(PriorityRequestRow, {
    request: activeRequest,
    saving: false,
    onAction: () => {},
  }))

  assert.ok(html.includes('Ambulance'))
  assert.ok(html.includes('Central Junction'))
  assert.ok(html.includes('Northbound'))
  assert.ok(html.includes('Signal'))
  assert.ok(html.includes('GREEN'))
  assert.ok(html.includes('Vehicle passed · restore'))
  assert.ok(html.includes('Cancel priority'))
})

test('renders an explicit restoration error instead of implying success', () => {
  const html = renderToString(React.createElement(PriorityRequestRow, {
    request: { ...activeRequest, restorationError: 'Signal database unavailable' },
    saving: false,
    onAction: () => {},
  }))

  assert.ok(html.includes('role="alert"'))
  assert.ok(html.includes('Priority remains active; operator intervention is required'))
})

test('renders service errors as alerts and success messages as status feedback', () => {
  const errorHtml = renderToString(React.createElement(EmergencyPriorityMessage, {
    kind: 'error',
    message: 'Priority activation failed.',
  }))
  const successHtml = renderToString(React.createElement(EmergencyPriorityMessage, {
    kind: 'success',
    message: 'Normal signal operation was restored.',
  }))

  assert.ok(errorHtml.includes('role="alert"'))
  assert.ok(errorHtml.includes('Priority activation failed.'))
  assert.ok(successHtml.includes('role="status"'))
  assert.ok(successHtml.includes('Normal signal operation was restored.'))
})
