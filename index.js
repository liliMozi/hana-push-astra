import { defineApp } from "./sdk/app-contract/server-client.js";

export const name = "hana-push-astra";

/** The single message this App sends. One click, one send, no loop and no retry. */
const CONTINUE_TEXT = "继续";

/**
 * Read the stable session id the host attaches to a UI-dispatched tool call.
 *
 * The input-bar contribution runs this tool through the host's ui-actions
 * channel, which supplies `context.sessionId` for the session the click came
 * from. A missing id means the caller is not that channel (or the session is
 * not yet created), and this App refuses to guess: it never reads global focus
 * and never substitutes `context.sessionPath`, because sending "继续" into a
 * session the user did not click in is worse than a visible error.
 */
function requireSessionId(args) {
  const sessionId = args?.context?.sessionId;
  if (typeof sessionId !== "string" || sessionId.trim() === "") {
    throw new Error(
      "hana-push-astra: continue_session needs context.sessionId; it sends only to the session the click came from and never guesses one.",
    );
  }
  return sessionId;
}

export default defineApp(async (sdk) => {
  await sdk.logger.info("hana-push-astra loaded");

  await sdk.tools.register({
    name: "continue_session",
    description:
      "向当前会话发送一次「继续」，让停下来的回复接着往下干。只在用户要求继续时调用：不检查进度、不等回复、不重发，也不会发到别的会话。",
    parameters: { type: "object", properties: {} },
    execute: async (args) => {
      const sessionId = requireSessionId(args);
      const result = await sdk.sessions.send({
        sessionId,
        scope: "all",
        text: CONTINUE_TEXT,
      });
      return {
        content: [
          {
            type: "text",
            text: `已在当前会话发送「${CONTINUE_TEXT}」，宿主已接纳这条消息（accepted: ${result?.accepted === true}）。`,
          },
        ],
      };
    },
  });
});
