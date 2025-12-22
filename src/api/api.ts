import { createDefaultStorage, StorageAdapter } from './storage'

const MIX_ID_API_BASE = import.meta?.env?.VITE_MIX_ID_API_BASE ?? 'https://data-center.zorin.cloud/api'

export interface Config {
  // Server
  server: string

  // App
  clientId: string
  clientSecret?: string

  // User
  accessToken?: string
  refreshToken?: string
}

class API {
  private config: Config | null = null
  private storage: StorageAdapter

  constructor(storage?: StorageAdapter) {
    this.storage = storage || createDefaultStorage()
  }

  setStorageAdapter(adapter: StorageAdapter) {
    this.storage = adapter
  }

  setConfig(config: Config) {
    this.config = config

    try {
      this.storage.setItem('mixid_config', JSON.stringify({
        server: config.server,
        clientId: config.clientId,
      }))
    } catch (e) {
      console.error('Error saving MIX ID config:', e)
    }

    window?.dispatchEvent(new Event('mixid-config-changed'))
  }

  getConfig(): Config | null {
    if (!this.config) {
      try {
        const stored = this.storage.getItem('mixid_config')
        if (stored) {
          this.config = { ...JSON.parse(stored) } as Config
        }
      } catch (error) {
        console.error('Error loading MIX ID config:', error)
        this.config = null
      }
    }
    return this.config
  }

  clearConfig() {
    this.config = null
    try {
      this.storage.removeItem('mixid_config')
    } catch (e) {
      console.error('Error clearing MIX ID config:', e)
    }

    window?.dispatchEvent(new Event('mixid-config-changed'))
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const config = this.getConfig()
    if (!config) {
      throw new Error('MIX ID not configured')
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    }

    const token = config.accessToken || null
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    const response = await fetch(`${config.server || MIX_ID_API_BASE}${endpoint}`, {
      ...options,
      headers,
    })

    if (response.status === 401) {
      const refreshed = await this.refreshAccessToken()
      if (refreshed) {
        const retryHeaders: Record<string, string> = {
          ...headers,
          Authorization: `Bearer ${refreshed}`,
        }
        const retryResponse = await fetch(`${config.server || MIX_ID_API_BASE}${endpoint}`, {
          ...options,
          headers: retryHeaders,
        })
        if (!retryResponse.ok) {
          throw new Error(`HTTP ${retryResponse.status}`)
        }
        return retryResponse.json()
      }
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }))
      throw new Error(error.error || `HTTP ${response.status}`)
    }

    return response.json()
  }

  private async refreshAccessToken(): Promise<string | null> {
    const config = this.getConfig()
    const refreshToken = config?.refreshToken
    if (!refreshToken) return null

    try {
      const response = await fetch(`${config?.server || MIX_ID_API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      })

      if (!response.ok) return null

      const data = await response.json()
      if (data.accessToken) {
        if (this.config) {
          this.config.accessToken = data.accessToken
        }
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('mixid-config-changed'))
        }
        return data.accessToken
      }
    } catch (error) {
      console.error('Failed to refresh token:', error)
    }
    return null
  }

  async initiateOAuth(redirectUri: string, state?: string): Promise<{ authorizationUrl: string; code: string }> {
    const config = this.getConfig()
    if (!config) {
      throw new Error('MIX ID not configured')
    }

    return this.request<{ authorizationUrl: string; code: string; state?: string }>(
      '/auth/oauth/authorize',
      {
        method: 'POST',
        body: JSON.stringify({
          clientId: config.clientId,
          redirectUri,
          state,
        }),
      }
    )
  }

  async exchangeCodeForToken(code: string, redirectUri?: string): Promise<{
    access_token: string
    refresh_token: string
    token_type: string
    expires_in: number
  }> {
    const config = this.getConfig()
    if (!config) {
      throw new Error('MIX ID not configured')
    }

    // Обмен кода на токен. Не отправляем clientSecret из браузера по умолчанию.
    // Рекомендуется использовать PKCE или выполнять обмен кода на сервере (server-side exchange).
    const body: any = {
      code,
      clientId: config.clientId,
      redirectUri,
    }

    const allowClientSecretInBrowser = import.meta?.env?.VITE_ALLOW_CLIENT_SECRET_IN_BROWSER === 'true'
    if (config.clientSecret) {
      if (typeof window === 'undefined' || allowClientSecretInBrowser) {
        body.clientSecret = config.clientSecret
      } else {
        console.warn('clientSecret присутствует, но не отправляется из браузера по соображениям безопасности. Используйте PKCE или server-side exchange.')
      }
    }

    const response = await fetch(`${config.server || MIX_ID_API_BASE}/auth/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }))
      throw new Error(error.error || `HTTP ${response.status}`)
    }

    const data = await response.json() as {
      access_token: string
      refresh_token: string
      token_type: string
      expires_in: number
    }

    this.setConfig({
      ...config,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
    })

    return data
  }

  async getSyncStatus(): Promise<{
    syncSettings: boolean
    syncData: boolean
    lastSyncAt: string | null
  }> {
    return this.request('/sync/status')
  }

  async updateSyncPreferences(syncSettings: boolean, syncData: boolean): Promise<{ success: boolean }> {
    return this.request('/sync/preferences', {
      method: 'PUT',
      body: JSON.stringify({ syncSettings, syncData }),
    })
  }

  async uploadSettings(settings: any): Promise<{ success: boolean; version: number }> {
    return this.request('/sync/settings', {
      method: 'POST',
      body: JSON.stringify({ settings }),
    })
  }

  async downloadSettings(): Promise<{ settings: any; version: number; updatedAt: string }> {
    return this.request('/sync/settings')
  }

  async uploadData(dataType: string, data: Record<string, any>): Promise<{ success: boolean }> {
    const CHUNK_SIZE = 100
    const dataEntries = Object.entries(data)

    if (dataEntries.length <= CHUNK_SIZE) {
      return this.request('/sync/data', {
        method: 'POST',
        body: JSON.stringify({ dataType, data }),
      })
    }

    const chunks: Record<string, any>[] = []
    for (let i = 0; i < dataEntries.length; i += CHUNK_SIZE) {
      const chunk: Record<string, any> = {}
      for (let j = i; j < Math.min(i + CHUNK_SIZE, dataEntries.length); j++) {
        chunk[dataEntries[j][0]] = dataEntries[j][1]
      }
      chunks.push(chunk)
    }

    for (const chunk of chunks) {
      await this.request('/sync/data', {
        method: 'POST',
        body: JSON.stringify({ dataType, data: chunk }),
      })
    }

    return { success: true }
  }

  async downloadData(dataType: string): Promise<{ data: Record<string, any>; dataType: string }> {
    return this.request(`/sync/data?dataType=${dataType}`)
  }

  async checkUpdates(settingsVersion?: number, dataTypes?: string[]): Promise<{
    updates: {
      settings?: { version: number; updatedAt: string }
      data?: Record<string, { updatedAt: string }>
    }
    hasUpdates: boolean
  }> {
    const params = new URLSearchParams()
    if (settingsVersion) params.append('settingsVersion', settingsVersion.toString())
    if (dataTypes) params.append('dataTypes', dataTypes.join(','))
    return this.request(`/sync/check-updates?${params.toString()}`)
  }

  async heartbeat(deviceInfo?: any): Promise<{ success: boolean }> {
    return this.request('/sessions/heartbeat', {
      method: 'POST',
      body: JSON.stringify({ deviceInfo }),
    })
  }

  async getSessions(): Promise<Array<{
    id: string
    deviceInfo: any
    lastActivityAt: string
    createdAt: string
  }>> {
    return this.request('/sessions')
  }

  async deleteSession(sessionId: string): Promise<{ success: boolean }> {
    return this.request(`/sessions/${sessionId}`, {
      method: 'DELETE',
    })
  }
}

export const api = new API()

