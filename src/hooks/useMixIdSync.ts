import { useEffect, useRef, useCallback } from 'react'
import { mixIdApi } from '../api/mixIdApi'
import { wsClient } from '../api/websocket'
import { offlineQueue } from '../api/offlineQueue'

const SYNC_INTERVAL = 5 * 60 * 1000 // 5 minutes (fallback HTTP sync)
const HEARTBEAT_INTERVAL = 30 * 1000 // 30 seconds

export interface UseMixIdSyncOptions {
  dataTypes?: string[]
  onSettingsUpdate?: (settings: any) => void
  onDataUpdate?: (dataType: string, data: Record<string, any>) => void
  getLocalSettings?: () => any
  getLocalData?: (dataType: string) => Promise<Record<string, any>>
  saveLocalSettings?: (settings: any) => void | Promise<void>
  saveLocalData?: (dataType: string, data: Record<string, any>) => void | Promise<void>
  mergeStrategy?: 'remote-wins' | 'local-wins' | 'newer-wins'
}

export function useMixIdSync(options: UseMixIdSyncOptions = {}) {
  const {
    dataTypes = [],
    onSettingsUpdate,
    onDataUpdate,
    getLocalSettings,
    getLocalData,
    saveLocalSettings,
    saveLocalData,
    mergeStrategy = 'newer-wins',
  } = options

  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const lastSettingsVersionRef = useRef<number>(0)
  const lastSettingsUpdateRef = useRef<number>(0)

  // Handle conflict resolution
  const mergeWithConflictResolution = useCallback(
    (local: any, remote: any, remoteUpdatedAt: string): any => {
      const remoteTime = new Date(remoteUpdatedAt).getTime()
      const localTime = lastSettingsUpdateRef.current

      switch (mergeStrategy) {
        case 'remote-wins':
          lastSettingsUpdateRef.current = remoteTime
          return { ...local, ...remote }
        case 'local-wins':
          return local
        case 'newer-wins':
        default:
          if (remoteTime > localTime) {
            lastSettingsUpdateRef.current = remoteTime
            return { ...local, ...remote }
          }
          return local
      }
    },
    [mergeStrategy]
  )

  // Upload settings
  const uploadSettings = useCallback(
    async (settingsToUpload: any, version?: number) => {
      try {
        const syncStatus = await mixIdApi.getSyncStatus()
        if (!syncStatus.syncSettings) return

        const result = await mixIdApi.uploadSettings(settingsToUpload)
        lastSettingsVersionRef.current = result.version
        lastSettingsUpdateRef.current = Date.now()

        // Send via WebSocket for real-time sync
        if (wsClient.isConnected()) {
          wsClient.send({
            type: 'sync:settings',
            settings: settingsToUpload,
            version: result.version,
          })
        }
      } catch (error) {
        console.error('Failed to upload settings:', error)
        // Queue for offline sync
        if (saveLocalSettings) {
          offlineQueue.enqueue('settings', settingsToUpload)
        }
      }
    },
    [saveLocalSettings]
  )

  // Upload data
  const uploadData = useCallback(async (dataType: string, data: Record<string, any>) => {
    try {
      const syncStatus = await mixIdApi.getSyncStatus()
      if (!syncStatus.syncData) return

      await mixIdApi.uploadData(dataType, data)

      // Send via WebSocket for real-time sync
      if (wsClient.isConnected()) {
        wsClient.send({
          type: 'sync:data',
          dataType,
          data,
        })
      }
    } catch (error) {
      console.error(`Failed to upload ${dataType}:`, error)
      // Queue for offline sync
      offlineQueue.enqueue('data', data, dataType)
    }
  }, [])

  // Process offline queue
  const processOfflineQueue = useCallback(async () => {
    await offlineQueue.processQueue(async (operation) => {
      if (operation.type === 'settings') {
        await uploadSettings(operation.data)
      } else if (operation.type === 'data' && operation.dataType) {
        await uploadData(operation.dataType, operation.data)
      }
    })
  }, [uploadSettings, uploadData])

  // Perform sync
  const performSync = useCallback(async () => {
    try {
      const config = mixIdApi.getConfig()
      if (!config || !config.accessToken) {
        return
      }

      // Get sync status
      const syncStatus = await mixIdApi.getSyncStatus()

      // Check for updates
      const updates = await mixIdApi.checkUpdates(
        lastSettingsVersionRef.current,
        syncStatus.syncData && dataTypes.length > 0 ? dataTypes : undefined
      )

      // Download updates if available
      if (updates.hasUpdates) {
        if (updates.updates.settings && syncStatus.syncSettings && getLocalSettings && saveLocalSettings) {
          try {
            const remoteSettings = await mixIdApi.downloadSettings()
            const localSettings = getLocalSettings()
            const merged = mergeWithConflictResolution(localSettings, remoteSettings.settings, remoteSettings.updatedAt)
            await saveLocalSettings(merged)
            lastSettingsVersionRef.current = remoteSettings.version
            onSettingsUpdate?.(merged)
          } catch (error) {
            console.error('Failed to download settings:', error)
          }
        }

        if (updates.updates.data && syncStatus.syncData && dataTypes.length > 0) {
          for (const dataType of dataTypes) {
            if (updates.updates.data[dataType] && getLocalData && saveLocalData) {
              try {
                const remoteData = await mixIdApi.downloadData(dataType)
                const localData = await getLocalData(dataType)
                
                // Merge with conflict resolution
                const merged = { ...localData, ...remoteData.data }
                await saveLocalData(dataType, merged)
                onDataUpdate?.(dataType, merged)
              } catch (error) {
                console.error(`Failed to download ${dataType}:`, error)
              }
            }
          }
        }
      }

      // Upload local changes (only if not already synced via WebSocket)
      if (syncStatus.syncSettings && getLocalSettings) {
        const localSettings = getLocalSettings()
        await uploadSettings(localSettings)
      }

      if (syncStatus.syncData && dataTypes.length > 0 && getLocalData) {
        for (const dataType of dataTypes) {
          try {
            const localData = await getLocalData(dataType)
            if (localData && Object.keys(localData).length > 0) {
              await uploadData(dataType, localData)
            }
          } catch (error) {
            console.error(`Failed to upload ${dataType}:`, error)
          }
        }
      }

      // Process offline queue
      await processOfflineQueue()
    } catch (error) {
      console.error('Sync error:', error)
    }
  }, [
    dataTypes,
    getLocalSettings,
    getLocalData,
    saveLocalSettings,
    saveLocalData,
    mergeWithConflictResolution,
    uploadSettings,
    uploadData,
    processOfflineQueue,
    onSettingsUpdate,
    onDataUpdate,
  ])

  useEffect(() => {
    const setupSync = () => {
      const config = mixIdApi.getConfig()
      if (!config || !config.accessToken) {
        // Disconnect WebSocket if config is cleared
        wsClient.disconnect()
        return
      }

      // Connect WebSocket
      wsClient.connect()
    }

    // Initial setup
    setupSync()

    // Listen for config changes
    const handleConfigChange = () => {
      setupSync()
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('mixid-config-changed', handleConfigChange)

      const config = mixIdApi.getConfig()
      if (!config || !config.accessToken) {
        return () => {
          window.removeEventListener('mixid-config-changed', handleConfigChange)
        }
      }

      // Set up WebSocket event handlers
      const handleSettingsUpdate = (message: any) => {
        if (message.settings && message.updatedAt && getLocalSettings && saveLocalSettings) {
          const localSettings = getLocalSettings()
          const merged = mergeWithConflictResolution(localSettings, message.settings, message.updatedAt)
          saveLocalSettings(merged)
          lastSettingsVersionRef.current = message.version || lastSettingsVersionRef.current
          onSettingsUpdate?.(merged)
        }
      }

      const handleDataUpdate = async (message: any) => {
        if (message.dataType && message.data && getLocalData && saveLocalData) {
          try {
            const localData = await getLocalData(message.dataType)
            const merged = { ...localData, ...message.data }
            await saveLocalData(message.dataType, merged)
            onDataUpdate?.(message.dataType, merged)
          } catch (error) {
            console.error(`Error merging ${message.dataType}:`, error)
          }
        }
      }

      wsClient.on('sync:settings:update', handleSettingsUpdate)
      wsClient.on('sync:data:update', handleDataUpdate)

      // Initial sync
      performSync()

      // Set up periodic sync (fallback HTTP sync)
      syncIntervalRef.current = setInterval(performSync, SYNC_INTERVAL)

      // Set up heartbeat
      heartbeatIntervalRef.current = setInterval(() => {
        mixIdApi.heartbeat({
          platform: typeof navigator !== 'undefined' ? navigator.platform : 'unknown',
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
        }).catch(console.error)
      }, HEARTBEAT_INTERVAL)

      // Process offline queue when online
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        processOfflineQueue()
      }

      return () => {
        window.removeEventListener('mixid-config-changed', handleConfigChange)
        wsClient.off('sync:settings:update', handleSettingsUpdate)
        wsClient.off('sync:data:update', handleDataUpdate)
        if (syncIntervalRef.current) {
          clearInterval(syncIntervalRef.current)
        }
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current)
        }
      }
    }
  }, [
    mergeWithConflictResolution,
    uploadSettings,
    uploadData,
    processOfflineQueue,
    performSync,
    getLocalSettings,
    getLocalData,
    saveLocalSettings,
    saveLocalData,
    onSettingsUpdate,
    onDataUpdate,
  ])

  return { performSync, uploadSettings, uploadData }
}

