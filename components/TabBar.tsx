"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "チャット", icon: "💬" },
  { href: "/dashboard", label: "ダッシュボード", icon: "📊" },
  { href: "/settings", label: "設定", icon: "⚙️" },
];

export function TabBar() {
  const pathname = usePathname();

  if (pathname === "/login") return null;

  return (
    <nav className="sticky bottom-0 z-10 flex border-t border-zinc-200 bg-white pb-[env(safe-area-inset-bottom)] dark:border-zinc-800 dark:bg-zinc-950">
      {TABS.map((tab) => {
        const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ${
              active ? "text-teal-700 dark:text-teal-400" : "text-zinc-500 dark:text-zinc-400"
            }`}
          >
            <span className="text-lg leading-none">{tab.icon}</span>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
