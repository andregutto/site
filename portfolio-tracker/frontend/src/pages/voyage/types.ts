export type TripStatus = 'planning' | 'ongoing' | 'past'

export interface Trip {
  id: number
  user_id: string
  title: string
  destination: string | null
  country: string | null
  cover_image_url: string | null
  cover_image_position: string
  start_date: string | null
  end_date: string | null
  summary: string | null
  status: TripStatus
  share_token: string | null
  share_expires_at: string | null
  share_hide_cost: boolean
  created_at: string
  // from list endpoint
  cost_total?: number
  cost_budget?: number | null
}

export interface TripMoment {
  id: number
  name: string
  icon: string
  color: string
  budget: number | null
  start_date: string | null
  end_date: string | null
  spent: number
}

export interface CostByUser {
  user_id: string
  total: number
  moment_ids: number[]
  display?: { name: string; email: string; avatar_url?: string }
}

export interface TripCost {
  total: number
  budget: number | null
  currency: string
  moments: TripMoment[]
  by_user: CostByUser[]
}

export interface TripMember {
  id: number
  user_id: string | null
  invite_email: string | null
  role: 'owner' | 'editor' | 'viewer'
  status: 'pending' | 'active' | 'left'
  joined_at: string | null
}

export interface TripPlace {
  id: number
  trip_id: number
  added_by: string | null
  library_place_id: number | null
  name: string
  category: string | null
  lat: number | null
  lng: number | null
  address: string | null
  google_place_id: string | null
  google_maps_url: string | null
  day_number: number | null
  sort_order: number
  is_highlight: boolean
  rating: number | null
  visited: boolean
  trip_note: string | null
}

export interface MomentPicker {
  id: number
  name: string
  icon: string
  color: string
  start_date: string | null
  end_date: string | null
  budget: number | null
}
