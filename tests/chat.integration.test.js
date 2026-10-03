// Integration tests against a running `vercel dev` instance.
//
// These hit real HTTP, so each test group sends its own x-vercel-forwarded-for
// value as a distinct "visitor". vercel dev does not set that header itself,
// so the value is what the limiter keys on here. The rate limiter is covered
// in-process in chat.unit.test.js, because vercel dev starts a fresh process
// per request and in-memory state never carries over between HTTP calls.
//
// Run with a `vercel dev` server already up (see README / package.json):
//   npm run test:integration
import { test, describe, before } from 'node:test'
import assert from 'node:assert/strict'

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000'
const VALID_ACCESS_CODE = 'test-local-access-code-123'

async function post(body, { visitor = 'default', headers = {}, rawBody } = {}) {
  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-vercel-forwarded-for': visitor,
      ...headers,
    },
    body: rawBody !== undefined ? rawBody : JSON.stringify(body),
  })
  let json = null
  try {
    json = await res.json()
  } catch {
    // some rejection paths may not return JSON; tests check status alone then
  }
  return { status: res.status, json }
}

before(async () => {
  const res = await fetch(BASE_URL).catch(() => null)
  if (!res) {
    throw new Error(
      `Could not reach ${BASE_URL} — start \`vercel dev\` before running integration tests.`,
    )
  }
})

describe('request validation', () => {
  test('rejects non-POST methods', async () => {
    const res = await fetch(`${BASE_URL}/api/chat`, {
      method: 'GET',
      headers: { 'x-vercel-forwarded-for': 'method-test' },
    })
    assert.equal(res.status, 405)
  })

  test('rejects an oversized body', async () => {
    const hugeQuestion = 'a'.repeat(20_000)
    const { status } = await post(
      { question: hugeQuestion },
      { visitor: 'oversized-test' },
    )
    assert.equal(status, 413)
  })

  test('rejects a missing question', async () => {
    const { status, json } = await post({}, { visitor: 'missing-q-test' })
    assert.equal(status, 400)
    assert.ok(json.error)
  })

  test('rejects a question over the max length', async () => {
    const { status } = await post(
      { question: 'a'.repeat(501) },
      { visitor: 'long-q-test' },
    )
    assert.equal(status, 400)
  })

  test('rejects history over the max turns', async () => {
    const history = Array.from({ length: 7 }, () => ({ role: 'user', content: 'hi' }))
    const { status } = await post(
      { question: 'What are your hours?', history },
      { visitor: 'long-history-test' },
    )
    assert.equal(status, 400)
  })

  test('rejects a malformed history entry', async () => {
    const { status } = await post(
      { question: 'What are your hours?', history: [{ role: 'bot', content: 'hi' }] },
      { visitor: 'bad-history-test' },
    )
    assert.equal(status, 400)
  })

  test('rejects invalid JSON', async () => {
    const { status } = await post(null, {
      visitor: 'bad-json-test',
      rawBody: '{not valid json',
    })
    assert.equal(status, 400)
  })
})

describe('demo mode retrieval', () => {
  test('answers a shipping question from the Shipping section in demo mode', async () => {
    const { status, json } = await post(
      { question: 'How much does shipping cost?' },
      { visitor: 'shipping-test' },
    )
    assert.equal(status, 200)
    assert.equal(json.mode, 'demo')
    assert.equal(json.section, 'Shipping')
    assert.ok(json.answer.length > 0)
  })

  test('answers a returns question from the Returns section in demo mode', async () => {
    const { status, json } = await post(
      { question: 'What is your return window?' },
      { visitor: 'returns-test' },
    )
    assert.equal(status, 200)
    assert.equal(json.mode, 'demo')
    assert.equal(json.section, 'Returns')
  })

  test('hands off on a documented gap (gift wrapping)', async () => {
    const { status, json } = await post(
      { question: 'Do you offer gift wrapping?' },
      { visitor: 'gift-wrap-test' },
    )
    assert.equal(status, 200)
    assert.equal(json.mode, 'demo')
    assert.equal(json.section, null)
    assert.match(json.answer, /connect you with our team/)
  })

  test('hands off on a documented gap (price matching)', async () => {
    const { status, json } = await post(
      { question: 'Will you price match a competitor?' },
      { visitor: 'price-match-test' },
    )
    assert.equal(status, 200)
    assert.equal(json.section, null)
  })
})

describe('mode decision', () => {
  test('stays in demo mode with no access code', async () => {
    const { json } = await post(
      { question: 'What are your hours?' },
      { visitor: 'no-code-test' },
    )
    assert.equal(json.mode, 'demo')
  })

  test('stays in demo mode with a wrong access code', async () => {
    const { json } = await post(
      { question: 'What are your hours?', accessCode: 'definitely-wrong' },
      { visitor: 'wrong-code-test' },
    )
    assert.equal(json.mode, 'demo')
  })

  test('attempts live mode with a valid access code, fails gracefully without a real key, never leaks it', async () => {
    // This .env.local key is a placeholder, not a real Anthropic key — live
    // mode is genuinely wired to the real SDK now, so this call really
    // reaches (and is rejected by) the Anthropic API. That's deliberate:
    // spending real API cost to verify a successful live answer end-to-end
    // wasn't requested, so this only verifies the mode decision reached the
    // live path and failed cleanly (no crash, no key leak) rather than
    // silently falling back to demo. See tests/chat.live.test.js for the
    // fully mocked, no-network verification of live mode's actual behavior.
    const { status, json } = await post(
      { question: 'What are your hours?', accessCode: VALID_ACCESS_CODE },
      { visitor: 'valid-code-test' },
    )
    assert.equal(status, 500)
    assert.doesNotMatch(JSON.stringify(json), /FAKE_TEST_KEY_not_real/)
  })
})

// No rate-limit test here: `vercel dev` was observed spawning a brand-new
// OS process for every single /api/chat request locally (confirmed via
// process.pid logging — a different PID on every call), so the in-memory
// rate-limit store can never carry state between two HTTP calls in this
// dev environment, unlike a real deployed instance that stays warm across
// nearby requests. Rate-limit behavior is verified instead by calling the
// exported `handler` directly, in-process, in chat.unit.test.js.
