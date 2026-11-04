/**
 * dsh-workspace-pin — 浏览器半边。
 *
 * 目标：在侧栏的每个「工作区（文件夹）」行上，加一个和官方会话行**完全同款**的
 * 置顶图钉：显示逻辑、尺寸、颜色、hover 行为、悬浮提示都对齐官方
 * `@deepseek-ai/dsh-client-ui-workspace` 的会话置顶实现。点一下把该工作区固定到
 * 列表最前，再点一下取消。
 *
 * 官方会话置顶的两段式外观（本插件照抄）：
 *   1. 悬浮态：行尾 actions 里一个 16×16 的 `*_iconButton`（圆角
 *      `--dsw-radius-xs`，颜色 `--dsw-alias-label-tertiary`，**背景透明**，hover
 *      只把颜色提到 `--dsw-alias-label-primary`），里面是 14px 的
 *      `IconPinOutline/IconPinFill`；外面套官方 `Tooltip`（侧边 bottom、对齐 end、
 *      delayMs 500、portal）。
 *   2. 静止态（置顶后、无 hover）：行尾一个 16×20 的 `*_pinIndicator` 标记
 *      （颜色 `--dsw-alias-label-caption`，14px 实心图钉），行 hover 时隐藏，让位
 *      给悬浮按钮。未置顶的行在静止态不显示任何图钉。
 *
 * 实现要点（不改 dsh 源码、不注册替代侧栏）：
 *   - 官方工作区行渲染在 `[data-row-key="workspace:<workspaceId>"]` 上，行尾的
 *     actions 容器只在悬停/菜单打开时显示，里面放着「…」和「+」两个官方按钮。
 *     本插件用 MutationObserver 跟踪行渲染，把「静止态标记」插到 actions 前面，
 *     把「悬浮按钮」挂到 actions 最右（与会话行里置顶按钮的位置一致）。
 *   - 悬浮按钮直接复用旁边官方按钮的 className（即官方 Rows.module.css 的
 *     `*_iconButton`），并用平台模块表里的官方 React / Tooltip / IconPin*
 *     渲染，因此尺寸、颜色、hover、tooltip 全部继承官方样式；只有拿不到官方原语
 *     时才退回等价的兜底类与原生 title。
 *   - 顺序写入走官方 Client 服务 `ctx.workspaces.insertBefore(workspaceId, anchor)`，
 *     也就是宿主 registry 的持久显示顺序；刷新/重启后顺序仍在。
 *   - 置顶集合由**宿主半边**持久化（`GET|POST /plugins/dsh-workspace-pin/state`，
 *     落盘在 `<DSH_HOME>/storages/dsh-workspace-pin/state.json`），因此和会话置顶
 *     一样跨浏览器、清缓存/无痕/换设备都不丢。浏览器 localStorage（键
 *     `dsh.workspace-pin.v1`）只当**本地缓存**用：首帧先画、宿主不可用时回退，
 *     以及把旧版本数据一次性迁移到宿主。
 *   - 页面加载、工作区列表变化、页面重新可见时重新把已置顶的工作区排到最前，
 *     所以新建工作区被宿主前插到最前时，已置顶的会回到顶部。
 *
 * @module dsh-workspace-pin
 */
window.__ModuleLoader__.load({
	id: "dsh-workspace-pin",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		const PLUGIN_ID = "dsh-workspace-pin";
		const VERSION = "0.3.0";
		const ROW_PREFIX = "workspace:";
		/** 宿主状态路由：置顶集合的唯一数据源（浏览器 localStorage 只是缓存）。 */
		const STATE_URL = "/plugins/dsh-workspace-pin/state";
		/** localStorage 缓存键（首帧提示、离线回退、旧版本数据一次性迁移）。 */
		const CACHE_KEY = "dsh.workspace-pin.v1";
		const ZH = (navigator.language || "").toLowerCase().startsWith("zh");
		const WORDS = {
			/** 悬浮按钮的 aria-label。 */
			pin: ZH ? "置顶工作区" : "Pin workspace",
			unpin: ZH ? "取消置顶工作区" : "Unpin workspace",
			/** 悬浮提示（官方会话行的 tooltip 用短词）。 */
			pinShort: ZH ? "置顶" : "Pin",
			unpinShort: ZH ? "取消置顶" : "Unpin",
			/** 静止态灰色图钉标记的说明文字（对应官方 row.pinned）。 */
			pinned: ZH ? "已置顶工作区" : "Pinned workspace",
		};

		/**
		 * 官方 @deepseek-ai/dsh-client-ui-primitives 的 IconPinFill（16×16，currentColor），
		 * 仅在拿不到官方原语、需要纯 DOM 兜底时使用。
		 */
		const ICON_FILL = [
			'<svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" stroke-width="1">',
			'<path d="M9.96976 1.70572L13.1554 3.93629L10.9019 8.12317L11.5158 11.605L10.7192 12.7427L2.52767 7.00693L3.3243 5.86922L6.80612 5.25528L9.96976 1.70572Z" fill="currentColor" stroke="currentColor" stroke-linejoin="round"/>',
			'<path d="M6.05285 9.47511C6.27284 9.16094 6.70586 9.08458 7.02003 9.30457C7.3342 9.52455 7.41055 9.95757 7.19057 10.2717L3.98587 14.4708L3.21223 13.9291L6.05285 9.47511Z" fill="currentColor"/>',
			"</svg>",
		].join("");

		/** 官方 IconPinOutline（16×16，currentColor）；同上，仅兜底用。 */
		const ICON_OUTLINE = [
			'<svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" stroke-width="1">',
			'<path d="M9.96976 1.70572L13.1554 3.93629L10.9019 8.12317L11.5158 11.605L10.7192 12.7427L2.52767 7.00693L3.3243 5.86922L6.80612 5.25528L9.96976 1.70572Z" stroke="currentColor" stroke-linejoin="round"/>',
			'<path d="M6.05285 9.47511C6.27284 9.16094 6.70586 9.08458 7.02003 9.30457C7.3342 9.52455 7.41055 9.95757 7.19057 10.2717L3.98587 14.4708L3.21223 13.9291L6.05285 9.47511Z" fill="currentColor"/>',
			"</svg>",
		].join("");

		/**
		 * 兜底样式：数值抄自官方 Rows.module.css，只有在拿不到官方类名/原语时才会
		 * 真正生效（拿到官方类名时按钮只用官方类名，这里的声明不参与）。
		 *   - `dsh-wp-indicator` 对应官方 `_pinIndicator`；工作区行 `gap:6px` 而会话行
		 *     `gap:0`，所以官方那 6px 的 margin-left 在这里由行间距承担，取 0 才能
		 *     和平行视觉间距保持一致。行 hover 时隐藏，让位给悬浮按钮（官方同样行为）。
		 *   - `dsh-wp-button` 对应官方 `_iconButton`。
		 */
		const STYLE = [
			".dsh-wp-host{display:inline-flex;flex:none}",
			".dsh-wp-indicator{width:16px;height:20px;color:var(--dsw-alias-label-caption);flex:none;justify-content:center;align-items:center;margin-left:0;display:inline-flex}",
			'[data-row-key^="workspace:"]:hover .dsh-wp-indicator{display:none}',
			".dsh-wp-button{border-radius:var(--dsw-radius-xs);cursor:pointer;width:16px;height:16px;color:var(--dsw-alias-label-tertiary);background:0 0;border:none;flex:none;justify-content:center;align-items:center;padding:0;display:inline-flex}",
			".dsh-wp-button:hover{color:var(--dsw-alias-label-primary)}",
		].join("\n");

		/**
		 * 从平台模块表里取官方 React 运行时与 UI 原语，让悬浮按钮和 tooltip 复用
		 * 官方实现（与官方会话置顶按钮同一套组件与样式）。任一缺失就返回 null，
		 * 由纯 DOM + 原生 title 兜底。
		 */
		function loadRuntime() {
			try {
				const React = require("react");
				const createRoot = require("react-dom/client").createRoot;
				const primitives = require("@deepseek-ai/dsh-client-ui-primitives");
				const Tooltip = primitives?.Tooltip;
				const IconPinFill = primitives?.IconPinFillRegular;
				const IconPinOutline = primitives?.IconPinOutlineRegular;
				if (React === null || React === undefined || typeof React.createElement !== "function") return null;
				if (typeof createRoot !== "function" || typeof Tooltip !== "function" || typeof IconPinFill !== "function" || typeof IconPinOutline !== "function") return null;
				return { React, createRoot, Tooltip, IconPinFill, IconPinOutline };
			} catch (error) {
				console.warn(`[${PLUGIN_ID}] 官方 UI 原语不可用，退回原生 title 提示`, error);
				return null;
			}
		}

		/** 规范化置顶集合：只留非空字符串，去重保序。 */
		function normalizePinned(value) {
			if (!Array.isArray(value)) return [];
			const seen = new Set();
			const pinned = [];
			for (const item of value) {
				if (typeof item !== "string") continue;
				const id = item.trim();
				if (id === "" || seen.has(id)) continue;
				seen.add(id);
				pinned.push(id);
			}
			return pinned;
		}

		/** 读取本浏览器缓存；只用于首帧提示与旧数据迁移，损坏的数据按空集合处理。 */
		function loadCache() {
			try {
				const raw = window.localStorage.getItem(CACHE_KEY);
				if (raw === null) return [];
				return normalizePinned(JSON.parse(raw)?.pinned);
			} catch (error) {
				console.warn(`[${PLUGIN_ID}] 读取本地缓存失败，按空集合处理`, error);
				return [];
			}
		}

		/** 写本地缓存；localStorage 不可用时静默跳过（宿主才是数据源）。 */
		function saveCache(pinned) {
			try {
				window.localStorage.setItem(CACHE_KEY, JSON.stringify({ pinned }));
			} catch (error) {
				console.warn(`[${PLUGIN_ID}] 写本地缓存失败`, error);
			}
		}

		/**
		 * 调用宿主状态路由。响应必须是带 `pinned` 数组的 JSON；否则视为宿主半边
		 * 尚未加载（例如路由被 SPA 回退成 index.html），由调用方退回本地缓存。
		 * @param method - "GET" 或 "POST"。
		 * @param body - POST 的操作体。
		 * @returns 宿主侧的权威置顶集合。
		 */
		async function requestHostState(method, body) {
			const headers = { accept: "application/json" };
			if (body !== undefined) headers["content-type"] = "application/json";
			const response = await window.fetch(STATE_URL, {
				method,
				credentials: "same-origin",
				cache: "no-store",
				headers,
				body: body === undefined ? undefined : JSON.stringify(body),
			});
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			const text = await response.text();
			let payload;
			try {
				payload = JSON.parse(text);
			} catch {
				throw new Error("宿主返回的不是 JSON（状态路由可能尚未加载）");
			}
			if (payload === null || typeof payload !== "object" || !Array.isArray(payload.pinned)) {
				throw new Error("宿主返回缺少 pinned 数组");
			}
			return normalizePinned(payload.pinned);
		}

		/** 从一行 `data-row-key` 里取出工作区 id；「未分组」桶返回空串。 */
		function workspaceIdOf(row) {
			const key = row.getAttribute("data-row-key");
			if (key === null || !key.startsWith(ROW_PREFIX)) return "";
			return key.slice(ROW_PREFIX.length);
		}

		/**
		 * 该行的 actions 容器（悬停才显示的那个 span）。
		 * @param row - 工作区行元素。
		 * @returns 容器，或 null。
		 */
		function findActions(row) {
			for (const child of row.children) {
				if (child.tagName === "SPAN" && child.querySelector(":scope > button") !== null) return child;
			}
			return null;
		}

		/**
		 * 旁边官方按钮的 className（官方 Rows.module.css 的 `*_iconButton`）。
		 * 复用它就能继承官方的全部视觉规则。
		 * @param actions - actions 容器。
		 * @returns 官方类名字符串；拿不到时返回空串。
		 */
		function officialIconButtonClass(actions) {
			const reference = actions.querySelector(":scope > button");
			if (reference === null) return "";
			return reference.className === undefined ? "" : String(reference.className).trim();
		}

		/** 读取工作区快照里的真实 Workspace。 */
		function snapshotItems(workspaces) {
			try {
				const snapshot = workspaces.list.getSnapshot();
				if (snapshot === null || snapshot === undefined) return null;
				if (snapshot.phase !== "ready") return null;
				return Array.isArray(snapshot.items) ? snapshot.items : null;
			} catch (error) {
				console.warn(`[${PLUGIN_ID}] 读取工作区快照失败`, error);
				return null;
			}
		}

		/**
		 * 浏览器半边入口。
		 * @param ctx - 客户端 Cordis Context。
		 */
		function apply(ctx) {
			const workspaces = typeof ctx.get === "function" ? ctx.get("workspaces") : ctx.workspaces;
			if (workspaces === null || workspaces === undefined) {
				console.warn(`[${PLUGIN_ID}] 未拿到 workspaces 服务，跳过`);
				return;
			}

			window.__dshWorkspacePinVersion = VERSION;

			const runtime = loadRuntime();
			/** 置顶集合：宿主为准，首帧先用本地缓存兜底。 */
			let state = { pinned: loadCache() };
			/** 诊断用：host = 已与宿主同步，cache = 宿主不可用、暂用本地缓存。 */
			window.__dshWorkspacePinStorageMode = "unknown";
			let frame = 0;
			let orderQueued = false;
			let busy = false;
			let blockedUntil = 0;
			/** 宿主状态同步的串行队列：同一页面内的 GET/POST 不互相踩踏。 */
			let syncTail = Promise.resolve();
			/** 插件实例是否已销毁（销毁后到达的宿主响应不再改 DOM）。 */
			let disposed = false;
			/** 行元素 → 该行的 React 悬浮按钮实例。 */
			const mounts = new Map();

			/** 把宿主返回的权威置顶集合应用到本地状态（有变化才刷新 UI 与顺序）。 */
			function applyPinned(pinned) {
				if (disposed) return;
				const next = normalizePinned(pinned);
				const same = next.length === state.pinned.length && next.every((id, index) => id === state.pinned[index]);
				state = { pinned: next };
				saveCache(next);
				if (same) return;
				decorate();
				queueOrderCheck();
			}

			/** 串行执行一次宿主同步；失败只告警并标记 cache 模式，不影响本地已生效的置顶。 */
			function enqueueHostTask(task) {
				const next = syncTail.then(() => (disposed ? undefined : task())).catch((error) => {
					if (disposed) return;
					window.__dshWorkspacePinStorageMode = "cache";
					console.warn(`[${PLUGIN_ID}] 宿主置顶状态同步失败，暂用本地缓存`, error);
				});
				syncTail = next;
				return next;
			}

			/** 从宿主拉取置顶集合；首次加载时把旧 localStorage 数据一次性迁移到宿主。 */
			async function syncFromHost(migrate) {
				let pinned = await requestHostState("GET");
				window.__dshWorkspacePinStorageMode = "host";
				if (migrate && pinned.length === 0) {
					const cached = state.pinned;
					if (cached.length > 0) pinned = await requestHostState("POST", { op: "set", pinned: cached });
				}
				applyPinned(pinned);
			}

			/** 把已置顶的工作区按置顶顺序挪到当前顺序的最前。 */
			function assertOrder() {
				if (busy || Date.now() < blockedUntil) return;
				const items = snapshotItems(workspaces);
				if (items === null) return;
				const current = items.map((item) => item.workspaceId);
				const pinned = state.pinned.filter((id) => current.includes(id));
				if (pinned.length === 0) return;
				const desired = pinned.concat(current.filter((id) => !pinned.includes(id)));
				let index = 0;
				while (index < current.length && current[index] === desired[index]) index += 1;
				if (index >= current.length) return;
				const target = desired[index];
				const anchor = current[index];
				busy = true;
				let request;
				try {
					request = anchor === undefined
						? workspaces.insertBefore(target)
						: workspaces.insertBefore(target, anchor);
				} catch (error) {
					busy = false;
					blockedUntil = Date.now() + 5000;
					console.warn(`[${PLUGIN_ID}] 调整工作区顺序失败`, error);
					return;
				}
				Promise.resolve(request).catch((error) => {
					blockedUntil = Date.now() + 5000;
					console.warn(`[${PLUGIN_ID}] 调整工作区顺序失败`, error);
				}).finally(() => {
					busy = false;
					queueOrderCheck();
					scheduleDecorate();
				});
			}

			/**
			 * 官方原语渲染的悬浮按钮：外层官方 Tooltip + 官方 iconButton 类名 +
			 * 官方 IconPinFill/Outline（14px），和会话行的置顶按钮同构。
			 * @param mount - 该行的挂载记录。
			 * @returns React 元素。
			 */
			function buildPinButton(mount) {
				const { React } = runtime;
				const pinned = mount.pinned;
				return React.createElement(runtime.Tooltip, {
					label: pinned ? WORDS.unpinShort : WORDS.pinShort,
					side: "bottom",
					align: "end",
					delayMs: 500,
					portal: true,
				}, React.createElement("button", {
					type: "button",
					className: mount.iconClass,
					"aria-label": pinned ? WORDS.unpin : WORDS.pin,
					"data-dsh-wp": "1",
					"data-pinned": pinned ? "true" : "false",
					onClick: (event) => {
						event.preventDefault();
						event.stopPropagation();
						toggle(mount.workspaceId);
					},
				}, React.createElement(pinned ? runtime.IconPinFill : runtime.IconPinOutline, { size: 14 })));
			}

			/**
			 * 纯 DOM 兜底按钮（拿不到官方原语时）：尺寸/绘图对齐官方，提示退回 title。
			 * @param actions - actions 容器。
			 * @param workspaceId - 该行工作区 id。
			 * @param pinned - 是否已置顶。
			 * @param iconClass - 官方按钮类名或空串。
			 */
			function decorateFallback(actions, workspaceId, pinned, iconClass) {
				let button = actions.querySelector(':scope > [data-dsh-wp="1"]');
				if (button === null) {
					button = document.createElement("button");
					button.type = "button";
					button.dataset.dshWp = "1";
					button.className = iconClass === "" ? "dsh-wp-button" : iconClass;
					button.addEventListener("click", (event) => {
						event.preventDefault();
						event.stopPropagation();
						toggle(workspaceId);
					});
					actions.appendChild(button);
				} else {
					const next = iconClass === "" ? "dsh-wp-button" : iconClass;
					if (button.className !== next) button.className = next;
				}
				const label = pinned ? WORDS.unpin : WORDS.pin;
				const icon = pinned ? "fill" : "outline";
				button.dataset.pinned = pinned ? "true" : "false";
				button.setAttribute("aria-label", label);
				button.title = pinned ? WORDS.unpinShort : WORDS.pinShort;
				if (button.dataset.icon !== icon) {
					button.dataset.icon = icon;
					button.innerHTML = pinned ? ICON_FILL : ICON_OUTLINE;
				}
			}

			/**
			 * 静止态灰色图钉标记：插在 actions 容器前面，行 hover 时由 CSS 隐藏。
			 * 未置顶时确保不存在（与官方会话行一致：未置顶的行静止态不显示图钉）。
			 * @param row - 工作区行元素。
			 * @param actions - actions 容器。
			 * @param pinned - 是否已置顶。
			 */
			function syncIndicator(row, actions, pinned) {
				let marker = row.querySelector(':scope > [data-dsh-wp-indicator="1"]');
				if (!pinned) {
					if (marker !== null) marker.remove();
					return;
				}
				if (marker === null) {
					marker = document.createElement("span");
					marker.dataset.dshWpIndicator = "1";
					marker.className = "dsh-wp-indicator";
					marker.setAttribute("role", "img");
					marker.innerHTML = ICON_FILL;
					row.insertBefore(marker, actions);
				} else if (marker.nextElementSibling !== actions) {
					row.insertBefore(marker, actions);
				}
				const label = WORDS.pinned;
				marker.setAttribute("aria-label", label);
				marker.title = label;
			}

			/** 当前行集合的图钉（静止态标记 + 悬浮按钮）。 */
			function decorate() {
				const rows = document.querySelectorAll(`[data-row-key^="${ROW_PREFIX}"]`);
				for (const row of rows) {
					const workspaceId = workspaceIdOf(row);
					if (workspaceId === "") continue;
					const actions = findActions(row);
					if (actions === null) continue;
					const pinned = state.pinned.includes(workspaceId);
					const iconClass = officialIconButtonClass(actions);
					const buttonClass = iconClass === "" ? "dsh-wp-button" : iconClass;

					syncIndicator(row, actions, pinned);

					if (runtime === null) {
						decorateFallback(actions, workspaceId, pinned, buttonClass);
						continue;
					}

					let mount = mounts.get(row);
					if (mount === undefined) {
						const host = document.createElement("span");
						host.dataset.dshWpHost = "1";
						host.className = "dsh-wp-host";
						actions.appendChild(host);
						mount = {
							host,
							root: runtime.createRoot(host),
							workspaceId: "",
							pinned: null,
							iconClass: "",
						};
						mounts.set(row, mount);
					}
					if (mount.host.parentNode !== actions) actions.appendChild(mount.host);
					if (mount.workspaceId !== workspaceId || mount.pinned !== pinned || mount.iconClass !== buttonClass) {
						mount.workspaceId = workspaceId;
						mount.pinned = pinned;
						mount.iconClass = buttonClass;
						mount.root.render(buildPinButton(mount));
					}
				}
				pruneMounts();
			}

			/** 行被移除（列表重排/折叠）后回收它的 React 根。 */
			function pruneMounts() {
				for (const [row, mount] of mounts) {
					if (row.isConnected) continue;
					try {
						mount.root.unmount();
					} catch (error) {
						console.warn(`[${PLUGIN_ID}] 卸载按钮失败`, error);
					}
					mounts.delete(row);
				}
			}

			/** 视觉刷新：一帧内合并多次 DOM 变化；隐藏页面的 rAF 不触发，退回定时器。 */
			function scheduleDecorate() {
				if (frame !== 0) return;
				if (document.visibilityState === "hidden") {
					frame = window.setTimeout(() => {
						frame = 0;
						decorate();
					}, 0);
					return;
				}
				frame = window.requestAnimationFrame(() => {
					frame = 0;
					decorate();
				});
			}

			/** 顺序校正：不依赖绘制帧，排队后直接写宿主 registry。 */
			function queueOrderCheck() {
				if (orderQueued) return;
				orderQueued = true;
				window.setTimeout(() => {
					orderQueued = false;
					assertOrder();
				}, 0);
			}

			/** 置顶/取消置顶：本地立即生效，然后写宿主（宿主持久化，跨浏览器一致）。 */
			function toggle(workspaceId) {
				const wasPinned = state.pinned.includes(workspaceId);
				const next = wasPinned
					? state.pinned.filter((id) => id !== workspaceId)
					: [workspaceId, ...state.pinned];
				state = { pinned: normalizePinned(next) };
				saveCache(state.pinned);
				blockedUntil = 0;
				decorate();
				assertOrder();
				const body = wasPinned ? { op: "unpin", id: workspaceId } : { op: "pin", id: workspaceId };
				enqueueHostTask(async () => {
					const authoritative = await requestHostState("POST", body);
					window.__dshWorkspacePinStorageMode = "host";
					applyPinned(authoritative);
				});
			}

			ctx.effect(() => {
				const style = document.createElement("style");
				style.dataset.plugin = PLUGIN_ID;
				style.textContent = STYLE;
				document.head.appendChild(style);

				const refresh = () => {
					scheduleDecorate();
					queueOrderCheck();
				};
				const observer = new MutationObserver(() => scheduleDecorate());
				observer.observe(document.body, {
					childList: true,
					subtree: true,
					attributes: true,
					attributeFilter: ["data-row-key"],
				});
				const unsubscribe = typeof workspaces.list.subscribe === "function"
					? workspaces.list.subscribe(() => refresh())
					: () => {};
				const onVisibilityChange = () => {
					refresh();
					// 页面重新可见时向宿主对齐一次：别的浏览器/标签页可能刚改过置顶。
					if (document.visibilityState === "visible") enqueueHostTask(() => syncFromHost(false));
				};
				document.addEventListener("visibilitychange", onVisibilityChange);
				const timers = [0, 300, 1200, 3000].map((delay) => window.setTimeout(refresh, delay));
				refresh();
				// 宿主是数据源：首帧之后立刻拉取一次，首次时顺带迁移旧 localStorage 数据。
				enqueueHostTask(() => syncFromHost(true));

				return () => {
					disposed = true;
					observer.disconnect();
					unsubscribe();
					document.removeEventListener("visibilitychange", onVisibilityChange);
					timers.forEach((timer) => window.clearTimeout(timer));
					if (frame !== 0) {
						window.cancelAnimationFrame(frame);
						window.clearTimeout(frame);
					}
					for (const mount of mounts.values()) {
						try {
							mount.root.unmount();
						} catch (error) {
							console.warn(`[${PLUGIN_ID}] 卸载按钮失败`, error);
						}
					}
					mounts.clear();
					style.remove();
					document.querySelectorAll('[data-dsh-wp-host="1"], [data-dsh-wp-indicator="1"], [data-dsh-wp="1"]').forEach((node) => node.remove());
				};
			}, `${PLUGIN_ID}: workspace rows`);
		}

		exports.apply = apply;
		exports.inject = ["workspaces"];
		return module.exports;
	},
});
