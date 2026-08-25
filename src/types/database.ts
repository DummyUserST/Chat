export type Profile = {
  id: string
  username: string
  display_name: string
  avatar_url: string | null
  status: string | null
  last_seen: string | null
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

export type Database = {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Omit<Profile, 'created_at' | 'updated_at'>; Update: Partial<Profile> }
      conversations: { Row: Conversation; Insert: Partial<Conversation>; Update: Partial<Conversation> }
      conversation_members: { Row: ConversationMember; Insert: Omit<ConversationMember, 'joined_at'>; Update: Partial<ConversationMember> }
      messages: { Row: Message; Insert: Omit<Message, 'id' | 'created_at' | 'edited_at' | 'deleted_at'>; Update: Partial<Message> }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
