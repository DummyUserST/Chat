import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Database, LogOut, MessageSquare, RefreshCw, ShieldCheck, Users, UsersRound } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import type { Conversation, ConversationMember, Message, Profile } from '../types/database'

type Tab = 'profiles' | 'conversations' | 'memberships' | 'messages'

const fmtDate = (value: string) => new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
const fmtTime = (value: string) => new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
const shortId = (id: string) => id.slice(0, 8)

export default function AdminPage() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [members, setMembers] = useState<ConversationMember[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<Tab>('profiles')
  const isAdmin = user?.app_metadata?.role === 'admin'

  const load = async () => {
    setLoading(true)
    setError('')
    const [profileResult, conversationResult, memberResult, messageResult] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('conversations').select('*').order('updated_at', { ascending: false }),
      supabase.from('conversation_members').select('*').order('joined_at', { ascending: false }),
      supabase.from('messages').select('*').order('created_at', { ascending: false }).limit(100),
    ])
    if (profileResult.error || conversationResult.error || memberResult.error || messageResult.error) {
      setError('Admin data could not be loaded. Verify the admin claim is set in app metadata.')
    }
    setProfiles(profileResult.data || [])
    setConversations(conversationResult.data || [])
    setMembers(memberResult.data || [])
    setMessages(messageResult.data || [])
    setLoading(false)
  }

  useEffect(() => { if (isAdmin) load() }, [isAdmin])

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

  if (!isAdmin) {
    return (
      <main className="admin-denied">
        <ShieldCheck size={35} />
        <h1>Admin access required</h1>
        <p>Your account does not have the administrator role.</p>
        <button className="primary-button" onClick={() => navigate('/chats')}>Return to chats</button>
      </main>
    )
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode; count: number }[] = [
    { id: 'profiles', label: 'Profiles', icon: <Users size={16} />, count: profiles.length },
    { id: 'conversations', label: 'Conversations', icon: <Database size={16} />, count: conversations.length },
    { id: 'memberships', label: 'Memberships', icon: <UsersRound size={16} />, count: members.length },
    { id: 'messages', label: 'Messages', icon: <MessageSquare size={16} />, count: messages.length },
  ]

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <div className="admin-brand">
          <span className="brand-mark"><ShieldCheck size={17} /></span>
          <span><b>Tandem</b><small>Admin console</small></span>
        </div>
        <div className="admin-actions">
          <button onClick={load} aria-label="Refresh data" title="Refresh"><RefreshCw size={17} /></button>
          <button onClick={() => navigate('/chats')}><ArrowLeft size={17} /> Chats</button>
          <button onClick={async () => { await signOut(); navigate('/login') }}><LogOut size={17} /> Log out</button>
        </div>
      </header>

      <main className="admin-content">
        <div className="admin-title">
          <div>
            <p className="eyebrow">Restricted workspace</p>
            <h1>Everything, in one view.</h1>
            <p className="muted">Operational visibility across all of Tandem's live data.</p>
          </div>
          <span className="admin-badge"><ShieldCheck size={15} /> Administrator</span>
        </div>

        {error && <div className="error">{error}</div>}

        <section className="admin-stats">
          <Stat icon={<Users size={20} />} label="Profiles" value={profiles.length} />
          <Stat icon={<Database size={20} />} label="Conversations" value={conversations.length} />
          <Stat icon={<UsersRound size={20} />} label="Memberships" value={members.length} />
          <Stat icon={<MessageSquare size={20} />} label="Messages (latest 100)" value={messages.length} />
        </section>

        <nav className="admin-tabs">
          {tabs.map(t => (
            <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
              {t.icon} {t.label} <span className="admin-tab-count">{t.count}</span>
            </button>
          ))}
        </nav>

        {loading ? (
          <p className="muted admin-loading">Loading...</p>
        ) : (
          <section className="admin-panel">
            {tab === 'profiles' && (
              <div className="admin-table">
                <div className="admin-row admin-row-head">
                  <span>User</span><span>Username</span><span>Private name</span><span>Status</span><span>Joined</span>
                </div>
                {profiles.length === 0 && <p className="admin-empty">No profiles yet.</p>}
                {profiles.map(p => (
                  <div className="admin-row" key={p.id}>
                    <span className="admin-user">
                      <span className="admin-avatar">{p.display_name.slice(0, 1).toUpperCase()}</span>
                      <span><b>{p.display_name}</b><small>{shortId(p.id)}</small></span>
                    </span>
                    <span className="admin-username">@{p.username}</span>
                    <span className="admin-private-name">{p.private_name || '—'}</span>
                    <em className={p.status === 'online' ? 'online-label' : 'offline-label'}>{p.status || 'offline'}</em>
                    <time>{fmtDate(p.created_at)}</time>
                  </div>
                ))}
              </div>
            )}

            {tab === 'conversations' && (
              <div className="admin-table">
                <div className="admin-row admin-row-head">
                  <span>Conversation ID</span><span>Members</span><span>Created</span><span>Last active</span>
                </div>
                {conversations.length === 0 && <p className="admin-empty">No conversations yet.</p>}
                {conversations.map(c => {
                  const convMembers = membersByConversation.get(c.id) || []
                  return (
                    <div className="admin-row" key={c.id}>
                      <span className="admin-mono">{shortId(c.id)}</span>
                      <span className="admin-members">
                        {convMembers.length === 0
                          ? <small className="muted">No members</small>
                          : convMembers.map(m => profileById.get(m.user_id)?.display_name || shortId(m.user_id)).join(', ')}
                      </span>
                      <time>{fmtDate(c.created_at)}</time>
                      <time>{fmtTime(c.updated_at)}</time>
                    </div>
                  )
                })}
              </div>
            )}

            {tab === 'memberships' && (
              <div className="admin-table">
                <div className="admin-row admin-row-head">
                  <span>Conversation</span><span>Member</span><span>Joined</span>
                </div>
                {members.length === 0 && <p className="admin-empty">No memberships yet.</p>}
                {members.map((m, i) => (
                  <div className="admin-row" key={`${m.conversation_id}-${m.user_id}-${i}`}>
                    <span className="admin-mono">{shortId(m.conversation_id)}</span>
                    <span className="admin-user">
                      <span className="admin-avatar">{(profileById.get(m.user_id)?.display_name || '?').slice(0, 1).toUpperCase()}</span>
                      <span><b>{profileById.get(m.user_id)?.display_name || 'Unknown user'}</b><small>@{profileById.get(m.user_id)?.username || shortId(m.user_id)}</small></span>
                    </span>
                    <time>{fmtTime(m.joined_at)}</time>
                  </div>
                ))}
              </div>
            )}

            {tab === 'messages' && (
              <div className="admin-table admin-messages-table">
                <div className="admin-row admin-row-head">
                  <span>Sender</span><span>Conversation</span><span>Content</span><span>Sent</span>
                </div>
                {messages.length === 0 && <p className="admin-empty">No messages yet.</p>}
                {messages.map(m => {
                  const sender = profileById.get(m.sender_id)
                  return (
                    <div className="admin-row admin-message-row" key={m.id}>
                      <span className="admin-user">
                        <span className="admin-avatar">{(sender?.display_name || '?').slice(0, 1).toUpperCase()}</span>
                        <span><b>{sender?.display_name || 'Unknown user'}</b><small>@{sender?.username || shortId(m.sender_id)}</small></span>
                      </span>
                      <span className="admin-mono">{shortId(m.conversation_id)}</span>
                      <p className={m.deleted_at ? 'deleted-text' : 'admin-message-content'}>
                        {m.deleted_at ? 'Message deleted' : m.content}
                      </p>
                      <time>{fmtTime(m.created_at)}</time>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  )
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="admin-stat">
      <span className="admin-stat-icon">{icon}</span>
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  )
}
