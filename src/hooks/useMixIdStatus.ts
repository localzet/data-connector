import { useState, useEffect, useCallback } from 'react'
import { api } from '../api/api'
import { wsClient } from '../api/websocket'

export type MixIdSyncStatus = 'connected-ws' | 'connected-rest' | 'disconnected' | 'checking'

export interface UseMixIdStatusReturn {
  isConnected: boolean
  syncStatus: MixIdSyncStatus
  hasConfig: boolean
  refresh: () => void
}

export function useMixIdStatus(): UseMixIdStatusReturn {
  const [isConnected, setIsConnected] = useState(false)
  const [syncStatus, setSyncStatus] = useState<MixIdSyncStatus>('checking')
  const [hasConfig, setHasConfig] = useState(false)

  const checkStatus = useCallback(async () => {
    try {
      const config = api.getConfig()
      const hasConfigValue = !!(config && config.accessToken)
      setHasConfig(hasConfigValue)

      if (!hasConfigValue) {
        setIsConnected(false)
        setSyncStatus('disconnected')
        return
      }

      // Check WebSocket connection
      const wsConnected = wsClient.isConnected()
      
      if (wsConnected) {
        setIsConnected(true)
        setSyncStatus('connected-ws')
      } else {
        // Check if we can use REST API (try to get sync status)
        try {
          await api.getSyncStatus()
          setIsConnected(true)
          setSyncStatus('connected-rest')
        } catch (error) {
          setIsConnected(false)
          setSyncStatus('disconnected')
        }
      }
    } catch (error) {
      setIsConnected(false)
      setSyncStatus('disconnected')
    }
  }, [])

  useEffect(() => {
    // Initial check
    checkStatus()

    // Check periodically
    const interval = setInterval(checkStatus, 2000) // Check every 2 seconds

    // Listen to storage changes (для cross-tab обновлений, если приложение использует персистентное хранилище)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'mixid_config' || e.key === 'mixId_config' ) {
        checkStatus()
      }
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('storage', handleStorageChange)

      // Listen to custom events for same-tab updates
      const handleConfigChange = () => {
        checkStatus()
      }

      const handleWsStatusChange = () => {
        checkStatus()
      }

      window.addEventListener('mixid-config-changed', handleConfigChange)
      window.addEventListener('mixid-ws-status-changed', handleWsStatusChange)

      return () => {
        clearInterval(interval)
        window.removeEventListener('storage', handleStorageChange)
        window.removeEventListener('mixid-config-changed', handleConfigChange)
        window.removeEventListener('mixid-ws-status-changed', handleWsStatusChange)
      }
    }

    return () => {
      clearInterval(interval)
    }
  }, [checkStatus])

  return {
    isConnected,
    syncStatus,
    hasConfig,
    refresh: checkStatus,
  }
}

