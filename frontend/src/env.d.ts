/**
 * 全局类型声明。
 *
 * 职责：
 *     引入 Vite 的客户端类型（import.meta.env 等），并声明构建期注入的全局常量。
 * 为什么需要：
 *     __BUILD_ID__ 是 vite.config.ts 里 define 出来的，TS 不认识，得在这里登记一次。
 * 上下游：
 *     上游：vite.config.ts；下游：app/SettingsPanel.vue 显示构建版本。
 */
/// <reference types="vite/client" />

/** 构建时间戳（本地时区），由 vite.config.ts 的 define 注入。 */
declare const __BUILD_ID__: string
