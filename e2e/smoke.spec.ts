import { test, expect } from "@playwright/test";
import fs from "node:fs";

function loadEnv(): Record<string, string> {
  const content = fs.readFileSync(".env", "utf8");
  const env: Record<string, string> = {};
  for (const line of content.split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return env;
}

test("login -> send message -> see streamed response", async ({ page }) => {
  const env = loadEnv();

  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);

  await page.getByPlaceholder("パスワード").fill(env.APP_PASSWORD);
  await page.getByRole("button", { name: "ログイン" }).click();
  await expect(page).toHaveURL("http://localhost:3000/");

  await page.getByPlaceholder(/今日食べたもの/).fill("こんにちは");
  await page.getByRole("button", { name: "送信" }).click();

  const assistantBubbles = page.locator("div.justify-start").locator("div.rounded-2xl");
  const lastBubble = assistantBubbles.last();

  await expect(lastBubble).not.toHaveText("", { timeout: 30_000 });
  await expect(lastBubble).not.toHaveText("…", { timeout: 30_000 });
});
