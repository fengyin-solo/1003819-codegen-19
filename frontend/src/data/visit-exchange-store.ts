import type { TodoItem, VisitReturnRecord } from './types'

// 预约交换包的回传结果与接待待办：与业务记录分开存，刷新、关掉再打开都还在。
const STORAGE_KEY = 'field-archaeology-digital:visit-exchange'

export type ExchangeStore = {
  results: Record<string, VisitReturnRecord>
  todos: TodoItem[]
}

const EMPTY: ExchangeStore = { results: {}, todos: [] }

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function readStorage(): ExchangeStore {
  if (typeof window === 'undefined' || !window.localStorage) {
    return clone(EMPTY)
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    return clone(EMPTY)
  }
  try {
    const parsed = JSON.parse(raw) as Partial<ExchangeStore>
    return { results: parsed.results ?? {}, todos: parsed.todos ?? [] }
  } catch {
    return clone(EMPTY)
  }
}

let cache: ExchangeStore | null = null

export function exchangeStore(): ExchangeStore {
  if (cache === null) {
    cache = readStorage()
  }
  return cache
}

export function saveExchange(store: ExchangeStore): void {
  cache = store
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  }
}
