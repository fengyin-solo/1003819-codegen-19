<template>
  <section class="page" data-module="visit">
    <header class="page-head">
      <div>
        <h2>工地接待管理</h2>
        <p class="page-desc">维护来访记录，围绕来访编号、来访单位、来访人数、参观日期做登记、筛选与状态流转。</p>
        <p class="page-desc">
          当前发掘区「{{ store.excavationArea }}」：仅可修改本区及「未分配」的接待记录；预约包交给现场值守端补写到访结果后回传。
        </p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记来访记录</button>
        <button class="btn" type="button" @click="pickReturnFile">导入回传包</button>
        <button class="btn" type="button" @click="exportRows">导出工地接待清单</button>
        <input
          ref="fileInput"
          type="file"
          accept="application/json,.json"
          class="visually-hidden"
          @change="onReturnFile"
        />
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <p class="status-legend">
      <span v-for="item in statusSummary" :key="item.status" class="legend-item">
        {{ item.status }}：{{ item.count }}
      </span>
    </p>

    <form class="filter-bar" @submit.prevent="reload">
      <label v-for="field in filterFields" :key="field" class="filter-item">
        <span>{{ field }}</span>
        <input v-model="filters[field]" :placeholder="`按${field}检索`" />
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <table class="data-table">
      <thead>
        <tr>
          <th v-for="column in columns" :key="column">{{ column }}</th>
          <th>当前状态</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="String(row.id)">
          <td v-for="column in columns" :key="column">{{ row[column] ?? '—' }}</td>
          <td>{{ row.status }}</td>
          <td class="row-actions">
            <button
              class="link"
              type="button"
              :disabled="!canGenerate(row)"
              :title="packageHint(row)"
              @click="generatePackage(row)"
            >
              生成预约包
            </button>
            <button
              v-for="action in actions"
              :key="action"
              class="link"
              type="button"
              :disabled="!canModifyRow(row)"
              :title="modifyHint(row)"
              @click="runAction(action, row)"
            >
              {{ action }}
            </button>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="columns.length + 2" class="empty-state">暂无工地接待数据，可先登记来访记录</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 条工地接待记录</span>
      <span v-if="noticeMessage" class="notice-text">{{ noticeMessage }}</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  downloadEntries,
  listEntries,
  moduleMeta,
  runAction as applyAction,
} from '@/api/local-service'
import {
  canGeneratePackage,
  canModifyVisit,
  downloadAppointmentPackage,
  importReturnPackage,
  visitAreaOf,
} from '@/api/visit-exchange'
import type { EntryRow } from '@/data/types'
import { useSessionStore } from '@/stores/session'

const meta = moduleMeta('visit')
const store = useSessionStore()
const columns = ["来访编号", "来访单位", "来访人数", "参观日期", "接待人员", "参观区域", "备注事项", "到访结果", "记录状态"]
const actions = ["完成接待", "提交归档", "取消接待"]
const statuses = ["待接待", "已接待", "已归档", "已取消"]
const stats = [{"label": "本月接待次数", "value": 0}, {"label": "累计参观人数", "value": 0}, {"label": "待接待批次", "value": 0}]

const rows = ref<EntryRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const noticeMessage = ref('')
const filters = ref<Record<string, string>>({})
const fileInput = ref<HTMLInputElement | null>(null)
const filterFields = columns.slice(0, 3)
const statusSummary = computed(() =>
  statuses.map((status: string) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)

function resetFilters() {
  filters.value = {}
  reload()
}

function exportRows() {
  downloadEntries(meta.key)
}

function openCreate() {
  errorMessage.value = '来访记录登记入口尚未接入审批流'
}

function canModifyRow(row: EntryRow) {
  return canModifyVisit(row, store.excavationArea)
}

function canGenerate(row: EntryRow) {
  return canGeneratePackage(row)
}

function packageHint(row: EntryRow) {
  return canGenerate(row) ? '打包来访编号、来访单位、参观区域、接待人员、计划日期' : '预约已取消或已归档，不能再生成接待包'
}

function modifyHint(row: EntryRow) {
  return canModifyRow(row) ? '' : `参观区域「${visitAreaOf(row)}」不属于当前发掘区，不能修改`
}

function generatePackage(row: EntryRow) {
  errorMessage.value = ''
  noticeMessage.value = ''
  const result = downloadAppointmentPackage(row, store.operator)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  noticeMessage.value = result.message
}

function pickReturnFile() {
  errorMessage.value = ''
  noticeMessage.value = ''
  fileInput.value?.click()
}

async function onReturnFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) {
    return
  }
  const text = await file.text()
  const result = importReturnPackage(text, store.excavationArea, store.operator)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  noticeMessage.value = result.message
  reload()
}

function runAction(action: string, row: EntryRow) {
  errorMessage.value = ''
  noticeMessage.value = ''
  if (!canModifyRow(row)) {
    errorMessage.value = `参观区域「${visitAreaOf(row)}」不属于当前发掘区（${store.excavationArea}），跨发掘区人员不能修改其他接待记录`
    return
  }
  const result = applyAction(meta.key, Number(row.id), action)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  reload()
}

function reload() {
  errorMessage.value = ''
  try {
    const payload = listEntries(meta.key, filters.value)
    rows.value = payload.items
    total.value = payload.total
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '工地接待列表读取失败'
  }
}

onMounted(reload)
</script>
