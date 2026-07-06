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

test("assistant's post-tool-call feedback survives a reload (is actually persisted, not just streamed live)", async ({
  page,
}) => {
  const env = loadEnv();

  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  await page.getByPlaceholder("パスワード").fill(env.APP_PASSWORD);
  await page.getByRole("button", { name: "ログイン" }).click();
  await expect(page).toHaveURL("http://localhost:3000/");

  await page.getByPlaceholder(/今日食べたもの/).fill("お昼に鶏胸肉を250g蒸したものを食べた");
  await page.getByRole("button", { name: "送信" }).click();

  const assistantBubbles = page.locator("div.justify-start").locator("div.rounded-2xl");
  await expect(assistantBubbles.last()).not.toHaveText("", { timeout: 30_000 });
  await expect(assistantBubbles.last()).not.toHaveText("…", { timeout: 30_000 });
  // Give the server a moment past the visible reply to finish persisting.
  await page.waitForTimeout(1500);

  // Reload forces the page to load history from the DB instead of the live SSE stream.
  await page.reload();
  const persistedText = await page.locator("div.justify-start").locator("div.rounded-2xl").last().innerText();

  expect(persistedText).not.toBe("(応答がありませんでした)");
  expect(persistedText.length).toBeGreaterThan(5);
});
