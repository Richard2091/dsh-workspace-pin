/**
 * dsh-workspace-pin — 宿主半边。
 *
 * 本插件的全部行为都在浏览器半边（lib/client.js）：在侧栏的每个工作区（文件夹）
 * 行上注入一个与官方会话置顶同款的图钉按钮，点击后通过
 * `ctx.workspaces.insertBefore()` 把该工作区挪到 Host 持久顺序的最前，并把置顶
 * 集合记在当前浏览器的 localStorage 里；每次页面加载/工作区列表变化时重新把
 * 已置顶的工作区排到最前。
 *
 * 宿主半边不需要任何逻辑：它只为 profile 里的 Loader 条目提供一个合法的宿主插件
 * 入口，浏览器半边由同包 package.json 的 `dsh.client` 声明自动挂载。
 *
 * 停用方式：在 `cordis.patch.yml` 里给 `workspace-pin` 条目加 `disabled: true`，
 * 或删掉那个 insert 条目，然后刷新页面。dsh 自身文件未被改动。
 *
 * @module dsh-workspace-pin
 */

/** 插件诊断名（与 profile patch 里的条目 id 一致）。 */
export const name = "workspace-pin";

/**
 * 宿主半边不依赖任何 Cordis 服务，也不需要配置。
 */
export function apply() {}
