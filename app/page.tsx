import { ChatClient } from "@/components/ChatClient";
import { getDaySummary, getRecentChatMessages } from "@/lib/db";
import { todayJST } from "@/lib/date";
import { MAX_HISTORY_MESSAGES } from "@/lib/claude";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const [history, summary] = await Promise.all([
    getRecentChatMessages(MAX_HISTORY_MESSAGES),
    getDaySummary(todayJST()),
  ]);

  return (
    <ChatClient
      initialMessages={history.map((m) => ({ role: m.role, content: m.content }))}
      initialSummary={summary}
    />
  );
}
