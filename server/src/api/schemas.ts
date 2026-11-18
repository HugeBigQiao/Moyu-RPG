/**
 * 请求体模型。
 *
 * 职责：
 *     定义前端 POST 进来的 JSON 结构，做最基本的字段与范围校验。
 * 为什么需要：
 *     接口层不该手搓 dict；zod 的错误会被 HTTP 层收成 {detail: "中文原因"}。
 * 上下游：
 *     上游：前端请求；下游：api/* 的路由。
 */
import { z } from 'zod'

export const GachaIn = z.object({ count: z.number().int().default(1) })

export const BuyIn = z.object({ item_id: z.string() })

export const SessionIn = z.object({
  character_id: z.number().int(),
  scenario_id: z.string(),
})

export const ActIn = z.object({ action: z.string() })

export const NpcIn = z.object({
  count: z.number().int().default(1),
  city: z.string().nullable().optional(),
  mission: z.string().nullable().optional(),
})

export const PlayerIn = z.object({
  name: z.string(),
  school: z.string(),
  element: z.string(),
  city: z.string().default('nanyu'),
  attrs: z.record(z.string(), z.number()).default({}),
  events: z.array(z.string()).default([]),
  notes: z.string().default(''),
})

export const RandomSessionIn = z.object({
  character_id: z.number().int(),
  city: z.string().nullable().optional(),
})
