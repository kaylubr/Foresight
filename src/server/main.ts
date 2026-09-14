import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import express from "express";
import type { ConnectRequest, HealthResult, HistoryEntry, PreviewRequest, StalenessRequest } from "../shared/types";
import { checkStaleness, connectRepo, currentDenialProbe, previewCommand } from "./pipeline";
import { sweepOrphanedMirrors } from "./mirror";

const PORT = Number(process.env.PORT ?? 4317);
const HISTORY_LIMIT = 100;

const history: HistoryEntry[] = [];
const app = express();

function describe(error: unknown): string {
  return error instanceof Error ? error.message : "unexpected failure";
}

app.use(express.json({ limit: "256kb" }));

app.get("/api/health", async (_request, response) => {
  const probe = await currentDenialProbe();
  const payload: HealthResult = {
    ok: true,
    sandbox: {
      ok: probe.ok,
      method: probe.sandbox?.kind ?? null,
      cause: probe.cause,
      reason: probe.reason,
      nextStep: probe.nextStep
    }
  };
  response.json(payload);
});

app.post("/api/probe", async (_request, response) => {
  const probe = await currentDenialProbe(true);
  response.json(probe);
});

app.post("/api/connect", async (request, response) => {
  const body = request.body as ConnectRequest;
  if (!body?.path) {
    response.status(400).json({ error: "a repository path is required" });
    return;
  }
  try {
    response.json(await connectRepo(body.path));
  } catch (error) {
    response.status(400).json({ error: describe(error) });
  }
});

app.post("/api/preview", async (request, response) => {
  const body = request.body as PreviewRequest;
  if (!body?.path || !body?.command) {
    response.status(400).json({ error: "a repository path and a command are required" });
    return;
  }
  try {
    const outcome = await previewCommand({
      path: body.path,
      command: body.command,
      sequence: body.sequence ?? null
    });
    history.push({
      id: randomUUID(),
      at: Date.now(),
      display: outcome.display,
      kind: outcome.kind
    });
    if (history.length > HISTORY_LIMIT) {
      history.splice(0, history.length - HISTORY_LIMIT);
    }
    response.json(outcome);
  } catch (error) {
    response.status(400).json({ error: describe(error) });
  }
});

app.get("/api/history", (_request, response) => {
  response.json({ entries: history });
});

app.post("/api/staleness", async (request, response) => {
  const body = request.body as StalenessRequest;
  if (!body?.path || !body?.snapshot) {
    response.status(400).json({ error: "a repository path and a snapshot are required" });
    return;
  }
  try {
    response.json(await checkStaleness({ path: body.path, snapshot: body.snapshot }));
  } catch (error) {
    response.status(400).json({ error: describe(error) });
  }
});

const webRoot = join(process.cwd(), "dist", "web");
if (existsSync(webRoot)) {
  app.use(express.static(webRoot));
  app.get("*", (_request, response) => {
    response.sendFile(join(webRoot, "index.html"));
  });
}

const swept = await sweepOrphanedMirrors();
if (swept > 0) {
  console.log(`Removed ${swept} orphaned rehearsal clone(s) left by a previous run.`);
}

app.listen(PORT, () => {
  console.log(`Foresight server listening on http://localhost:${PORT}`);
});
