/**
 * 骰子：CPython random.Random 的逐位兼容移植 + 骰子表达式。
 *
 * 职责：
 *     所有随机都从同一个种子派生；每次掷骰留痕，供回放与对拍。
 * 为什么需要：
 *     旧会话按「种子 → 随机序列」复现，必须与 Python 逐位一致；
 *     普通 MT19937 库在 seed 展开、randbelow、shuffle/sample 上对不上。
 * 上下游：
 *     上游：crypto（种子生成）；下游：checks、gacha、npc、kp、mission、session。
 */
import { createHash, randomBytes } from 'node:crypto'
import { pyRound } from './python.ts'

const N = 624
const M = 397
const MATRIX_A = 0x9908b0df
const UPPER_MASK = 0x80000000
const LOWER_MASK = 0x7fffffff

export class PythonRandom {
  private mt = new Uint32Array(N)
  private mti = N + 1

  constructor(seed?: number | bigint) {
    if (seed === undefined) this.initGenrand(5489)
    else this.seedInt(BigInt(seed))
  }

  /** CPython 对 int 种子：取绝对值，按 32 位小端切片，再 init_by_array。 */
  seedInt(value: bigint): void {
    let n = value < 0n ? -value : value
    const key: number[] = []
    if (n === 0n) key.push(0)
    else {
      while (n > 0n) {
        key.push(Number(n & 0xffffffffn))
        n >>= 32n
      }
    }
    this.initByArray(key)
  }

  private initGenrand(s: number): void {
    this.mt[0] = s >>> 0
    for (let i = 1; i < N; i++) {
      const prev = this.mt[i - 1] ^ (this.mt[i - 1] >>> 30)
      this.mt[i] = (Math.imul(1812433253, prev) + i) >>> 0
    }
    this.mti = N
  }

  private initByArray(key: number[]): void {
    this.initGenrand(19650218)
    let i = 1
    let j = 0
    let k = Math.max(N, key.length)
    for (; k > 0; k--) {
      const prev = this.mt[i - 1] ^ (this.mt[i - 1] >>> 30)
      this.mt[i] = ((this.mt[i] ^ Math.imul(prev, 1664525)) + key[j] + j) >>> 0
      i++
      j++
      if (i >= N) {
        this.mt[0] = this.mt[N - 1]
        i = 1
      }
      if (j >= key.length) j = 0
    }
    for (k = N - 1; k > 0; k--) {
      const prev = this.mt[i - 1] ^ (this.mt[i - 1] >>> 30)
      this.mt[i] = ((this.mt[i] ^ Math.imul(prev, 1566083941)) - i) >>> 0
      i++
      if (i >= N) {
        this.mt[0] = this.mt[N - 1]
        i = 1
      }
    }
    this.mt[0] = UPPER_MASK
  }

  private twist(): void {
    let i = 0
    for (; i < N - M; i++) {
      const y = (this.mt[i] & UPPER_MASK) | (this.mt[i + 1] & LOWER_MASK)
      this.mt[i] = this.mt[i + M] ^ (y >>> 1) ^ (y & 1 ? MATRIX_A : 0)
    }
    for (; i < N - 1; i++) {
      const y = (this.mt[i] & UPPER_MASK) | (this.mt[i + 1] & LOWER_MASK)
      this.mt[i] = this.mt[i + (M - N)] ^ (y >>> 1) ^ (y & 1 ? MATRIX_A : 0)
    }
    const y = (this.mt[N - 1] & UPPER_MASK) | (this.mt[0] & LOWER_MASK)
    this.mt[N - 1] = this.mt[M - 1] ^ (y >>> 1) ^ (y & 1 ? MATRIX_A : 0)
    this.mti = 0
  }

  genrandUint32(): number {
    if (this.mti >= N) this.twist()
    let y = this.mt[this.mti++]
    y ^= y >>> 11
    y ^= (y << 7) & 0x9d2c5680
    y ^= (y << 15) & 0xefc60000
    y ^= y >>> 18
    return y >>> 0
  }

  getrandbits(k: number): bigint {
    if (k <= 0) throw new RangeError('k must be positive')
    const words = Math.ceil(k / 32)
    let out = 0n
    let remain = k
    for (let i = 0; i < words; i++, remain -= 32) {
      let r = this.genrandUint32()
      if (remain < 32) r >>>= 32 - remain
      out += BigInt(r) << BigInt(32 * i)
    }
    return out
  }

  private bitLength(n: number): number {
    return n === 0 ? 0 : 32 - Math.clz32(n)
  }

  randbelow(n: number): number {
    if (n <= 0) throw new RangeError('n must be positive')
    const k = this.bitLength(n)
    let r = Number(this.getrandbits(k))
    while (r >= n) r = Number(this.getrandbits(k))
    return r
  }

  randint(a: number, b: number): number {
    return a + this.randbelow(b - a + 1)
  }

  randrange(start: number, stop?: number): number {
    if (stop === undefined) return this.randbelow(start)
    return start + this.randbelow(stop - start)
  }

  random(): number {
    const a = this.genrandUint32() >>> 5
    const b = this.genrandUint32() >>> 6
    return (a * 67108864.0 + b) / 9007199254740992.0
  }

  uniform(a: number, b: number): number {
    return a + (b - a) * this.random()
  }

  choice<T>(seq: ArrayLike<T>): T {
    if (!seq.length) throw new Error('从空列表里抽不出东西')
    return seq[this.randbelow(seq.length)]
  }

  shuffle<T>(x: T[]): T[] {
    for (let i = x.length - 1; i >= 1; i--) {
      const j = this.randbelow(i + 1)
      ;[x[i], x[j]] = [x[j], x[i]]
    }
    return x
  }

  sample<T>(population: readonly T[], k: number): T[] {
    const n = population.length
    if (!(0 <= k && k <= n)) throw new RangeError('抽样数不合法')
    const result: T[] = new Array(k)
    let setsize = 21
    if (k > 5) setsize += 4 ** Math.ceil(Math.log(k * 3) / Math.log(4))
    if (n <= setsize) {
      const pool = Array.from(population)
      for (let i = 0; i < k; i++) {
        const j = this.randbelow(n - i)
        result[i] = pool[j]
        pool[j] = pool[n - i - 1]
      }
    } else {
      const selected = new Set<number>()
      for (let i = 0; i < k; i++) {
        let j = this.randbelow(n)
        while (selected.has(j)) j = this.randbelow(n)
        selected.add(j)
        result[i] = population[j]
      }
    }
    return result
  }
}

export interface Roll {
  notation: string
  rolls: number[]
  modifier: number
  total: number
  reason: string
}

const DICE_RE = /^\s*(\d*)d(\d+)([+-]\d+)?\s*$/i

/** 带种子的骰子：种子字符串 → sha256 → 前 16 位十六进制转整数 → PythonRandom。 */
export class Roller {
  readonly seed: string
  private rng: PythonRandom
  history: Roll[] = []

  constructor(seed = '') {
    this.seed = seed
    const digest = createHash('sha256').update(seed, 'utf8').digest('hex')
    this.rng = new PythonRandom(BigInt('0x' + digest.slice(0, 16)))
  }

  private record(
    notation: string,
    rolls: number[],
    modifier: number,
    total: number,
    reason: string,
  ): Roll {
    const roll = { notation, rolls, modifier, total, reason }
    this.history.push(roll)
    return roll
  }

  d(sides: number, reason = ''): number {
    const value = this.rng.randint(1, sides)
    this.record(`1d${sides}`, [value], 0, value, reason)
    return value
  }

  roll(notation: string, reason = ''): Roll {
    const match = DICE_RE.exec(notation)
    if (!match) throw new Error(`看不懂的骰子写法：${JSON.stringify(notation)}（要 2d6+3 这种）`)
    const count = Number(match[1] || 1)
    const sides = Number(match[2])
    const modifier = Number(match[3] || 0)
    if (count < 1 || count > 50 || sides < 2) {
      throw new Error(`骰子参数不合理：${JSON.stringify(notation)}`)
    }
    const rolls = Array.from({ length: count }, () => this.rng.randint(1, sides))
    const total = rolls.reduce((sum, item) => sum + item, 0) + modifier
    return this.record(notation, rolls, modifier, total, reason)
  }

  d100(reason = ''): number {
    const value = this.rng.randint(1, 100)
    this.record('1d100', [value], 0, value, reason)
    return value
  }

  choice<T>(seq: readonly T[], reason = ''): T {
    if (!seq.length) throw new Error('从空列表里抽不出东西')
    const index = this.rng.randrange(seq.length)
    this.record('choice', [index], 0, index, reason)
    return seq[index]
  }

  weighted<T>(pairs: ReadonlyArray<readonly [T, number]>, reason = ''): T {
    const valid = pairs.filter(([, weight]) => weight > 0)
    if (!valid.length) throw new Error('权重全是 0')
    const total = valid.reduce((sum, [, weight]) => sum + weight, 0)
    const pick = this.rng.uniform(0, total)
    let acc = 0
    for (const [value, weight] of valid) {
      acc += weight
      if (pick <= acc) {
        this.record('weighted', [0], 0, 0, reason)
        return value
      }
    }
    this.record('weighted', [0], 0, 0, reason)
    return valid[valid.length - 1][0]
  }

  shuffle<T>(items: readonly T[], reason = ''): T[] {
    const out = Array.from(items)
    this.rng.shuffle(out)
    this.record('shuffle', [0], 0, 0, reason)
    return out
  }

  sample<T>(seq: readonly T[], k: number, reason = ''): T[] {
    const picked = this.rng.sample(seq, Math.min(k, seq.length))
    this.record('sample', [0], 0, 0, reason)
    return picked
  }

  randint(low: number, high: number, reason = ''): number {
    const value = this.rng.randint(low, high)
    this.record(`${low}-${high}`, [value], 0, value, reason)
    return value
  }

  pool(count: number, sides: number, reason = ''): number[] {
    const values = Array.from({ length: count }, () => this.rng.randint(1, sides))
    this.record(`${count}d${sides}`, values, 0, values.reduce((a, b) => a + b, 0), reason)
    return values
  }

  chance(probability: number, reason = ''): boolean {
    const raw = this.rng.random()
    const pct = pyRound(raw * 100)
    this.record('chance', [pct], 0, pct, reason)
    return raw < Math.max(0, Math.min(1, probability))
  }
}

export function roll4d6DropLowest(roller: Roller): number {
  const rolls = roller.pool(4, 6, '属性生成').sort((a, b) => a - b)
  const dropped = rolls[0]
  const total = rolls.slice(1).reduce((a, b) => a + b, 0)
  const last = roller.history[roller.history.length - 1]
  last.total = total
  last.reason = `4d6↓（丢 ${dropped}）`
  return total
}

/** 新种子：Python 用 SystemRandom().getrandbits(64) 再格式化成 16 位十六进制。 */
export function newSeed(): string {
  return randomBytes(8).toString('hex')
}
