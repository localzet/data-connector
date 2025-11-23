# Использование библиотеки @localzet/data-connector

## Установка

```bash
cd data-connector
npm install
npm run build
```

## Интеграция в проект

### 1. Установка как локальная зависимость

В `package.json` вашего проекта добавьте:

```json
{
  "dependencies": {
    "@localzet/data-connector": "file:../data-connector"
  }
}
```

### 2. Базовое использование

```tsx
import { MixIdConnection, useMixIdSync, useMixIdSession, useNotifications } from '@localzet/data-connector'
import { notifications } from '@mantine/notifications'

function App() {
  // Управление сессиями с взаимоудалением
  useMixIdSession({
    onSessionDeleted: () => {
      notifications.show({
        title: 'Сессия удалена',
        message: 'Ваша сессия была удалена в личном кабинете',
        color: 'red',
      })
    },
    onSessionExpired: () => {
      notifications.show({
        title: 'Сессия истекла',
        message: 'Ваша сессия истекла. Пожалуйста, войдите снова',
        color: 'orange',
      })
    },
  })

  // Синхронизация данных
  const { performSync } = useMixIdSync({
    dataTypes: ['timesheets', 'projects', 'activities'],
    getLocalSettings: () => {
      // Вернуть локальные настройки
      return {}
    },
    getLocalData: async (dataType) => {
      // Вернуть локальные данные по типу
      return {}
    },
    saveLocalSettings: (settings) => {
      // Сохранить настройки локально
    },
    saveLocalData: (dataType, data) => {
      // Сохранить данные локально
    },
    onSettingsUpdate: (settings) => {
      // Обработка обновления настроек
    },
    onDataUpdate: (dataType, data) => {
      // Обработка обновления данных
    },
  })

  // Уведомления
  const { notifications: mixIdNotifications, unreadCount } = useNotifications()

  return (
    <div>
      <MixIdConnection
        notifications={notifications}
        showSyncSettings={true}
        showSyncData={true}
      />
    </div>
  )
}
```

### 3. Настройка роутинга для OAuth callback

Добавьте маршрут для обработки OAuth callback:

```tsx
import { MixIdCallbackPage } from '@localzet/data-connector/components'

// В вашем роутере
<Route path="/mixid-callback" element={<MixIdCallbackPage />} />
```

### 4. Переменные окружения

Создайте `.env` файл:

```env
VITE_MIX_ID_API_BASE=http://localhost:3000/api
VITE_MIX_ID_CLIENT_ID=your_client_id
VITE_MIX_ID_CLIENT_SECRET=your_client_secret
```

## Особенности

### Взаимоудаление сессий

Библиотека автоматически отслеживает удаление сессий:
- Если сессия удалена в личном кабинете, приложение автоматически отключается
- Если сессия удалена в приложении, она удаляется на сервере
- Поддержка heartbeat для поддержания сессии активной

### Уведомления в реальном времени

Уведомления синхронизируются через WebSocket:
- Новые уведомления приходят мгновенно
- Статус прочтения синхронизируется между устройствами

### Синхронизация данных

- Автоматическая синхронизация через WebSocket
- Fallback на HTTP при недоступности WebSocket
- Очередь операций для офлайн режима
- Разрешение конфликтов (remote-wins, local-wins, newer-wins)

## API

### mixIdApi

```typescript
// Настройка
mixIdApi.setConfig({ apiBase, clientId, clientSecret })
const config = mixIdApi.getConfig()
mixIdApi.clearConfig()

// OAuth
await mixIdApi.initiateOAuth(redirectUri, state)
await mixIdApi.exchangeCodeForToken(code, redirectUri)

// Синхронизация
await mixIdApi.getSyncStatus()
await mixIdApi.updateSyncPreferences(syncSettings, syncData)
await mixIdApi.uploadSettings(settings)
await mixIdApi.downloadSettings()
await mixIdApi.uploadData(dataType, data)
await mixIdApi.downloadData(dataType)
await mixIdApi.checkUpdates(settingsVersion, dataTypes)

// Сессии
await mixIdApi.heartbeat(deviceInfo)
await mixIdApi.getSessions()
await mixIdApi.deleteSession(sessionId)
```

### wsClient

```typescript
wsClient.connect()
wsClient.disconnect()
wsClient.isConnected()
wsClient.send(message)
wsClient.on(eventType, handler)
wsClient.off(eventType, handler)
```

### offlineQueue

```typescript
offlineQueue.enqueue(type, data, dataType)
await offlineQueue.processQueue(processFn)
offlineQueue.remove(id)
offlineQueue.clear()
offlineQueue.getQueue()
offlineQueue.getQueueSize()
```

