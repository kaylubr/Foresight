import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import type {
  ConnectRequest,
  HealthResult,
  PreviewRequest,
  StalenessRequest
} from "../../shared/types";
import { checkStaleness, connectRepo, currentDenialProbe, previewCommand } from "./pipeline";
import { listHistory, recordOutcome } from "./session/history";

function describe(error: unknown): string {
  return error instanceof Error ? error.message : "unexpected failure";
}

export function createApp(): express.Express {
  const app = express();

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
    response.json(await currentDenialProbe(true));
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
      recordOutcome(outcome);
      response.json(outcome);
    } catch (error) {
      response.status(400).json({ error: describe(error) });
    }
  });

  app.get("/api/history", (_request, response) => {
    response.json({ entries: listHistory() });
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

  const webRoot = fileURLToPath(new URL("../../web/dist", import.meta.url));
  if (existsSync(webRoot)) {
    app.use(express.static(webRoot));
    app.get("*", (_request, response) => {
      response.sendFile(join(webRoot, "index.html"));
    });
  }

  return app;
}
