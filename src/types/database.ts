export type Profile = {
  id: string
  username: string
  display_name: string
  avatar_url: string | null
  status: string | null
  last_seen: string | null
  birthday: string | null
  private_name: string | null
  created_at: string
  updated_at: string
}

export type Conversation = {
  id: string
  created_at: string
  updated_at: string
}

export type ConversationMember = {
  conversation_id: string
  user_id: string
  joined_at: string
  hidden: boolean
  profile?: Profile
}

export type Message = {
  id: string
  conversation_id: string
  sender_id: string
  content: string
  created_at: string
  edited_at: string | null
  deleted_at: string | null
  attachment_url: string | null
  attachment_type: string | null
  attachment_name: string | null
  attachment_duration: number | null
}

export type FriendRequest = {
  id: string
  sender_id: string
  receiver_id: string
  status: 'pending' | 'accepted' | 'declined'
  created_at: string
  updated_at: string
}

export type Story = {
  id: string
  author_id: string
  image_url: string
  caption: string | null
  privacy: 'public' | 'private'
  created_at: string
}

export type StoryLike = {
  id: string
  story_id: string
  user_id: string
  created_at: string
}

export type StoryComment = {
  id: string
  story_id: string
  user_id: string
  content: string
  created_at: string
}

export type MessageReaction = {
  id: string
  message_id: string
  user_id: string
  emoji: string
  created_at: string
}

export type BlockedUser = {
  id: string
  blocker_id: string
  blocked_id: string
  created_at: string
}

export type AdminBroadcast = {
  id: string
  message: string
  created_by: string
  created_at: string
  cancelled_at: string | null
}

export type Database = {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Omit<Profile, 'created_at' | 'updated_at'>; Update: Partial<Profile> }
      conversations: { Row: Conversation; Insert: Partial<Conversation>; Update: Partial<Conversation> }
      conversation_members: { Row: ConversationMember; Insert: Omit<ConversationMember, 'joined_at'>; Update: Partial<ConversationMember> }
      messages: { Row: Message; Insert: Omit<Message, 'id' | 'created_at' | 'edited_at' | 'deleted_at'>; Update: Partial<Message> }
      friend_requests: { Row: FriendRequest; Insert: Omit<FriendRequest, 'id' | 'created_at' | 'updated_at'>; Update: Partial<FriendRequest> }
      stories: { Row: Story; Insert: Omit<Story, 'id' | 'created_at'>; Update: Partial<Story> }
      story_likes: { Row: StoryLike; Insert: Omit<StoryLike, 'id' | 'created_at'>; Update: Partial<StoryLike> }
      story_comments: { Row: StoryComment; Insert: Omit<StoryComment, 'id' | 'created_at'>; Update: Partial<StoryComment> }
      message_reactions: { Row: MessageReaction; Insert: Omit<MessageReaction, 'id' | 'created_at'>; Update: Partial<MessageReaction> }
      blocked_users: { Row: BlockedUser; Insert: Omit<BlockedUser, 'id' | 'created_at'>; Update: Partial<BlockedUser> }
      admin_broadcasts: { Row: AdminBroadcast; Insert: Omit<AdminBroadcast, 'id' | 'created_at'>; Update: Partial<AdminBroadcast> }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
