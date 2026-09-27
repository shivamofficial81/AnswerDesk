import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  validatePayload,
  timingSafeEqualStrings,
  checkRateLimit,
  getRequestBodySize,
  getVisitorKey,
  retrieveDemoAnswer,
  loadPolicySections,
  LIMITS,
  default as handler,
} from '../api/chat.js'

function createMockRes() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code
      return this
    },
    json(payload) {
      this.body = payload
      return this
    },
  }
}

function createMockReq(visitor) {
  const payload = { question: 'What are your hours?' }
  return {
    method: 'POST',
    headers: {
      'content-length': String(Buffer.byteLength(JSON.stringify(payload))),
      'x-forwarded-for': visitor,
    },
    body: payload,
    socket: {},
  }
}

describe('validatePayload', () => {
  test('rejects a non-object body', () => {
    assert.equal(validatePayload(null).valid, false)
    assert.equal(validatePayload('nope').valid, false)
    assert.equal(validatePayload([1, 2]).valid, false)
  })

  test('rejects a missing or empty question', () => {
    assert.equal(validatePayload({}).valid, false)
    assert.equal(validatePayload({ question: '   ' }).valid, false)
    assert.equal(validatePayload({ question: 42 }).valid, false)
  })

  test('rejects a question over the max length', () => {
    const tooLong = 'a'.repeat(LIMITS.MAX_QUESTION_LENGTH + 1)
    const result = validatePayload({ question: tooLong })
    assert.equal(result.valid, false)
    assert.match(result.error, /characters or fewer/)
  })

  test('accepts a question at exactly the max length', () => {
    const exact = 'a'.repeat(LIMITS.MAX_QUESTION_LENGTH)
    assert.equal(validatePayload({ question: exact }).valid, true)
  })

  test('rejects history that is not an array', () => {
    const result = validatePayload({ question: 'hi', history: 'nope' })
    assert.equal(result.valid, false)
  })

  test('rejects history longer than the max turns', () => {
    const history = Array.from({ length: LIMITS.MAX_HISTORY_TURNS + 1 }, () => ({
      role: 'user',
      content: 'hi',
    }))
    const result = validatePayload({ question: 'hi', history })
    assert.equal(result.valid, false)
  })

  test('accepts history at exactly the max turns', () => {
    const history = Array.from({ length: LIMITS.MAX_HISTORY_TURNS }, () => ({
      role: 'user',
      content: 'hi',
    }))
    const result = validatePayload({ question: 'hi', history })
    assert.equal(result.valid, true)
  })

  test('rejects a malformed history entry', () => {
    assert.equal(
      validatePayload({ question: 'hi', history: [{ role: 'bot', content: 'hi' }] }).valid,
      false,
    )
    assert.equal(
      validatePayload({ question: 'hi', history: [{ role: 'user' }] }).valid,
      false,
    )
  })

  test('trims the question and defaults history/accessCode', () => {
    const result = validatePayload({ question: '  what are your hours?  ' })
    assert.equal(result.valid, true)
    assert.equal(result.question, 'what are your hours?')
    assert.deepEqual(result.history, [])
    assert.equal(result.accessCode, '')
  })
})

describe('timingSafeEqualStrings', () => {
  test('returns true for equal strings', () => {
    assert.equal(timingSafeEqualStrings('secret-code', 'secret-code'), true)
  })

  test('returns false for different strings', () => {
    assert.equal(timingSafeEqualStrings('secret-code', 'wrong-code'), false)
  })

  test('returns false for strings of different lengths', () => {
    assert.equal(timingSafeEqualStrings('short', 'a-much-longer-string'), false)
  })

  test('returns false when compared against undefined/empty', () => {
    assert.equal(timingSafeEqualStrings('secret-code', undefined), false)
    assert.equal(timingSafeEqualStrings('', ''), true)
  })
})

describe('getRequestBodySize', () => {
  test('uses the content-length header when present', () => {
    const req = { headers: { 'content-length': '123' } }
    assert.equal(getRequestBodySize(req, {}), 123)
  })

  test('falls back to measuring the parsed body', () => {
    const req = { headers: {} }
    const body = { question: 'hi' }
    assert.equal(getRequestBodySize(req, body), Buffer.byteLength(JSON.stringify(body)))
  })
})

describe('getVisitorKey', () => {
  test('uses the first x-forwarded-for entry', () => {
    const req = { headers: { 'x-forwarded-for': '203.0.113.5, 10.0.0.1' }, socket: {} }
    assert.equal(getVisitorKey(req), '203.0.113.5')
  })

  test('falls back to the socket remote address', () => {
    const req = { headers: {}, socket: { remoteAddress: '127.0.0.1' } }
    assert.equal(getVisitorKey(req), '127.0.0.1')
  })

  test('falls back to "unknown" with no signal at all', () => {
    const req = { headers: {}, socket: {} }
    assert.equal(getVisitorKey(req), 'unknown')
  })
})

describe('checkRateLimit', () => {
  test('allows requests under the limit', () => {
    const store = new Map()
    const limits = { RATE_LIMIT_WINDOW_MS: 1000, RATE_LIMIT_MAX_REQUESTS: 3 }
    assert.equal(checkRateLimit(store, 'visitor-a', 0, limits).allowed, true)
    assert.equal(checkRateLimit(store, 'visitor-a', 10, limits).allowed, true)
    assert.equal(checkRateLimit(store, 'visitor-a', 20, limits).allowed, true)
  })

  test('blocks once the limit is reached within the window', () => {
    const store = new Map()
    const limits = { RATE_LIMIT_WINDOW_MS: 1000, RATE_LIMIT_MAX_REQUESTS: 2 }
    assert.equal(checkRateLimit(store, 'visitor-b', 0, limits).allowed, true)
    assert.equal(checkRateLimit(store, 'visitor-b', 10, limits).allowed, true)
    assert.equal(checkRateLimit(store, 'visitor-b', 20, limits).allowed, false)
  })

  test('resets after the window elapses', () => {
    const store = new Map()
    const limits = { RATE_LIMIT_WINDOW_MS: 1000, RATE_LIMIT_MAX_REQUESTS: 1 }
    assert.equal(checkRateLimit(store, 'visitor-c', 0, limits).allowed, true)
    assert.equal(checkRateLimit(store, 'visitor-c', 500, limits).allowed, false)
    assert.equal(checkRateLimit(store, 'visitor-c', 1500, limits).allowed, true)
  })

  test('tracks separate visitors independently', () => {
    const store = new Map()
    const limits = { RATE_LIMIT_WINDOW_MS: 1000, RATE_LIMIT_MAX_REQUESTS: 1 }
    assert.equal(checkRateLimit(store, 'visitor-d', 0, limits).allowed, true)
    assert.equal(checkRateLimit(store, 'visitor-e', 0, limits).allowed, true)
  })
})

describe('demo retrieval', () => {
  test('loads at least the documented policy sections', () => {
    const sections = loadPolicySections()
    const headings = sections.map((s) => s.heading)
    for (const expected of ['Shipping', 'Returns', 'Refunds', 'Warranty', 'Payment Methods']) {
      assert.ok(headings.includes(expected), `expected a "${expected}" section`)
    }
  })

  test('matches a shipping question to the Shipping section', () => {
    const result = retrieveDemoAnswer('How much does shipping cost?')
    assert.equal(result.section, 'Shipping')
  })

  test('matches a returns question to the Returns section', () => {
    const result = retrieveDemoAnswer('What is your return window?')
    assert.equal(result.section, 'Returns')
  })

  test('matches a warranty question to the Warranty section', () => {
    const result = retrieveDemoAnswer('Is furniture covered by a warranty?')
    assert.equal(result.section, 'Warranty')
  })

  test('returns the handoff message for a documented gap (gift wrapping)', () => {
    const result = retrieveDemoAnswer('Do you offer gift wrapping?')
    assert.equal(result.section, null)
    assert.match(result.answer, /connect you with our team/)
  })

  test('returns the handoff message for a documented gap (price matching)', () => {
    const result = retrieveDemoAnswer('Will you price match a competitor?')
    assert.equal(result.section, null)
    assert.match(result.answer, /connect you with our team/)
  })

  test('returns the handoff message for a nonsense question', () => {
    const result = retrieveDemoAnswer('asdkjhasdkjh qwoiuqwoiu')
    assert.equal(result.section, null)
  })
})

describe('handler rate limiting (direct, in-process)', () => {
  // Calls the real exported handler repeatedly in this one Node process, so
  // the module-level rateLimitStore actually persists between calls — unlike
  // an HTTP request through `vercel dev`, which was observed to spawn a new
  // OS process per request locally and reset all in-memory state each time.
  test('eventually rejects a visitor sending too many requests too fast', async () => {
    const visitor = 'handler-rate-limit-test'
    const statuses = []
    for (let i = 0; i < LIMITS.RATE_LIMIT_MAX_REQUESTS + 5; i += 1) {
      const res = createMockRes()
      await handler(createMockReq(visitor), res)
      statuses.push(res.statusCode)
    }
    assert.ok(statuses.includes(429), `expected a 429 among: ${statuses.join(', ')}`)
  })

  test('does not rate-limit a visitor under the threshold', async () => {
    const visitor = 'handler-rate-limit-ok-test'
    const statuses = []
    for (let i = 0; i < LIMITS.RATE_LIMIT_MAX_REQUESTS - 1; i += 1) {
      const res = createMockRes()
      await handler(createMockReq(visitor), res)
      statuses.push(res.statusCode)
    }
    assert.ok(statuses.every((s) => s === 200))
  })
})
