export interface StorageAdapter {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export class InMemoryStorage implements StorageAdapter {
  private store = new Map<string, string>()
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null
  }
  setItem(key: string, value: string) {
    this.store.set(key, value)
  }
  removeItem(key: string) {
    this.store.delete(key)
  }
}

export class SessionStorageAdapter implements StorageAdapter {
  getItem(key: string) {
    if (typeof window === 'undefined' || !window.sessionStorage) return null
    return window.sessionStorage.getItem(key)
  }
  setItem(key: string, value: string) {
    if (typeof window === 'undefined' || !window.sessionStorage) return
    window.sessionStorage.setItem(key, value)
  }
  removeItem(key: string) {
    if (typeof window === 'undefined' || !window.sessionStorage) return
    window.sessionStorage.removeItem(key)
  }
}

export function createDefaultStorage(): StorageAdapter {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      // Разрешаем sessionStorage только если явно включено через env (безопасность по умолчанию)
      // В сборках Vite можно установить VITE_ALLOW_PERSISTENT_STORAGE=true для тестов
      // Но лучше использовать безопасное хранилище на бекенде / secure native storage
      // @ts-ignore
      if (import.meta?.env?.VITE_ALLOW_PERSISTENT_STORAGE === 'true') {
        return new SessionStorageAdapter()
      }
    }
  } catch (e) {
    // ignore
  }
  return new InMemoryStorage()
}
