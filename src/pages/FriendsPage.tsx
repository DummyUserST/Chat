import { useEffect, useState } from 'react'
import { ArrowLeft, Ban, Check, Search, Sparkles, UserPlus, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useProfile } from '../hooks/useProfile'
import { useFriends } from '../hooks/useFriends'
import { usePresence } from '../hooks/usePresence'
import { supabase } from '../lib/supabase'
import type { Profile } from '../types/database'

const initials = (name: string) => name.split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase()
const timeAgo = (value: string) => {
  const diff = Date.now() - new Date(value).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  return `${d}d`
}

function Avatar({ profile, online }: { profile: Profile; online: boolean }) {
  return <span className="avatar">{profile.avatar_url ? <img src={profile.avatar_url} alt="" /> : initials(profile.display_name || '?')}{online && <i />}</span>
}

export default function FriendsPage() {
  const { user } = useAuth()
  const { profile } = useProfile(user?.id)
  const { friends, incoming, outgoing, blocked, loading, sendRequest, acceptRequest, declineRequest, removeFriend, isFriend, hasPendingRequest, blockUser, unblockUser } = useFriends(user?.id)
  const { isOnline } = usePresence(user?.id)
  const nav = useNavigate()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Profile[]>([])
  const [tab, setTab] = useState<'friends' | 'requests' | 'find' | 'blocked'>('friends')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    const t = setTimeout(async () => {
      const q = query.trim()
      if (q.length < 2 || !user) { setResults([]); return }
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .neq('id', user.id)
        .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
        .limit(10)
      setResults(data || [])
    }, 250)
    return () => clearTimeout(t)
  }, [query, user?.id])

  const flash = (msg: string) => { setNotice(msg); setTimeout(() => setNotice(''), 3000) }

  const handleSend = async (id: string) => {
    const err = await sendRequest(id)
    flash(err || 'Friend request sent!')
  }

  const handleAccept = async (id: string) => {
    const err = await acceptRequest(id)
    flash(err || 'You are now friends!')
  }

  const handleDecline = async (id: string) => {
    const err = await declineRequest(id)
    flash(err || 'Request declined.')
  }

  const handleRemove = async (id: string) => {
    const err = await removeFriend(id)
    flash(err || 'Friend removed.')
  }

  const handleBlock = async (id: string) => {
    const err = await blockUser(id)
    flash(err || 'User blocked.')
  }

  const handleUnblock = async (id: string) => {
    const err = await unblockUser(id)
    flash(err || 'User unblocked.')
  }

  return (
    <div className="friends-shell">
      <header className="settings-top">
        <button onClick={() => nav('/chats')}><ArrowLeft size={18} /> Back to chats</button>
        <div className="brand"><span className="brand-mark"><Sparkles size={16} /></span> tandem</div>
        <button onClick={() => nav('/stories')}><Sparkles size={17} /> Stories</button>
      </header>
      <main className="friends-content">
        <p className="eyebrow">Friends</p>
        <h1>Your circle.</h1>
        <p className="muted">Find people, send friend requests, and grow your network.</p>

        <div className="friends-tabs">
          <button className={tab === 'friends' ? 'active' : ''} onClick={() => setTab('friends')}>
            Friends {friends.length > 0 && <span className="tab-count">{friends.length}</span>}
          </button>
          <button className={tab === 'requests' ? 'active' : ''} onClick={() => setTab('requests')}>
            Requests {incoming.length > 0 && <span className="tab-count">{incoming.length}</span>}
          </button>
          <button className={tab === 'find' ? 'active' : ''} onClick={() => setTab('find')}>
            <Search size={15} /> Find people
          </button>
          <button className={tab === 'blocked' ? 'active' : ''} onClick={() => setTab('blocked')}>
            <Ban size={15} /> Blocked {blocked.length > 0 && <span className="tab-count">{blocked.length}</span>}
          </button>
        </div>

        {notice && <div className="success friends-notice">{notice}</div>}

        {loading ? (
          <div className="stories-loading">Loading...</div>
        ) : tab === 'friends' ? (
          <div className="friends-list">
            {friends.length ? friends.map(({ friend, requestId }) => (
              <div className="friend-row" key={friend.id}>
                <Avatar profile={friend} online={isOnline(friend.id)} />
                <div className="friend-info">
                  <b>{friend.display_name}</b>
                  <small>@{friend.username}</small>
                </div>
                <button className="friend-action" onClick={() => handleRemove(requestId)}>
                  <X size={15} /> Remove
                </button>
                <button className="friend-action danger" onClick={() => handleBlock(friend.id)}>
                  <Ban size={15} /> Block
                </button>
              </div>
            )) : (
              <div className="stories-empty">
                <UserPlus size={26} />
                <b>No friends yet</b>
                <span>Search for people and send a friend request.</span>
              </div>
            )}
          </div>
        ) : tab === 'requests' ? (
          <div className="friends-list">
            {incoming.length === 0 && outgoing.length === 0 ? (
              <div className="stories-empty">
                <UserPlus size={26} />
                <b>No pending requests</b>
                <span>Friend requests will appear here.</span>
              </div>
            ) : (
              <>
                {incoming.length > 0 && <p className="friends-section-label">Incoming</p>}
                {incoming.map(({ request, profile: p }) => (
                  <div className="friend-row" key={request.id}>
                    <Avatar profile={p} online={isOnline(p.id)} />
                    <div className="friend-info">
                      <b>{p.display_name}</b>
                      <small>@{p.username} · {timeAgo(request.created_at)} ago</small>
                    </div>
                    <button className="friend-action accept" onClick={() => handleAccept(request.id)}>
                      <Check size={15} /> Accept
                    </button>
                    <button className="friend-action" onClick={() => handleDecline(request.id)}>
                      <X size={15} /> Decline
                    </button>
                  </div>
                ))}
                {outgoing.length > 0 && <p className="friends-section-label">Sent</p>}
                {outgoing.map(({ request, profile: p }) => (
                  <div className="friend-row" key={request.id}>
                    <Avatar profile={p} online={isOnline(p.id)} />
                    <div className="friend-info">
                      <b>{p.display_name}</b>
                      <small>@{p.username} · {timeAgo(request.created_at)} ago</small>
                    </div>
                    <span className="pending-tag">Pending</span>
                  </div>
                ))}
              </>
            )}
          </div>
        ) : tab === 'blocked' ? (
          <div className="friends-list">
            {blocked.length ? blocked.map(({ block, profile: p }) => (
              <div className="friend-row" key={block.id}>
                <Avatar profile={p} online={isOnline(p.id)} />
                <div className="friend-info">
                  <b>{p.display_name}</b>
                  <small>@{p.username}</small>
                </div>
                <button className="friend-action accept" onClick={() => handleUnblock(block.id)}>
                  <X size={15} /> Unblock
                </button>
              </div>
            )) : (
              <div className="stories-empty">
                <Ban size={26} />
                <b>No blocked users</b>
                <span>People you block will appear here.</span>
              </div>
            )}
          </div>
        ) : (
          <div className="friends-find">
            <div className="search-box friends-search">
              <Search size={17} />
              <input
                placeholder="Search by name or username..."
                value={query}
                onChange={e => setQuery(e.target.value)}
                aria-label="Search people"
              />
              {query && <button onClick={() => setQuery('')} aria-label="Clear"><X size={15} /></button>}
            </div>
            <div className="friends-list">
              {results.map(p => (
                <div className="friend-row" key={p.id}>
                  <Avatar profile={p} online={isOnline(p.id)} />
                  <div className="friend-info">
                    <b>{p.display_name}</b>
                    <small>@{p.username}</small>
                  </div>
                  {isFriend(p.id) ? (
                    <span className="friends-tag">Friends</span>
                  ) : hasPendingRequest(p.id) ? (
                    <span className="pending-tag">Pending</span>
                  ) : (
                    <button className="friend-action accept" onClick={() => handleSend(p.id)}>
                      <UserPlus size={15} /> Add friend
                    </button>
                  )}
                </div>
              ))}
              {!results.length && query.trim().length >= 2 && (
                <div className="stories-empty">
                  <Search size={24} />
                  <b>No one found</b>
                  <span>Try a different name or username.</span>
                </div>
              )}
              {!query.trim() && (
                <div className="stories-empty">
                  <Search size={24} />
                  <b>Start searching</b>
                  <span>Type a name or username to find people.</span>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
