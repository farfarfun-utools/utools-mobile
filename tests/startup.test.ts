import { expect, it } from "vitest";
import { createSSRApp } from "vue";
import { renderToString } from "vue/server-renderer";
import App from "../src/App.vue";

it("disables the backup menu until stored data has loaded", async () => {
  const html = await renderToString(createSSRApp(App));
  const menu = html.match(/<button\b[^>]*aria-label="数据导入与导出"[^>]*>/)?.[0];
  expect(menu).toMatch(/\sdisabled\b/);
});
