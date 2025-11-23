# @localzet/data-connector

Библиотека для подключения к MIX ID с поддержкой синхронизации в реальном времени, уведомлений и управления сессиями.

## Установка

```bash
npm install @localzet/data-connector
```

## Использование

### Базовое подключение

```tsx
import { MixIdConnection } from '@localzet/data-connector/components';
import { useMixIdSync } from '@localzet/data-connector/hooks';

function App() {
  const { performSync } = useMixIdSync();
  
  return (
    <div>
      <MixIdConnection />
    </div>
  );
}
```

### Хуки

- `useMixIdSync()` - синхронизация данных
- `useMixIdStatus()` - статус подключения
- `useNotifications()` - уведомления
- `useMixIdSession()` - управление сессиями

### API

- `mixIdApi` - основной API клиент
- `wsClient` - WebSocket клиент
- `offlineQueue` - очередь для офлайн операций

## Особенности

- ✅ OAuth 2.0 авторизация
- ✅ Синхронизация в реальном времени через WebSocket
- ✅ Уведомления в реальном времени
- ✅ Управление сессиями с взаимоудалением
- ✅ Офлайн поддержка с очередью операций
- ✅ React компоненты для быстрой интеграции
- ✅ TypeScript поддержка

