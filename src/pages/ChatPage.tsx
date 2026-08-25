import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { ArrowLeft, CircleUserRound, File as FileIcon, LogOut, MessageCircle, Mic, MoveHorizontal as MoreHorizontal, Paperclip, Play, Pause, Search, Send, Settings, ShieldCheck, Sparkles, Square, Trash2, UserPlus, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { usePresence } from '../hooks/usePresence'
import { useProfile } from '../hooks/useProfile'
import { useAttachments } from '../hooks/useAttachments'
import { supabase } from '../lib/supabase'
import type { Conversation, Message, Profile } from '../types/database'

const time = (value: string) => new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(value))
const initials = (name: string) => name.split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase()
const fmtDuration = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`

function Avatar({ profile, online = false }: { profile?: Profile | null; online?: boolean }) {
  return <span className="avatar">{profile?.avatar_url ? <img src={profile.avatar_url} alt="" /> : initials(profile?.display_name || '?')}{online && <i />}</span>
}

type Chat = { conversation: Conversation; person: Profile; latest?: Message }

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
  const [chats, setChats] = useState<Chat[]>([])
  const [selected, setSelected] = useState<Chat | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Profile[]>([])
  const [mobile, setMobile] = useState(false)
  const navigate = useNavigate()
  const isAdmin = user?.app_metadata?.role === 'admin'

  const load = async () => {
    if (!user) return
    const { data: memberships } = await supabase.from('conversation_members').select('conversation_id').eq('user_id', user.id)
    const rows = await Promise.all((memberships || []).map(async m => {
      const [{ data: conversation }, { data: members }, { data: latest }] = await Promise.all([
        supabase.from('conversations').select('*').eq('id', m.conversation_id).maybeSingle(),
        supabase.from('conversation_members').select('user_id').eq('conversation_id', m.conversation_id),
        supabase.from('messages').select('*').eq('conversation_id', m.conversation_id).order('created_at', { ascending: false }).limit(1)
      ])
      const id = members?.find(x => x.user_id !== user.id)?.user_id
      if (!conversation || !id) return null
      const { data: person } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle()
      return person ? { conversation, person, latest: latest?.[0] } : null
    }))
    setChats(rows.filter(Boolean) as Chat[])
  }

  useEffect(() => { load() }, [user?.id])

  useEffect(() => {
    const t = setTimeout(async () => {
      if (query.length < 2 || !user) { setResults([]); return }
      const { data } = await supabase.from('profiles').select('*').neq('id', user.id).or(`username.ilike.%${query}%,display_name.ilike.%${query}%`).limit(8)
      setResults(data || [])
    }, 250)
    return () => clearTimeout(t)
  }, [query, user?.id])

  const open = async (person: Profile) => {
    setQuery(''); setResults([])
    let chat = chats.find(x => x.person.id === person.id)
    if (!chat) {
      const { data: conversation, error } = await supabase.rpc('create_direct_conversation', { other_user_id: person.id })
      if (error || !conversation || !user) return
      chat = { conversation, person }
      setChats(x => [chat!, ...x])
    }
    setSelected(chat); setMobile(true)
  }

  const previewText = (m?: Message) => {
    if (!m) return 'Start a conversation'
    if (m.deleted_at) return 'Message deleted'
    if (m.attachment_type === 'audio') return 'Voice message'
    if (m.attachment_type === 'image') return 'Photo'
    if (m.attachment_type === 'video') return 'Video'
    if (m.attachment_type === 'file') return m.attachment_name || 'File'
    return m.content || 'Attachment'
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
            <input aria-label="Search users" placeholder="Find someone..." value={query} onChange={e => setQuery(e.target.value)} />
            {query && <button onClick={() => setQuery('')} aria-label="Clear"><X size={15} /></button>}
          </div>
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
            <button onClick={() => document.querySelector<HTMLInputElement>('.search-box input')?.focus()} aria-label="New chat"><UserPlus size={17} /></button>
          </div>
          {chats.sort((a, b) => new Date(b.conversation.updated_at).getTime() - new Date(a.conversation.updated_at).getTime()).map(c => (
            <button className={`chat-row ${selected?.conversation.id === c.conversation.id ? 'active' : ''}`} key={c.conversation.id} onClick={() => { setSelected(c); setMobile(true) }}>
              <Avatar profile={c.person} online={isOnline(c.person.id)} />
              <span><b>{c.person.display_name}</b><small>{previewText(c.latest)}</small></span>
              {c.latest && <time>{time(c.latest.created_at)}</time>}
            </button>
          ))}
          {!chats.length && (
            <div className="empty-side">
              <MessageCircle size={23} />
              <b>No conversations yet</b>
              <span>Find someone and start your first conversation.</span>
            </div>
          )}
        </div>
        <nav>
          <button onClick={() => navigate('/profile')}><CircleUserRound size={17} /> Profile</button>
          <button onClick={() => navigate('/settings')}><Settings size={17} /> Settings</button>
          {isAdmin && <button onClick={() => navigate('/admin')}><ShieldCheck size={17} /> Admin</button>}
          <button onClick={signOut}><LogOut size={17} /> Log out</button>
        </nav>
      </aside>
      <ChatPanel chat={selected} userId={user?.id || ''} online={selected ? isOnline(selected.person.id) : false} back={() => setMobile(false)} />
    </div>
  )
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

function ChatPanel({ chat, userId, online, back }: { chat: Chat | null; userId: string; online: boolean; back: () => void }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recordTime, setRecordTime] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const recordTimeRef = useRef(0)
  const { upload, uploadWithDuration } = useAttachments(userId)

  useEffect(() => {
    if (!chat) return
    setLoading(true)
    supabase.from('messages').select('*').eq('conversation_id', chat.conversation.id).order('created_at', { ascending: false }).limit(50).then(({ data }) => {
      setMessages((data || []).reverse())
      setLoading(false)
      requestAnimationFrame(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight })
    })
    const channel = supabase.channel(`chat-${chat.conversation.id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `conversation_id=eq.${chat.conversation.id}` }, p => {
      const message = p.new as Message
      setMessages(x => p.eventType === 'INSERT' ? [...x, message] : x.map(m => m.id === message.id ? message : m))
    }).subscribe()
    return () => { channel.unsubscribe() }
  }, [chat?.conversation.id])

  const sendMessage = async (params: { content?: string; attachmentUrl?: string; attachmentType?: string; attachmentName?: string; attachmentDuration?: number | null }) => {
    if (!chat) return
    const content = (params.content || '').trim()
    if (!content && !params.attachmentUrl) return
    const { data } = await supabase.from('messages').insert({
      conversation_id: chat.conversation.id,
      sender_id: userId,
      content: content || '',
      ...(params.attachmentUrl ? { attachment_url: params.attachmentUrl, attachment_type: params.attachmentType!, attachment_name: params.attachmentName!, attachment_duration: params.attachmentDuration ?? null } : {})
    }).select().single()
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

  const deleteMessage = async (id: string) => {
    await supabase.from('messages').update({ content: 'Message deleted', deleted_at: new Date().toISOString(), attachment_url: null, attachment_type: null, attachment_name: null, attachment_duration: null }).eq('id', id).eq('sender_id', userId)
  }

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
        <Avatar profile={chat.person} online={online} />
        <div><h2>{chat.person.display_name}</h2><p>{online ? 'Online now' : `@${chat.person.username}`}</p></div>
        <button className="more" aria-label="More options"><MoreHorizontal size={20} /></button>
      </header>
      <div className="messages" ref={ref}>
        {loading ? 'Loading messages...' : messages.length ? messages.map(m => (
          <div className={`message ${m.sender_id === userId ? 'mine' : ''}`} key={m.id}>
            <div className={m.deleted_at ? 'deleted' : ''}>
              {m.deleted_at ? 'Message deleted' : (
                <>
                  <AttachmentView message={m} />
                  {m.content && <span className="msg-text">{m.content}</span>}
                </>
              )}
              <small>
                {time(m.created_at)}
                {m.sender_id === userId && !m.deleted_at && (
                  <button onClick={() => deleteMessage(m.id)} aria-label="Delete message"><Trash2 size={11} /></button>
                )}
              </small>
            </div>
          </div>
        )) : (
          <div className="empty-messages">
            <Sparkles size={18} />
            <b>No messages yet</b>
            <span>Start the conversation.</span>
          </div>
        )}
      </div>
      <div className="composer">
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
