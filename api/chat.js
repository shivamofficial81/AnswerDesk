import { createHash, timingSafeEqual as nodeTimingSafeEqual } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

export const LIMITS = {
  MAX_QUESTION_LENGTH: 500,
  MAX_HISTORY_TURNS: 6,
  MAX_BODY_BYTES: 8 * 1024,
  RATE_LIMIT_WINDOW_MS: 60_000,
  RATE_LIMIT_MAX_REQUESTS: 20,
  MIN_SCORE: 2,
}

const HANDOFF_MESSAGE =
  "I don't have that information — would you like me to connect you with our team?"

// docs/hearth-policies.md is a real file on disk, not bundled via import, so
// production deploys must ensure Vercel's file tracer includes it (e.g. a
// vercel.json "includeFiles" entry) before this stops working post-deploy.
const DOCS_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'docs',
  'hearth-policies.md',
)

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'can', 'do', 'does',
  'for', 'from', 'have', 'how', 'i', 'if', 'in', 'is', 'it', 'me', 'my', 'of',
  'on', 'or', 'our', 'please', 'that', 'the', 'their', 'there', 'these',
  'this', 'to', 'was', 'we', 'what', 'when', 'where', 'which', 'who', 'will',
  'with', 'would', 'you', 'your',
])

// Best-effort, per-instance only: a serverless platform can route requests to
// several concurrent instances, or recycle one, so this never adds up to a
// real global ceiling — it just keeps a single hot instance from being
// hammered. The real cost ceiling is the prepaid API balance with
// auto-reload off.
//
// Anchored on globalThis, not a plain module-level variable: some dev/edge
// runtimes (observed with `vercel dev`) re-evaluate this module on every
// invocation even within one warm process, which would silently reset a
// module-level Map on every request and make the limiter a no-op. globalThis
// survives module re-evaluation as long as the process itself is alive.
const rateLimitStore = (globalThis.__answerdeskRateLimitStore ??= new Map())

// Crude suffix stripping, not a real stemmer — just enough to line up
// "returns"/"return" and "shipping"/"ships" so plural/singular mismatches
// between a question and a doc heading don't tank an otherwise-good match.
function stem(word) {
  if (word.length > 4 && word.endsWith('ing')) return word.slice(0, -3)
  if (word.length > 3 && word.endsWith('es')) return word.slice(0, -2)
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1)
  return word
}

function tokenize(text) {
  const matches = String(text).toLowerCase().match(/[a-z0-9']+/g) || []
  return matches.filter((word) => !STOPWORDS.has(word)).map(stem)
}

export function timingSafeEqualStrings(a, b) {
  const hashA = createHash('sha256').update(String(a ?? '')).digest()
  const hashB = createHash('sha256').update(String(b ?? '')).digest()
  return nodeTimingSafeEqual(hashA, hashB)
}

export function getRequestBodySize(req, body) {
  const contentLength = req.headers?.['content-length']
  if (contentLength !== undefined) {
    const parsed = Number(contentLength)
    if (Number.isFinite(parsed)) return parsed
  }
  return Buffer.byteLength(JSON.stringify(body ?? {}))
}

// @vercel/node's `req.body` is a lazy getter that parses JSON on first
// access and THROWS synchronously on malformed JSON — uncaught, that
// exception crashes the whole dev/production process, not just this one
// request. Every access has to go through here.
function readBody(req) {
  try {
    return { ok: true, body: req.body }
  } catch {
    return { ok: false, body: undefined }
  }
}

export function validatePayload(body) {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { valid: false, error: 'Request body must be a JSON object.' }
  }

  const { question, history } = body

  if (typeof question !== 'string' || question.trim().length === 0) {
    return { valid: false, error: 'Please include a question.' }
  }
  if (question.length > LIMITS.MAX_QUESTION_LENGTH) {
    return {
      valid: false,
      error: `Questions must be ${LIMITS.MAX_QUESTION_LENGTH} characters or fewer — please shorten your question.`,
    }
  }

  let normalizedHistory = []
  if (history !== undefined) {
    if (!Array.isArray(history)) {
      return { valid: false, error: 'Conversation history must be a list.' }
    }
    if (history.length > LIMITS.MAX_HISTORY_TURNS) {
      return {
        valid: false,
        error: `This conversation has gotten too long for me to keep track of — please start a new conversation.`,
      }
    }
    for (const turn of history) {
      if (
        typeof turn !== 'object' ||
        turn === null ||
        (turn.role !== 'user' && turn.role !== 'assistant') ||
        typeof turn.content !== 'string'
      ) {
        return { valid: false, error: 'Conversation history is malformed.' }
      }
    }
    normalizedHistory = history
  }

  const accessCode = typeof body.accessCode === 'string' ? body.accessCode : ''

  return {
    valid: true,
    question: question.trim(),
    history: normalizedHistory,
    accessCode,
  }
}

export function checkRateLimit(store, key, now, limits = LIMITS) {
  const entry = store.get(key)
  if (!entry || now - entry.windowStart >= limits.RATE_LIMIT_WINDOW_MS) {
    store.set(key, { windowStart: now, count: 1 })
    return { allowed: true }
  }
  if (entry.count >= limits.RATE_LIMIT_MAX_REQUESTS) {
    return { allowed: false }
  }
  entry.count += 1
  return { allowed: true }
}

export function getVisitorKey(req) {
  const forwarded = req.headers?.['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim()
  }
  return req.socket?.remoteAddress ?? 'unknown'
}

let cachedSections = null

export function loadPolicySections() {
  if (cachedSections) return cachedSections
  const raw = readFileSync(DOCS_PATH, 'utf8')
  const headingPattern = /^##\s+(.+)$/gm
  const sections = []
  let match
  let lastIndex = -1
  let lastHeading = null

  while ((match = headingPattern.exec(raw)) !== null) {
    if (lastHeading !== null) {
      sections.push({
        heading: lastHeading,
        body: raw.slice(lastIndex, match.index).trim(),
      })
    }
    lastHeading = match[1].trim()
    lastIndex = headingPattern.lastIndex
  }
  if (lastHeading !== null) {
    sections.push({ heading: lastHeading, body: raw.slice(lastIndex).trim() })
  }

  cachedSections = sections
  return sections
}

export function scoreSection(questionTokens, section) {
  const headingTokens = tokenize(section.heading)
  const bodyTokens = new Set(tokenize(section.body))
  let score = 0
  for (const token of questionTokens) {
    if (headingTokens.includes(token)) score += 2
    else if (bodyTokens.has(token)) score += 1
  }
  return score
}

export function retrieveDemoAnswer(question) {
  const sections = loadPolicySections()
  const questionTokens = tokenize(question)

  let best = null
  for (const section of sections) {
    const score = scoreSection(questionTokens, section)
    if (!best || score > best.score) {
      best = { section, score }
    }
  }

  if (!best || best.score < LIMITS.MIN_SCORE) {
    return { answer: HANDOFF_MESSAGE, section: null }
  }

  return { answer: best.section.body, section: best.section.heading }
}

// Placeholder for the real Anthropic API call. Left unimplemented on
// purpose — wiring this up is a separate task. It currently reuses demo
// retrieval so the "live" response contract can be exercised end-to-end
// without spending on the Claude API.
async function callClaudeStub({ question }) {
  return retrieveDemoAnswer(question)
}

function sendJson(res, status, payload) {
  res.status(status).json(payload)
}

async function handleChat(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Only POST requests are supported.' })
  }

  const { ok: bodyOk, body } = readBody(req)
  if (!bodyOk) {
    return sendJson(res, 400, {
      error: 'That request could not be understood — please check the message format.',
    })
  }

  const bodySize = getRequestBodySize(req, body)
  if (bodySize > LIMITS.MAX_BODY_BYTES) {
    return sendJson(res, 413, {
      error: 'That request is too large — please send a shorter message.',
    })
  }

  const visitorKey = getVisitorKey(req)
  const rateLimit = checkRateLimit(rateLimitStore, visitorKey, Date.now())
  if (!rateLimit.allowed) {
    return sendJson(res, 429, {
      error: "You're sending messages a little too fast — please wait a moment and try again.",
    })
  }

  const validation = validatePayload(body)
  if (!validation.valid) {
    return sendJson(res, 400, { error: validation.error })
  }

  const hasApiKey = Boolean(process.env.ANTHROPIC_API_KEY)
  const hasValidAccessCode =
    Boolean(process.env.ACCESS_CODE) &&
    Boolean(validation.accessCode) &&
    timingSafeEqualStrings(validation.accessCode, process.env.ACCESS_CODE)

  const mode = hasApiKey && hasValidAccessCode ? 'live' : 'demo'

  const result =
    mode === 'live'
      ? await callClaudeStub({ question: validation.question, history: validation.history })
      : retrieveDemoAnswer(validation.question)

  return sendJson(res, 200, {
    mode,
    answer: result.answer,
    section: result.section,
  })
}

export default async function handler(req, res) {
  try {
    await handleChat(req, res)
  } catch (err) {
    // Never log question content (privacy rule) — error type and status only.
    console.error('chat handler error:', err?.name ?? 'UnknownError')
    if (!res.headersSent) {
      sendJson(res, 500, { error: 'Something went wrong — please try again in a moment.' })
    }
  }
}
