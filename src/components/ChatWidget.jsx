import { useEffect, useRef, useState } from 'react'
import { ChatCircle, PaperPlaneRight, X } from '@phosphor-icons/react'
import { askChat, isHandoff, MAX_QUESTION_LENGTH, MESSAGES } from '../lib/chatClient.js'

const GREETING =
  'Hi, I can answer questions about shipping, returns, refunds, warranties, and order tracking. What would you like to know?'

const SUGGESTIONS = [
  'What is your return window?',
  'How much is standard shipping?',
  'Do you offer gift wrapping?',
  'How do I track my order?',
]

let nextId = 1
const newId = () => nextId++

function ChatMessage({ message }) {
  if (message.role === 'user') {
    return (
      <li className="chat-row chat-row-user">
        <p className="bubble bubble-user">{message.text}</p>
      </li>
    )
  }

  if (message.role === 'error') {
    return (
      <li className="chat-row">
        <p className="bubble bubble-error" role="alert">
          {message.text}
        </p>
      </li>
    )
  }

  return (
    <li className="chat-row">
      <div className="bubble bubble-assistant">
        <p>{message.text}</p>
        {message.handoff && (
          <p className="handoff-action">
            <a href="mailto:support@hearthandco.example">Email support@hearthandco.example</a>
          </p>
        )}
        {message.section && <span className="citation">Source: {message.section}</span>}
      </div>
    </li>
  )
}

export default function ChatWidget() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([{ id: newId(), role: 'assistant', text: GREETING }])
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState(false)
  const [mode, setMode] = useState('demo')
  const [showAccess, setShowAccess] = useState(false)
  const [accessCode, setAccessCode] = useState('')

  const launcherRef = useRef(null)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  const hasUserMessage = messages.some((m) => m.role === 'user')
  const overLimit = draft.length > MAX_QUESTION_LENGTH
  const canSend = draft.trim().length > 0 && !overLimit && !pending

  useEffect(() => {
    if (!listRef.current) return
    listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages, pending])

  useEffect(() => {
    if (open) {
      inputRef.current?.focus()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (event) => {
      if (event.key === 'Escape') {
        setOpen(false)
        launcherRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  async function send(text) {
    const question = text.trim()
    if (!question || pending) return
    if (question.length > MAX_QUESTION_LENGTH) {
      setMessages((prev) => [...prev, { id: newId(), role: 'error', text: MESSAGES.tooLong }])
      return
    }

    setMessages((prev) => [...prev, { id: newId(), role: 'user', text: question }])
    setDraft('')
    setPending(true)

    const result = await askChat({ question, accessCode })

    setPending(false)
    if (!result.ok) {
      setMessages((prev) => [...prev, { id: newId(), role: 'error', text: result.message }])
      return
    }

    setMode(result.mode)
    setMessages((prev) => [
      ...prev,
      {
        id: newId(),
        role: 'assistant',
        text: result.answer,
        section: result.section,
        handoff: isHandoff(result.answer),
      },
    ])
  }

  function handleSubmit(event) {
    event.preventDefault()
    send(draft)
  }

  return (
    <>
      <button
        ref={launcherRef}
        type="button"
        className={open ? 'chat-launcher is-hidden' : 'chat-launcher'}
        aria-expanded={open}
        aria-controls="chat-panel"
        onClick={() => setOpen(true)}
      >
        <ChatCircle size={20} weight="regular" aria-hidden="true" />
        <span>Ask a question</span>
      </button>

      {open && (
        <section id="chat-panel" className="chat-panel" aria-label="Hearth and Co. support chat">
          <header className="chat-header">
            <div className="chat-title">
              <h2>Hearth &amp; Co. support</h2>
              <span
                className={`mode-badge mode-${mode}`}
                title={
                  mode === 'live'
                    ? 'Live: answers come from the AI model, using the policy document.'
                    : 'Demo: answers come from keyword search of the policy document. No AI calls.'
                }
              >
                {mode === 'live' ? 'Live' : 'Demo'}
              </span>
            </div>
            <button
              type="button"
              className="icon-button"
              aria-label="Close chat"
              onClick={() => {
                setOpen(false)
                launcherRef.current?.focus()
              }}
            >
              <X size={18} weight="regular" aria-hidden="true" />
            </button>
          </header>

          <ul ref={listRef} className="chat-list" aria-live="polite">
            {messages.map((message) => (
              <ChatMessage key={message.id} message={message} />
            ))}
            {pending && (
              <li className="chat-row" aria-label="Answer loading">
                <div className="bubble bubble-assistant skeleton" aria-hidden="true">
                  <span className="skeleton-line" />
                  <span className="skeleton-line short" />
                </div>
              </li>
            )}
          </ul>

          {!hasUserMessage && (
            <div className="suggestions" role="group" aria-label="Suggested questions">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className="chip"
                  disabled={pending}
                  onClick={() => send(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}

          <form className="chat-form" onSubmit={handleSubmit}>
            <label className="field-label" htmlFor="chat-input">
              Your question
            </label>
            <div className="input-row">
              <input
                id="chat-input"
                ref={inputRef}
                type="text"
                className="chat-input"
                value={draft}
                autoComplete="off"
                placeholder="Ask about shipping, returns, or orders"
                aria-invalid={overLimit}
                aria-describedby="chat-counter"
                onChange={(event) => setDraft(event.target.value)}
              />
              <button type="submit" className="send-button" disabled={!canSend}>
                <PaperPlaneRight size={18} weight="regular" aria-hidden="true" />
                <span className="visually-hidden">Send question</span>
              </button>
            </div>
            <div className="input-meta">
              <span id="chat-counter" className={overLimit ? 'counter counter-over' : 'counter'}>
                {draft.length} / {MAX_QUESTION_LENGTH}
              </span>
              {overLimit && <span className="input-error">{MESSAGES.tooLong}</span>}
            </div>
          </form>

          <div className="access-area">
            <button
              type="button"
              className="text-button"
              aria-expanded={showAccess}
              onClick={() => setShowAccess((value) => !value)}
            >
              Have an access code?
            </button>
            {showAccess && (
              <div className="access-field">
                <label className="field-label" htmlFor="access-code">
                  Access code
                </label>
                <input
                  id="access-code"
                  type="password"
                  className="chat-input"
                  value={accessCode}
                  autoComplete="off"
                  onChange={(event) => setAccessCode(event.target.value)}
                />
                <p className="helper-text">
                  Kept in this page only. It is not saved, and it clears when you reload.
                </p>
              </div>
            )}
          </div>
        </section>
      )}
    </>
  )
}
