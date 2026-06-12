// MOCK para revisão visual — usuário fake, sem rede. NÃO usar em produção.
const mockUser = {
  id: 'mock-user-id',
  email: 'andre@arvo.app',
  user_metadata: {
    first_name: 'André',
    last_name: 'Gutto',
    preferred_locale: 'pt',
    favorites: ['/dashboard', '/finances', '/finances/freedom'],
  },
  app_metadata: {},
  aud: 'authenticated',
  created_at: '2023-02-01T00:00:00Z',
  email_confirmed_at: '2023-02-01T00:05:00Z',
  confirmed_at: '2023-02-01T00:05:00Z',
  last_sign_in_at: '2026-06-12T08:00:00Z',
  role: 'authenticated',
}

const mockSession = {
  access_token: 'mock-token',
  refresh_token: 'mock-refresh',
  expires_in: 3600,
  token_type: 'bearer',
  user: mockUser,
}

type Cb = (event: string, session: typeof mockSession | null) => void

export const supabase = {
  auth: {
    getSession: async () => ({ data: { session: mockSession }, error: null }),
    getUser: async () => ({ data: { user: mockUser }, error: null }),
    refreshSession: async () => ({ data: { session: mockSession, user: mockUser }, error: null }),
    onAuthStateChange: (cb: Cb) => {
      setTimeout(() => cb('INITIAL_SESSION', mockSession), 0)
      return { data: { subscription: { unsubscribe: () => {} } } }
    },
    signInWithPassword: async () => ({ data: { session: mockSession }, error: null }),
    signUp: async () => ({ data: {}, error: null }),
    signOut: async () => ({ error: null }),
    resend: async () => ({ data: {}, error: null }),
    updateUser: async () => ({ data: { user: mockUser }, error: null }),
    resetPasswordForEmail: async () => ({ data: {}, error: null }),
  },
  storage: {
    from: () => ({
      upload: async () => ({ data: { path: 'mock' }, error: null }),
      getPublicUrl: () => ({ data: { publicUrl: '' } }),
    }),
  },
} as never
