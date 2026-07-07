import { useEffect, useState } from 'react'
import { apiFetch } from '../lib/api'

export interface ActiveFriend {
  email: string
  name?: string
  avatar_url?: string
  user_id: string | null
}

type PeopleResponse = { contacts: { email: string; name?: string; avatar_url?: string; user_id: string | null; contexts: { type: string; friend_status?: string }[] }[] }

// Every share/invite overlay (Voyage trip, Moment, Shared category) re-fetched /people from
// scratch on every mount, so the friends shortcut list showed up empty for a few seconds each
// time the overlay opened — annoying since it's the same list every time in a session. Cache
// it at module scope: first call fetches and shares the in-flight promise, later calls in the
// same session reuse the cached result immediately.
let cached: ActiveFriend[] | null = null
let inFlight: Promise<ActiveFriend[]> | null = null

function fetchActiveFriends(): Promise<ActiveFriend[]> {
  if (cached) return Promise.resolve(cached)
  if (!inFlight) {
    inFlight = apiFetch<PeopleResponse>('/people')
      .then(data => {
        const list = data.contacts
          .filter(c => c.contexts.some(ctx => ctx.type === 'friend' && ctx.friend_status === 'active'))
          .map(c => ({ email: c.email, name: c.name, avatar_url: c.avatar_url, user_id: c.user_id }))
        cached = list
        return list
      })
      .catch(() => [])
      .finally(() => { inFlight = null })
  }
  return inFlight
}

// Called once from AppLayout on mount so the list is already warm by the time the
// user opens the first share/invite overlay in a session, instead of only starting
// the fetch (and showing an empty list for a few seconds) at that point.
export function prefetchActiveFriends(): void {
  if (!cached && !inFlight) fetchActiveFriends()
}

export function useActiveFriends(): ActiveFriend[] {
  const [friends, setFriends] = useState<ActiveFriend[]>(cached ?? [])

  useEffect(() => {
    if (cached) { setFriends(cached); return }
    fetchActiveFriends().then(setFriends)
  }, [])

  return friends
}
