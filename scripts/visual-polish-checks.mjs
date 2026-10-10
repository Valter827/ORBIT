import { createServer } from "node:http";
import { promises as fs } from "node:fs";
import assert from "node:assert/strict";
export async function createChatFixture() {
  let requests = 0;
  const server = createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.url === "/v1/models") {
      res.end(JSON.stringify({ data: [{ id: "polish-fixture", capabilities: ["tools"], context_length: 32768 }] }));
      return;
    }
    if (req.url !== "/v1/chat/completions") {
      res.writeHead(404);
      res.end();
      return;
    }
    let body = "";
    req.on("data", (b) => (body += b));
    req.on("end", () => {
      requests++;
      const input = JSON.parse(body);
      const answer =
        (body.includes("violet-739") ? "Aurora launch code: violet-739." : "Fixture response.") +
        "\n\n" +
        String.fromCharCode(96).repeat(3) +
        'javascript\nconst launchCode = "violet-739";\n' +
        String.fromCharCode(96).repeat(3);
      if (!input.stream) {
        res.end(
          JSON.stringify({
            model: "polish-fixture",
            choices: [{ message: { content: answer } }],
            usage: { prompt_tokens: 20, completion_tokens: 15 },
          }),
        );
        return;
      }
      res.setHeader("content-type", "text/event-stream");
      res.write(
        "data: " +
          JSON.stringify({ choices: [{ delta: { content: answer.slice(0, 10) }, finish_reason: null }] }) +
          "\n\n",
      );
      const timer = setTimeout(
        () =>
          res.end(
            "data: " +
              JSON.stringify({
                model: "polish-fixture",
                choices: [{ delta: { content: answer.slice(10) }, finish_reason: "stop" }],
                usage: { prompt_tokens: 20, completion_tokens: 15 },
              }) +
              "\n\ndata: [DONE]\n\n",
          ),
        700,
      );
      res.on("close", () => clearTimeout(timer));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    provider: {
      id: "polish-local",
      type: "local",
      name: "Local test fixture",
      endpoint: "http://127.0.0.1:" + server.address().port + "/v1/",
      remoteAcknowledged: false,
      localInferenceConfirmed: true,
    },
    requests: () => requests,
    close: async () => {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
export const resolutions = [
  [1100, 700],
  [1366, 768],
  [1440, 900],
  [1920, 1080],
];
export function createVisualCapture(page, enabled) {
  const captures = [];
  const capture = async (name) => {
    if (!enabled) return;
    await fs.mkdir("validation/polish", { recursive: true });
    for (const [width, height] of resolutions) {
      await page.setViewportSize({ width, height });
      await page.locator("main").evaluateAll((elements) => elements.forEach((el) => (el.scrollTop = 0)));
      const bounds = await page.evaluate(() => {
        const root = document.documentElement;
        return {
          document: root.scrollWidth <= root.clientWidth,
          main: [...document.querySelectorAll("main")].every((el) => el.scrollWidth <= el.clientWidth + 1),
        };
      });
      assert.ok(bounds.document && bounds.main, name + " must fit window width at " + width);
      const wizard = page.locator(".modal:has(.wizard-footer)");
      if (await wizard.count()) {
        const footer = await wizard.locator(".wizard-footer").boundingBox();
        assert.ok(
          footer && footer.y >= 0 && footer.y + footer.height <= height,
          name + " footer must remain visible at " + width,
        );
        assert.ok(await wizard.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), name + " modal must fit");
      }
      const file = "validation/polish/" + name + "-" + width + ".png";
      if (name === "home") {
        const input = await page.getByRole("button", { name: "Send message", exact: true }).boundingBox();
        assert.ok(input && input.y + input.height <= height, "Chat composer must be visible on Home at " + width);
      }
      if (name === "ai-actions") await page.locator(".card-menu[open]").scrollIntoViewIfNeeded();
      await page.screenshot({ path: file });
      captures.push(file);
    }
    await page.setViewportSize({ width: 1366, height: 768 });
  };
  return { capture, captures };
}
export async function checkCreatorAndChat({ page, host, capture }) {
  const nav = async (name) => {
    await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name, exact: true }).click();
    await page.waitForFunction(
      (name) => document.querySelector('.navitem[aria-current="page"]')?.textContent === name,
      name,
    );
  };
  for (const name of ["Home", "My AIs", "Knowledge", "Memory", "Settings"]) {
    await nav(name);
    if (name === "My AIs") await page.locator(".ai-card").first().waitFor();
    await capture(name.toLowerCase().replaceAll(" ", "-"));
  }
  await nav("Create AI");
  const wizard = page.getByRole("dialog", { name: /Create My AI/ });
  await wizard.waitFor();
  await wizard.getByLabel("Name", { exact: true }).fill("NOVA");
  const next = () => wizard.getByRole("button", { name: "Continue", exact: true }).click();
  for (let step = 0; step < 10; step++) {
    if (step === 1) await wizard.getByRole("checkbox", { name: "Programming", exact: true }).check();
    if (step === 2) {
      await wizard.locator('input[type="range"]').first().fill("90");
      assert.match(await wizard.locator(".personality-summary").innerText(), /detailed answers/);
    }
    if (step === 3) {
      await wizard.getByLabel("Provider", { exact: true }).selectOption("polish-local");
      await wizard.getByRole("button", { name: "Refresh available models", exact: true }).click();
      await wizard.getByLabel("Model", { exact: true }).selectOption("polish-fixture");
    }
    if (step === 4) {
      await wizard.getByText("Add manual knowledge", { exact: true }).click();
      await wizard.getByLabel("Source name", { exact: true }).fill("launch.md");
      await wizard.getByLabel("Knowledge text", { exact: true }).fill("Aurora launch code is violet-739.");
      await wizard.getByRole("button", { name: "Save knowledge note", exact: true }).click();
      await wizard.locator(".knowledge-list").getByText("launch.md", { exact: true }).waitFor();
      assert.match(await wizard.locator(".wizard-preview").innerText(), /1 sources/);
    }
    if (step === 8) {
      await wizard.getByLabel("Test question", { exact: true }).fill("What is the Aurora launch code?");
      await wizard.getByRole("button", { name: "Test my AI", exact: true }).click();
      await wizard.locator(".preview-answer").filter({ hasText: "violet-739" }).waitFor();
    }
    await capture("wizard-step-" + (step + 1));
    if (step < 9) await next();
  }
  // The footer must wrap keyboard focus inside the dialog.
  await wizard.getByRole("button", { name: "Create AI · Start chatting", exact: true }).focus();
  await page.keyboard.press("Tab");
  assert.ok(await wizard.evaluate((el) => el.contains(document.activeElement)));
  await wizard.getByRole("button", { name: "Create AI · Start chatting", exact: true }).click();
  const completion = page.getByRole("dialog", { name: "Meet NOVA", exact: true });
  await completion.waitFor();
  await capture("created");
  await completion.getByRole("button", { name: "Start chatting", exact: true }).click();
  await page.getByRole("heading", { name: "What shall we work on?", exact: true }).waitFor();
  const state = await host.request("ai.state");
  assert.equal(state.profiles.find((p) => p.id === state.selected).isDraft, false);
  await page.getByLabel("Ask ORBIT", { exact: true }).fill("What is the Aurora launch code?");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await page.getByRole("button", { name: "New conversation", exact: true }).click();
  await page.locator(".chat-message.assistant").filter({ hasText: "violet-739" }).waitFor();
  await page.getByRole("button", { name: "Regenerate", exact: true }).waitFor();
  assert.equal(
    await page.locator(".chat-message.user").count(),
    1,
    "New conversation must not erase an active response",
  );
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Copy code", exact: true }).click();
  assert.match(await page.evaluate(() => navigator.clipboard.readText()), /const launchCode/);
  await page.locator(".response-context>summary").click();
  await page.locator(".source-list").getByRole("button", { name: "launch.md", exact: true }).click();
  await page.getByRole("dialog", { name: "launch.md", exact: true }).waitFor();
  await capture("knowledge-preview");
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
  await capture("chat");
  await page.keyboard.press("Control+n");
  await page.waitForFunction(() => document.querySelectorAll(".chat-message").length === 0);
  assert.equal(await page.locator(".chat-message").count(), 0, "Ctrl+N starts a fresh conversation");
  assert.equal(await page.getByLabel("Ask ORBIT", { exact: true }).inputValue(), "");
  await nav("Memory");
  await page.getByText("Add a memory", { exact: true }).click();
  await page.getByLabel("Memory note", { exact: true }).fill("Use concise answers.");
  await page.getByRole("button", { name: "Remember", exact: true }).click();
  await page.getByText("Use concise answers.", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Category", { exact: true }).selectOption("Preferences");
  await page.getByRole("button", { name: "Save memory", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Preferences", exact: true }).click();
  await page.getByText("Use concise answers.", { exact: true }).waitFor();
  await page.getByText("Add a memory", { exact: true }).click();
  await capture("memory-populated");
  await nav("Knowledge");
  await page.locator(".knowledge-list").getByText("launch.md", { exact: true }).waitFor();
  await capture("knowledge-populated");
  await nav("My AIs");
  await page.getByRole("heading", { name: "NOVA", exact: true }).waitFor();
  const card = page.locator(".ai-card").filter({ has: page.getByRole("heading", { name: "NOVA", exact: true }) });
  await card.getByText("More actions", { exact: true }).click();
  await capture("ai-actions");
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(
    await page
      .getByRole("button", { name: "Create AI", exact: true })
      .evaluate((el) => getComputedStyle(el).transitionDuration),
    "0s",
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
}
