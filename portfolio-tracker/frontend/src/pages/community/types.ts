export interface CommunityCategory {
  id: number
  slug: string
  name_key: string
  name?: string | null
  icon: string | null
  icon_key?: string | null
  sort_order: number
  topic_count: number
  archived?: boolean
}

export interface CommunityMemberRow {
  id: string
  name: string
  username: string | null
  avatar_url: string | null
  tier: 'free' | 'paid'
  joined_at: string
  is_admin: boolean
}

export interface CommunityRecentPost {
  id: number
  topic_id: number
  topic_title: string
  category_slug: string
  author_name: string
  excerpt: string
  created_at: string
}

export interface CommunityAuthor {
  id: string
  name: string
  username?: string
  avatar_url?: string
  is_admin?: boolean
}

export interface CommunityTopicSummary {
  id: number
  category_id: number
  category_slug?: string
  title: string
  matched_in_body?: boolean
  pinned: boolean
  locked: boolean
  reply_count: number
  last_post_at: string
  created_at: string
  author: CommunityAuthor
}

export interface CommunityLinkedTrip {
  id: number
  title: string
  destination: string | null
  cover_image_url: string | null
  share_token: string
}

export interface CommunityPost {
  id: number
  topic_id: number
  body: string
  edited_at: string | null
  created_at: string
  author: CommunityAuthor
  like_count: number
  liked_by_me: boolean
  is_first_post: boolean
}

export interface CommunityTopicDetail {
  id: number
  category_id: number
  title: string
  pinned: boolean
  locked: boolean
  created_at: string
  author: CommunityAuthor
  is_own: boolean
  is_admin_viewer: boolean
  linked_trip: CommunityLinkedTrip | null
  posts: CommunityPost[]
}

export interface VoyageTripOption {
  id: number
  title: string
  destination?: string | null
  share_token?: string | null
}
