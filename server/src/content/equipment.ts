/**
 * 装备索引。
 *
 * 职责：
 *     读装备表并建 id 索引。
 * 为什么需要：
 *     装备是档案页与后续战斗扩展的数据源。
 * 上下游：
 *     上游：equipment.json；下游：api/archive。
 */

export interface Equipment {
  id: string
  name: string
  kind: string
  grade: number
  price?: number
  effect?: string
  desc?: string
  [key: string]: any
}

export const GRADE_INFO: Record<number, string> = { 1: '甲', 2: '乙', 3: '丙', 4: '丁' }

export interface EquipmentDoc {
  equipment: Equipment[]
}

export interface EquipmentIndex {
  equipment: Equipment[]
  byId: Map<string, Equipment>
}

export function indexEquipment(doc: EquipmentDoc): EquipmentIndex {
  const equipment = doc.equipment ?? []
  return { equipment, byId: new Map(equipment.map((item) => [item.id, item])) }
}

export function getEquipment(index: EquipmentIndex, itemId: string): Equipment | undefined {
  return index.byId.get(itemId)
}

export function byKind(index: EquipmentIndex, kind: string): Equipment[] {
  return index.equipment.filter((item) => item.kind === kind)
}
