import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { PathGuard } from "../src/security/path-guard.js";

test("canonical workspace paths can be revalidated without permitting outside paths or stale root aliases", async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "orbit-root-alias-"));
  try {
    const first = path.join(base, "first"),
      second = path.join(base, "second"),
      alias = path.join(base, "workspace");
    await fs.mkdir(first);
    await fs.mkdir(second);
    await fs.writeFile(path.join(first, "note.txt"), "controlled");
    await fs.symlink(first, alias, process.platform === "win32" ? "junction" : "dir");
    const guard = new PathGuard({ roots: [alias] });
    const canonical = await guard.validate("note.txt", "read");
    assert.equal(await guard.validate(canonical, "write"), canonical);
    await assert.rejects(guard.validate(path.join(second, "outside.txt"), "write"), /outside workspace/);
    await assert.rejects(guard.validate(path.join(path.dirname(canonical), ".env"), "read"), /Protected/);
    await fs.unlink(alias);
    await fs.symlink(second, alias, process.platform === "win32" ? "junction" : "dir");
    await assert.rejects(guard.validate(canonical, "write"), /outside workspace/);
  } finally {
    await fs.rm(base, { recursive: true, force: true });
  }
});
