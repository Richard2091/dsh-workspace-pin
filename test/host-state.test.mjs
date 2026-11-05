// 宿主半边（lib/index.js）的单元测试：状态路由的读写、增量语义、并发串行化、
// 准入拒绝与边界错误。不依赖真实 dsh 宿主，用假的 ctx / req / res 直接驱动 handler。
//
// 运行：node --test test/host-state.test.mjs

import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { apply, inject, name } from "../lib/index.js";

/** 一个最小的假 Cordis Context：立刻执行 effect、收集注册的路由与 warning。 */
function createFakeContext({ connection } = {}) {
	const routes = [];
	const warnings = [];
	const ctx = {
		logger: { warn: (message) => warnings.push(message) },
		effect: (fn) => fn(),
		// 与 Cordis 的 ctx.get() 一致：未 inject 的服务通过 get 读取（返回 undefined）。
		get: (name) => (name === "connection" ? connection : undefined),
		webServer: {
			register: (route) => {
				routes.push(route);
				return () => undefined;
			},
		},
	};
	if (connection !== undefined) ctx.connection = connection;
	return { ctx, routes, warnings };
}

/** 假的 IncomingMessage：method/headers + 可选的 UTF-8 请求体。 */
function createRequest(method, { body, headers = {} } = {}) {
	const chunks = body === undefined ? [] : [Buffer.from(body, "utf8")];
	return {
		method,
		headers,
		async *[Symbol.asyncIterator]() {
			for (const chunk of chunks) yield chunk;
		},
		resume() {},
	};
}

/** 假的 ServerResponse：记录状态码、响应头与响应体。 */
function createResponse() {
	return {
		statusCode: 200,
		headersSent: false,
		headers: {},
		body: "",
		setHeader(key, value) {
			this.headers[key.toLowerCase()] = value;
		},
		end(chunk) {
			if (chunk !== undefined) this.body += chunk;
			this.headersSent = true;
		},
	};
}

/** 起一个已注册路由的插件实例，返回调用工具。 */
async function setup({ connection, stateFile } = {}) {
	const root = await mkdtemp(path.join(tmpdir(), "dsh-workspace-pin-test-"));
	const file = stateFile ?? path.join(root, "storages", "dsh-workspace-pin", "state.json");
	const { ctx, routes, warnings } = createFakeContext({ connection });
	apply(ctx, { stateFile: file });
	assert.equal(routes.length, 1, "应当注册且只注册一条路由");
	const route = routes[0];
	const call = async (method, options) => {
		const res = createResponse();
		await route.handler(createRequest(method, options), res);
		return { status: res.statusCode, headers: res.headers, body: res.body === "" ? undefined : JSON.parse(res.body) };
	};
	return {
		route,
		call,
		warnings,
		file,
		async cleanup() {
			await rm(root, { recursive: true, force: true });
		},
	};
}

test("导出的插件元信息与路由形态", async () => {
	assert.equal(name, "workspace-pin");
	assert.deepEqual(inject, ["webServer"]);
	const env = await setup();
	try {
		assert.equal(env.route.kind, "exact");
		assert.equal(env.route.path, "/plugins/dsh-workspace-pin/state");
		assert.equal(typeof env.route.handler, "function");
	} finally {
		await env.cleanup();
	}
});

test("空状态：GET 返回空集合，且不会提前创建状态文件", async () => {
	const env = await setup();
	try {
		const response = await env.call("GET");
		assert.equal(response.status, 200);
		assert.deepEqual(response.body, { version: 1, pinned: [] });
		await assert.rejects(readFile(env.file, "utf8"), /ENOENT/);
	} finally {
		await env.cleanup();
	}
});

test("pin 前插、重复 pin 幂等、unpin 删除、set 整体替换", async () => {
	const env = await setup();
	try {
		assert.deepEqual((await env.call("POST", {
			body: JSON.stringify({ op: "pin", id: "a" }),
			headers: { "content-type": "application/json" },
		})).body.pinned, ["a"]);

		assert.deepEqual((await env.call("POST", {
			body: JSON.stringify({ op: "pin", id: "b" }),
			headers: { "content-type": "application/json" },
		})).body.pinned, ["b", "a"]);

		assert.deepEqual((await env.call("POST", {
			body: JSON.stringify({ op: "pin", id: "a" }),
			headers: { "content-type": "application/json" },
		})).body.pinned, ["a", "b"]);

		assert.deepEqual((await env.call("POST", {
			body: JSON.stringify({ op: "unpin", id: "a" }),
			headers: { "content-type": "application/json" },
		})).body.pinned, ["b"]);

		assert.deepEqual((await env.call("POST", {
			body: JSON.stringify({ op: "set", pinned: ["x", "y", "x", "", 3] }),
			headers: { "content-type": "application/json" },
		})).body.pinned, ["x", "y"]);

		const stored = JSON.parse(await readFile(env.file, "utf8"));
		assert.deepEqual(stored, { version: 1, pinned: ["x", "y"] });

		const reloaded = await env.call("GET");
		assert.deepEqual(reloaded.body, { version: 1, pinned: ["x", "y"] });
	} finally {
		await env.cleanup();
	}
});

test("并发 pin 由宿主串行化，不互相覆盖", async () => {
	const env = await setup();
	try {
		const ids = ["c1", "c2", "c3", "c4", "c5"];
		const responses = await Promise.all(ids.map((id) => env.call("POST", {
			body: JSON.stringify({ op: "pin", id }),
			headers: { "content-type": "application/json" },
		})));
		assert.ok(responses.every((response) => response.status === 200));
		const final = await env.call("GET");
		assert.equal(final.body.pinned.length, ids.length);
		assert.deepEqual([...final.body.pinned].sort(), [...ids].sort());
	} finally {
		await env.cleanup();
	}
});

test("准入校验：connection 拒绝时直接回状态码且不落盘", async () => {
	const env = await setup({ connection: { requestRejection: () => 401 } });
	try {
		const getResponse = await env.call("GET");
		assert.equal(getResponse.status, 401);
		const postResponse = await env.call("POST", {
			body: JSON.stringify({ op: "pin", id: "a" }),
			headers: { "content-type": "application/json" },
		});
		assert.equal(postResponse.status, 401);
		await assert.rejects(readFile(env.file, "utf8"), /ENOENT/);
	} finally {
		await env.cleanup();
	}
});

test("没有 connection 服务时退回同源校验：跨源写请求被拒绝", async () => {
	const env = await setup();
	try {
		const response = await env.call("POST", {
			body: JSON.stringify({ op: "pin", id: "a" }),
			headers: { "content-type": "application/json", origin: "https://evil.example", host: "127.0.0.1:3080" },
		});
		assert.equal(response.status, 403);
		await assert.rejects(readFile(env.file, "utf8"), /ENOENT/);
	} finally {
		await env.cleanup();
	}
});

test("边界错误：方法、content-type、坏 JSON、坏操作都给出明确状态码", async () => {
	const env = await setup();
	try {
		assert.equal((await env.call("PUT")).status, 405);
		assert.equal((await env.call("POST", { body: "{}", headers: { "content-type": "text/plain" } })).status, 415);
		assert.equal((await env.call("POST", { body: "not-json", headers: { "content-type": "application/json" } })).status, 400);
		assert.equal((await env.call("POST", {
			body: JSON.stringify({ op: "explode", id: "a" }),
			headers: { "content-type": "application/json" },
		})).status, 400);
		assert.equal((await env.call("POST", {
			body: JSON.stringify({ op: "pin", id: "" }),
			headers: { "content-type": "application/json" },
		})).status, 400);
	} finally {
		await env.cleanup();
	}
});

test("损坏的状态文件按空集合处理并记录 warning", async () => {
	const env = await setup();
	try {
		const { mkdir, writeFile } = await import("node:fs/promises");
		await mkdir(path.dirname(env.file), { recursive: true });
		await writeFile(env.file, "{ not json", "utf8");
		const response = await env.call("GET");
		assert.deepEqual(response.body, { version: 1, pinned: [] });
		assert.ok(env.warnings.some((message) => message.includes("不是合法 JSON")));
	} finally {
		await env.cleanup();
	}
});
