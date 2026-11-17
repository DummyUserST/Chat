import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { ArrowLeft, Ban, CircleUserRound, File as FileIcon, Globe, Image, Lock, LogIn, LogOut, MessageCircle, Mic, MoveHorizontal as MoreHorizontal, Paperclip, Play, Pause, Plus, Repeat, Search, Send, Settings, ShieldCheck, Smile, Sparkles, Square, Trash2, UserPlus, Users, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useFriends } from '../hooks/useFriends'
import { usePresence } from '../hooks/usePresence'
import { useProfile } from '../hooks/useProfile'
import { useAttachments } from '../hooks/useAttachments'
import { supabase } from '../lib/supabase'
import type { Conversation, Message, MessageReaction, Profile } from '../types/database'

const ADMIN_MODE_KEY = 'tandem-admin-mode'

const time = (value: string) => new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(value))
const initials = (name: string) => name.split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase()
const fmtDuration = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`

function Avatar({ profile, online = false }: { profile?: Profile | null; online?: boolean }) {
  return <span className="avatar">{profile?.avatar_url ? <img src={profile.avatar_url} alt="" /> : initials(profile?.display_name || '?')}{online && <i />}</span>
}

type Chat = { conversation: Conversation; person: Profile | null; members: Profile[]; latest?: Message }

function getAttachmentType(file: File): 'image' | 'audio' | 'video' | 'file' {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('audio/')) return 'audio'
  if (file.type.startsWith('video/')) return 'video'
  return 'file'
}

export default function ChatPage() {
  const { user, signOut } = useAuth()
  const { profile } = useProfile(user?.id)
  const { isOnline } = usePresence(user?.id)
  const { friends } = useFriends(user?.id)
  const [chats, setChats] = useState<Chat[]>([])
  const [selected, setSelected] = useState<Chat | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Profile[]>([])
  const [mobile, setMobile] = useState(false)
  const [openError, setOpenError] = useState('')
  const [showPlusMenu, setShowPlusMenu] = useState(false)
  const [showGroupModal, setShowGroupModal] = useState(false)
  const [joinableGroups, setJoinableGroups] = useState<Conversation[]>([])
  const navigate = useNavigate()
  const hasAdminRole = user?.app_metadata?.role === 'admin'
  const [adminMode, setAdminMode] = useState(() => localStorage.getItem(ADMIN_MODE_KEY) !== 'user')
  const isAdmin = hasAdminRole && adminMode
  const plusMenuRef = useRef<HTMLDivElement>(null)

  const switchMode = () => {
    const next = !adminMode
    setAdminMode(next)
    localStorage.setItem(ADMIN_MODE_KEY, next ? 'admin' : 'user')
  }

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (plusMenuRef.current && !plusMenuRef.current.contains(e.target as Node)) {
        setShowPlusMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const load = async () => {
    if (!user) return
    const { data: memberships } = await supabase.from('conversation_members').select('conversation_id').eq('user_id', user.id)
    const rows = await Promise.all((memberships || []).map(async m => {
      const [{ data: conversation }, { data: memberRows }, { data: latest }] = await Promise.all([
        supabase.from('conversations').select('*').eq('id', m.conversation_id).maybeSingle(),
        supabase.from('conversation_members').select('user_id').eq('conversation_id', m.conversation_id),
        supabase.from('messages').select('*').eq('conversation_id', m.conversation_id).order('created_at', { ascending: false }).limit(1)
      ])
      if (!conversation) return null

      const otherIds = (memberRows || []).map(x => x.user_id).filter(id => id !== user.id)
      let members: Profile[] = []
      let person: Profile | null = null

      if (otherIds.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('*').in('id', otherIds)
        members = profiles || []
        person = members[0] || null
      }

      return { conversation, person, members, latest: latest?.[0] } as Chat
    }))
    setChats(rows.filter(Boolean) as Chat[])
  }

  const loadJoinableGroups = async () => {
    if (!user) return
    const { data } = await supabase
      .from('conversations')
      .select('*')
      .eq('is_group', true)
      .neq('created_by', user.id)
    const groups = (data || []).filter(g => {
      if (g.privacy === 'public') return true
      if (g.join_setting === 'friends_only' && g.created_by) {
        return friends.some(f => f.friend.id === g.created_by)
      }
      return false
    })
    const memberIds = new Set(chats.map(c => c.conversation.id))
    setJoinableGroups(groups.filter(g => !memberIds.has(g.id)))
  }

  useEffect(() => { load() }, [user?.id])
  useEffect(() => { loadJoinableGroups() }, [user?.id, friends.length, chats.length])

  useEffect(() => {
    const t = setTimeout(async () => {
      const q = query.trim()
      if (q.length < 2 || !user) { setResults([]); return }
      if (q.includes('@')) {
        const { data } = await supabase.rpc('get_user_by_email', { p_email: q.toLowerCase() })
        if (data) setResults([data as Profile])
        else setResults([])
      } else {
        const { data } = await supabase.from('profiles').select('*').neq('id', user.id).or(`username.ilike.%${q}%,display_name.ilike.%${q}%`).limit(8)
        setResults(data || [])
      }
    }, 250)
    return () => clearTimeout(t)
  }, [query, user?.id])

  const open = async (person: Profile) => {
    setQuery(''); setResults([])
    setOpenError('')
    let chat = chats.find(x => x.person?.id === person.id && !x.conversation.is_group)
    if (!chat) {
      const { data: conversation, error } = await supabase.rpc('create_direct_conversation', { other_user_id: person.id })
      if (error) {
        setOpenError('You can only message people who accepted your friend request. Send a request first.')
        return
      }
      if (!conversation || !user) return
      chat = { conversation, person, members: [person] }
      setChats(x => [chat!, ...x])
    }
    setSelected(chat); setMobile(true)
  }

  const openGroup = (chat: Chat) => {
    setSelected(chat); setMobile(true)
  }

  const joinGroup = async (conv: Conversation) => {
    const { data, error } = await supabase.rpc('join_group_chat', { p_conversation_id: conv.id })
    if (error || !data) {
      setOpenError('Could not join this group.')
      return
    }
    setOpenError('')
    const { data: memberRows } = await supabase.from('conversation_members').select('user_id').eq('conversation_id', conv.id)
    const otherIds = (memberRows || []).map(x => x.user_id).filter(id => id !== user?.id)
    const { data: profiles } = await supabase.from('profiles').select('*').in('id', otherIds)
    const chat: Chat = { conversation: data as Conversation, person: null, members: profiles || [] }
    setChats(x => [chat, ...x])
    setSelected(chat); setMobile(true)
  }

  const previewText = (chat: Chat) => {
    const m = chat.latest
    if (!m) return 'Start a conversation'
    if (m.deleted_at) return 'Message deleted'
    if (m.attachment_type === 'audio') return 'Voice message'
    if (m.attachment_type === 'image') return 'Photo'
    if (m.attachment_type === 'video') return 'Video'
    if (m.attachment_type === 'file') return m.attachment_name || 'File'
    return m.content || 'Attachment'
  }

  const chatTitle = (chat: Chat) => {
    if (chat.conversation.is_group) return chat.conversation.name || 'Group chat'
    return chat.person?.display_name || 'Unknown'
  }

  const chatMembers = (chat: Chat) => {
    if (chat.conversation.is_group) return `${chat.members.length + 1} members`
    return chat.person ? `@${chat.person.username}` : ''
  }

  return (
    <div className={`app-shell ${mobile ? 'mobile-chat' : ''}`}>
      <aside className="sidebar">
        <header>
          <div className="brand"><span className="brand-mark"><Sparkles size={16} /></span> tandem</div>
          <Avatar profile={profile} online={isOnline(user?.id || '')} />
        </header>
        <div className="sidebar-body">
          <div className="search-box">
            <Search size={17} />
            <input aria-label="Search by email or name" placeholder="Enter email to chat..." value={query} onChange={e => setQuery(e.target.value)} />
            {query && <button onClick={() => setQuery('')} aria-label="Clear"><X size={15} /></button>}
          </div>
          {openError && <div className="error open-error">{openError}</div>}
          {results.length > 0 && (
            <div className="results">
              {results.map(p => (
                <button className="result" key={p.id} onClick={() => open(p)}>
                  <Avatar profile={p} online={isOnline(p.id)} />
                  <span><b>{p.display_name}</b><small>@{p.username}</small></span>
                  <UserPlus size={16} />
                </button>
              ))}
            </div>
          )}
          <div className="section-title">Your conversations
            <div className="plus-menu-wrapper" ref={plusMenuRef}>
              <button onClick={() => setShowPlusMenu(!showPlusMenu)} aria-label="New"><Plus size={17} /></button>
              {showPlusMenu && (
                <div className="plus-dropdown">
                  <button onClick={() => { setShowPlusMenu(false); document.querySelector<HTMLInputElement>('.search-box input')?.focus() }}>
                    <UserPlus size={16} /> New direct chat
                  </button>
                  <button onClick={() => { setShowPlusMenu(false); setShowGroupModal(true) }}>
                    <Users size={16} /> New group chat
                  </button>
                </div>
              )}
            </div>
          </div>
          {joinableGroups.length > 0 && (
            <div className="joinable-groups">
              <div className="joinable-label">Groups you can join</div>
              {joinableGroups.map(g => (
                <button className="chat-row joinable-row" key={g.id} onClick={() => joinGroup(g)}>
                  <span className="avatar group-avatar"><Users size={16} /></span>
                  <span><b>{g.name || 'Group chat'}</b><small>{g.privacy === 'public' ? 'Public' : 'Friends only'} group</small></span>
                  <span className="join-btn">Join</span>
                </button>
              ))}
            </div>
          )}
          {chats.sort((a, b) => new Date(b.conversation.updated_at).getTime() - new Date(a.conversation.updated_at).getTime()).map(c => (
            <button className={`chat-row ${selected?.conversation.id === c.conversation.id ? 'active' : ''}`} key={c.conversation.id} onClick={() => openGroup(c)}>
              {c.conversation.is_group ? (
                <span className="avatar group-avatar"><Users size={16} /></span>
              ) : (
                <Avatar profile={c.person} online={isOnline(c.person?.id || '')} />
              )}
              <span><b>{chatTitle(c)}</b><small>{previewText(c)}</small></span>
              {c.latest && <time>{time(c.latest.created_at)}</time>}
            </button>
          ))}
          {!chats.length && !joinableGroups.length && (
            <div className="empty-side">
              <MessageCircle size={23} />
              <b>No conversations yet</b>
              <span>Find someone and start your first conversation.</span>
            </div>
          )}
        </div>
        <nav>
          <button onClick={() => navigate('/stories')}><Image size={17} /> Stories</button>
          <button onClick={() => navigate('/friends')}><Users size={17} /> Friends</button>
          <button onClick={() => navigate('/profile')}><CircleUserRound size={17} /> Profile</button>
          <button onClick={() => navigate('/settings')}><Settings size={17} /> Settings</button>
          {hasAdminRole && (
            <button onClick={switchMode} aria-label="Switch account mode">
              <Repeat size={17} /> {adminMode ? 'Admin' : 'User'}
            </button>
          )}
          {isAdmin && <button onClick={() => navigate('/admin')}><ShieldCheck size={17} /> Admin</button>}
          <button onClick={signOut}><LogOut size={17} /> Log out</button>
        </nav>
      </aside>
      <ChatPanel
        chat={selected}
        userId={user?.id || ''}
        online={selected && !selected.conversation.is_group ? isOnline(selected.person?.id || '') : false}
        isAdminPanel={isAdmin}
        back={() => setMobile(false)}
        onLeft={conversationId => {
          setChats(x => x.filter(c => c.conversation.id !== conversationId))
          setSelected(null)
          setMobile(false)
        }}
      />
      {showGroupModal && (
        <CreateGroupModal
          friends={friends}
          currentUserId={user?.id || ''}
          onClose={() => setShowGroupModal(false)}
          onCreated={async (conv) => {
            setShowGroupModal(false)
            const { data: memberRows } = await supabase.from('conversation_members').select('user_id').eq('conversation_id', conv.id)
            const otherIds = (memberRows || []).map(x => x.user_id).filter(id => id !== user?.id)
            const { data: profiles } = await supabase.from('profiles').select('*').in('id', otherIds)
            const chat: Chat = { conversation: conv, person: null, members: profiles || [] }
            setChats(x => [chat, ...x])
            setSelected(chat); setMobile(true)
          }}
        />
      )}
    </div>
  )
}

function CreateGroupModal({ friends, currentUserId, onClose, onCreated }: {
  friends: { friend: Profile; requestId: string }[]
  currentUserId: string
  onClose: () => void
  onCreated: (conv: Conversation) => void
}) {
  const [name, setName] = useState('')
  const [privacy, setPrivacy] = useState<'private' | 'public'>('private')
  const [joinSetting, setJoinSetting] = useState<'friends_only' | 'invite_only'>('friends_only')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const toggleFriend = (id: string) => {
    setSelectedIds(x => x.includes(id) ? x.filter(i => i !== id) : [...x, id])
  }

  const create = async () => {
    const trimmed = name.trim()
    if (!trimmed) { setError('Enter a group name.'); return }
    if (trimmed.length > 60) { setError('Group name must be 60 characters or fewer.'); return }
    setBusy(true); setError('')
    const { data, error: rpcError } = await supabase.rpc('create_group_chat', {
      p_name: trimmed,
      p_privacy: privacy,
      p_join_setting: joinSetting,
      p_member_ids: selectedIds
    })
    setBusy(false)
    if (rpcError || !data) {
      setError('Could not create the group. Please try again.')
      return
    }
    onCreated(data as Conversation)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2><Users size={18} /> New group chat</h2>
          <button onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="modal-body">
          <label className="modal-field">
            <span>Group name</span>
            <input value={name} onChange={e => setName(e.target.value)} maxLength={60} placeholder="e.g. Weekend Trip" />
          </label>
          <div className="modal-field">
            <span>Privacy</span>
            <div className="segmented">
              <button className={privacy === 'private' ? 'active' : ''} onClick={() => setPrivacy('private')}>
                <Lock size={14} /> Private
              </button>
              <button className={privacy === 'public' ? 'active' : ''} onClick={() => setPrivacy('public')}>
                <Globe size={14} /> Public
              </button>
            </div>
          </div>
          <div className="modal-field">
            <span>Who can join</span>
            <div className="segmented">
              <button className={joinSetting === 'friends_only' ? 'active' : ''} onClick={() => setJoinSetting('friends_only')}>
                Friends only
              </button>
              <button className={joinSetting === 'invite_only' ? 'active' : ''} onClick={() => setJoinSetting('invite_only')}>
                Invite only
              </button>
            </div>
            <small className="modal-hint">
              {joinSetting === 'friends_only' ? 'Any of your friends can discover and join this group.' : 'Only people you invite can join.'}
            </small>
          </div>
          {friends.length > 0 && (
            <div className="modal-field">
              <span>Add members ({selectedIds.length} selected)</span>
              <div className="member-list">
                {friends.map(f => (
                  <button
                    key={f.friend.id}
                    className={`member-chip ${selectedIds.includes(f.friend.id) ? 'selected' : ''}`}
                    onClick={() => toggleFriend(f.friend.id)}
                  >
                    {f.friend.avatar_url ? <img src={f.friend.avatar_url} alt="" /> : <span>{initials(f.friend.display_name)}</span>}
                    <b>{f.friend.display_name}</b>
                    {selectedIds.includes(f.friend.id) && <X size={14} />}
                  </button>
                ))}
              </div>
            </div>
          )}
          {error && <div className="error">{error}</div>}
        </div>
        <div className="modal-footer">
          <button className="ghost-button" onClick={onClose}>Cancel</button>
          <button className="primary-button" onClick={create} disabled={busy || !name.trim()}>
            {busy ? 'Creating...' : 'Create group'}
          </button>
        </div>
      </div>
    </div>
  )
}

function groupReactions(list: MessageReaction[], userId: string) {
  const groups = new Map<string, { emoji: string; count: number; mine: boolean }>()
  for (const r of list) {
    const g = groups.get(r.emoji) ?? { emoji: r.emoji, count: 0, mine: false }
    g.count += 1
    if (r.user_id === userId) g.mine = true
    groups.set(r.emoji, g)
  }
  return [...groups.values()]
}

function AttachmentView({ message }: { message: Message }) {
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)

  if (!message.attachment_url) return null

  if (message.attachment_type === 'image') {
    return <a href={message.attachment_url} target="_blank" rel="noopener noreferrer"><img src={message.attachment_url} alt={message.attachment_name || 'image'} className="msg-image" /></a>
  }
  if (message.attachment_type === 'video') {
    return <video src={message.attachment_url} controls className="msg-video" />
  }
  if (message.attachment_type === 'audio') {
    const toggle = () => {
      const el = audioRef.current
      if (!el) return
      if (playing) { el.pause(); setPlaying(false) } else { el.play(); setPlaying(true) }
    }
    return (
      <div className="msg-audio">
        <button onClick={toggle} aria-label={playing ? 'Pause' : 'Play'} className="msg-audio-btn">
          {playing ? <Pause size={18} /> : <Play size={18} />}
        </button>
        <div className="msg-audio-info">
          <span>Voice message</span>
          {message.attachment_duration && <small>{fmtDuration(message.attachment_duration)}</small>}
        </div>
        <audio ref={audioRef} src={message.attachment_url} onEnded={() => setPlaying(false)} />
      </div>
    )
  }
  return (
    <a href={message.attachment_url} target="_blank" rel="noopener noreferrer" className="msg-file">
      <FileIcon size={20} />
      <span><b>{message.attachment_name || 'Download file'}</b><small>Tap to open</small></span>
    </a>
  )
}

function ChatPanel({ chat, userId, online, back, onLeft, isAdminPanel }: { chat: Chat | null; userId: string; online: boolean; back: () => void; onLeft: (conversationId: string) => void; isAdminPanel: boolean }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recordTime, setRecordTime] = useState(0)
  const [sendError, setSendError] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const recordTimeRef = useRef(0)
  const { upload, uploadWithDuration } = useAttachments(userId)

  const isGroup = chat?.conversation.is_group ?? false

  useEffect(() => {
    if (!chat) return
    setLoading(true)
    supabase.from('messages').select('*').eq('conversation_id', chat.conversation.id).order('created_at', { ascending: false }).limit(50).then(({ data }) => {
      setMessages((data || []).reverse())
      setLoading(false)
      requestAnimationFrame(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight })
    })
    const filter = `conversation_id=eq.${chat.conversation.id}`
    const channel = supabase.channel(`chat-${chat.conversation.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter }, p => {
        const message = p.new as Message
        setMessages(x => x.some(m => m.id === message.id) ? x : [...x, message])
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter }, p => {
        const message = p.new as Message
        setMessages(x => x.map(m => m.id === message.id ? message : m))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, p => {
        const id = (p.old as { id: string }).id
        setMessages(x => x.filter(m => m.id !== id))
      })
      .subscribe()
    return () => { channel.unsubscribe() }
  }, [chat?.conversation.id])

  const sendMessage = async (params: { content?: string; attachmentUrl?: string; attachmentType?: string; attachmentName?: string; attachmentDuration?: number | null }) => {
    if (!chat) return
    const content = (params.content || '').trim()
    if (!content && !params.attachmentUrl) return
    setSendError('')
    const { data, error } = await supabase.from('messages').insert({
      conversation_id: chat.conversation.id,
      sender_id: userId,
      content: content || '',
      ...(params.attachmentUrl ? { attachment_url: params.attachmentUrl, attachment_type: params.attachmentType!, attachment_name: params.attachmentName!, attachment_duration: params.attachmentDuration ?? null } : {})
    }).select().single()
    if (error) {
      const msg = error.message || ''
      if (msg.includes('not a member') || msg.includes('policy') || error.code === '42501') {
        setSendError('You are not a member of this conversation.')
      } else if (msg.includes('friend')) {
        setSendError('You can only message friends.')
      } else {
        setSendError('Could not send message. Please try again.')
      }
      return
    }
    if (data) {
      setMessages(x => x.some(m => m.id === data.id) ? x : [...x, data])
      setText('')
      requestAnimationFrame(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight })
    }
  }

  const send = async () => {
    const content = text.trim()
    if (!content || !chat) return
    await sendMessage({ content })
  }

  const key = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !chat) return
    setUploading(true)
    const type = getAttachmentType(file)
    const result = await upload(file, type)
    setUploading(false)
    if (result) {
      await sendMessage({ attachmentUrl: result.url, attachmentType: type, attachmentName: result.name, attachmentDuration: result.duration })
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      mediaRecorderRef.current = recorder
      audioChunksRef.current = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        if (blob.size < 1000) { setRecording(false); setRecordTime(0); return }
        const file = new File([blob], `voice-${Date.now()}.webm`, { type: 'audio/webm' })
        setUploading(true)
        const result = await uploadWithDuration(file, 'audio', recordTimeRef.current)
        setUploading(false)
        if (result) {
          await sendMessage({ attachmentUrl: result.url, attachmentType: 'audio', attachmentName: result.name, attachmentDuration: result.duration })
        }
        setRecording(false); setRecordTime(0)
      }
      recorder.start()
      setRecording(true); setRecordTime(0); recordTimeRef.current = 0
      recordTimerRef.current = setInterval(() => { setRecordTime(t => t + 1); recordTimeRef.current += 1 }, 1000)
    } catch {
      setRecording(false)
    }
  }

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state !== 'inactive') recorder.stop()
    if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null }
  }

  const [reactions, setReactions] = useState<MessageReaction[]>([])
  const [reactionPicker, setReactionPicker] = useState<string | null>(null)
  const [showBlockMenu, setShowBlockMenu] = useState(false)
  const [joinBusy, setJoinBusy] = useState(false)
  const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏']

  useEffect(() => {
    if (!chat) return
    supabase.from('message_reactions').select('*').in('message_id', messages.map(m => m.id)).then(({ data }) => {
      setReactions(data || [])
    })
    const reactionChannel = supabase.channel(`reactions-${chat.conversation.id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, p => {
      const r = p.new as MessageReaction
      if (p.eventType === 'INSERT') setReactions(x => x.some(x2 => x2.id === r.id) ? x : [...x, r])
      else if (p.eventType === 'DELETE') { const d = p.old as MessageReaction; setReactions(x => x.filter(x2 => x2.id !== d.id)) }
    }).subscribe()
    return () => { reactionChannel.unsubscribe() }
  }, [chat?.conversation.id, messages.length])

  const toggleReaction = async (messageId: string, emoji: string) => {
    const existing = reactions.find(r => r.message_id === messageId && r.user_id === userId && r.emoji === emoji)
    if (existing) {
      await supabase.from('message_reactions').delete().eq('id', existing.id)
      setReactions(x => x.filter(r => r.id !== existing.id))
    } else {
      const { data } = await supabase.from('message_reactions').insert({ message_id: messageId, user_id: userId, emoji }).select().single()
      if (data) setReactions(x => [...x, data])
    }
    setReactionPicker(null)
  }

  const reactionsFor = (messageId: string) => reactions.filter(r => r.message_id === messageId)

  const deleteMessage = async (id: string) => {
    await supabase.from('messages').delete().eq('id', id).eq('sender_id', userId)
    setMessages(x => x.filter(m => m.id !== id))
    setReactions(x => x.filter(r => r.message_id !== id))
  }

  const blockUser = async () => {
    if (!chat || !chat.person) return
    await supabase.from('blocked_users').insert({ blocker_id: userId, blocked_id: chat.person.id })
    setShowBlockMenu(false)
  }

  const deleteChat = async () => {
    if (!chat) return
    setShowBlockMenu(false)
    const { error } = await supabase.from('conversation_members').delete().eq('conversation_id', chat.conversation.id).eq('user_id', userId)
    if (error) { setSendError('Could not delete chat. Please try again.'); return }
    onLeft(chat.conversation.id)
  }

  const headerTitle = isGroup ? (chat?.conversation.name || 'Group chat') : chat?.person?.display_name || 'Unknown'
  const headerSubtitle = isGroup
    ? `${(chat?.members.length || 0) + 1} members`
    : online ? 'Online now' : `@${chat?.person?.username || ''}`

  if (!chat) return (
    <main className="chat-panel empty-panel">
      <div className="empty-icon"><MessageCircle size={30} /></div>
      <h2>Select a conversation</h2>
      <p>Choose a chat from the sidebar to start messaging.</p>
    </main>
  )

  return (
    <main className="chat-panel">
      <header className="chat-header">
        <button className="back" onClick={back} aria-label="Back"><ArrowLeft size={19} /></button>
        {isGroup ? (
          <span className="avatar group-avatar"><Users size={16} /></span>
        ) : (
          <Avatar profile={chat.person} online={online} />
        )}
        <div><h2>{headerTitle}</h2><p>{headerSubtitle}</p></div>
        {isAdminPanel && (
          <button
            className="admin-join-chat"
            onClick={async () => {
              setJoinBusy(true)
              const { error } = await supabase.rpc('admin_join_conversation', { p_conversation_id: chat.conversation.id })
              setJoinBusy(false)
              if (error) { setSendError('Could not join this conversation.'); return }
              setSendError('')
            }}
            disabled={joinBusy}
            aria-label="Join conversation as admin"
            title="Join conversation as admin"
          >
            <LogIn size={16} /> Join
          </button>
        )}
        <button className="more" aria-label="More options" onClick={() => setShowBlockMenu(!showBlockMenu)}><MoreHorizontal size={20} /></button>
        {showBlockMenu && (
          <div className="chat-menu">
            {!isGroup && <button onClick={blockUser}><Ban size={15} /> Block user</button>}
            <button onClick={deleteChat}><Trash2 size={15} /> {isGroup ? 'Leave group' : 'Delete chat'}</button>
            <button onClick={() => setShowBlockMenu(false)}>Cancel</button>
          </div>
        )}
      </header>
      <div className="messages" ref={ref}>
        {loading ? 'Loading messages...' : messages.length ? messages.map(m => {
          const msgReactions = reactionsFor(m.id)
          const senderProfile = isGroup ? chat.members.find(p => p.id === m.sender_id) : null
          return (
          <div className={`message ${m.sender_id === userId ? 'mine' : ''}`} key={m.id}>
            <div className={m.deleted_at ? 'deleted' : ''}>
              {m.deleted_at ? 'Message deleted' : (
                <>
                  {isGroup && m.sender_id !== userId && senderProfile && (
                    <small className="group-sender">{senderProfile.display_name}</small>
                  )}
                  <AttachmentView message={m} />
                  {m.content && <span className="msg-text">{m.content}</span>}
                </>
              )}
              {msgReactions.length > 0 && !m.deleted_at && (
                <div className="msg-reactions">
                  {groupReactions(msgReactions, userId).map(r => (
                    <button key={r.emoji} className={`msg-reaction ${r.mine ? 'mine' : ''}`} onClick={() => toggleReaction(m.id, r.emoji)}>{r.emoji} {r.count > 1 && <span>{r.count}</span>}</button>
                  ))}
                </div>
              )}
              <small>
                {time(m.created_at)}
                {!m.deleted_at && (
                  <button onClick={() => setReactionPicker(reactionPicker === m.id ? null : m.id)} aria-label="React"><Smile size={11} /></button>
                )}
                {reactionPicker === m.id && (
                  <div className="reaction-picker">
                    {QUICK_EMOJIS.map(e => (
                      <button key={e} onClick={() => toggleReaction(m.id, e)}>{e}</button>
                    ))}
                  </div>
                )}
                {m.sender_id === userId && !m.deleted_at && (
                  <button onClick={() => deleteMessage(m.id)} aria-label="Delete message"><Trash2 size={11} /></button>
                )}
              </small>
            </div>
          </div>
          )
        }) : (
          <div className="empty-messages">
            <Sparkles size={18} />
            <b>No messages yet</b>
            <span>Start the conversation.</span>
          </div>
        )}
      </div>
      <div className="composer">
        {sendError && <div className="composer-error">{sendError}</div>}
        {recording ? (
          <div className="recording-bar">
            <span className="recording-dot" />
            <span className="recording-time">{fmtDuration(recordTime)}</span>
            <span className="recording-label">Recording...</span>
            <button className="stop-btn" onClick={stopRecording} aria-label="Stop recording"><Square size={16} fill="currentColor" /></button>
          </div>
        ) : (
          <>
            <input ref={fileInputRef} type="file" onChange={handleFileSelect} hidden accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.txt,.zip" />
            <button className="composer-attach" onClick={() => fileInputRef.current?.click()} disabled={uploading} aria-label="Attach file">
              {uploading ? <span className="composer-spinner" /> : <Paperclip size={19} />}
            </button>
            <textarea rows={1} maxLength={4000} value={text} onChange={e => setText(e.target.value)} onKeyDown={key} placeholder="Write a message..." aria-label="Message" />
            {text.trim() ? (
              <button disabled={uploading} onClick={send} aria-label="Send"><Send size={18} /></button>
            ) : (
              <button onClick={startRecording} disabled={uploading} aria-label="Record voice message"><Mic size={18} /></button>
            )}
          </>
        )}
      </div>
    </main>
  )
}
