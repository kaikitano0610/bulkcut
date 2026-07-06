"use client";

import { useEffect, useRef, useState } from "react";
import { ChatBubble, type ChatMessageUI } from "./ChatBubble";
import { SummaryBar, type DaySummaryUI } from "./SummaryBar";

function stripToolCallSummary(content: string): string {
  return content.replace(/\n\n\[tool_calls:[\s\S]*\]$/, "").trim();
}

export function ChatClient({
  initialMessages,
  initialSummary,
}: {
  initialMessages: { role: "user" | "assistant"; content: string }[];
  initialSummary: DaySummaryUI | null;
}) {
  const [messages, setMessages] = useState<ChatMessageUI[]>(() =>
    initialMessages.map((m) => ({
      id: crypto.randomUUID(),
      role: m.role,
      content: stripToolCallSummary(m.content),
      toolResults: [],
    })),
  );
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [isComposing, setIsComposing] = useState(false);
  const [summary, setSummary] = useState(initialSummary);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sendingRef = useRef(sending);
  sendingRef.current = sending;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // If this page mounted while a previous turn was still being processed
  // server-side (e.g. the user switched tabs mid-reply and came back before
  // it finished), the assistant's reply never reaches this instance via SSE.
  // Poll briefly for it instead of leaving the conversation stuck on the
  // trailing user message.
  useEffect(() => {
    if (initialMessages[initialMessages.length - 1]?.role !== "user") return;

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 40;

    const poll = async () => {
      if (cancelled) return;
      attempts += 1;
      try {
        const res = await fetch("/api/chat");
        if (res.ok) {
          const { messages: fresh } = (await res.json()) as {
            messages: { role: "user" | "assistant"; content: string }[];
          };
          if (!cancelled && !sendingRef.current && fresh[fresh.length - 1]?.role === "assistant") {
            setMessages(
              fresh.map((m) => ({
                id: crypto.randomUUID(),
                role: m.role,
                content: stripToolCallSummary(m.content),
                toolResults: [],
              })),
            );
            refreshSummary();
            return;
          }
        }
      } catch {
        // best-effort; retry on next tick
      }
      if (!cancelled && attempts < maxAttempts) {
        timer = setTimeout(poll, 1500);
      }
    };

    let timer = setTimeout(poll, 1500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshSummary() {
    try {
      const res = await fetch("/api/today");
      if (res.ok) setSummary(await res.json());
    } catch {
      // best-effort refresh; ignore failures
    }
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setSending(true);

    const userMsg: ChatMessageUI = { id: crypto.randomUUID(), role: "user", content: text, toolResults: [] };
    const assistantId = crypto.randomUUID();
    setMessages((prev) => [...prev, userMsg, { id: assistantId, role: "assistant", content: "", toolResults: [] }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      if (res.status === 409) {
        // Previous message is still being processed server-side; nothing was
        // recorded for this attempt, so drop the optimistic bubbles and let the
        // user resend once the current turn finishes instead of showing an error.
        const body = await res.json().catch(() => null);
        setMessages((prev) => prev.filter((m) => m.id !== userMsg.id && m.id !== assistantId));
        setInput(text);
        window.alert(body?.error ?? "前のメッセージをまだ処理中です。少し待ってから送信してください。");
        return;
      }
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `request failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let idx: number;
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const raw = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);

          const eventMatch = raw.match(/^event: (.+)$/m);
          const dataMatch = raw.match(/^data: (.+)$/m);
          if (!eventMatch || !dataMatch) continue;

          const eventName = eventMatch[1];
          const data = JSON.parse(dataMatch[1]);

          if (eventName === "delta") {
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + data.text } : m)),
            );
          } else if (eventName === "tool_result") {
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, toolResults: [...m.toolResults, data] } : m)),
            );
          } else if (eventName === "error") {
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, content: `${m.content}\n\n⚠️ ${data.message}` } : m)),
            );
          }
        }
      }
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: `⚠️ ${err instanceof Error ? err.message : "通信エラーが発生しました"}` }
            : m,
        ),
      );
    } finally {
      setSending(false);
      refreshSummary();
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {summary && (
        <div className="shrink-0">
          <SummaryBar summary={summary} />
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {messages.map((m) => (
          <ChatBubble key={m.id} message={m} />
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="flex shrink-0 gap-2 border-t border-zinc-200 p-3 dark:border-zinc-800">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={() => setIsComposing(false)}
          onKeyDown={(e) => {
            // Enter while an IME composition is active confirms the conversion,
            // it must not also submit the message (isComposing + keyCode 229 covers Safari's quirks).
            if (e.key === "Enter" && !e.shiftKey && !isComposing && e.keyCode !== 229) {
              e.preventDefault();
              sendMessage();
            }
          }}
          rows={1}
          placeholder="今日食べたもの、運動、体重などを入力..."
          className="flex-1 resize-none rounded-full border border-zinc-300 px-4 py-2 text-sm outline-none focus:border-teal-600 dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          onClick={sendMessage}
          disabled={sending || !input.trim()}
          className="rounded-full bg-teal-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          送信
        </button>
      </div>
    </div>
  );
}
