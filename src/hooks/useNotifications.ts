import { useState, useEffect, useCallback } from 'react'
import { mixIdApi } from '../api/mixIdApi'
import { wsClient } from '../api/websocket'

export interface Notification {
  id: string
  appId: string | null
  title: string
  message: string
  type: string
  read: boolean
  createdAt: string
}

const NOTIFICATIONS_STORAGE_KEY = 'mixId_notifications'

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>(() => {
    if (typeof window === 'undefined' || !window.localStorage) {
      return []
    }
    try {
      const stored = localStorage.getItem(NOTIFICATIONS_STORAGE_KEY)
      return stored ? JSON.parse(stored) : []
    } catch {
      return []
    }
  })
  const [unreadCount, setUnreadCount] = useState(0)

  const saveNotifications = useCallback((newNotifications: Notification[]) => {
    setNotifications(newNotifications)
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(newNotifications))
    }
    setUnreadCount(newNotifications.filter((n) => !n.read).length)
  }, [])

  const fetchNotifications = useCallback(async () => {
    try {
      const config = mixIdApi.getConfig()
      if (!config || !config.accessToken) {
        return
      }

      const apiBase = config.apiBase || (typeof import.meta !== 'undefined' && import.meta.env?.VITE_MIX_ID_API_BASE) 
        ? (import.meta.env?.VITE_MIX_ID_API_BASE || 'http://localhost:3000/api')
        : 'http://localhost:3000/api'

      const response = await fetch(`${apiBase}/notifications`, {
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        saveNotifications(data)
      }
    } catch (error) {
      console.error('Failed to fetch notifications:', error)
    }
  }, [saveNotifications])

  const markAsRead = useCallback(
    async (notificationId: string) => {
      try {
        const config = mixIdApi.getConfig()
        if (!config || !config.accessToken) {
          return
        }

        // Update locally first
        const updated = notifications.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
        saveNotifications(updated)

        // Send via WebSocket for real-time sync
        if (wsClient.isConnected()) {
          wsClient.send({
            type: 'notification:read',
            notificationId,
          })
        }

        // Also send via HTTP as fallback
        const apiBase = config.apiBase || (typeof import.meta !== 'undefined' && import.meta.env?.VITE_MIX_ID_API_BASE) 
          ? (import.meta.env?.VITE_MIX_ID_API_BASE || 'http://localhost:3000/api')
          : 'http://localhost:3000/api'

        await fetch(`${apiBase}/notifications/${notificationId}/read`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${config.accessToken}`,
          },
        })
      } catch (error) {
        console.error('Failed to mark notification as read:', error)
      }
    },
    [notifications, saveNotifications]
  )

  const markAllAsRead = useCallback(async () => {
    try {
      const config = mixIdApi.getConfig()
      if (!config || !config.accessToken) {
        return
      }

      // Update locally first
      const updated = notifications.map((n) => ({ ...n, read: true }))
      saveNotifications(updated)

      // Send via HTTP
      const apiBase = config.apiBase || (typeof import.meta !== 'undefined' && import.meta.env?.VITE_MIX_ID_API_BASE) 
        ? (import.meta.env?.VITE_MIX_ID_API_BASE || 'http://localhost:3000/api')
        : 'http://localhost:3000/api'

      await fetch(`${apiBase}/notifications/read-all`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
        },
      })
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error)
    }
  }, [notifications, saveNotifications])

  useEffect(() => {
    const config = mixIdApi.getConfig()
    if (!config || !config.accessToken) {
      // Clear notifications if MIX ID is not connected
      saveNotifications([])
      return
    }

    // Fetch initial notifications
    fetchNotifications()

    // Set up WebSocket handlers
    const handleNewNotification = (message: any) => {
      if (message.notification) {
        const newNotification = message.notification as Notification
        const updated = [newNotification, ...notifications]
        saveNotifications(updated)
      }
    }

    const handleNotificationRead = (message: any) => {
      if (message.notificationId) {
        const updated = notifications.map((n) =>
          n.id === message.notificationId ? { ...n, read: true } : n
        )
        saveNotifications(updated)
      }
    }

    wsClient.on('notification:new', handleNewNotification)
    wsClient.on('notification:read', handleNotificationRead)

    // Periodic refresh (every 5 minutes)
    const interval = setInterval(fetchNotifications, 5 * 60 * 1000)

    return () => {
      wsClient.off('notification:new', handleNewNotification)
      wsClient.off('notification:read', handleNotificationRead)
      clearInterval(interval)
    }
  }, [fetchNotifications, notifications, saveNotifications])

  return {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    refresh: fetchNotifications,
  }
}

