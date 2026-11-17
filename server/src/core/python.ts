/**
 * Python 语义垫片。
 *
 * 职责：
 *     提供与 Python 内置行为一致的小工具：银行家舍入、向零截断、整除、%+d / %.Nf。
 * 为什么需要：
 *     JS 的 Math.round 是四舍五入，Python 的 round 是 round-half-even；
 *     伤害结算里 round(raw) 差 1 点就会让整局对拍失败。所有跨语言数值都从这里走。
 * 上下游：
 *     上游：无；下游：core/*、content/*。
 */

/**
 * Python round(x, ndigits)：对 double 的精确十进制展开做 round-half-even。
 *
 * 为什么不用 x*10^n 再取整：2.675 * 100 会变成 267.50000000000006，
 * 直接判 .5 会得到 2.68，而 Python 是 2.67。这里把 IEEE754 拆成
 * mantissa × 2^exponent，再乘 5^n 做精确的整数除法与余数比较。
 */
export function pyRound(x: number, digits = 0): number {
  if (!Number.isFinite(x) || x === 0) return x

  // 负数位数不在引擎里使用；按 10 的幂缩放后复用本函数
  if (digits < 0) {
    const factor = 10 ** -digits
    return pyRound(x / factor) * factor
  }

  const view = new DataView(new ArrayBuffer(8))
  view.setFloat64(0, Math.abs(x))
  const bits = view.getBigUint64(0)
  const expBits = Number((bits >> 52n) & 0x7ffn)
  const fraction = bits & ((1n << 52n) - 1n)
  const mantissa = expBits === 0 ? fraction : fraction | (1n << 52n)
  const exponent = expBits === 0 ? -1074 : expBits - 1075

  // |x| * 10^digits = mantissa * 5^digits * 2^(exponent + digits)
  const numerator = mantissa * 5n ** BigInt(digits)
  const shift = exponent + digits
  let scaled: bigint
  if (shift >= 0) {
    scaled = numerator << BigInt(shift)
  } else {
    const denominator = 1n << BigInt(-shift)
    const quotient = numerator / denominator
    const remainder = numerator % denominator
    const half = denominator >> 1n
    const roundUp = remainder > half || (remainder === half && (quotient & 1n) === 1n)
    scaled = roundUp ? quotient + 1n : quotient
  }

  const text = digits === 0 ? scaled.toString() : `${scaled.toString()}e-${digits}`
  const result = (x < 0 ? -1 : 1) * Number(text)
  return result === 0 ? 0 : result
}

/** Python int()：向零截断。 */
export function pyInt(value: number): number {
  return Math.trunc(value)
}

/** Python //：向下取整（负数也向下）。 */
export function pyFloorDiv(a: number, b: number): number {
  return Math.floor(a / b)
}

/** Python "%+d"：正数带 +，负数自带 -。 */
export function signed(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`
}

/** Python "%.Nf"：定点小数。 */
export function fixed(value: number, digits: number): string {
  return value.toFixed(digits)
}
