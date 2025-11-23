import { useEffect, useCallback, useState } from 'react'
import { mixIdApi } from '../api/mixIdApi'
import { wsClient } from '../api/websocket'

export interface Session {
  id: string
  deviceInfo: any
  lastActivityAt: string
  createdAt: string
}

export interface UseMixIdSessionOptions {
  onSessionDeleted?: () => void
  onSessionExpired?: () => void
  onSessionInvalid?: () => void
  heartbeatInterval?: number
  checkSessionOnMount?: boolean
}

export function useMixIdSession(options: UseMixIdSessionOptions = {}) {
  const {
    onSessionDeleted,
    onSessionExpired,
    onSessionInvalid,
    heartbeatInterval = 30 * 1000, // 30 seconds
    checkSessionOnMount = true,
  } = options

  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)

  const sendHeartbeat = useCallback(async () => {
    try {
      const config = mixIdApi.getConfig()
      if (!config || !config.accessToken) {
        return
      }

      const result = await mixIdApi.heartbeat({
        platform: typeof navigator !== 'undefined' ? navigator.platform : 'unknown',
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
        timestamp: new Date().toISOString(),
      })

      // Store session ID if returned
      if (result && (result as any).sessionId) {
        setCurrentSessionId((result as any).sessionId)
      }
    } catch (error) {
      console.error('Heartbeat failed:', error)
      // If heartbeat fails with 401/403, session might be deleted or expired
      if (error instanceof Error) {
        if (error.message.includes('401') || error.message.includes('403')) {
          mixIdApi.clearConfig()
          wsClient.disconnect()
          onSessionExpired?.()
        } else if (error.message.includes('404')) {
          // Session not found - might have been deleted
          mixIdApi.clearConfig()
          wsClient.disconnect()
          onSessionDeleted?.()
        } else {
          onSessionInvalid?.()
        }
      }
    }
  }, [onSessionDeleted, onSessionExpired, onSessionInvalid])

  const checkSession = useCallback(async () => {
    try {
      const config = mixIdApi.getConfig()
      if (!config || !config.accessToken) {
        return
      }

      // Try to get sessions to verify current session exists
      const sessions = await mixIdApi.getSessions()
      // If we have a current session ID, check if it still exists
      if (currentSessionId) {
        const sessionExists = sessions.some(s => s.id === currentSessionId)
        if (!sessionExists) {
          // Session was deleted
          mixIdApi.clearConfig()
          wsClient.disconnect()
          onSessionDeleted?.()
        }
      }
    } catch (error) {
      console.error('Failed to check session:', error)
      if (error instanceof Error && (error.message.includes('401') || error.message.includes('403'))) {
        mixIdApi.clearConfig()
        wsClient.disconnect()
        onSessionExpired?.()
      }
    }
  }, [currentSessionId, onSessionDeleted, onSessionExpired])

  useEffect(() => {
    const config = mixIdApi.getConfig()
    if (!config || !config.accessToken) {
      return
    }

    // Check session on mount if enabled
    if (checkSessionOnMount) {
      checkSession()
    }

    // Set up WebSocket handlers for session events
    const handleSessionDeleted = (message: any) => {
      // If message contains sessionId, check if it's our session
      if (message.sessionId) {
        if (currentSessionId && message.sessionId === currentSessionId) {
          // Our session was deleted
          mixIdApi.clearConfig()
          wsClient.disconnect()
          onSessionDeleted?.()
        }
      } else {
        // Session deletion event without specific ID - might be ours
        // Check by making a request
        checkSession()
      }
    }

    const handleSessionExpired = () => {
      mixIdApi.clearConfig()
      wsClient.disconnect()
      onSessionExpired?.()
    }

    wsClient.on('session:deleted', handleSessionDeleted)
    wsClient.on('session:expired', handleSessionExpired)

    // Start heartbeat
    const heartbeatIntervalId = setInterval(sendHeartbeat, heartbeatInterval)
    
    // Send initial heartbeat
    sendHeartbeat()

    // Check session periodically (every 5 minutes)
    const sessionCheckInterval = setInterval(checkSession, 5 * 60 * 1000)

    return () => {
      wsClient.off('session:deleted', handleSessionDeleted)
      wsClient.off('session:expired', handleSessionExpired)
      clearInterval(heartbeatIntervalId)
      clearInterval(sessionCheckInterval)
    }
  }, [sendHeartbeat, checkSession, onSessionDeleted, onSessionExpired, heartbeatInterval, checkSessionOnMount, currentSessionId])

  return {
    sendHeartbeat,
    checkSession,
    currentSessionId,
  }
}

