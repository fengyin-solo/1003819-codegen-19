<template>
  <section class="page">
    <header class="page-head">
      <div>
        <h2>运营概览</h2>
        <p class="page-desc">汇总各业务模块的关键指标，先看总量再看异常。</p>
      </div>
      <div class="page-actions">
        <button class="btn" type="button" @click="refresh">重新统计</button>
      </div>
    </header>
    <div class="stat-row">
      <article v-for="card in cards" :key="card.label" class="stat-card">
        <span class="stat-label">{{ card.label }}</span>
        <strong class="stat-value">{{ card.value }}</strong>
      </article>
    </div>
    <table class="data-table">
      <thead>
        <tr><th>业务模块</th><th>今日新增</th><th>待处理</th><th>异常量</th></tr>
      </thead>
      <tbody>
        <tr v-for="row in moduleRows" :key="row.name">
          <td>{{ row.name }}</td>
          <td>{{ row.created }}</td>
          <td>{{ row.pending }}</td>
          <td>{{ row.abnormal }}</td>
        </tr>
      </tbody>
    </table>

    <section class="todo-section">
      <h3 class="todo-title">接待待办</h3>
      <table v-if="todos.length" class="data-table">
        <thead>
          <tr><th>来访编号</th><th>待办内容</th><th>生成时间</th><th>状态</th><th>操作</th></tr>
        </thead>
        <tbody>
          <tr v-for="todo in todos" :key="todo.id">
            <td>{{ todo.visitNo }}</td>
            <td>{{ todo.title }}</td>
            <td>{{ formatTime(todo.createdAt) }}</td>
            <td>{{ todo.done ? '已办结' : '待处理' }}</td>
            <td>
              <button class="link" type="button" @click="toggleTodo(todo)">
                {{ todo.done ? '恢复' : '办结' }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="page-desc">暂无接待待办，现场值守端回传预约包后会在这里新增一条。</p>
    </section>

    <footer class="page-foot">
      <span>数据保存在本机浏览器里，换浏览器或清缓存会回到示例数据</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'

import { loadOverview } from '@/api/local-service'
import { setTodoDone } from '@/api/visit-exchange'
import type { OverviewResult, TodoItem } from '@/data/types'

const cards = ref<OverviewResult['cards']>([])
const moduleRows = ref<OverviewResult['modules']>([])
const todos = ref<TodoItem[]>([])

function refresh() {
  const payload = loadOverview()
  cards.value = payload.cards
  moduleRows.value = payload.modules
  todos.value = payload.todos
}

function toggleTodo(todo: TodoItem) {
  setTodoDone(todo.id, !todo.done)
  refresh()
}

function formatTime(iso: string) {
  return iso.replace('T', ' ').slice(0, 16)
}

onMounted(refresh)
</script>
