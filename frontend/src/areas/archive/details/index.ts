/**
 * 档案详情组件注册表。
 *
 * 职责：
 *     把「类别 key」映射到对应的详情组件，ArchiveView 用 `<component :is>` 动态渲染。
 * 为什么需要：
 *     11 个类别各有一个详情组件，如果让 ArchiveView 逐个 import 再判断，就又回到长 v-if；
 *     集中注册后，新增一个类别 = 新增一个 details/XxxDetail.vue + 这里加一行。
 * 上下游：
 *     上游：areas/archive/ArchiveView.vue（按当前类别取组件）；
 *     下游：details/*.vue（纯展示组件）。
 */
import type { Component } from 'vue'

import AgencyDetail from './AgencyDetail.vue'
import CityDetail from './CityDetail.vue'
import EquipmentDetail from './EquipmentDetail.vue'
import EventDetail from './EventDetail.vue'
import FigureDetail from './FigureDetail.vue'
import IndustryDetail from './IndustryDetail.vue'
import LoreDetail from './LoreDetail.vue'
import MissionDetail from './MissionDetail.vue'
import NationDetail from './NationDetail.vue'
import SectDetail from './SectDetail.vue'
import TraitDetail from './TraitDetail.vue'

/** key 与后端 edit.py 的 KINDS 一致。 */
export const DETAILS: Record<string, Component> = {
  cities: CityDetail,
  figures: FigureDetail,
  agencies: AgencyDetail,
  sects: SectDetail,
  industries: IndustryDetail,
  nations: NationDetail,
  lore: LoreDetail,
  events: EventDetail,
  missions: MissionDetail,
  equipment: EquipmentDetail,
  traits: TraitDetail
}
