import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createOrbitService, type ServiceOptions } from "./service.js";
import { AIProviderNotConfiguredError } from "./ai/router.js";
export interface ServerOptions extends ServiceOptions {
  uiDirectory: string;
}
export async function createOrbitServer(options: ServerOptions) {
  const token = randomBytes(32).toString("hex");
  const clients = new Set<ServerResponse>();
  const service = await createOrbitService({
    ...options,
    onEvent: (event) => {
      options.onEvent?.(event);
      for (const res of clients) res.write("data: " + JSON.stringify(event) + "\n\n");
    },
    onPending: () => {
      void service.status().then((status) => {
        for (const pending of status.pending)
          for (const res of clients) res.write("event: pending\ndata: " + JSON.stringify(pending) + "\n\n");
      });
    },
  });
  const json = (res: ServerResponse, status: number, value: unknown) => {
    res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify(value));
  };
  async function body(req: IncomingMessage): Promise<unknown> {
    let text = "";
    for await (const chunk of req) {
      text += String(chunk);
      if (Buffer.byteLength(text) > 64000) throw new Error("Request too large");
    }
    return JSON.parse(text) as unknown;
  }
  const server = createServer((req, res) => {
    void (async () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      const expected = "127.0.0.1:" + port;
      if (req.headers.host !== expected && req.headers.host !== "localhost:" + port) {
        json(res, 403, { error: "Invalid host" });
        return;
      }
      if (
        req.method === "POST" &&
        (req.headers["x-orbit-token"] !== token ||
          (req.headers.origin && !["http://" + expected, "http://localhost:" + port].includes(req.headers.origin)))
      ) {
        json(res, 403, { error: "Invalid request origin/token" });
        return;
      }
      if (req.url === "/" && req.method === "GET") {
        const html = await fs.readFile(path.join(options.uiDirectory, "orbit-ui.html"), "utf8");
        res.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
          "content-security-policy":
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self'; frame-ancestors 'none'",
          "x-content-type-options": "nosniff",
        });
        res.end(html.replace("</head>", '<meta name="orbit-token" content="' + token + '"></head>'));
        return;
      }
      if (req.url === "/client.js" && req.method === "GET") {
        res.writeHead(200, { "content-type": "text/javascript" });
        res.end(await fs.readFile(path.join(options.uiDirectory, "client.js")));
        return;
      }

      if (req.url === "/api/status" && req.method === "GET") {
        json(res, 200, await service.status());
        return;
      }
      if (req.url === "/api/events" && req.method === "GET") {
        res.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive",
        });
        res.write(": connected\n\n");
        clients.add(res);
        req.on("close", () => clients.delete(res));
        return;
      }
      if (req.method === "POST") {
        const routes: Record<string, (v: unknown) => unknown> = {
          "/api/task": (v) => service.start(v),
          "/api/answer": (v) => service.answer(v),
          "/api/stop": () => service.stop(),
          "/api/undo": (v) => service.undo(v),
        };
        const action = routes[req.url ?? ""];
        if (action) {
          json(res, req.url === "/api/task" ? 202 : 200, await action(await body(req)));
          return;
        }
      }
      json(res, 404, { error: "Not found" });
    })().catch((e: unknown) => {
      if (!res.headersSent)
        json(
          res,
          e instanceof AIProviderNotConfiguredError ||
            (e instanceof Error && /no longer pending|already active|running task first/.test(e.message))
            ? 409
            : 400,
          {
            error: e instanceof Error ? e.message : "Request failed",
            code: e instanceof AIProviderNotConfiguredError ? e.code : undefined,
          },
        );
      else res.end();
    });
  });
  server.on("orbit:shutdown", () => {
    void service.shutdown();
  });
  server.on("close", () => {
    void service.shutdown();
    for (const client of clients) client.end();
  });
  return server;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const uiDirectory = process.cwd();
  const server = await createOrbitServer({
    workspace: process.env["ORBIT_WORKSPACE"] ?? path.join(uiDirectory, "demos/failing-add"),
    stateDirectory: process.env["ORBIT_STATE_DIR"] ?? path.join(uiDirectory, ".orbit-state"),
    uiDirectory,
    ...(process.env["ORBIT_VERIFY_COMMAND"] ? { verificationCommand: process.env["ORBIT_VERIFY_COMMAND"] } : {}),
  });
  const port = Number(process.env["PORT"] ?? 4317);
  server.listen(port, "127.0.0.1", () => console.log("ORBIT: http://127.0.0.1:" + port));
}
