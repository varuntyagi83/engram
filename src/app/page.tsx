'use client'

import React, { useState, useEffect, useRef } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────

type MemoryType = 'episodic' | 'semantic' | 'preference' | 'procedural'

interface Memory {
  id: string
  userId: string
  type: MemoryType
  content: string
  importance: number
  relevanceScore: number
  sessionId: string | null
  tags: string[]
  decayedAt: string | null
  createdAt: string
  updatedAt: string
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

type TabId = 'chat' | 'memory' | 'threads' | 'profile' | 'system-prompt'

// ── Sample thread data for Threads tab placeholder ─────────────────────────

interface SampleThread {
  id: string
  title: string
  status: string
  priority: string
  createdAt: string
}

const SAMPLE_THREADS: SampleThread[] = [
  { id: '1', title: 'Review API authentication approach', status: 'open', priority: 'high', createdAt: '2026-03-14' },
  { id: '2', title: 'Decide on embedding model for Pro tier', status: 'in_progress', priority: 'medium', createdAt: '2026-03-15' },
  { id: '3', title: 'Write onboarding docs for SDK', status: 'open', priority: 'low', createdAt: '2026-03-16' },
]

// ── Shared styles ──────────────────────────────────────────────────────────

const s = {
  container: {
    minHeight: '100vh',
    background: '#0f0f0f',
    color: '#e5e5e5',
    fontFamily: 'system-ui, sans-serif',
  } as React.CSSProperties,

  header: {
    borderBottom: '1px solid #2a2a2a',
    padding: '16px 24px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  } as React.CSSProperties,

  headerTitle: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#ffffff',
    margin: 0,
  } as React.CSSProperties,

  headerSub: {
    fontSize: '13px',
    color: '#888',
    margin: 0,
  } as React.CSSProperties,

  tabBar: {
    display: 'flex',
    borderBottom: '1px solid #2a2a2a',
    padding: '0 24px',
    gap: '4px',
  } as React.CSSProperties,

  tabBtn: (active: boolean): React.CSSProperties => ({
    padding: '12px 18px',
    background: 'none',
    border: 'none',
    borderBottom: active ? '2px solid #7c6af7' : '2px solid transparent',
    color: active ? '#ffffff' : '#888',
    fontSize: '14px',
    fontWeight: active ? 600 : 400,
    cursor: 'pointer',
    transition: 'color 0.15s',
    marginBottom: '-1px',
  }),

  content: {
    padding: '24px',
    maxWidth: '900px',
    margin: '0 auto',
  } as React.CSSProperties,

  input: {
    background: '#1a1a1a',
    border: '1px solid #333',
    borderRadius: '8px',
    color: '#e5e5e5',
    padding: '10px 14px',
    fontSize: '14px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  } as React.CSSProperties,

  textarea: {
    background: '#1a1a1a',
    border: '1px solid #333',
    borderRadius: '8px',
    color: '#e5e5e5',
    padding: '10px 14px',
    fontSize: '14px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    resize: 'vertical',
    fontFamily: 'inherit',
  } as React.CSSProperties,

  select: {
    background: '#1a1a1a',
    border: '1px solid #333',
    borderRadius: '8px',
    color: '#e5e5e5',
    padding: '10px 14px',
    fontSize: '14px',
    outline: 'none',
    cursor: 'pointer',
  } as React.CSSProperties,

  btn: {
    background: '#7c6af7',
    border: 'none',
    borderRadius: '8px',
    color: '#ffffff',
    padding: '10px 18px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background 0.15s',
    whiteSpace: 'nowrap',
  } as React.CSSProperties,

  btnSecondary: {
    background: '#2a2a2a',
    border: '1px solid #333',
    borderRadius: '8px',
    color: '#e5e5e5',
    padding: '8px 14px',
    fontSize: '13px',
    cursor: 'pointer',
    transition: 'background 0.15s',
    whiteSpace: 'nowrap',
  } as React.CSSProperties,

  btnDanger: {
    background: 'transparent',
    border: '1px solid #ef4444',
    borderRadius: '6px',
    color: '#ef4444',
    padding: '4px 10px',
    fontSize: '12px',
    cursor: 'pointer',
    transition: 'background 0.15s',
  } as React.CSSProperties,

  card: {
    background: '#1a1a1a',
    border: '1px solid #2a2a2a',
    borderRadius: '10px',
    padding: '16px',
  } as React.CSSProperties,

  badge: (type: MemoryType): React.CSSProperties => {
    const colors: Record<MemoryType, string> = {
      episodic: '#7c6af7',
      semantic: '#06b6d4',
      preference: '#f59e0b',
      procedural: '#22c55e',
    }
    return {
      display: 'inline-block',
      background: colors[type] + '22',
      border: `1px solid ${colors[type]}44`,
      color: colors[type],
      borderRadius: '4px',
      padding: '2px 8px',
      fontSize: '11px',
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
    }
  },

  banner: {
    background: '#7c6af722',
    border: '1px solid #7c6af744',
    borderRadius: '8px',
    padding: '10px 14px',
    fontSize: '13px',
    color: '#a89cf7',
    marginBottom: '16px',
  } as React.CSSProperties,

  errorBanner: {
    background: '#ef444422',
    border: '1px solid #ef444444',
    borderRadius: '8px',
    padding: '10px 14px',
    fontSize: '13px',
    color: '#f87171',
    marginBottom: '16px',
  } as React.CSSProperties,

  label: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    display: 'block',
    marginBottom: '6px',
  } as React.CSSProperties,

  sectionTitle: {
    fontSize: '15px',
    fontWeight: 600,
    color: '#ffffff',
    margin: '0 0 16px 0',
  } as React.CSSProperties,
}

// ── Tab 1: Chat ────────────────────────────────────────────────────────────

function ChatTab() {
  const userId = 'varun'
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [memoriesExtracted, setMemoriesExtracted] = useState(0)
  const [sessionId] = useState<string>(`sess_${Date.now()}`)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  async function sendMessage() {
    const trimmed = input.trim()
    if (!trimmed || loading) return

    const userMsg: ChatMessage = { role: 'user', content: trimmed }
    const nextMessages = [...messages, userMsg]
    setMessages(nextMessages)
    setInput('')
    setLoading(true)
    setError(null)

    try {
      const conversationHistory = nextMessages.slice(0, -1).map(m => ({
        role: m.role as 'system' | 'user' | 'assistant',
        content: m.content,
      }))

      const res = await fetch('/api/memory/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          message: trimmed,
          conversationHistory,
          sessionId,
        }),
      })

      const data = (await res.json()) as { reply?: string; memoriesExtracted?: number; error?: string }

      if (!res.ok) {
        setError(data.error ?? 'Chat request failed')
        setMessages(prev => prev.slice(0, -1))
        return
      }

      setMemoriesExtracted(data.memoriesExtracted ?? 0)
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply ?? '' }])
    } catch {
      setError('Network error — could not reach the server')
      setMessages(prev => prev.slice(0, -1))
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void sendMessage()
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)' }}>
      {error && <div style={s.errorBanner}>{error}</div>}

      {memoriesExtracted > 0 && (
        <div style={s.banner}>
          {memoriesExtracted} {memoriesExtracted === 1 ? 'memory' : 'memories'} extracted from last response
        </div>
      )}

      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          paddingBottom: '16px',
        }}
      >
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: '#555', marginTop: '80px' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>&#129504;</div>
            <p style={{ margin: 0, fontSize: '15px' }}>Start a conversation. Memories are extracted automatically.</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
            }}
          >
            <div
              style={{
                maxWidth: '72%',
                background: msg.role === 'user' ? '#7c6af7' : '#1e1e1e',
                border: msg.role === 'user' ? 'none' : '1px solid #2a2a2a',
                borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                padding: '10px 14px',
                fontSize: '14px',
                lineHeight: '1.5',
                color: '#e5e5e5',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div
              style={{
                background: '#1e1e1e',
                border: '1px solid #2a2a2a',
                borderRadius: '16px 16px 16px 4px',
                padding: '10px 16px',
                color: '#666',
                fontSize: '14px',
              }}
            >
              Thinking...
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '10px', paddingTop: '12px', borderTop: '1px solid #2a2a2a' }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message... (Enter to send, Shift+Enter for newline)"
          rows={2}
          style={{ ...s.textarea, flex: 1 }}
          disabled={loading}
        />
        <button
          onClick={() => void sendMessage()}
          disabled={loading || !input.trim()}
          style={{
            ...s.btn,
            alignSelf: 'flex-end',
            opacity: loading || !input.trim() ? 0.5 : 1,
          }}
        >
          Send
        </button>
      </div>
    </div>
  )
}

// ── Tab 2: Memory ──────────────────────────────────────────────────────────

function MemoryTab() {
  const userId = 'varun'
  const [memories, setMemories] = useState<Memory[]>([])
  const [filter, setFilter] = useState<MemoryType | 'all'>('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Add form
  const [addType, setAddType] = useState<MemoryType>('semantic')
  const [addContent, setAddContent] = useState('')
  const [addImportance, setAddImportance] = useState<1 | 2 | 3 | 4 | 5>(3)
  const [addLoading, setAddLoading] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)

  async function fetchMemories(searchQuery?: string, typeFilter?: MemoryType | 'all') {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ userId, limit: '50' })
      if (searchQuery) params.set('search', searchQuery)
      const effectiveType = typeFilter ?? filter
      if (effectiveType !== 'all') params.set('type', effectiveType)

      const endpoint = searchQuery ? `/api/memory?${params}` : `/api/memory?${params}`
      const res = await fetch(endpoint)
      if (!res.ok) {
        const d = (await res.json()) as { error?: string }
        setError(d.error ?? 'Failed to fetch memories')
        return
      }
      const data = (await res.json()) as Memory[]
      setMemories(data)
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchMemories()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleFilterChange(newFilter: MemoryType | 'all') {
    setFilter(newFilter)
    void fetchMemories(search || undefined, newFilter)
  }

  function handleSearch(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    setSearch(val)
    if (val.length === 0 || val.length >= 2) {
      void fetchMemories(val || undefined, filter)
    }
  }

  async function deleteMemory(id: string) {
    try {
      const res = await fetch(`/api/memory?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (res.ok) {
        setMemories(prev => prev.filter(m => m.id !== id))
      }
    } catch {
      // silent
    }
  }

  async function addMemory() {
    if (!addContent.trim()) return
    setAddLoading(true)
    setAddError(null)
    try {
      const res = await fetch('/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          type: addType,
          content: addContent.trim(),
          importance: addImportance,
        }),
      })
      if (!res.ok) {
        const d = (await res.json()) as { error?: string }
        setAddError(d.error ?? 'Failed to add memory')
        return
      }
      setAddContent('')
      setAddImportance(3)
      setShowAddForm(false)
      void fetchMemories(search || undefined, filter)
    } catch {
      setAddError('Network error')
    } finally {
      setAddLoading(false)
    }
  }

  function stars(n: number) {
    return Array.from({ length: 5 }, (_, i) => (
      <span key={i} style={{ color: i < n ? '#f59e0b' : '#333', fontSize: '14px' }}>&#9733;</span>
    ))
  }

  const filterTypes: Array<MemoryType | 'all'> = ['all', 'episodic', 'semantic', 'preference', 'procedural']

  return (
    <div>
      {/* Controls row */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          style={{ ...s.input, maxWidth: '240px' }}
          placeholder="Search memories..."
          value={search}
          onChange={handleSearch}
        />
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {filterTypes.map(ft => (
            <button
              key={ft}
              onClick={() => handleFilterChange(ft)}
              style={{
                ...s.btnSecondary,
                background: filter === ft ? '#7c6af7' : '#2a2a2a',
                border: filter === ft ? '1px solid #7c6af7' : '1px solid #333',
                color: filter === ft ? '#fff' : '#aaa',
                textTransform: 'capitalize',
              }}
            >
              {ft}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowAddForm(prev => !prev)}
          style={{ ...s.btn, marginLeft: 'auto' }}
        >
          {showAddForm ? 'Cancel' : '+ Add Memory'}
        </button>
      </div>

      {/* Add form */}
      {showAddForm && (
        <div style={{ ...s.card, marginBottom: '24px' }}>
          <p style={s.sectionTitle}>Add Memory</p>
          {addError && <div style={{ ...s.errorBanner, marginBottom: '12px' }}>{addError}</div>}
          <div style={{ display: 'grid', gap: '12px' }}>
            <div>
              <label style={s.label}>Type</label>
              <select
                style={s.select}
                value={addType}
                onChange={e => setAddType(e.target.value as MemoryType)}
              >
                <option value="episodic">Episodic</option>
                <option value="semantic">Semantic</option>
                <option value="preference">Preference</option>
                <option value="procedural">Procedural</option>
              </select>
            </div>
            <div>
              <label style={s.label}>Content</label>
              <textarea
                style={{ ...s.textarea, minHeight: '80px' }}
                value={addContent}
                onChange={e => setAddContent(e.target.value)}
                placeholder="Enter memory content..."
              />
            </div>
            <div>
              <label style={s.label}>Importance (1–5)</label>
              <select
                style={s.select}
                value={addImportance}
                onChange={e => setAddImportance(parseInt(e.target.value, 10) as 1 | 2 | 3 | 4 | 5)}
              >
                {[1, 2, 3, 4, 5].map(n => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
            <button
              onClick={() => void addMemory()}
              disabled={addLoading || !addContent.trim()}
              style={{ ...s.btn, opacity: addLoading || !addContent.trim() ? 0.5 : 1, alignSelf: 'flex-start' }}
            >
              {addLoading ? 'Saving...' : 'Save Memory'}
            </button>
          </div>
        </div>
      )}

      {error && <div style={s.errorBanner}>{error}</div>}

      {loading ? (
        <div style={{ color: '#666', textAlign: 'center', padding: '40px' }}>Loading memories...</div>
      ) : memories.length === 0 ? (
        <div style={{ color: '#555', textAlign: 'center', padding: '40px' }}>
          No memories found. Start a chat to extract memories automatically.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '12px' }}>
          {memories.map(m => (
            <div key={m.id} style={s.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '8px' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={s.badge(m.type)}>{m.type}</span>
                  <span style={{ display: 'flex', gap: '1px' }}>{stars(m.importance)}</span>
                </div>
                <button
                  onClick={() => void deleteMemory(m.id)}
                  style={s.btnDanger}
                >
                  Delete
                </button>
              </div>
              <p style={{ margin: '0 0 8px 0', fontSize: '14px', lineHeight: '1.5', color: '#d0d0d0' }}>
                {m.content}
              </p>
              <div style={{ fontSize: '11px', color: '#555' }}>
                {new Date(m.createdAt).toLocaleString()}
                {m.tags && m.tags.length > 0 && (
                  <span style={{ marginLeft: '12px' }}>{m.tags.join(', ')}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Tab 3: Threads ─────────────────────────────────────────────────────────

function ThreadsTab() {
  const statusColors: Record<string, string> = {
    open: '#22c55e',
    in_progress: '#7c6af7',
    resolved: '#888',
    snoozed: '#f59e0b',
  }

  const priorityColors: Record<string, string> = {
    low: '#888',
    medium: '#06b6d4',
    high: '#f59e0b',
    critical: '#ef4444',
  }

  return (
    <div>
      <div style={{ ...s.banner, display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span>Threads will appear here once the threads API is ready.</span>
        <span style={{ color: '#666', fontSize: '12px' }}>Showing sample data below.</span>
      </div>

      <p style={s.sectionTitle}>Sample Threads</p>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #2a2a2a' }}>
            {['Title', 'Status', 'Priority', 'Created'].map(h => (
              <th
                key={h}
                style={{
                  textAlign: 'left',
                  padding: '10px 12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#888',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {SAMPLE_THREADS.map(t => (
            <tr
              key={t.id}
              style={{ borderBottom: '1px solid #1e1e1e', transition: 'background 0.1s' }}
            >
              <td style={{ padding: '12px', color: '#d0d0d0' }}>{t.title}</td>
              <td style={{ padding: '12px' }}>
                <span
                  style={{
                    display: 'inline-block',
                    background: (statusColors[t.status] ?? '#888') + '22',
                    border: `1px solid ${(statusColors[t.status] ?? '#888')}44`,
                    color: statusColors[t.status] ?? '#888',
                    borderRadius: '4px',
                    padding: '2px 8px',
                    fontSize: '11px',
                    fontWeight: 600,
                    textTransform: 'capitalize',
                  }}
                >
                  {t.status.replace('_', ' ')}
                </span>
              </td>
              <td style={{ padding: '12px' }}>
                <span style={{ color: priorityColors[t.priority] ?? '#888', textTransform: 'capitalize' }}>
                  {t.priority}
                </span>
              </td>
              <td style={{ padding: '12px', color: '#555', fontSize: '13px' }}>{t.createdAt}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Tab 4: Profile ─────────────────────────────────────────────────────────

interface ProfileRow {
  key: string
  value: string
  editing: boolean
  editValue: string
}

function ProfileTab() {
  const userId = 'varun'
  const [rows, setRows] = useState<ProfileRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<Record<string, string>>({})

  async function fetchProfile() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/memory/inject?userId=${encodeURIComponent(userId)}`)
      if (!res.ok) {
        const d = (await res.json()) as { error?: string }
        setError(d.error ?? 'Failed to fetch profile data')
        return
      }
      const data = (await res.json()) as { systemPromptBlock?: string }
      // Parse key-value pairs out of the system prompt block
      const block = data.systemPromptBlock ?? ''
      const parsed = parseProfileFromBlock(block)
      setRows(
        Object.entries(parsed).map(([k, v]) => ({
          key: k,
          value: v,
          editing: false,
          editValue: v,
        }))
      )
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchProfile()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function parseProfileFromBlock(block: string): Record<string, string> {
    const result: Record<string, string> = {}
    // Look for lines like "- key: value" or "key: value" in the block
    const lines = block.split('\n')
    for (const line of lines) {
      const match = /^[-\s]*([A-Za-z_][A-Za-z0-9_ ]*?)\s*:\s*(.+)$/.exec(line.trim())
      if (match) {
        const key = match[1].trim()
        const val = match[2].trim()
        // Skip lines that look like section headers or code
        if (key.length > 0 && key.length < 40 && !key.includes('{') && !key.startsWith('//')) {
          result[key] = val
        }
      }
    }
    return result
  }

  function startEdit(idx: number) {
    setRows(prev =>
      prev.map((r, i) => (i === idx ? { ...r, editing: true, editValue: r.value } : r))
    )
  }

  function cancelEdit(idx: number) {
    setRows(prev =>
      prev.map((r, i) => (i === idx ? { ...r, editing: false, editValue: r.value } : r))
    )
  }

  async function saveRow(idx: number) {
    const row = rows[idx]
    if (!row) return
    setSaveStatus(prev => ({ ...prev, [row.key]: 'saving' }))
    try {
      const res = await fetch('/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          type: 'semantic',
          content: `${row.key}: ${row.editValue}`,
          importance: 4,
        }),
      })
      if (res.ok) {
        setRows(prev =>
          prev.map((r, i) =>
            i === idx ? { ...r, value: r.editValue, editing: false } : r
          )
        )
        setSaveStatus(prev => ({ ...prev, [row.key]: 'saved' }))
        setTimeout(() => setSaveStatus(prev => { const next = { ...prev }; delete next[row.key]; return next }), 2000)
      } else {
        setSaveStatus(prev => ({ ...prev, [row.key]: 'error' }))
      }
    } catch {
      setSaveStatus(prev => ({ ...prev, [row.key]: 'error' }))
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <p style={{ ...s.sectionTitle, margin: 0 }}>Profile — Extracted from Memory</p>
        <button onClick={() => void fetchProfile()} style={s.btnSecondary}>Refresh</button>
      </div>

      <div style={{ ...s.banner, marginBottom: '20px' }}>
        Profile data is extracted from your conversation memories. Edit a value to store an updated semantic memory.
      </div>

      {error && <div style={s.errorBanner}>{error}</div>}

      {loading ? (
        <div style={{ color: '#666', textAlign: 'center', padding: '40px' }}>Loading profile...</div>
      ) : rows.length === 0 ? (
        <div style={{ color: '#555', textAlign: 'center', padding: '40px' }}>
          No profile data found yet. Start chatting to build your memory profile.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '8px' }}>
          {rows.map((row, idx) => (
            <div
              key={row.key}
              style={{
                ...s.card,
                display: 'grid',
                gridTemplateColumns: '180px 1fr auto',
                gap: '12px',
                alignItems: 'center',
              }}
            >
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#888', wordBreak: 'break-all' }}>
                {row.key}
              </div>
              {row.editing ? (
                <input
                  style={s.input}
                  value={row.editValue}
                  onChange={e =>
                    setRows(prev =>
                      prev.map((r, i) => (i === idx ? { ...r, editValue: e.target.value } : r))
                    )
                  }
                  autoFocus
                />
              ) : (
                <div style={{ fontSize: '14px', color: '#d0d0d0', wordBreak: 'break-word' }}>{row.value}</div>
              )}
              <div style={{ display: 'flex', gap: '8px' }}>
                {row.editing ? (
                  <>
                    <button onClick={() => void saveRow(idx)} style={s.btn}>
                      {saveStatus[row.key] === 'saving' ? 'Saving...' : 'Save'}
                    </button>
                    <button onClick={() => cancelEdit(idx)} style={s.btnSecondary}>Cancel</button>
                  </>
                ) : (
                  <button onClick={() => startEdit(idx)} style={s.btnSecondary}>
                    {saveStatus[row.key] === 'saved' ? 'Saved' : 'Edit'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Tab 5: System Prompt ───────────────────────────────────────────────────

function SystemPromptTab() {
  const userId = 'varun'
  const [block, setBlock] = useState('')
  const [tokenCount, setTokenCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function fetchBlock() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/memory/inject?userId=${encodeURIComponent(userId)}`)
      if (!res.ok) {
        const d = (await res.json()) as { error?: string }
        setError(d.error ?? 'Failed to fetch system prompt')
        return
      }
      const data = (await res.json()) as { systemPromptBlock?: string; tokenCount?: number }
      setBlock(data.systemPromptBlock ?? '')
      setTokenCount(data.tokenCount ?? 0)
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchBlock()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <p style={{ ...s.sectionTitle, margin: 0 }}>Injected System Prompt</p>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {tokenCount > 0 && (
            <span style={{ fontSize: '13px', color: '#888' }}>
              ~{tokenCount.toLocaleString()} tokens
            </span>
          )}
          <button onClick={() => void fetchBlock()} style={s.btnSecondary} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && <div style={s.errorBanner}>{error}</div>}

      {loading ? (
        <div style={{ color: '#666', textAlign: 'center', padding: '40px' }}>Loading system prompt...</div>
      ) : block ? (
        <pre
          style={{
            background: '#111',
            border: '1px solid #2a2a2a',
            borderRadius: '10px',
            padding: '20px',
            fontSize: '12px',
            lineHeight: '1.6',
            color: '#b8b8b8',
            overflowX: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            margin: 0,
            fontFamily: 'ui-monospace, "Cascadia Code", "Source Code Pro", Menlo, monospace',
          }}
        >
          {block}
        </pre>
      ) : (
        <div style={{ color: '#555', textAlign: 'center', padding: '40px' }}>
          No system prompt generated yet. Add memories to see the injected context block.
        </div>
      )}
    </div>
  )
}

// ── Main Dashboard ─────────────────────────────────────────────────────────

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'chat', label: 'Chat' },
  { id: 'memory', label: 'Memory' },
  { id: 'threads', label: 'Threads' },
  { id: 'profile', label: 'Profile' },
  { id: 'system-prompt', label: 'System Prompt' },
]

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<TabId>('chat')

  function renderTab() {
    switch (activeTab) {
      case 'chat':          return <ChatTab />
      case 'memory':        return <MemoryTab />
      case 'threads':       return <ThreadsTab />
      case 'profile':       return <ProfileTab />
      case 'system-prompt': return <SystemPromptTab />
      default:              return null
    }
  }

  return (
    <div style={s.container}>
      {/* Header */}
      <div style={s.header}>
        <div>
          <p style={s.headerTitle}>Memory Engine</p>
          <p style={s.headerSub}>Local-first persistent memory for AI agents</p>
        </div>
        <div style={{ marginLeft: 'auto', fontSize: '12px', color: '#444' }}>
          user: varun
        </div>
      </div>

      {/* Tab bar */}
      <div style={s.tabBar}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={s.tabBtn(activeTab === tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={s.content}>
        {renderTab()}
      </div>
    </div>
  )
}
