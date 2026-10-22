import { definePlugin } from "nitro";
import {
  captureAuditRequest,
  purgeExpiredAuditLogs,
  writeAuditResponse,
  type CapturedAuditRequest,
} from "../audit-logs/audit-request";

interface AuditRequestContext extends Record<string, unknown> {
  platformAuditCapture?: CapturedAuditRequest;
}

const cleanupIntervalMs = 24 * 60 * 60 * 1000;

export default definePlugin((nitro) => {
  if (process.env.TASKLATTICE_PRERENDER === "true") return;
  nitro.hooks.hook("request", async (event) => {
    const context = (event.req.context ??= {}) as AuditRequestContext;
    const captured = await captureAuditRequest(event.req);
    if (captured) context.platformAuditCapture = captured;
  });
  nitro.hooks.hook("response", async (response, event) => {
    const captured = (event.req.context as AuditRequestContext | undefined)
      ?.platformAuditCapture;
    if (!captured) return;
    const write = writeAuditResponse(captured, response).catch((error) => {
      console.error("Platform audit logging failed after request completion.", error);
    });
    if (event.req.waitUntil) {
      void event.req.waitUntil(write);
    } else {
      void write;
    }
  });

  void purgeExpiredAuditLogs()
    .then((deleted) => {
      if (deleted) console.info(`Purged ${deleted} audit events older than 90 days.`);
    })
    .catch((error) => {
      console.error("Initial audit retention cleanup failed.", error);
    });
  const timer = setInterval(() => {
    void purgeExpiredAuditLogs().catch((error) => {
      console.error("Scheduled audit retention cleanup failed.", error);
    });
  }, cleanupIntervalMs);
  timer.unref();
});
