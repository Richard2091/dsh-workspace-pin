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
 *   - 置顶集合保存在当前浏览器的 localStorage（键 `dsh.workspace-pin.v1`，
 *     最近的置顶在前）；页面加载、工作区列表变化时重新把已置顶的工作区排到最前，
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
		const VERSION = "0.2.0";
		const STORAGE_KEY = "dsh.workspace-pin.v1";
		const ROW_PREFIX = "workspace:";
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

		/** 读取当前浏览器的置顶集合；损坏的数据按空集合处理。 */
		function loadState() {
			try {
				const raw = window.localStorage.getItem(STORAGE_KEY);
				if (raw === null) return { pinned: [] };
				const parsed = JSON.parse(raw);
				const pinned = Array.isArray(parsed?.pinned) ? parsed.pinned : [];
				return { pinned: pinned.filter((id) => typeof id === "string" && id !== "") };
			} catch (error) {
				console.warn(`[${PLUGIN_ID}] 读取置顶状态失败，按空集合处理`, error);
				return { pinned: [] };
			}
		}

		/** 落盘置顶集合；localStorage 不可用时只保留内存状态。 */
		function saveState(state) {
			try {
				window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
			} catch (error) {
				console.warn(`[${PLUGIN_ID}] 保存置顶状态失败（仅内存生效）`, error);
			}
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
			let state = loadState();
			let frame = 0;
			let orderQueued = false;
			let busy = false;
			let blockedUntil = 0;
			/** 行元素 → 该行的 React 悬浮按钮实例。 */
			const mounts = new Map();

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

			/** 置顶/取消置顶。 */
			function toggle(workspaceId) {
				const index = state.pinned.indexOf(workspaceId);
				if (index >= 0) state.pinned.splice(index, 1);
				else state.pinned.unshift(workspaceId);
				state = { pinned: state.pinned.slice() };
				saveState(state);
				blockedUntil = 0;
				decorate();
				assertOrder();
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
				const onVisibilityChange = () => refresh();
				document.addEventListener("visibilitychange", onVisibilityChange);
				const timers = [0, 300, 1200, 3000].map((delay) => window.setTimeout(refresh, delay));
				refresh();

				return () => {
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
