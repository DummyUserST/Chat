
import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  Database,
  LogOut,
  Megaphone,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  Users,
  UsersRound,
  X,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import type {
  AdminBroadcast,
  Conversation,
  ConversationMember,
  Message,
  Profile,
} from '../types/database'

type Tab = 'profiles' | 'conversations' | 'memberships' | 'messages' | 'broadcast'

const fmtDate = (value: string) =>
  new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })

const fmtTime = (value: string) =>
  new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

const shortId = (id: string) => id.slice(0, 8)

export default function AdminPage() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  const [profiles, setProfiles] = useState<Profile[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [members, setMembers] = useState<ConversationMember[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [broadcasts, setBroadcasts] = useState<AdminBroadcast[]>([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<Tab>('profiles')

  const isAdmin = user?.app_metadata?.role === 'admin'

  const [unlocked, setUnlocked] = useState(false)
  const [password, setPassword] = useState('')
  const [unlockError, setUnlockError] = useState('')
  const [unlocking, setUnlocking] = useState(false)

  const [broadcastText, setBroadcastText] = useState('')
  const [broadcastError, setBroadcastError] = useState('')
  const [broadcastBusy, setBroadcastBusy] = useState(false)

  const [joiningId, setJoiningId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError('')

    const [
      profileResult,
      conversationResult,
      memberResult,
      messageResult,
      broadcastResult,
    ] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('conversations').select('*').order('updated_at', { ascending: false }),
      supabase.from('conversation_members').select('*').order('joined_at', { ascending: false }),
      supabase.from('messages').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('admin_broadcasts').select('*').order('created_at', { ascending: false }).limit(20),
    ])

    if (
      profileResult.error ||
      conversationResult.error ||
      memberResult.error ||
      messageResult.error ||
      broadcastResult.error
    ) {
      setError(
        'Admin data could not be loaded. Verify the admin claim is set in app metadata.',
      )
    }

    setProfiles(profileResult.data || [])
    setConversations(conversationResult.data || [])
    setMembers(memberResult.data || [])
    setMessages(messageResult.data || [])
    setBroadcasts(broadcastResult.data || [])

    setLoading(false)
  }

  useEffect(() => {
    if (isAdmin && unlocked) load()
  }, [isAdmin, unlocked])

  const unlock = async (e: React.FormEvent) => {
    e.preventDefault()

    setUnlocking(true)
    setUnlockError('')

    const { data, error } = await supabase.rpc(
      'admin_console_unlock',
      { p_password: password },
    )

    setUnlocking(false)

    if (error) {
      setUnlockError('Could not verify the password. Please try again.')
      return
    }

    if (data !== true) {
      setUnlockError('Incorrect password.')
      return
    }

    setPassword('')
    setUnlocked(true)
  }

  const profileById = useMemo(() => {
    const map = new Map<string, Profile>()

    profiles.forEach(p => map.set(p.id, p))

    return map
  }, [profiles])

  const membersByConversation = useMemo(() => {
    const map = new Map<string, ConversationMember[]>()

    members.forEach(m => {
      const list = map.get(m.conversation_id) || []
      list.push(m)
      map.set(m.conversation_id, list)
    })

    return map
  }, [members])

  const publishBroadcast = async (e: React.FormEvent) => {
    e.preventDefault()

    const text = broadcastText.trim()

    if (!text) return

    setBroadcastBusy(true)
    setBroadcastError('')

    const { data, error } = await supabase.rpc(
      'admin_publish_broadcast',
      { p_message: text },
    )

    setBroadcastBusy(false)

    if (error || !data) {
      setBroadcastError('Could not publish broadcast.')
      return
    }

    setBroadcasts(prev => [data as AdminBroadcast, ...prev])
    setBroadcastText('')
  }

  const cancelBroadcast = async (id: string) => {
    const { error } = await supabase
      .from('admin_broadcasts')
      .update({ cancelled_at: new Date().toISOString() })
      .eq('id', id)
      .is('cancelled_at', null)

    if (!error) {
      setBroadcasts(prev =>
        prev.map(b =>
          b.id === id
            ? { ...b, cancelled_at: new Date().toISOString() }
            : b,
        ),
      )
    }
  }

  const joinConversation = async (conversationId: string) => {
    setJoiningId(conversationId)

    const { error } = await supabase.rpc(
      'admin_join_conversation',
      { p_conversation_id: conversationId },
    )

    setJoiningId(null)

    if (error) {
      setError('Could not join conversation.')
      return
    }

    navigate('/chats')
  }

  const recipientForMessage = (msg: Message): Profile | undefined => {
    const convMembers = membersByConversation.get(msg.conversation_id) || []
    const other = convMembers.find(
      m => m.user_id !== msg.sender_id && !m.hidden,
    )

    return other ? profileById.get(other.user_id) : undefined
  }

  if (!isAdmin) {
    return (
      <main className="admin-denied">
        <ShieldCheck size={35} />
        <h1>Admin access required</h1>
        <p>Your account does not have the administrator role.</p>
        <button
          className="primary-button"
          onClick={() => navigate('/chats')}
        >
          Return to chats
        </button>
      </main>
    )
  }

  const tabs: {
    id: Tab
    label: string
    icon: React.ReactNode
    count: number
  }[] = [
    {
      id: 'profiles',
      label: 'Profiles',
      icon: <Users size={16} />,
      count: profiles.length,
    },
    {
      id: 'conversations',
      label: 'Conversations',
      icon: <Database size={16} />,
      count: conversations.length,
    },
    {
      id: 'memberships',
      label: 'Memberships',
      icon: <UsersRound size={16} />,
      count: members.length,
    },
    {
      id: 'messages',
      label: 'Messages',
      icon: <MessageSquare size={16} />,
      count: messages.length,
    },
    {
      id: 'broadcast',
      label: 'Broadcast',
      icon: <Megaphone size={16} />,
      count: broadcasts.filter(b => !b.cancelled_at).length,
    },
  ]

  if (!unlocked) {
    return (
      <div className="admin-gate-screen">
        <form className="admin-gate-card" onSubmit={unlock}>
          <div className="admin-gate-icon">
            <ShieldCheck size={28} />
          </div>

          <span className="admin-badge">
            <ShieldCheck size={13} />
            Administrator
          </span>

          <h1>Enter admin password</h1>

          <p className="muted">
            Admin data loads only after the password is verified.
          </p>

          <div className="admin-gate-field">
            <input
              type="password"
              aria-label="Admin password"
              autoComplete="current-password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>

          {unlockError && (
            <div className="error admin-gate-error">
              {unlockError}
            </div>
          )}

          <button
            type="submit"
            className="primary-button admin-gate-btn"
            disabled={unlocking}
          >
            {unlocking ? 'Checking...' : 'Unlock console'}
          </button>

          <button
            type="button"
            className="admin-gate-back"
            onClick={() => navigate('/chats')}
          >
            <ArrowLeft size={15} />
            Back to chats
          </button>
        </form>
      </div>
    )
  }

  const activeBroadcast = broadcasts.find(b => !b.cancelled_at)

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <div className="admin-brand">
          <span className="brand-mark">
            <ShieldCheck size={17} />
          </span>

          <span>
            <b>Tandem</b>
            <small>Admin console</small>
          </span>
        </div>

        <div className="admin-actions">
          <button
            onClick={load}
            aria-label="Refresh data"
            title="Refresh"
          >
            <RefreshCw size={17} />
          </button>

          <button onClick={() => navigate('/chats')}>
            <ArrowLeft size={17} />
            Chats
          </button>

          <button
            onClick={async () => {
              await signOut()
              navigate('/login')
            }}
          >
            <LogOut size={17} />
            Log out
          </button>
        </div>
      </header>

      <main className="admin-content">
        <div className="admin-title">
          <div>
            <p className="eyebrow">Restricted workspace</p>
            <h1>Everything, in one view.</h1>
            <p className="muted">
              Operational visibility across all of Tandem's live data.
            </p>
          </div>

          <span className="admin-badge">
            <ShieldCheck size={15} />
            Administrator
          </span>
        </div>

        {error && <div className="error">{error}</div>}

        <section className="admin-stats">
          <Stat
            icon={<Users size={20} />}
            label="Profiles"
            value={profiles.length}
          />
          <Stat
            icon={<Database size={20} />}
            label="Conversations"
            value={conversations.length}
          />
          <Stat
            icon={<UsersRound size={20} />}
            label="Memberships"
            value={members.length}
          />
          <Stat
            icon={<MessageSquare size={20} />}
            label="Messages (latest 100)"
            value={messages.length}
          />
        </section>

        <nav className="admin-tabs">
          {tabs.map(t => (
            <button
              key={t.id}
              className={tab === t.id ? 'active' : ''}
              onClick={() => setTab(t.id)}
            >
              {t.icon}
              {t.label}
              <span className="admin-tab-count">{t.count}</span>
            </button>
          ))}
        </nav>

        {loading ? (
          <p className="muted admin-loading">Loading...</p>
        ) : (
          <section className="admin-panel">

            {/* PROFILES */}
            {tab === 'profiles' && (
              <div className="admin-table">
                <div className="admin-row admin-row-head">
                  <span>User</span>
                  <span>Username</span>
                  <span>Private name</span>
                  <span>Status</span>
                  <span>Joined</span>
                </div>

                {profiles.length === 0 && (
                  <p className="admin-empty">No profiles yet.</p>
                )}

                {profiles.map(p => (
                  <div className="admin-row" key={p.id}>
                    <span className="admin-user">
                      <span className="admin-avatar">
                        {(p.display_name || '?').slice(0, 1).toUpperCase()}
                      </span>

                      <span>
                        <b>{p.display_name || 'Unknown user'}</b>
                        <small>{shortId(p.id)}</small>
                      </span>
                    </span>

                    <span className="admin-username">
                      @{p.username}
                    </span>

                    <span className="admin-private-name">
                      {p.private_name || '—'}
                    </span>

                    <em
                      className={
                        p.status === 'online'
                          ? 'online-label'
                          : 'offline-label'
                      }
                    >
                      {p.status || 'offline'}
                    </em>

                    <time>{fmtDate(p.created_at)}</time>
                  </div>
                ))}
              </div>
            )}

            {/* CONVERSATIONS */}
            {tab === 'conversations' && (
              <div className="admin-table">
                <div className="admin-row admin-row-head">
                  <span>Conversation ID</span>
                  <span>Members</span>
                  <span>Created</span>
                  <span>Last active</span>
                </div>

                {conversations.length === 0 && (
                  <p className="admin-empty">No conversations yet.</p>
                )}

                {conversations.map(c => {
                  const convMembers =
                    membersByConversation.get(c.id) || []

                  return (
                    <div className="admin-row" key={c.id}>
                      <span className="admin-mono">
                        {shortId(c.id)}
                      </span>

                      <span className="admin-members">
                        {convMembers.length === 0 ? (
                          <small className="muted">No members</small>
                        ) : (
                          convMembers
                            .map(
                              m =>
                                profileById.get(m.user_id)?.display_name ||
                                shortId(m.user_id),
                            )
                            .join(', ')
                        )}
                      </span>

                      <time>{fmtDate(c.created_at)}</time>
                      <time>{fmtTime(c.updated_at)}</time>
                    </div>
                  )
                })}
              </div>
            )}

            {/* MEMBERSHIPS */}
            {tab === 'memberships' && (
              <div className="admin-table">
                <div className="admin-row admin-row-head">
                  <span>Conversation</span>
                  <span>Member</span>
                  <span>Joined</span>
                </div>

                {members.length === 0 && (
                  <p className="admin-empty">No memberships yet.</p>
                )}

                {members.map((m, i) => (
                  <div
                    className="admin-row"
                    key={`${m.conversation_id}-${m.user_id}-${i}`}
                  >
                    <span className="admin-mono">
                      {shortId(m.conversation_id)}
                    </span>

                    <span className="admin-user">
                      <span className="admin-avatar">
                        {(
                          profileById.get(m.user_id)?.display_name || '?'
                        )
                          .slice(0, 1)
                          .toUpperCase()}
                      </span>

                      <span>
                        <b>
                          {profileById.get(m.user_id)?.display_name ||
                            'Unknown user'}
                        </b>
                        <small>
                          @
                          {profileById.get(m.user_id)?.username ||
                            shortId(m.user_id)}
                        </small>
                      </span>
                    </span>

                    <time>{fmtTime(m.joined_at)}</time>
                  </div>
                ))}
              </div>
            )}

            {/* MESSAGES */}
            {tab === 'messages' && (
              <div className="admin-table admin-messages-table">
                <div className="admin-row admin-row-head">
                  <span>Sender</span>
                  <span>Recipient</span>
                  <span>Content</span>
                  <span>Sent</span>
                  <span>Join</span>
                </div>

                {messages.length === 0 && (
                  <p className="admin-empty">No messages yet.</p>
                )}

                {messages.map(m => {
                  const sender = profileById.get(m.sender_id)
                  const recipient = recipientForMessage(m)

                  return (
                    <div
                      className="admin-row admin-message-row"
                      key={m.id}
                    >
                      <span className="admin-user">
                        <span className="admin-avatar">
                          {(sender?.display_name || '?')
                            .slice(0, 1)
                            .toUpperCase()}
                        </span>

                        <span>
                          <b>{sender?.display_name || 'Unknown user'}</b>
                          <small>
                            @{sender?.username || shortId(m.sender_id)}
                          </small>
                        </span>
                      </span>

                      <span className="admin-user">
                        {recipient ? (
                          <>
                            <span className="admin-avatar">
                              {(recipient.display_name || '?')
                                .slice(0, 1)
                                .toUpperCase()}
                            </span>

                            <span>
                              <b>{recipient.display_name}</b>
                              <small>@{recipient.username}</small>
                            </span>
                          </>
                        ) : (
                          <small className="muted">—</small>
                        )}
                      </span>

                      <p
                        className={
                          m.deleted_at
                            ? 'deleted-text'
                            : 'admin-message-content'
                        }
                      >
                        {m.deleted_at ? 'Message deleted' : m.content}
                      </p>

                      <time>{fmtTime(m.created_at)}</time>

                      <button
                        className="admin-join-btn"
                        onClick={() =>
                          joinConversation(m.conversation_id)
                        }
                        disabled={joiningId === m.conversation_id}
                        aria-label={`Join conversation ${shortId(
                          m.conversation_id,
                        )}`}
                      >
                        {joiningId === m.conversation_id
                          ? 'Joining...'
                          : 'Join'}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {/* BROADCAST */}
            {tab === 'broadcast' && (
              <div
                style={{
                  width: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '32px',
                  padding: '24px 16px',
                  boxSizing: 'border-box',
                }}
              >
                <form
                  onSubmit={publishBroadcast}
                  style={{
                    width: '100%',
                    maxWidth: '680px',
                    boxSizing: 'border-box',
                    padding: '32px',
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '20px',
                    boxShadow: '0 4px 16px rgba(15, 23, 42, 0.05)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '22px',
                  }}
                >
                  <div style={{ textAlign: 'center' }}>
                    <div
                      style={{
                        width: '58px',
                        height: '58px',
                        borderRadius: '17px',
                        background: '#5145e5',
                        color: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 18px',
                      }}
                    >
                      <Megaphone size={27} />
                    </div>

                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '8px 15px',
                        borderRadius: '30px',
                        background: '#eef2ff',
                        color: '#5145e5',
                        fontSize: '13px',
                        fontWeight: 600,
                        marginBottom: '14px',
                      }}
                    >
                      <ShieldCheck size={15} />
                      Announcement system
                    </div>

                    <h2
                      style={{
                        fontSize: '24px',
                        fontWeight: 700,
                        color: '#172033',
                        margin: '0 0 10px',
                      }}
                    >
                      Publish a broadcast
                    </h2>

                    <p
                      style={{
                        maxWidth: '480px',
                        margin: '0 auto',
                        color: '#64748b',
                        fontSize: '14px',
                        lineHeight: 1.7,
                      }}
                    >
                      Send an announcement to everyone using Tandem. Your message
                      will appear at the top of every screen until cancelled.
                    </p>
                  </div>

                  <div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '12px',
                        marginBottom: '9px',
                      }}
                    >
                      <label
                        htmlFor="broadcast-message"
                        style={{
                          fontSize: '14px',
                          fontWeight: 600,
                          color: '#334155',
                        }}
                      >
                        Message
                      </label>

                      <span
                        style={{
                          fontSize: '12px',
                          color: '#94a3b8',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {broadcastText.length}/500 characters
                      </span>
                    </div>

                    <textarea
                      id="broadcast-message"
                      aria-label="Broadcast message"
                      placeholder="Write your announcement here..."
                      value={broadcastText}
                      onChange={e => setBroadcastText(e.target.value)}
                      maxLength={500}
                      rows={5}
                      required
                      style={{
                        display: 'block',
                        width: '100%',
                        minHeight: '145px',
                        boxSizing: 'border-box',
                        resize: 'vertical',
                        padding: '15px',
                        border: '1px solid #dbe2ea',
                        borderRadius: '12px',
                        background: '#f8fafc',
                        color: '#172033',
                        fontSize: '14px',
                        lineHeight: 1.6,
                        fontFamily: 'inherit',
                        outline: 'none',
                      }}
                    />
                  </div>

                  {broadcastError && (
                    <div
                      style={{
                        padding: '12px 14px',
                        borderRadius: '9px',
                        background: '#fef2f2',
                        border: '1px solid #fecaca',
                        color: '#b91c1c',
                        fontSize: '13px',
                      }}
                    >
                      {broadcastError}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={broadcastBusy || !broadcastText.trim()}
                    style={{
                      width: '100%',
                      minHeight: '48px',
                      border: 'none',
                      borderRadius: '11px',
                      background:
                        broadcastBusy || !broadcastText.trim()
                          ? '#a5a0eb'
                          : '#5145e5',
                      color: '#ffffff',
                      fontSize: '14px',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '10px',
                      cursor:
                        broadcastBusy || !broadcastText.trim()
                          ? 'not-allowed'
                          : 'pointer',
                      opacity: broadcastBusy || !broadcastText.trim() ? 0.7 : 1,
                    }}
                  >
                    <Megaphone size={17} />
                    {broadcastBusy ? 'Publishing...' : 'Publish broadcast'}
                  </button>
                </form>

                {activeBroadcast && (
                  <div
                    style={{
                      width: '100%',
                      maxWidth: '680px',
                      boxSizing: 'border-box',
                      padding: '20px',
                      border: '1px solid #c7d2fe',
                      borderRadius: '13px',
                      background: '#eef2ff',
                    }}
                  >
                    <div
                      style={{
                        color: '#5145e5',
                        fontSize: '12px',
                        fontWeight: 700,
                        marginBottom: '10px',
                      }}
                    >
                      ACTIVE BROADCAST
                    </div>

                    <p style={{ color: '#1e293b', margin: '0 0 10px', lineHeight: 1.6 }}>
                      {activeBroadcast.message}
                    </p>

                    <small style={{ color: '#64748b' }}>
                      Published {fmtTime(activeBroadcast.created_at)}
                    </small>

                    <div style={{ marginTop: '15px' }}>
                      <button
                        type="button"
                        onClick={() => cancelBroadcast(activeBroadcast.id)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '7px',
                          padding: '8px 12px',
                          border: '1px solid #fecaca',
                          borderRadius: '8px',
                          background: '#ffffff',
                          color: '#b91c1c',
                          cursor: 'pointer',
                          fontSize: '13px',
                          fontWeight: 600,
                        }}
                      >
                        <X size={14} />
                        Cancel broadcast
                      </button>
                    </div>
                  </div>
                )}

                <div
                  style={{
                    width: '100%',
                    maxWidth: '680px',
                    boxSizing: 'border-box',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '15px',
                    }}
                  >
                    <h3
                      style={{
                        margin: 0,
                        fontSize: '18px',
                        fontWeight: 700,
                        color: '#172033',
                      }}
                    >
                      Broadcast history
                    </h3>

                    <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                      {broadcasts.length} total
                    </span>
                  </div>

                  {broadcasts.length === 0 && (
                    <div
                      style={{
                        padding: '35px 20px',
                        border: '1px dashed #cbd5e1',
                        borderRadius: '13px',
                        background: '#ffffff',
                        textAlign: 'center',
                      }}
                    >
                      <div
                        style={{
                          width: '42px',
                          height: '42px',
                          borderRadius: '50%',
                          background: '#f1f5f9',
                          color: '#64748b',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          margin: '0 auto 12px',
                        }}
                      >
                        <Megaphone size={19} />
                      </div>

                      <p
                        style={{
                          margin: '0 0 5px',
                          color: '#334155',
                          fontSize: '14px',
                          fontWeight: 600,
                        }}
                      >
                        No broadcasts yet.
                      </p>

                      <p
                        style={{
                          margin: 0,
                          color: '#94a3b8',
                          fontSize: '13px',
                        }}
                      >
                        Your published announcements will appear here.
                      </p>
                    </div>
                  )}

                  {broadcasts.map(b => (
                    <div
                      key={b.id}
                      style={{
                        padding: '17px',
                        marginBottom: '12px',
                        border: '1px solid #e2e8f0',
                        borderRadius: '12px',
                        background: '#ffffff',
                      }}
                    >
                      <p
                        style={{
                          margin: '0 0 13px',
                          color: '#1e293b',
                          fontSize: '14px',
                          lineHeight: 1.6,
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        {b.message}
                      </p>

                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '12px',
                        }}
                      >
                        <small style={{ color: '#94a3b8' }}>
                          Published {fmtTime(b.created_at)}
                        </small>

                        {b.cancelled_at ? (
                          <span
                            style={{
                              color: '#64748b',
                              fontSize: '12px',
                              fontWeight: 600,
                            }}
                          >
                            Cancelled
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => cancelBroadcast(b.id)}
                            style={{
                              border: 'none',
                              background: 'transparent',
                              color: '#dc2626',
                              fontSize: '12px',
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </section>
        )}
      </main>
    </div>
  )
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: number
}) {
  return (
    <div className="admin-stat">
      <span className="admin-stat-icon">{icon}</span>
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  )
}
