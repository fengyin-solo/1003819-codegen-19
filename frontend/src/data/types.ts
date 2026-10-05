/** 纯前端数据层的公共类型：与全栈版后端返回的结构保持一致，换回后端时页面不用改。 */

export type EntryRow = {
  id: number
  status: string
  pending: boolean
  abnormal: boolean
  [field: string]: string | number | boolean
}

export type ModuleMeta = {
  key: string
  name: string
  entity: string
  desc: string
  fields: string[]
  statuses: string[]
  actions: string[]
  actionTargets: Record<string, string>
  metrics: string[]
}

export type PageResult = {
  items: EntryRow[]
  total: number
  page: number
  size: number
}

export type ActionResult = {
  ok: boolean
  message: string
}

export type OverviewResult = {
  cards: { label: string; value: number }[]
  modules: { name: string; created: number; pending: number; abnormal: number }[]
  todos: TodoItem[]
}

/** 预约交换包：平台导出给现场值守端的预约文件，值守端补写到访结果后原样回传。 */
export type VisitPackage = {
  type: 'visit-appointment-package'
  version: 1
  packageId: string
  generatedAt: string
  generatedBy: string
  来访编号: string
  来访单位: string
  参观区域: string
  接待人员: string
  计划日期: string
  到访结果: string
  实际到访日期: string
  值守备注: string
}

/** 一次成功回传的存档：按来访编号去重，同一预约只保留一份。 */
export type VisitReturnRecord = {
  visitNo: string
  packageId: string
  result: string
  arrivedAt: string
  note: string
  importedAt: string
  importedBy: string
}

/** 运营概览上的接待待办：回传成功后生成一条。 */
export type TodoItem = {
  id: string
  kind: string
  title: string
  visitNo: string
  createdAt: string
  done: boolean
}
