// 工地接待预约交换包：预约文件下发给现场值守端，现场填到访结果后回传。
// 回传结果与接待待办按来访编号去重，存在本机 localStorage，各页面共享这一份。

export const UNASSIGNED_AREA = '未分配'

// 历史记录可能没有参观区域：统一按「未分配」兼容。
export function normalizeVisitArea(value: unknown): string {
  const text = String(value ?? '').trim()
  return text === '' ? UNASSIGNED_AREA : text
}

export type VisitAppointment = {
  来访编号: string
  来访单位: string
  参观区域: string
  接待人员: string
  计划日期: string
}

export type VisitPackage = {
  kind: 'visit-appointment-package'
  version: 1
  generatedAt: string
  appointment: VisitAppointment
  到访结果: {
    是否到访: string
    实际到访日期: string
    现场备注: string
  }
}

export type VisitReturnRecord = {
  visitNo: string
  appointment: VisitAppointment
  是否到访: string
  实际到访日期: string
  现场备注: string
  conflicts: string[]
  returnedAt: string
  returnedBy: string
}

export type ReceptionTodo = {
  visitNo: string
  text: string
  createdAt: string
}

type VisitExchangeState = {
  results: VisitReturnRecord[]
  todos: ReceptionTodo[]
}

const STORAGE_KEY = 'field-archaeology-digital:visit-exchange'

function emptyState(): VisitExchangeState {
  return { results: [], todos: [] }
}

function readState(): VisitExchangeState {
  if (typeof window === 'undefined' || !window.localStorage) {
    return emptyState()
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    return emptyState()
  }
  try {
    const parsed = JSON.parse(raw) as Partial<VisitExchangeState>
    return {
      results: Array.isArray(parsed.results) ? parsed.results : [],
      todos: Array.isArray(parsed.todos) ? parsed.todos : [],
    }
  } catch {
    return emptyState()
  }
}

let cache: VisitExchangeState | null = null

function exchangeState(): VisitExchangeState {
  if (cache === null) {
    cache = readState()
  }
  return cache
}

function saveState(state: VisitExchangeState): void {
  cache = state
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }
}

export function listReturnRecords(): VisitReturnRecord[] {
  return [...exchangeState().results]
}

export function listReceptionTodos(): ReceptionTodo[] {
  return [...exchangeState().todos]
}

// 同一预约重复下载回传只保留一份结果，接待待办也不重复登记。
export function saveReturnRecord(record: VisitReturnRecord, todoText: string): void {
  const state = exchangeState()
  const results = [...state.results]
  const resultIndex = results.findIndex((item) => item.visitNo === record.visitNo)
  if (resultIndex >= 0) {
    results[resultIndex] = record
  } else {
    results.push(record)
  }
  const todos = [...state.todos]
  const todo: ReceptionTodo = { visitNo: record.visitNo, text: todoText, createdAt: record.returnedAt }
  const todoIndex = todos.findIndex((item) => item.visitNo === record.visitNo)
  if (todoIndex >= 0) {
    todos[todoIndex] = todo
  } else {
    todos.push(todo)
  }
  saveState({ results, todos })
}
