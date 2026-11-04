<script setup>
import { onMounted, ref } from 'vue'
import { api } from '../api'

const data = ref(null)
const err = ref('')

const KIND = {
  investigate: { label: '勘查', cls: 'accent' },
  combat: { label: '遭遇', cls: 'error' },
  choice: { label: '抉择', cls: 'warn' }
}

onMounted(async () => {
  try {
    data.value = await api.scenarios()
  } catch (e) {
    err.value = e.message
  }
})
</script>

<template>
  <div v-if="err" class="panel"><div class="empty">加载失败：{{ err }}</div></div>
  <div v-else-if="!data" class="loading">LOADING / 正在读取手册…</div>

  <template v-else>
    <div class="page-head">
      <div>
        <h1>作业手册与资产台账</h1>
        <div class="sub">runbooks · 从「现场勘查」到「结案」的标准处置流程</div>
      </div>
    </div>

    <div v-for="sc in data.scenarios" :key="sc.id" class="panel">
      <div class="panel-head">
        <h2>{{ sc.name }}</h2>
        <span class="sub">{{ sc.code }} · {{ sc.scenes.length }} 个阶段 · 起始阴浊 {{ sc.start_corruption }}</span>
      </div>
      <div class="lede">{{ sc.brief }}</div>
      <div class="sub" style="margin:8px 0 12px">地点：{{ sc.place }}</div>
      <table>
        <thead><tr><th>#</th><th>阶段</th><th>类型</th><th>地点</th></tr></thead>
        <tbody>
          <tr v-for="(scene, i) in sc.scenes" :key="scene.id">
            <td class="mono dim">{{ i + 1 }}</td>
            <td>{{ scene.name }}</td>
            <td><span class="chip" :class="(KIND[scene.kind] || {}).cls">{{ (KIND[scene.kind] || {}).label || '收尾' }}</span></td>
            <td class="mono dim">{{ scene.place }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="panel" style="margin-top:14px">
      <div class="panel-head"><h2>符箓台账</h2><span class="sub">{{ data.talismans.length }} 种</span></div>
      <table>
        <thead><tr><th>符名</th><th>五行</th><th>绘制</th><th>引动</th><th>类型</th><th>说明</th></tr></thead>
        <tbody>
          <tr v-for="t in data.talismans" :key="t.id">
            <td>{{ t.name }}</td>
            <td class="mono">{{ t.element }}</td>
            <td class="mono">{{ t.draw_cost }}</td>
            <td class="mono">{{ t.use_cost }}</td>
            <td class="mono dim">{{ t.kind }}</td>
            <td class="dim">{{ t.note }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="panel" style="margin-top:14px">
      <div class="panel-head"><h2>故障源图鉴</h2><span class="sub">{{ data.bestiary.length }} 类</span></div>
      <table>
        <thead><tr><th>名称</th><th>五行</th><th>气血</th><th>阴浊</th><th>形态</th><th>弱点</th></tr></thead>
        <tbody>
          <tr v-for="m in data.bestiary" :key="m.id">
            <td>{{ m.name }}</td>
            <td class="mono">{{ m.element }}</td>
            <td class="mono">{{ m.hp }}</td>
            <td class="mono">{{ m.corruption }}</td>
            <td>
              <span v-for="ph in m.phases" :key="ph.state" class="chip" style="margin-right:4px">{{ ph.state }}</span>
            </td>
            <td class="dim">{{ m.weakness.join(' / ') }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="panel" style="margin-top:14px">
      <div class="panel-head"><h2>英灵台账</h2><span class="sub">{{ data.spirits.length }} 位</span></div>
      <table>
        <thead><tr><th>英灵</th><th>最低箓职</th><th>五行</th><th>武力</th><th>道法</th><th>神识</th><th>灵力</th><th>认可条件</th></tr></thead>
        <tbody>
          <tr v-for="s in data.spirits" :key="s.id">
            <td>{{ s.name }}<div class="sub">{{ s.title }}</div></td>
            <td class="mono">{{ s.rank }}</td>
            <td class="mono">{{ s.element }}</td>
            <td class="mono">{{ s.panel['武力'] }}</td>
            <td class="mono">{{ s.panel['道法'] }}</td>
            <td class="mono">{{ s.panel['神识'] }}</td>
            <td class="mono">{{ s.cost }}</td>
            <td class="dim">{{ s.creed }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="panel" style="margin-top:14px">
      <div class="panel-head"><h2>物事台账</h2><span class="sub">{{ data.shop.length }} 件</span></div>
      <table>
        <thead><tr><th>物事</th><th>类别</th><th>价</th><th>说明</th></tr></thead>
        <tbody>
          <tr v-for="it in data.shop" :key="it.id">
            <td>{{ it.name }}</td>
            <td class="mono dim">{{ it.kind }}</td>
            <td class="mono">{{ it.price }}</td>
            <td class="dim">{{ it.desc }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </template>
</template>
