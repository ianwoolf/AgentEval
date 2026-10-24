import { defineHandler } from "nitro";
import { ProjectService } from "../../../../../../projects/project-service";

/** Browser credentials terminate here; backend credentials never reach the client. */
export default defineHandler(async (event) => {
  const request = event.req;
  const url = new URL(request.url);
  if (!["GET", "POST"].includes(request.method)) return new Response("Method not allowed", { status: 405 });
  if (request.method === "POST" && request.headers.get("origin") !== url.origin) {
    return new Response("Invalid origin", { status: 403 });
  }
  let projectId: string;
  try { ({ projectId } = await new ProjectService().resolve(request)); }
  catch { return Response.json({ detail: "Authentication or project access denied" }, { status: 403 }); }
  const path = event.context.params?.path ?? "";
  const readPath = /^(config|runs(?:\/eval-[a-z0-9-]+)?|datasets(?:\/[A-Za-z0-9_.-]+(?:\/versions\/[1-9][0-9]*)?)?|experiments\/[A-Za-z0-9_.-]+(?:\/samples)?|traces|scores)$/;
  const writePath = /^datasets\/[A-Za-z0-9_.-]+$|^runs$/;
  if (!readPath.test(path) || (request.method === "POST" && !writePath.test(path))) return new Response("Not found", { status: 404 });
  const token = process.env.EVAL_TRIGGER_TOKEN;
  if (!token) return Response.json({ detail: "Evaluation backend is not configured" }, { status: 503 });
  try {
    const body = request.method === "POST" ? await request.text() : undefined;
    if (body && Buffer.byteLength(body) > (path.startsWith("datasets/") ? 8_000_000 : 40000)) return new Response("Request too large", { status: 413 });
    const query = new URLSearchParams();
    for (const key of ["offset", "limit", "evaluation_id"]) {
      const value = url.searchParams.get(key);
      if (value !== null) query.set(key, value);
    }
    const response = await fetch(`${process.env.EVAL_EXECUTION_API_URL ?? "http://127.0.0.1:18001"}/api/v1/evaluations/${path}${query.size ? `?${query}` : ""}`, {
      method: request.method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-Project-ID": projectId,
        "Idempotency-Key": request.headers.get("idempotency-key") ?? "" },
      ...(body === undefined ? {} : {body}), signal: AbortSignal.timeout(30000),
    });
    return new Response(await response.text(), { status: response.status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  } catch { return Response.json({ detail: "Evaluation backend is unavailable" }, { status: 502 }); }
});
