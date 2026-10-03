export const MAX_QUESTION_LENGTH = 500

export const MESSAGES = {
  rateLimit: "You're sending messages a little too fast. Wait a moment, then try again.",
  tooLong: `Questions must be ${MAX_QUESTION_LENGTH} characters or fewer. Shorten your question and try again.`,
  unavailable:
    'The assistant is unavailable right now. Try again in a moment, or email support@hearthandco.com.',
}

const HANDOFF_PREFIX = "I don't have that information"

export function isHandoff(answer) {
  return typeof answer === 'string' && answer.startsWith(HANDOFF_PREFIX)
}

export async function askChat({ question, accessCode }) {
  const body = accessCode ? { question, accessCode } : { question }

  let response
  try {
    response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    return { ok: false, message: MESSAGES.unavailable }
  }

  if (response.status === 429) return { ok: false, message: MESSAGES.rateLimit }
  if (response.status === 413) return { ok: false, message: MESSAGES.tooLong }

  let data = null
  try {
    data = await response.json()
  } catch {
    data = null
  }

  if (response.status === 400) {
    return { ok: false, message: data?.error ?? MESSAGES.tooLong }
  }

  if (!response.ok || typeof data?.answer !== 'string') {
    return { ok: false, message: MESSAGES.unavailable }
  }

  return {
    ok: true,
    answer: data.answer,
    section: typeof data.section === 'string' ? data.section : null,
    mode: data.mode === 'live' ? 'live' : 'demo',
  }
}
