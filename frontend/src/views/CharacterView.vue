<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api'
import { setFlash } from '../flash'
import MeterBar from '../components/MeterBar.vue'

const route = useRoute()
const router = useRouter()
const data = ref(null)
const err = ref('')
const busy = ref(false)

async function load() {
  try {
    data.value = await api.character(route.params.id)
  } catch (e) {
    err.value = e.message
  }
}

async function start(scenarioId) {
  busy.value = true
  try {
    const out = await api.startSession(route.params.id, scenarioId)
    router.push(`/play/${out.id}`)
  } catch (e) {
    setFlash('开团失败：' + e.message, 'err')
  } finally {
    busy.value = false
  }
}

async function startRandom() {
  busy.value = true
  try {
    const out = await api.startRandom(route.params.id, null)
    setFlash(`随机任务：${out.name}（难度 ${out.difficulty}，报酬 ${out.reward}）`)
    router.push(`/play/${out.id}`)
  } catch (e) {
    setFlash('开随机任务失败：' + e.message, 'err')
  } finally {
    busy.value = false
  }
}

async function promote() {
  try {
    const out = await api.promote(route.params.id)
    setFlash(`授箓晋升：${out.from} → ${out.to}。新开英灵：${(out.opened || []).join('、') || '无'}`)
    await load()
  } catch (e) {
    setFlash(e.message, 'err')
  }
}

async function trial() {
  try {
    const out = await api.trial(route.params.id)
    const detail = out.rolls.map(r => `${r.roll}→${r.level}`).join('／')
    setFlash(`${out.text}（${detail}，${out.passes}/${out.need} 过）`, out.passed ? 'ok' : 'err')
    await load()
  } catch (e) {
    setFlash(e.message, 'err')
  }
}

async function buy(item) {
  try {
    const out = await api.buy(route.params.id, item.id)
    setFlash(`已入库：${out.item}，花功德 ${out.spent}，余 ${out.left}。`)
    await load()
  } catch (e) {
    setFlash(e.message, 'err')
  }
}

const stats = computed(() => data.value?.stats || {})
const progress = computed(() => data.value?.progress || {})

onMounted(load)
watch(() => route.params.id, load)
</script>

<template>
  <div v-if="err" class="panel"><div class="empty">加载失败：{{ err }}</div></div>
  <div v-else-if="!data" class="loading">LOADING / 正在读取实例档案…</div>

  <template v-else>
    <div class="page-head">
      <div>
        <h1>{{ data.name }}</h1>
        <div class="sub">
          {{ data.code }} · {{ data.school_name }} · 本命{{ data.element }} ·
          <span class="chip" :class="'rarity-' + data.rarity">{{ data.rarity }}品</span>
          <span class="chip">{{ data.rank }}箓</span>
        </div>
      </div>
      <div class="tag-list">
        <button v-for="(m, i) in data.missions" :key="m.id"
                :class="i === 0 ? 'primary' : ''" :disabled="busy" @click="start(m.id)">
          开团：{{ m.name }}
        </button>
        <button class="primary" :disabled="busy" @click="startRandom">随机任务</button>
      </div>
    </div>

    <div class="grid c2" style="margin-bottom:14px">
      <div class="panel">
        <div class="panel-head">
          <h2>出身</h2>
          <span class="sub">{{ data.kind === 'player' ? '玩家自建' : '系统生成' }}</span>
        </div>
        <div class="kv-grid">
          <span class="k">城市</span><span class="v">{{ data.city.name }}（{{ data.city.tier_name }}）</span>
          <span class="k">事件数</span><span class="v">{{ data.events.length }}</span>
          <span class="k">难案倾向</span><span class="v">{{ data.difficulty }}</span>
          <span class="k">报酬基准</span><span class="v">{{ data.reward }} 功德</span>
        </div>
        <div class="lede" style="margin-top:10px;font-size:12px">
          难度与报酬都是从出身事件推出来的：事件等级越高，接到的案子越硬，报酬越高。
        </div>
      </div>

      <div class="panel">
        <div class="panel-head"><h2>出身事件</h2><span class="sub">events</span></div>
        <div v-for="(e, i) in data.events" :key="e.id" class="ev" style="margin-bottom:8px">
          <div class="tag">{{ e.grade_name }}</div>
          <div class="txt">
            <b>{{ e.name }}</b> —— {{ e.text }}
            <div class="sub" style="margin-top:4px">钩子：{{ e.hook }}</div>
          </div>
        </div>
        <div v-if="!data.events.length" class="empty">没有事件。这个人是白纸。</div>
      </div>
    </div>

    <div class="grid c2">
      <div class="panel">
        <div class="panel-head"><h2>健康指标</h2><span class="sub">attributes</span></div>
        <div class="attrs">
          <div v-for="a in data.attrs" :key="a.key" class="attr" :class="a.tier">
            <div class="k">{{ a.label }}</div>
            <div class="v">{{ a.value }}</div>
          </div>
        </div>
        <div class="hr"></div>
        <h3>技能值</h3>
        <div class="skills">
          <span v-for="s in data.skills" :key="s.id" class="skill">{{ s.name }} <b>{{ s.value }}</b></span>
        </div>
      </div>

      <div class="panel">
        <div class="panel-head"><h2>资源上限</h2><span class="sub">derived</span></div>
        <div class="bars">
          <MeterBar label="气血" kind="hp" :value="stats.hp_max" :max="stats.hp_max" />
          <MeterBar label="灵力" kind="mp" :value="stats.mp_max" :max="stats.mp_max" />
          <MeterBar label="理智" kind="san" :value="stats.san_max" :max="stats.san_max" />
        </div>
        <div class="hr"></div>
        <div class="kv-grid">
          <span class="k">灵力来源</span><span class="v">{{ stats.mp_source }} × 2</span>
          <span class="k">剑意 / 杀气</span><span class="v">{{ stats.jianyi_max }} / {{ stats.shaqi_max }}</span>
          <span class="k">先攻权</span><span class="v">{{ stats.initiative }}</span>
          <span class="k">功德</span><span class="v">{{ stats.merit }}</span>
          <span class="k">业障</span><span class="v">{{ stats.karma_debt }} 层（检定 {{ stats.karma_penalty }}）</span>
          <span class="k">每日符力</span><span class="v">{{ stats.draw_pool }}</span>
          <span class="k">可请神</span><span class="v">{{ stats.can_summon ? '是' : '否（初真箓）' }}</span>
        </div>
        <div class="lede" style="margin-top:10px;font-size:12px">{{ data.tagline }}</div>
      </div>
    </div>

    <div class="grid c2" style="margin-top:14px">
      <div class="panel">
        <div class="panel-head"><h2>特性</h2><span class="sub">{{ data.traits.length }} 项</span></div>
        <div v-for="(t, i) in data.traits" :key="i" class="ev" style="margin-bottom:8px">
          <div class="tag">{{ i + 1 }}</div>
          <div class="txt"><b>{{ t.name }}</b> —— {{ t.desc }}</div>
        </div>
        <div v-if="!data.traits.length" class="empty">没有特性。</div>
        <div class="hr"></div>
        <h3>档案备注</h3>
        <div class="lede">{{ data.notes || '无。' }}</div>
        <div class="sub" style="margin-top:8px">seed {{ data.seed }}</div>
      </div>

      <div class="panel">
        <div class="panel-head"><h2>可请英灵</h2><span class="sub">{{ data.spirits.length }} 位</span></div>
        <table v-if="data.spirits.length">
          <thead><tr><th>英灵</th><th>五行</th><th>认可度</th><th>灵力</th></tr></thead>
          <tbody>
            <tr v-for="s in data.spirits" :key="s.id">
              <td>{{ s.name }}<div class="sub">{{ s.title }}</div></td>
              <td class="mono">{{ s.element }}</td>
              <td class="mono">{{ s.approval }}%</td>
              <td class="mono dim">{{ s.cost }}</td>
            </tr>
          </tbody>
        </table>
        <div v-else class="empty">初真箓，还没资格请神。先去做几次驱祟任务。</div>
      </div>
    </div>

    <div class="grid c2" style="margin-top:14px">
      <div class="panel">
        <div class="panel-head">
          <h2>授箓晋升</h2>
          <span class="sub">当前 {{ data.rank }}箓 · 已完成 {{ data.completed_sessions }} 案</span>
        </div>
        <template v-if="progress.next_rank">
          <div class="lede">下一级：<b>{{ progress.next_rank }}箓</b></div>
          <div v-for="r in progress.reqs" :key="r.label" class="bars" style="margin-top:10px">
            <div class="row" style="grid-template-columns: 104px 1fr 72px">
              <span class="name">{{ r.label }}</span>
              <span class="bar"><i :style="{ width: r.pct + '%', background: r.ok ? '#3fb950' : '#4c9aff' }"></i></span>
              <span class="num">{{ r.have }}/{{ r.need }}</span>
            </div>
          </div>
          <div class="tag-list" style="margin-top:14px">
            <button class="primary" :disabled="!progress.promotable" @click="promote">
              晋升 {{ progress.next_rank }}箓
            </button>
            <button v-if="progress.next_rank === '五雷' && !progress.trial_passed" @click="trial">
              走一次心魔试炼
            </button>
          </div>
          <div v-if="progress.trial_attempts" class="sub" style="margin-top:8px">
            心魔试炼 {{ progress.trial_attempts }} 次{{ progress.trial_passed ? ' · 已过' : '' }}
          </div>
        </template>
        <div v-else class="lede">已是天师箓。上面没人了，剩下的路得自己走。</div>

        <template v-if="data.ascensions.length">
          <div class="hr"></div>
          <h3>授箓记录</h3>
          <div v-for="(a, i) in data.ascensions" :key="i" class="ev" style="margin-bottom:6px">
            <div class="tag">{{ (a.at || '').slice(5, 10) }}</div>
            <div class="txt">{{ a.from }} → {{ a.to }}<template v-if="a.opened && a.opened.length">，新开：{{ a.opened.join('、') }}</template></div>
          </div>
        </template>
      </div>

      <div class="panel">
        <div class="panel-head">
          <h2>功德商店</h2>
          <span class="sub">余额 {{ data.merit }}<template v-if="data.karma_debt"> · 业障 {{ data.karma_debt }} 层</template></span>
        </div>
        <table>
          <thead><tr><th>物事</th><th>价</th><th>持有</th><th></th></tr></thead>
          <tbody>
            <tr v-for="it in data.shelf" :key="it.id">
              <td>{{ it.name }}<div class="sub">{{ it.desc }}</div></td>
              <td class="mono">{{ it.price ? it.price : '—' }}</td>
              <td class="mono dim">{{ it.owned }}/{{ it.max_qty }}</td>
              <td>
                <span v-if="it.full" class="sub">已满</span>
                <button v-else :class="it.corrupt ? 'danger' : ''" :disabled="!it.afford" @click="buy(it)">兑换</button>
              </td>
            </tr>
          </tbody>
        </table>
        <template v-if="data.items.length">
          <div class="hr"></div>
          <h3>随身物事</h3>
          <div class="tag-list">
            <span v-for="i in data.items" :key="i.id" class="chip" :class="i.id === 'shihunding' ? 'error' : 'violet'">
              {{ i.name }} ×{{ i.qty }}
            </span>
          </div>
        </template>
      </div>
    </div>

    <div class="panel" style="margin-top:14px">
      <div class="panel-head"><h2>处置记录</h2><span class="sub">sessions</span></div>
      <table v-if="data.sessions.length">
        <thead><tr><th>会话</th><th>手册</th><th>状态</th><th>阴浊</th><th></th></tr></thead>
        <tbody>
          <tr v-for="s in data.sessions" :key="s.id">
            <td class="mono">{{ s.code }}</td>
            <td>{{ s.scenario_name }}</td>
            <td><span v-if="s.status === 'active'" class="chip accent">进行中</span><span v-else class="chip">已结案</span></td>
            <td class="mono">{{ s.corruption }}%</td>
            <td><router-link :to="`/play/${s.id}`">{{ s.status === 'active' ? '继续 →' : '回看 →' }}</router-link></td>
          </tr>
        </tbody>
      </table>
      <div v-else class="empty">这台节点还没出过现场。</div>
    </div>
  </template>
</template>
