<template>
  <section class="page" data-module="visit">
    <header class="page-head">
      <div>
        <h2>工地接待管理</h2>
        <p class="page-desc">维护来访记录，围绕来访编号、来访单位、来访人数、参观日期做登记、筛选与状态流转。</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记来访记录</button>
        <button class="btn" type="button" @click="exportRows">导出工地接待清单</button>
        <button class="btn" type="button" @click="pickReturnFile">回传接待包</button>
        <input
          ref="fileInput"
          type="file"
          accept=".json,application/json"
          hidden
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

    <div class="area-bar">
      <label class="filter-item">
        <span>当前发掘区</span>
        <select v-model="currentArea">
          <option v-for="area in areaOptions" :key="area" :value="area">{{ area }}</option>
        </select>
      </label>
      <span class="area-hint">跨发掘区人员不能修改其他接待记录；未分配区域的记录各发掘区均可处理</span>
    </div>

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
          <td v-for="column in columns" :key="column">
            {{ column === '参观区域' ? normalizeVisitArea(row[column]) : (row[column] ?? '—') }}
          </td>
          <td>{{ row.status }}</td>
          <td class="row-actions">
            <button class="link" type="button" @click="generatePackage(row)">生成接待包</button>
            <button
              v-for="action in actions"
              :key="action"
              class="link"
              type="button"
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

    <section class="panel">
      <h3>回传结果</h3>
      <table class="data-table">
        <thead>
          <tr>
            <th>来访编号</th>
            <th>来访单位</th>
            <th>参观区域</th>
            <th>计划日期</th>
            <th>到访结果</th>
            <th>实际到访日期</th>
            <th>现场备注</th>
            <th>回传时间</th>
            <th>冲突处理</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in results" :key="item.visitNo">
            <td>{{ item.visitNo }}</td>
            <td>{{ item.appointment.来访单位 }}</td>
            <td>{{ item.appointment.参观区域 }}</td>
            <td>{{ item.appointment.计划日期 }}</td>
            <td>{{ item.是否到访 }}</td>
            <td>{{ item.实际到访日期 || '—' }}</td>
            <td>{{ item.现场备注 || '—' }}</td>
            <td>{{ formatTime(item.returnedAt) }}</td>
            <td>{{ item.conflicts.length ? item.conflicts.join('；') : '无' }}</td>
          </tr>
          <tr v-if="!results.length">
            <td colspan="9" class="empty-state">暂无回传结果，现场值守端填写接待包后可在此回传</td>
          </tr>
        </tbody>
      </table>
    </section>

    <footer class="page-foot">
      <span>共 {{ total }} 条工地接待记录</span>
      <span v-if="notice" class="notice-text">{{ notice }}</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  downloadEntries,
  downloadVisitPackage,
  importVisitReturn,
  listEntries,
  listVisitResults,
  moduleMeta,
  runAction as applyAction,
  visitAreaBlock,
} from '@/api/local-service'
import type { EntryRow } from '@/data/types'
import { normalizeVisitArea, UNASSIGNED_AREA } from '@/data/visit-exchange'
import type { VisitReturnRecord } from '@/data/visit-exchange'
import { useSessionStore } from '@/stores/session'

const meta = moduleMeta('visit')
const columns = ["来访编号", "来访单位", "来访人数", "参观日期", "接待人员", "参观区域", "备注事项", "记录状态"]
const actions = ["完成接待", "提交归档", "取消接待"]
const statuses = ["待接待", "已接待", "已归档", "已取消"]
const stats = [{"label": "本月接待次数", "value": 0}, {"label": "累计参观人数", "value": 0}, {"label": "待接待批次", "value": 0}]

const session = useSessionStore()
const rows = ref<EntryRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const notice = ref('')
const filters = ref<Record<string, string>>({})
const filterFields = columns.slice(0, 3)
const results = ref<VisitReturnRecord[]>([])
const areaOptions = ref<string[]>([])
const fileInput = ref<HTMLInputElement | null>(null)

const currentArea = computed({
  get: () => session.excavationArea,
  set: (area: string) => session.setExcavationArea(area),
})

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

function generatePackage(row: EntryRow) {
  errorMessage.value = ''
  notice.value = ''
  const result = downloadVisitPackage(Number(row.id), session.excavationArea)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  notice.value = result.message
}

function pickReturnFile() {
  errorMessage.value = ''
  notice.value = ''
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
  const result = importVisitReturn(text, session.operator, session.excavationArea)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  notice.value = result.message
  reload()
}

function runAction(action: string, row: EntryRow) {
  errorMessage.value = ''
  notice.value = ''
  const block = visitAreaBlock(row, session.excavationArea)
  if (block) {
    errorMessage.value = block
    return
  }
  const result = applyAction(meta.key, Number(row.id), action)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  reload()
}

function formatTime(iso: string): string {
  const time = new Date(iso)
  return Number.isNaN(time.getTime()) ? iso : time.toLocaleString('zh-CN', { hour12: false })
}

function reload() {
  errorMessage.value = ''
  try {
    const payload = listEntries(meta.key, filters.value)
    rows.value = payload.items
    total.value = payload.total
    results.value = listVisitResults()
    const areas = new Set<string>([session.excavationArea])
    for (const row of listEntries(meta.key).items) {
      const area = normalizeVisitArea(row['参观区域'])
      if (area !== UNASSIGNED_AREA) {
        areas.add(area)
      }
    }
    areaOptions.value = [...areas]
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '工地接待列表读取失败'
  }
}

onMounted(reload)
</script>
