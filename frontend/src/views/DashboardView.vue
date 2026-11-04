<script setup>
import { onMounted, ref } from 'vue'
import { api } from '../api'
import EventStream from '../components/EventStream.vue'

const data = ref(null)
const err = ref('')

onMounted(async () => {
  try {
    data.value = await api.dashboard()
  } catch (e) {
    err.value = e.message
  }
})

function loadClass(v) {
  if (v >= 60) return 'error'
  if (v >= 30) return 'warn'
  return 'good'
}
</script>

<template>
  <div v-if="err" class="panel"><div class="empty">加载失败：{{ err }}</div></div>
  <div v-else-if="!data" class="loading">LOADING / 正在拉取集群状态…</div>

  <template v-else>
    <div class="page-head">
      <div>
        <h1>集群总览</h1>
        <div class="sub">CN-EAST-1 · 边缘节点与处置会话的统一视图</div>
      </div>
      <div class="tag-list">
        <router-link class="btn" to="/roster">人员档案</router-link>
        <router-link class="btn primary" to="/scenarios">打开作业手册</router-link>
      </div>
    </div>

    <div class="grid c4">
      <div class="panel kpi">
        <div class="label">在册人员</div>
        <div class="value">{{ data.totals.characters }}<small>台</small></div>
        <div class="trend">含全部稀有度</div>
      </div>
      <div class="panel kpi">
        <div class="label">处置会话</div>
        <div class="value">{{ data.totals.sessions }}<small>次</small></div>
        <div class="trend">累计</div>
      </div>
      <div class="panel kpi">
        <div class="label">进行中</div>
        <div class="value">{{ data.totals.active }}<small>个</small></div>
        <div class="trend">未结案</div>
      </div>
      <div class="panel kpi">
        <div class="label">平均阴浊负载</div>
        <div class="value">{{ data.totals.avg_load }}<small>%</small></div>
        <div class="trend"><span class="chip" :class="loadClass(data.totals.avg_load)">
          {{ data.totals.avg_load >= 60 ? '超阈值' : data.totals.avg_load >= 30 ? '偏高' : '平稳' }}
        </span></div>
      </div>
    </div>

    <div class="grid c2">
      <div class="panel">
        <div class="panel-head"><h2>节点稀有度分布</h2><span class="sub">cap / {{ data.totals.characters }}</span></div>
        <div v-for="(count, name) in data.by_rarity" :key="name" class="bars" style="margin-bottom:10px">
          <div class="row">
            <span class="name">{{ name }}</span>
            <span class="bar"><i :style="{ width: (count * 100 / (data.totals.characters || 1)).toFixed(1) + '%' }"></i></span>
            <span class="num">{{ count }}</span>
          </div>
        </div>
        <div class="hr"></div>
        <div class="lede">节点通过「纳管」生成。稀有度只影响初始属性池、特性数量与授箓起点，不影响后续成长。</div>
      </div>

      <div class="panel">
        <div class="panel-head"><h2>最近告警</h2><span class="sub">stream</span></div>
        <EventStream :events="data.logs.map(l => ({ kind: l.kind, severity: l.severity, text: l.text }))" />
      </div>
    </div>

    <div class="panel" style="margin-top:14px">
      <div class="panel-head"><h2>处置会话</h2><span class="sub">sessions</span></div>
      <table v-if="data.recent_sessions.length">
        <thead><tr><th>会话</th><th>节点</th><th>手册</th><th>状态</th><th>阴浊</th><th>创建</th><th></th></tr></thead>
        <tbody>
          <tr v-for="s in data.recent_sessions" :key="s.id">
            <td class="mono">{{ s.code }}</td>
            <td>{{ s.character_name }}</td>
            <td>{{ s.scenario_name }}</td>
            <td>
              <span v-if="s.status === 'active'" class="chip accent">进行中</span>
              <span v-else class="chip">已结案</span>
            </td>
            <td class="mono">{{ s.corruption }}%</td>
            <td class="mono dim">{{ s.created_at }}</td>
            <td><router-link :to="`/play/${s.id}`">进入 →</router-link></td>
          </tr>
        </tbody>
      </table>
      <div v-else class="empty">还没有会话。到「人员档案」生成一个人，然后在详情里开团。</div>
    </div>

    <div class="panel" style="margin-top:14px">
      <div class="panel-head"><h2>最近建档</h2><span class="sub">nodes</span></div>
      <table v-if="data.recent_chars.length">
        <thead><tr><th>档案号</th><th>姓名</th><th>流派</th><th>本命</th><th>稀有度</th><th>箓职</th><th></th></tr></thead>
        <tbody>
          <tr v-for="c in data.recent_chars" :key="c.id">
            <td class="mono">{{ c.code }}</td>
            <td>{{ c.name }}</td>
            <td><span class="chip">{{ c.school_name }}</span></td>
            <td class="mono">{{ c.element }}</td>
            <td><span class="chip" :class="'rarity-' + c.rarity">{{ c.rarity }}品</span></td>
            <td class="mono dim">{{ c.rank }}</td>
            <td><router-link :to="`/characters/${c.id}`">详情 →</router-link></td>
          </tr>
        </tbody>
      </table>
      <div v-else class="empty">空。去「人员档案」生成第一份档案。</div>
    </div>
  </template>
</template>
