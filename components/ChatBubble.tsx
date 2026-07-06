export interface ToolResultUI {
  name: string;
  input: any;
  output: any;
  is_error: boolean;
}

export interface ChatMessageUI {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolResults: ToolResultUI[];
}

function RecordCard({ tool }: { tool: ToolResultUI }) {
  if (tool.is_error) {
    return (
      <div className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
        エラー: {typeof tool.output === "string" ? tool.output : JSON.stringify(tool.output)}
      </div>
    );
  }

  if (tool.name === "log_meal" || tool.name === "update_meal") {
    const items: { name: string; amount: string; kcal: number }[] = tool.input?.items ?? [];
    const totals = tool.output ?? {};
    return (
      <div className="mt-2 overflow-hidden rounded-lg border border-zinc-200 text-xs dark:border-zinc-700">
        <table className="w-full">
          <tbody>
            {items.map((item, i) => (
              <tr key={i} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                <td className="px-2 py-1">{item.name}</td>
                <td className="px-2 py-1 text-zinc-500">{item.amount}</td>
                <td className="whitespace-nowrap px-2 py-1 text-right">{Math.round(item.kcal)}kcal</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="bg-zinc-50 px-2 py-1 text-right font-medium dark:bg-zinc-900">
          合計 {Math.round(totals.total_kcal ?? 0)}kcal (P{totals.total_protein_g}/F{totals.total_fat_g}/C
          {totals.total_carbs_g})
        </div>
      </div>
    );
  }

  if (tool.name === "log_exercise") {
    return (
      <div className="mt-2 rounded-lg border border-zinc-200 px-3 py-2 text-xs dark:border-zinc-700">
        🏃 {tool.input?.description} — 消費 {Math.round(tool.output?.kcal_burned ?? 0)}kcal
      </div>
    );
  }

  if (tool.name === "log_weight") {
    return (
      <div className="mt-2 rounded-lg border border-zinc-200 px-3 py-2 text-xs dark:border-zinc-700">
        ⚖️ {tool.output?.logged_on}: {tool.output?.weight_kg}kg
      </div>
    );
  }

  if (tool.name === "delete_meal") {
    return (
      <div className="mt-2 rounded-lg border border-zinc-200 px-3 py-2 text-xs dark:border-zinc-700">
        🗑️ 食事の記録を削除しました
      </div>
    );
  }

  return null;
}

export function ChatBubble({ message }: { message: ChatMessageUI }) {
  const isUser = message.role === "user";
  return (
    <div className={`mb-3 flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm ${
          isUser
            ? "bg-teal-700 text-white"
            : "border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
        }`}
      >
        {message.content || (!isUser ? "…" : "")}
        {message.toolResults.map((t, i) => (
          <RecordCard key={i} tool={t} />
        ))}
      </div>
    </div>
  );
}
