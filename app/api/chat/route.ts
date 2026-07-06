import { NextRequest } from "next/server";
import { anthropic, buildContextBlock, MAX_HISTORY_MESSAGES, MAX_TOOL_ITERATIONS, MODEL, SYSTEM_PROMPT, tools } from "@/lib/claude";
import { acquireChatLock, getRecentChatMessages, insertChatMessage, releaseChatLock } from "@/lib/db";

export const runtime = "nodejs";

function sseEncode(event: string, data: unknown): Uint8Array {
  return new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function ensureStartsWithUser<T extends { role: string }>(msgs: T[]): T[] {
  const idx = msgs.findIndex((m) => m.role === "user");
  return idx === -1 ? [] : msgs.slice(idx);
}

function findToolUse(messages: any[], toolUseId: string): { name: string; input: unknown } | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "assistant" && Array.isArray(m.content)) {
      const block = m.content.find((b: any) => b.type === "tool_use" && b.id === toolUseId);
      if (block) return { name: block.name, input: block.input };
    }
  }
  return null;
}

export async function GET() {
  const history = await getRecentChatMessages(MAX_HISTORY_MESSAGES);
  return Response.json({
    messages: history.map((m) => ({ role: m.role, content: m.content })),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message) {
    return new Response(JSON.stringify({ error: "message is required" }), { status: 400 });
  }

  // Single-user app: serialize processing so a message sent before the previous
  // one finished can't spawn a second, unsynchronized agent loop that duplicates
  // tool calls (e.g. logging the same meal twice).
  const acquired = await acquireChatLock();
  if (!acquired) {
    return new Response(
      JSON.stringify({ error: "前のメッセージをまだ処理中です。少し待ってから送信してください。" }),
      { status: 409, headers: { "Content-Type": "application/json" } },
    );
  }

  let history, contextBlock;
  try {
    await insertChatMessage("user", message);
    [history, contextBlock] = await Promise.all([getRecentChatMessages(MAX_HISTORY_MESSAGES), buildContextBlock()]);
  } catch (err) {
    await releaseChatLock().catch(() => {});
    throw err;
  }

  const trimmed = ensureStartsWithUser(history);
  const messages = trimmed.map((m, i) => ({
    role: m.role,
    content: i === 0 ? `${contextBlock}\n\n---\n\n${m.content}` : m.content,
  }));

  const stream = new ReadableStream({
    async start(controller) {
      // Delivery to the client is best-effort: if the client navigates away mid-turn,
      // enqueue() throws once the stream is cancelled. That must never abort the agent
      // loop or skip persistence below — recording and history must not depend on
      // whether anyone is still watching the SSE connection.
      let clientGone = false;
      const send = (event: string, data: unknown) => {
        if (clientGone) return;
        try {
          controller.enqueue(sseEncode(event, data));
        } catch {
          clientGone = true;
        }
      };

      let assistantText = "";
      const toolCallSummaries: string[] = [];
      let processingError: unknown = null;

      // The tool runner only appends a turn's assistant/tool-result messages to
      // `runner.params.messages` when it resumes past our `yield` to start the *next*
      // iteration — so reading the array inside the loop body always lags one turn
      // behind. That means the final turn (whichever one ends the conversation with
      // no further tool calls) never gets flushed inside the loop; it's only visible
      // after `runner.done()` resolves. Extract in both places so nothing is dropped.
      function extractNewMessages(current: any[], fromIndex: number): number {
        for (let i = fromIndex; i < current.length; i++) {
          const m = current[i];
          if (m.role === "assistant" && Array.isArray(m.content)) {
            for (const block of m.content) {
              if (block.type === "text") assistantText += block.text;
            }
          }
          if (m.role === "user" && Array.isArray(m.content)) {
            for (const block of m.content) {
              if (block.type === "tool_result") {
                const toolUse = findToolUse(current, block.tool_use_id);
                let output: unknown = block.content;
                if (typeof output === "string") {
                  try {
                    output = JSON.parse(output);
                  } catch {
                    // leave as raw string
                  }
                }
                send("tool_result", {
                  name: toolUse?.name,
                  input: toolUse?.input,
                  output,
                  is_error: block.is_error ?? false,
                });
                if (!block.is_error) {
                  toolCallSummaries.push(`${toolUse?.name}(${JSON.stringify(output)})`);
                }
              }
            }
          }
        }
        return current.length;
      }

      try {
        const runner = anthropic.beta.messages.toolRunner({
          model: MODEL,
          max_tokens: 4096,
          system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
          messages,
          tools,
          stream: true,
          max_iterations: MAX_TOOL_ITERATIONS,
        });

        let emittedUpTo = messages.length;

        for await (const msgStream of runner) {
          msgStream.on("text", (delta: string) => send("delta", { text: delta }));
          await msgStream.finalMessage();
          emittedUpTo = extractNewMessages(runner.params.messages as any[], emittedUpTo);
        }

        await runner.done();
        extractNewMessages(runner.params.messages as any[], emittedUpTo);
      } catch (err) {
        // Tool calls that already ran before the error persisted their own DB writes
        // regardless of this; we still record whatever text/tool summary was produced
        // so the conversation history stays accurate for the next turn.
        processingError = err;
      }

      const storedContent = toolCallSummaries.length
        ? `${assistantText}\n\n[tool_calls: ${toolCallSummaries.join("; ")}]`
        : assistantText;

      try {
        if (processingError) {
          const errMessage = processingError instanceof Error ? processingError.message : String(processingError);
          await insertChatMessage("assistant", storedContent || `(エラーが発生しました: ${errMessage})`);
          send("error", { message: errMessage });
        } else {
          await insertChatMessage("assistant", storedContent || "(応答がありませんでした)");
          send("done", {});
        }
      } catch (persistErr) {
        send("error", {
          message: persistErr instanceof Error ? persistErr.message : String(persistErr),
        });
      } finally {
        await releaseChatLock().catch(() => {});
        try {
          controller.close();
        } catch {
          // already closed by the client disconnecting; nothing to do
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
