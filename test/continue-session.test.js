import assert from "node:assert/strict";
import test from "node:test";

import app from "../index.js";

/**
 * Load the real default export the host loads, with a fake entry context just
 * rich enough for `defineApp` to wire its SDK. Nothing here implements host
 * behavior; it only records what the App asks the host to do.
 */
async function loadApp({ sessionId } = {}) {
  const registrations = [];
  const sends = [];
  // `defineApp` binds every domain the host hands it, so the stub carries the
  // few shape-required ones this App never touches. Only tools and bus are real.
  const context = {
    dataDir: "/tmp/hana-push-astra-test",
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    tools: {
      register(tool) {
        registrations.push(tool);
        return { ready: Promise.resolve() };
      },
    },
    bus: {
      async request(verb, input) {
        if (verb !== "session:send") throw new Error(`unexpected host verb ${verb}`);
        sends.push(input);
        return { sessionPath: "/sessions/test.jsonl", accepted: true };
      },
    },
    models: {},
    media: {},
    providers: {},
    hooks: {},
    storage: { global: {}, agent: () => ({}) },
  };

  await app.apply(context);

  const tool = registrations.find((entry) => entry.name === "continue_session");
  assert.ok(tool, "the App registers continue_session");

  const callArgs = sessionId === undefined ? { context: { sessionPath: "/sessions/test.jsonl", messageId: null } }
    : { context: { sessionId, sessionPath: "/sessions/test.jsonl", messageId: null } };

  return { tool, registrations, sends, callArgs };
}

test("registers exactly one tool: continue_session", async () => {
  const { tool, registrations } = await loadApp({ sessionId: "session-a" });
  assert.equal(registrations.length, 1, "no leftover starter tool is registered");
  assert.equal(tool.name, "continue_session");
  assert.equal(tool.parameters.type, "object");
  assert.match(tool.description, /继续/);
  assert.match(tool.description, /一次/);
});

test("one call sends a single 继续 to the clicked session under scope all", async () => {
  const { tool, sends, callArgs } = await loadApp({ sessionId: "session-a" });

  const result = await tool.execute(callArgs);

  assert.equal(sends.length, 1, "exactly one send, no retry and no loop");
  assert.deepEqual(sends[0], { sessionId: "session-a", scope: "all", text: "继续" });
  assert.equal(result.content[0].type, "text");
  assert.match(result.content[0].text, /继续/);
});

test("a missing session id is refused before anything is sent", async () => {
  const { tool, sends, callArgs } = await loadApp({ sessionId: undefined });

  await assert.rejects(() => tool.execute(callArgs), /sessionId/);
  assert.equal(sends.length, 0, "no send happened, and sessionPath was not used as a substitute");
});
