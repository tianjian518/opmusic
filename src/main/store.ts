import Store from 'electron-store'

export interface Account {
  id: string
  name: string
  url: string
  username: string
  password: string
}

export interface Playlist {
  id: string
  name: string
  tracks: TrackRef[]
}

export interface TrackRef {
  accountId: string
  path: string
  name: string
  artist?: string
  album?: string
  duration?: number
}

export interface Settings {
  theme: 'dark' | 'light'
  accent: string
  playMode: 'order' | 'loop-one' | 'loop-list' | 'shuffle'
  volume: number
  eq: number[] // 10 段增益 dB
}

export interface ProgressItem {
  path: string
  time: number
}

const defaults = {
  accounts: [] as Account[],
  playlists: [] as Playlist[],
  favorites: [] as TrackRef[],
  settings: {
    theme: 'dark',
    accent: '#1db954',
    playMode: 'order',
    volume: 0.8,
    eq: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  } as Settings,
  progress: {} as Record<string, number>
}

class AppStore {
  private store
  constructor() {
    this.store = new Store({ defaults })
  }
  get<T = any>(key: string): T {
    return this.store.get(key) as T
  }
  set(key: string, value: any) {
    this.store.set(key, value)
  }
}

export const appStore = new AppStore()
