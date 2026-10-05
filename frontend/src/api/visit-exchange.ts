import { downloadTextFile, UNASSIGNED_AREA, visitAreaOf } from '@/api/local-service'
import { listRows, saveRows } from '@/data/local-store'
import { exchangeStore, saveExchange } from '@/data/visit-exchange-store'
import type {
  ActionResult,
  EntryRow,
  TodoItem,
  VisitPackage,
  VisitReturnRecord,
} from '@/data/types'

const VISIT_KEY = 'visit'

// 现场值守端回传时允许填的到访结果。
const VISIT_RESULTS = ['已到访', '未到访']

// 冲突处理规则：回传包与平台状态冲突时以平台为准。
// - 平台记录已取消 / 已归档的，回传包直接作废；
// - 来访单位、参观区域、接待人员、计划日期以平台登记为准，回传包只带回到访结果。
const BLOCKED_STATUSES = ['已取消', '已归档']

export { UNASSIGNED_AREA, visitAreaOf }

/** 跨发掘区人员不能修改其他接待记录；未分配区域的历史记录所有人可处理。 */
export function canModifyVisit(row: EntryRow, operatorArea: string): boolean {
  const area = visitAreaOf(row)
  return area === UNASSIGNED_AREA || area === operatorArea
}

/** 预约已取消或已归档时不能再生成接待包。 */
export function canGeneratePackage(row: EntryRow): boolean {
  return !BLOCKED_STATUSES.includes(String(row.status))
}

/** 把来访编号、来访单位、参观区域、接待人员、计划日期打包成预约文件。 */
export function buildAppointmentPackage(row: EntryRow, operator: string): VisitPackage {
  const visitNo = String(row['来访编号'] ?? '')
  return {
    type: 'visit-appointment-package',
    version: 1,
    packageId: `${visitNo}-${Date.now()}`,
    generatedAt: new Date().toISOString(),
    generatedBy: operator,
    来访编号: visitNo,
    来访单位: String(row['来访单位'] ?? ''),
    参观区域: visitAreaOf(row),
    接待人员: String(row['接待人员'] ?? ''),
    计划日期: String(row['参观日期'] ?? ''),
    到访结果: '',
    实际到访日期: '',
    值守备注: '',
  }
}

export function downloadAppointmentPackage(row: EntryRow, operator: string): ActionResult {
  if (!canGeneratePackage(row)) {
    return { ok: false, message: `预约已「${String(row.status)}」，不能再生成接待包` }
  }
  const pkg = buildAppointmentPackage(row, operator)
  downloadTextFile(
    `预约包-${pkg.来访编号}.json`,
    JSON.stringify(pkg, null, 2),
    'application/json;charset=utf-8',
  )
  return { ok: true, message: `已生成 ${pkg.来访编号} 的预约包，可交给现场值守端` }
}

/** 导入现场值守端的回传包：校验、冲突裁决、去重、登记待办。 */
export function importReturnPackage(
  text: string,
  operatorArea: string,
  operator: string,
): ActionResult {
  let pkg: VisitPackage
  try {
    pkg = JSON.parse(text) as VisitPackage
  } catch {
    return { ok: false, message: '回传包不是有效的 JSON 文件' }
  }
  if (pkg.type !== 'visit-appointment-package' || pkg.version !== 1) {
    return { ok: false, message: '回传包格式不对，请使用平台生成的预约包' }
  }
  const visitNo = String(pkg.来访编号 ?? '').trim()
  if (!visitNo) {
    return { ok: false, message: '回传包缺少来访编号' }
  }
  const rows = listRows(VISIT_KEY)
  const index = rows.findIndex((row) => String(row['来访编号']) === visitNo)
  if (index < 0) {
    return { ok: false, message: `平台没有来访编号为 ${visitNo} 的接待记录` }
  }
  const current = rows[index]
  if (!canModifyVisit(current, operatorArea)) {
    return {
      ok: false,
      message: `参观区域「${visitAreaOf(current)}」不属于当前发掘区，跨发掘区人员不能修改其他接待记录`,
    }
  }
  if (BLOCKED_STATUSES.includes(String(current.status))) {
    return {
      ok: false,
      message: `平台记录已「${String(current.status)}」，回传包与平台状态冲突，以平台为准，本次回传作废`,
    }
  }
  const store = exchangeStore()
  if (store.results[visitNo]) {
    return { ok: false, message: `${visitNo} 已有回传结果，同一预约重复回传只保留一份` }
  }
  const result = String(pkg.到访结果 ?? '').trim()
  if (!VISIT_RESULTS.includes(result)) {
    return { ok: false, message: `回传包的到访结果需填「${VISIT_RESULTS.join('」或「')}」` }
  }
  const arrivedAt = String(pkg.实际到访日期 ?? '').trim()
  const note = String(pkg.值守备注 ?? '').trim()
  const now = new Date().toISOString()
  const updated: EntryRow = {
    ...current,
    参观区域: visitAreaOf(current),
    到访结果: result,
    实际到访日期: arrivedAt,
    值守备注: note,
    status: result === '已到访' ? '已接待' : current.status,
    pending: true,
  }
  const next = [...rows]
  next[index] = updated
  saveRows(VISIT_KEY, next)
  const record: VisitReturnRecord = {
    visitNo,
    packageId: String(pkg.packageId ?? ''),
    result,
    arrivedAt,
    note,
    importedAt: now,
    importedBy: operator,
  }
  const todo: TodoItem = {
    id: `visit-${visitNo}`,
    kind: '接待待办',
    title: `${visitNo} 回传「${result}」，请跟进后续接待安排`,
    visitNo,
    createdAt: now,
    done: false,
  }
  saveExchange({
    results: { ...store.results, [visitNo]: record },
    todos: [todo, ...store.todos.filter((item) => item.visitNo !== visitNo)],
  })
  return { ok: true, message: `${visitNo} 回传成功，到访结果「${result}」，运营概览已新增接待待办` }
}

export function setTodoDone(id: string, done: boolean): void {
  const store = exchangeStore()
  saveExchange({
    ...store,
    todos: store.todos.map((item) => (item.id === id ? { ...item, done } : item)),
  })
}
