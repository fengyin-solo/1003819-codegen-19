import { MODULE_BY_KEY } from '@/data/modules'
import { allRows, listRows, resetRows, saveRows } from '@/data/local-store'
import {
  listReceptionTodos as readReceptionTodos,
  listReturnRecords,
  normalizeVisitArea,
  saveReturnRecord,
  UNASSIGNED_AREA,
} from '@/data/visit-exchange'
import type { VisitAppointment, VisitPackage, VisitReturnRecord } from '@/data/visit-exchange'
import type { ActionResult, EntryRow, ModuleMeta, OverviewResult, PageResult } from '@/data/types'

// 会写进数据的「往回走」动作：命中就把这条记录标成异常态，看板上能一眼看出来。
const NEGATIVE_ACTIONS = ['撤销', '作废', '拒绝', '驳回', '停用', '忽略', '下线', '回滚']

export function moduleMeta(key: string): ModuleMeta {
  const meta = MODULE_BY_KEY.get(key)
  if (!meta) {
    throw new Error(`没有登记名为 ${key} 的业务模块`)
  }
  return meta
}

export function filterRows(rows: EntryRow[], filters: Record<string, string>): EntryRow[] {
  const pairs = Object.entries(filters).filter(([, value]) => value.trim() !== '')
  if (pairs.length === 0) {
    return rows
  }
  return rows.filter((row) =>
    pairs.every(([field, value]) => String(row[field] ?? '').includes(value.trim())),
  )
}

export function listEntries(key: string, filters: Record<string, string> = {}): PageResult {
  const matched = filterRows(listRows(key), filters)
  return { items: matched, total: matched.length, page: 1, size: matched.length }
}

export function runAction(key: string, id: number, action: string): ActionResult {
  const meta = moduleMeta(key)
  const target = meta.actionTargets[action]
  if (!target) {
    return { ok: false, message: `${meta.entity}没有登记「${action}」这个动作` }
  }
  const rows = listRows(key)
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的${meta.entity}` }
  }
  const current = String(rows[index].status)
  if (current === target) {
    return { ok: false, message: `${meta.entity}已经是「${target}」，不用重复操作` }
  }
  const lastStatus = meta.statuses[meta.statuses.length - 1]
  const updated: EntryRow = {
    ...rows[index],
    status: target,
    pending: target !== lastStatus,
    abnormal: NEGATIVE_ACTIONS.some((verb) => action.startsWith(verb)),
  }
  const next = [...rows]
  next[index] = updated
  saveRows(key, next)
  return { ok: true, message: `${meta.entity}已${action}，当前状态「${target}」` }
}

export function resetModule(key: string): PageResult {
  resetRows(key)
  return listEntries(key)
}

export function exportEntries(key: string): { filename: string; content: string } {
  const meta = moduleMeta(key)
  const header = ['编号', ...meta.fields, '当前状态']
  const lines = [header.join(',')]
  for (const row of listRows(key)) {
    lines.push([row.id, ...meta.fields.map((field) => row[field] ?? ''), row.status].join(','))
  }
  return { filename: `${meta.name}-清单.csv`, content: `\uFEFF${lines.join('\n')}` }
}

export function downloadEntries(key: string): void {
  const { filename, content } = exportEntries(key)
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

export function loadOverview(): OverviewResult {
  const rows = allRows()
  const modules = [...MODULE_BY_KEY.values()].map((meta) => {
    const entries = rows[meta.key] ?? []
    return {
      name: meta.name,
      created: entries.length,
      pending: entries.filter((row) => row.pending).length,
      abnormal: entries.filter((row) => row.abnormal).length,
    }
  })
  const receptionTodos = readReceptionTodos()
  const cards = [
    { label: '业务模块', value: modules.length },
    { label: '登记总量', value: modules.reduce((sum, item) => sum + item.created, 0) },
    { label: '待处理', value: modules.reduce((sum, item) => sum + item.pending, 0) },
    { label: '异常量', value: modules.reduce((sum, item) => sum + item.abnormal, 0) },
    { label: '接待待办', value: receptionTodos.length },
  ]
  return { cards, modules, receptionTodos }
}

// ---- 工地接待预约交换包 ----

const VISIT_KEY = 'visit'
// 已取消、已归档是终态：不再生成接待包，也不再接受回传。
const VISIT_TERMINAL_STATUSES = ['已取消', '已归档']

function findVisitRow(id: number): EntryRow | undefined {
  return listRows(VISIT_KEY).find((row) => Number(row.id) === id)
}

// 跨发掘区校验：返回空串表示可以操作，否则是拒绝原因。未分配区域的记录各发掘区都能处理。
export function visitAreaBlock(row: EntryRow, operatorArea: string): string {
  const area = normalizeVisitArea(row['参观区域'])
  if (area === UNASSIGNED_AREA || area === operatorArea) {
    return ''
  }
  return `该记录属于「${area}」，跨发掘区人员不能修改其他接待记录`
}

function platformAppointment(row: EntryRow): VisitAppointment {
  return {
    来访编号: String(row['来访编号'] ?? ''),
    来访单位: String(row['来访单位'] ?? ''),
    参观区域: normalizeVisitArea(row['参观区域']),
    接待人员: String(row['接待人员'] ?? ''),
    计划日期: String(row['参观日期'] ?? ''),
  }
}

export function buildVisitPackage(
  id: number,
  operatorArea: string,
): { ok: boolean; message: string; pkg?: VisitPackage } {
  const row = findVisitRow(id)
  if (!row) {
    return { ok: false, message: `没有找到编号为 ${id} 的来访记录` }
  }
  const block = visitAreaBlock(row, operatorArea)
  if (block) {
    return { ok: false, message: block }
  }
  const status = String(row.status)
  if (VISIT_TERMINAL_STATUSES.includes(status)) {
    return { ok: false, message: `预约${status}，不能再生成接待包` }
  }
  const pkg: VisitPackage = {
    kind: 'visit-appointment-package',
    version: 1,
    generatedAt: new Date().toISOString(),
    appointment: platformAppointment(row),
    到访结果: { 是否到访: '', 实际到访日期: '', 现场备注: '' },
  }
  return { ok: true, message: `已生成 ${pkg.appointment.来访编号} 的接待包，可交给现场值守端`, pkg }
}

export function downloadVisitPackage(id: number, operatorArea: string): ActionResult {
  const built = buildVisitPackage(id, operatorArea)
  if (!built.ok || !built.pkg) {
    return { ok: false, message: built.message }
  }
  const blob = new Blob([JSON.stringify(built.pkg, null, 2)], {
    type: 'application/json;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `接待包-${built.pkg.appointment.来访编号}.json`
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
  return { ok: true, message: built.message }
}

// 冲突约定：预约基础信息一律以平台为准（平台没有该预约、或预约已到终态时直接拒绝），
// 包内与平台不一致的字段按平台登记并记入 conflicts；到访结果以回传包为准。
export function importVisitReturn(text: string, operator: string, operatorArea: string): ActionResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, message: '回传文件不是有效的 JSON，请使用平台生成的接待包' }
  }
  const pkg = parsed as Partial<VisitPackage>
  if (pkg?.kind !== 'visit-appointment-package' || !pkg.appointment) {
    return { ok: false, message: '回传文件不是工地接待预约包' }
  }
  const visitNo = String(pkg.appointment.来访编号 ?? '').trim()
  if (!visitNo) {
    return { ok: false, message: '回传包缺少来访编号，无法对应平台预约' }
  }
  const row = listRows(VISIT_KEY).find((item) => String(item['来访编号']) === visitNo)
  if (!row) {
    return { ok: false, message: `平台没有来访编号 ${visitNo} 的预约，回传被拒绝（以平台为准）` }
  }
  const block = visitAreaBlock(row, operatorArea)
  if (block) {
    return { ok: false, message: block }
  }
  const status = String(row.status)
  if (VISIT_TERMINAL_STATUSES.includes(status)) {
    return { ok: false, message: `预约 ${visitNo} ${status}，平台状态优先，回传被拒绝` }
  }
  const result = pkg.到访结果
  const 是否到访 = String(result?.是否到访 ?? '').trim()
  if (!是否到访) {
    return { ok: false, message: '回传包还没有填写到访结果，请现场值守端补充后再回传' }
  }
  const appointment = platformAppointment(row)
  const conflicts: string[] = []
  const pairs: [keyof VisitAppointment, unknown][] = [
    ['来访单位', pkg.appointment.来访单位],
    ['参观区域', pkg.appointment.参观区域],
    ['接待人员', pkg.appointment.接待人员],
    ['计划日期', pkg.appointment.计划日期],
  ]
  for (const [field, incoming] of pairs) {
    const incomingText =
      field === '参观区域' ? normalizeVisitArea(incoming) : String(incoming ?? '').trim()
    if (incomingText !== appointment[field]) {
      conflicts.push(`${field}以平台「${appointment[field]}」为准（回传包为「${incomingText}」）`)
    }
  }
  const record: VisitReturnRecord = {
    visitNo,
    appointment,
    是否到访,
    实际到访日期: String(result?.实际到访日期 ?? '').trim(),
    现场备注: String(result?.现场备注 ?? '').trim(),
    conflicts,
    returnedAt: new Date().toISOString(),
    returnedBy: operator,
  }
  saveReturnRecord(record, `确认 ${visitNo}（${appointment.来访单位}）到访结果：${是否到访}`)
  const conflictNote = conflicts.length ? `，${conflicts.length} 处不一致已按平台为准` : ''
  return { ok: true, message: `回传成功：${visitNo} 到访结果已登记${conflictNote}，运营概览已新增接待待办` }
}

export function listVisitResults(): VisitReturnRecord[] {
  return listReturnRecords()
}
