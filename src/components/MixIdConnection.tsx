import { useState, useEffect } from 'react'
import {
  Paper,
  Group,
  Button,
  Text,
  Badge,
  Modal,
  Stack,
  Switch,
  Alert,
  Loader,
} from '@mantine/core'
import { IconPlug, IconSettings, IconLogout, IconX } from '@tabler/icons-react'
import { useDisclosure } from '@mantine/hooks'
import { api, Config } from '../api/api'
import { useMixIdStatus } from '../hooks/useMixIdStatus'

export interface MixIdConnectionProps {
  onConnected?: (code?: string) => void
  onDisconnected?: () => void
  showSyncSettings?: boolean
  showSyncData?: boolean
  server?: string
  clientId?: string
  clientSecret?: string
  notifications?: {
    show: (options: { title: string; message: string; color?: string }) => void
  }
}

export default function MixIdConnection({
  onConnected,
  onDisconnected,
  showSyncSettings = true,
  showSyncData = true,
  server,
  clientId,
  clientSecret,
  notifications,
}: MixIdConnectionProps) {
  const { isConnected, syncStatus, hasConfig } = useMixIdStatus()
  const [loading, setLoading] = useState(true)
  const [syncStatusData, setSyncStatusData] = useState<{
    syncSettings: boolean
    syncData: boolean
    lastSyncAt: string | null
  } | null>(null)
  const [settingsModalOpened, { open: openSettings, close: closeSettings }] = useDisclosure(false)
  const [syncSettings, setSyncSettings] = useState(false)
  const [syncData, setSyncData] = useState(false)

  useEffect(() => {
    checkConnection()
  }, [])

  const checkConnection = async () => {
    try {
      const config = api.getConfig()
      if (!config || !config.accessToken) {
        setSyncStatusData(null)
        return
      }

      const status = await api.getSyncStatus()
      setSyncStatusData(status)
      setSyncSettings(status.syncSettings)
      setSyncData(status.syncData)
    } catch (error) {
      setSyncStatusData(null)
    } finally {
      setLoading(false)
    }
  }

  const handleConnect = async () => {
    try {
      // Get config from props or environment
      const finalApiBase = server || import.meta?.env?.VITE_MIX_ID_API_BASE || 'https://data-center.zorin.cloud/api'
      const finalClientId = clientId || 
        (typeof import.meta !== 'undefined' && import.meta.env?.VITE_MIX_ID_CLIENT_ID) 
          ? (import.meta.env?.VITE_MIX_ID_CLIENT_ID || '')
          : ''

      if (!finalClientId) {
        const message = 'MIX ID не настроен. Укажите VITE_MIX_ID_CLIENT_ID (clientId)'
        if (notifications) {
          notifications.show({
            title: 'Ошибка',
            message,
            color: 'red',
          })
        } else {
          alert(message)
        }
        return
      }

      // Не сохраняем clientSecret в клиентском приложении.
      // Если у вас есть clientSecret, выполняйте обмен кода на сервере (server-side),
      // либо включите PKCE на бэкенде. Для desktop-приложений (Electron) можно
      // передать `clientSecret` через безопасный адаптер хранения (secure native store).
      api.setConfig({
        server: finalApiBase || 'https://data-center.zorin.cloud/api',
        clientId: finalClientId,
      })

      // Initiate OAuth flow
      const redirectUri = typeof window !== 'undefined' ? window.location.origin + '/mixid-callback' : ''
      const { authorizationUrl, code } = await api.initiateOAuth(redirectUri)

      // Open OAuth window
      if (typeof window === 'undefined') return

      const width = 600
      const height = 700
      const left = window.screenX + (window.outerWidth - width) / 2
      const top = window.screenY + (window.outerHeight - height) / 2

      const oauthWindow = window.open(
        authorizationUrl,
        'MIX ID Authorization',
        `width=${width},height=${height},left=${left},top=${top}`
      )

      // Listen for OAuth callback
      const handleMessage = async (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return
          if (event.data.type === 'mixid-oauth-callback') {
          window.removeEventListener('message', handleMessage)
          oauthWindow?.close()

          try {
              const { code: callbackCode } = event.data
              // Delegate token exchange to the embedding app/backend for security.
              // Return the authorization code to the parent via callback.
              onConnected?.(callbackCode || code)
              // Trigger status update so parent can check connection state
              window.dispatchEvent(new Event('mixid-config-changed'))
              await checkConnection()
              if (notifications) {
                notifications.show({
                  title: 'Успешно',
                  message: 'MIX ID подключен',
                  color: 'green',
                })
              }
              openSettings()
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Не удалось подключить MIX ID'
            if (notifications) {
              notifications.show({
                title: 'Ошибка',
                message,
                color: 'red',
              })
            } else {
              alert(message)
            }
          }
        }
      }

      window.addEventListener('message', handleMessage)

      // Fallback: check if window was closed manually
      const checkClosed = setInterval(() => {
        if (oauthWindow?.closed) {
          clearInterval(checkClosed)
          window.removeEventListener('message', handleMessage)
        }
      }, 1000)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось инициировать подключение'
      if (notifications) {
        notifications.show({
          title: 'Ошибка',
          message,
          color: 'red',
        })
      } else {
        alert(message)
      }
    }
  }

  const handleDisconnect = async () => {
    if (typeof window === 'undefined') return
    if (!confirm('Вы уверены, что хотите отключить MIX ID?')) return

    api.clearConfig()
    // Dispatch event to trigger WebSocket disconnection and status update
    window.dispatchEvent(new Event('mixid-config-changed'))
    setSyncStatusData(null)
    if (notifications) {
      notifications.show({
        title: 'Успешно',
        message: 'MIX ID отключен',
        color: 'blue',
      })
    }
    onDisconnected?.()
  }

  const handleSaveSettings = async () => {
    try {
      await api.updateSyncPreferences(syncSettings, syncData)
      if (notifications) {
        notifications.show({
          title: 'Успешно',
          message: 'Настройки синхронизации сохранены',
          color: 'green',
        })
      }
      closeSettings()
      await checkConnection()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось сохранить настройки'
      if (notifications) {
        notifications.show({
          title: 'Ошибка',
          message,
          color: 'red',
        })
      } else {
        alert(message)
      }
    }
  }

  if (loading) {
    return (
      <Paper p="md" withBorder>
        <Loader size="sm" />
      </Paper>
    )
  }

  return (
    <>
      <Paper p="md" withBorder>
        <Group justify="space-between">
          <Group>
            <IconPlug size={24} />
            <div>
              <Text fw={500}>MIX ID</Text>
              <Text size="sm" c="dimmed">
                Синхронизация данных через Zorin Projects
              </Text>
            </div>
          </Group>
          {isConnected ? (
            <Group>
              {syncStatusData && (
                <Group gap="xs">
                  {showSyncSettings && (
                    <Badge color={syncStatusData.syncSettings ? 'green' : 'gray'}>Настройки</Badge>
                  )}
                  {showSyncData && (
                    <Badge color={syncStatusData.syncData ? 'green' : 'gray'}>Данные</Badge>
                  )}
                </Group>
              )}
              <Button leftSection={<IconSettings size={16} />} variant="light" onClick={openSettings}>
                Параметры
              </Button>
              <Button leftSection={<IconLogout size={16} />} variant="subtle" onClick={handleDisconnect}>
                Выйти
              </Button>
            </Group>
          ) : (
            <Button leftSection={<IconPlug size={16} />} onClick={handleConnect}>
              Подключить
            </Button>
          )}
        </Group>
      </Paper>

      <Modal opened={settingsModalOpened} onClose={closeSettings} title="Параметры синхронизации MIX ID">
        <Stack gap="md">
          <Alert>
            <Text size="sm">
              MIX ID позволяет синхронизировать ваши настройки и данные между устройствами. Вы можете выбрать,
              что именно синхронизировать.
            </Text>
          </Alert>

          {showSyncSettings && (
            <Switch
              label="Синхронизировать настройки"
              description="Настройки приложения будут синхронизироваться с сервером"
              checked={syncSettings}
              onChange={(e) => {
                setSyncSettings(e.currentTarget.checked)
                if (!e.currentTarget.checked) {
                  setSyncData(false)
                }
              }}
            />
          )}

          {showSyncData && (
            <Switch
              label="Синхронизировать данные"
              description="Данные приложения будут синхронизироваться с сервером"
              checked={syncData}
              onChange={(e) => setSyncData(e.currentTarget.checked)}
              disabled={showSyncSettings && !syncSettings}
            />
          )}

          {showSyncSettings && !syncSettings && (
            <Alert color="yellow" icon={<IconX size={16} />}>
              Для синхронизации данных необходимо включить синхронизацию настроек
            </Alert>
          )}

          {syncStatusData?.lastSyncAt && (
            <Text size="sm" c="dimmed">
              Последняя синхронизация: {new Date(syncStatusData.lastSyncAt).toLocaleString('ru-RU')}
            </Text>
          )}

          <Group justify="flex-end">
            <Button variant="subtle" onClick={closeSettings}>
              Отмена
            </Button>
            <Button onClick={handleSaveSettings}>Сохранить</Button>
          </Group>
        </Stack>
      </Modal>
    </>
  )
}

