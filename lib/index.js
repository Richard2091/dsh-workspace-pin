/**
 * dsh-workspace-pin — 宿主半边。
 *
 * 作用：给浏览器半边提供**宿主持久化**的「工作区置顶集合」，让置顶状态和会话置顶
 * 一样跨浏览器、清缓存/换设备都不丢。
 *
 * 实现（不改 dsh 源码、不新增依赖）：
 *   - 注册一条精确路由 `GET|POST /plugins/dsh-workspace-pin/state`，通过官方
 *     `ctx.webServer.register()` 交给宿主的 HTTP 服务器；
 *   - 请求准入复用官方 `ctx.connection.requestRejection()`：Host/Origin 围栏 +
 *     浏览器会话鉴权，和官方插件的私有路由同等级，不额外暴露写入口；
 *   - 状态文件默认 `<DSH_HOME>/storages/dsh-workspace-pin/state.json`（可用条目
 *     config 的 `stateFile` 覆盖），写入走「临时文件 + rename」的原子替换；
 *   - POST 语义与官方会话置顶一致：`pin` / `unpin` 是**增量操作**，由宿主串行化
 *     读改写，多浏览器并发置顶不会互相覆盖；`set` 仅用于迁移旧 localStorage。
 *
 * 数据形状：`{ "version": 1, "pinned": ["<workspaceId>", ...] }`，最近的置顶在前。
 *
 * @module dsh-workspace-pin
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

/** 插件诊断名（与 profile patch 里的条目 id 一致）。 */
export const name = "workspace-pin";

/** 需要宿主服务：HTTP 路由注册表（准入校验用 `connection`，缺省时降级）。 */
export const inject = ["webServer"];

/** 浏览器半边读写的状态路由（精确匹配，不会遮蔽官方 `/plugins/**` 前缀路由）。 */
const STATE_PATH = "/plugins/dsh-workspace-pin/state";

/** 状态文件格式版本。 */
const STATE_VERSION = 1;

/** 状态文件默认子目录（相对 DSH 主目录）。 */
const STATE_DIR = ["storages", "dsh-workspace-pin"];

/** POST 体上限：只有工作区 id，64 KiB 足够。 */
const MAX_BODY_BYTES = 64 * 1024;

/** 置顶集合上限，防御异常输入。 */
const MAX_PINNED = 5000;

/** 允许的 POST 操作。 */
const OPERATIONS = new Set(["pin", "unpin", "set"]);

/**
 * 解析 DSH 主目录：显式配置 > `$DSH_HOME` > `~/.dsh`（与官方 `resolveDshHome` 一致，
 * 空白环境变量视为未设置）。
 * @returns {string} 主目录绝对路径。
 */
function resolveDshHome() {
	const configured = (process.env.DSH_HOME ?? "").trim();
	if (configured !== "") return configured;
	return path.join(homedir(), ".dsh");
}

/**
 * 展开 `~`/`~/`/`~\` 前缀（只处理当前用户，和官方 `expandHomePath` 的窄语义一致）。
 * @param {string} value - 待展开路径。
 * @returns {string} 本地路径。
 */
function expandHome(value) {
	if (value === "~") return homedir();
	if (value.startsWith("~/") || value.startsWith("~\\")) return path.join(homedir(), value.slice(2));
	return value;
}

/**
 * 状态文件位置：条目 config 的 `stateFile` 优先，否则落在 DSH 主目录下。
 * @param {{ stateFile?: string } | undefined} config - 条目配置。
 * @returns {string} 绝对路径。
 */
function resolveStateFile(config) {
	const configured = typeof config?.stateFile === "string" ? config.stateFile.trim() : "";
	if (configured !== "") return path.resolve(expandHome(configured));
	return path.join(resolveDshHome(), ...STATE_DIR, "state.json");
}

/**
 * 规范化置顶集合：只留非空字符串，去重保序，截断到上限。
 * @param {unknown} value - 任意输入。
 * @returns {string[]} 干净的 workspace id 列表。
 */
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
		if (pinned.length >= MAX_PINNED) break;
	}
	return pinned;
}

/**
 * 读取状态文件；不存在按空集合处理，损坏的数据记一条 warn 后按空集合处理。
 * @param {string} file - 状态文件路径。
 * @param {{ warn: (message: string) => void }} logger - 宿主日志。
 * @returns {Promise<{ version: number, pinned: string[] }>} 当前状态。
 */
async function readState(file, logger) {
	let raw;
	try {
		raw = await readFile(file, "utf8");
	} catch (error) {
		if (error?.code === "ENOENT") return { version: STATE_VERSION, pinned: [] };
		logger.warn(`workspace-pin: 读取 ${file} 失败，按空集合处理：${String(error)}`);
		return { version: STATE_VERSION, pinned: [] };
	}
	try {
		const parsed = JSON.parse(raw);
		return { version: STATE_VERSION, pinned: normalizePinned(parsed?.pinned) };
	} catch (error) {
		logger.warn(`workspace-pin: ${file} 不是合法 JSON，按空集合处理：${String(error)}`);
		return { version: STATE_VERSION, pinned: [] };
	}
}

/**
 * 原子写状态文件：同目录临时文件 + rename，避免读方看到半个文件。
 * @param {string} file - 状态文件路径。
 * @param {string[]} pinned - 要落盘的置顶集合。
 * @returns {Promise<void>} 落盘完成。
 */
async function writeState(file, pinned) {
	await mkdir(path.dirname(file), { recursive: true });
	const temp = `${file}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
	await writeFile(temp, `${JSON.stringify({ version: STATE_VERSION, pinned }, null, 2)}\n`, "utf8");
	await rename(temp, file);
}

/** 发送 JSON 响应（no-store：置顶集合是实时事实）。 */
function sendJson(res, status, payload) {
	res.statusCode = status;
	res.setHeader("content-type", "application/json; charset=utf-8");
	res.setHeader("cache-control", "no-store");
	res.end(JSON.stringify(payload));
}

/** 405 + Allow。 */
function sendMethodNotAllowed(res, allow) {
	res.statusCode = 405;
	res.setHeader("allow", allow);
	res.end();
}

/**
 * 读取有上限的请求体；超限时排空并返回 null。
 * @param {import("node:http").IncomingMessage} req - 请求。
 * @returns {Promise<string | null>} UTF-8 文本，或超限的 null。
 */
async function readBoundedBody(req) {
	const chunks = [];
	let size = 0;
	for await (const chunk of req) {
		size += chunk.byteLength;
		if (size > MAX_BODY_BYTES) {
			req.resume();
			return null;
		}
		chunks.push(chunk);
	}
	return Buffer.concat(chunks, size).toString("utf8");
}

/**
 * 解析一条 POST 体：`{op:"pin",id}` / `{op:"unpin",id}` / `{op:"set",pinned:[...]}`。
 * @param {unknown} body - 已解析的 JSON。
 * @returns {{ op: string, id: string } | { op: "set", pinned: string[] } | null} 操作，或 null。
 */
function parseOperation(body) {
	if (typeof body !== "object" || body === null) return null;
	const op = body.op;
	if (typeof op !== "string" || !OPERATIONS.has(op)) return null;
	if (op === "set") return { op, pinned: normalizePinned(body.pinned) };
	if (typeof body.id !== "string") return null;
	const id = body.id.trim();
	return id === "" ? null : { op, id };
}

/**
 * 宿主半边入口：注册状态路由。
 * @param {import("@deepseek-ai/cordis").Context} ctx - 宿主 Cordis Context。
 * @param {{ stateFile?: string } | undefined} config - 条目配置。
 */
export function apply(ctx, config) {
	const file = resolveStateFile(config);
	const logger = {
		warn: (message) => {
			try {
				if (typeof ctx.logger?.warn === "function") {
					ctx.logger.warn(message);
					return;
				}
			} catch {
				// 宿主 logger 不可用时退回 console
			}
			console.warn(`[workspace-pin] ${message}`);
		},
	};
	/** 串行化「读改写」，让 pin/unpin 在多浏览器并发下仍然各自生效。 */
	let tail = Promise.resolve();
	const mutate = (change) => {
		const next = tail.then(async () => {
			const current = await readState(file, logger);
			const pinned = normalizePinned(change(current.pinned));
			await writeState(file, pinned);
			return { version: STATE_VERSION, pinned };
		});
		tail = next.catch(() => undefined);
		return next;
	};

	/**
	 * 官方准入：Host/Origin 围栏 + 浏览器会话鉴权；拿不到 connection 服务时
	 * 退回同源校验（本机 loopback 部署）。
	 *
	 * 注意：用 `ctx.get()` 而不是属性访问，因为 Cordis 对未列入 `inject` 的服务
	 * 属性访问会抛 `cannot get property "..." without inject`；`connection` 是
	 * 可选依赖，缺失时不应影响本插件加载。
	 * @returns {boolean} 是否已拒绝（已写响应）。
	 */
	const rejected = (req, res) => {
		let connection;
		try {
			connection = typeof ctx.get === "function" ? ctx.get("connection") : undefined;
		} catch {
			connection = undefined;
		}
		if (typeof connection?.requestRejection === "function") {
			const rejection = connection.requestRejection(req);
			if (rejection === undefined) return false;
			res.statusCode = rejection;
			res.end();
			return true;
		}
		const origin = req.headers.origin;
		const host = req.headers.host;
		if (typeof origin === "string" && origin !== "" && host !== undefined) {
			try {
				if (new URL(origin).host !== host) {
					res.statusCode = 403;
					res.end();
					return true;
				}
			} catch {
				res.statusCode = 403;
				res.end();
				return true;
			}
		}
		return false;
	};

	const handler = async (req, res) => {
		try {
			if (rejected(req, res)) return;
			if (req.method === "GET") {
				sendJson(res, 200, await readState(file, logger));
				return;
			}
			if (req.method !== "POST") {
				sendMethodNotAllowed(res, "GET, POST");
				return;
			}
			const contentType = String(req.headers["content-type"] ?? "").split(";", 1)[0].trim().toLowerCase();
			if (contentType !== "application/json") {
				sendJson(res, 415, { error: "content-type must be application/json" });
				return;
			}
			const text = await readBoundedBody(req);
			if (text === null) {
				sendJson(res, 413, { error: "request body too large" });
				return;
			}
			let body;
			try {
				body = JSON.parse(text);
			} catch {
				sendJson(res, 400, { error: "invalid JSON" });
				return;
			}
			const operation = parseOperation(body);
			if (operation === null) {
				sendJson(res, 400, { error: "expected {op:pin|unpin,id} or {op:set,pinned}" });
				return;
			}
			const next = await mutate((current) => {
				if (operation.op === "set") return operation.pinned;
				if (operation.op === "pin") return [operation.id, ...current.filter((id) => id !== operation.id)];
				return current.filter((id) => id !== operation.id);
			});
			sendJson(res, 200, next);
		} catch (error) {
			logger.warn(`workspace-pin: 处理 ${STATE_PATH} 失败：${String(error)}`);
			if (!res.headersSent) sendJson(res, 500, { error: "internal error" });
			else res.end();
		}
	};

	ctx.effect(() => ctx.webServer.register({
		kind: "exact",
		path: STATE_PATH,
		handler,
	}), `workspace-pin: ${STATE_PATH}`);
}
