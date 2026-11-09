// GET /api/docs/<file>: the few files Swagger UI needs, read from the swagger-ui-dist package.
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const dynamic = "force-dynamic";

const INIT = `window.ui = SwaggerUIBundle({
  url: "/api/v1/openapi.json",
  dom_id: "#swagger-ui",
  deepLinking: true,
  persistAuthorization: true,
  displayRequestDuration: true
});`;

const FILES: Record<string, string> = {
  "swagger-ui.css": "text/css; charset=utf-8",
  "swagger-ui-bundle.js": "text/javascript; charset=utf-8",
  "favicon-32x32.png": "image/png"
};

export async function GET(_req: Request, ctx: { params: Promise<{ asset: string }> }) {
  const { asset } = await ctx.params;
  if (asset === "swagger-init.js") {
    return new Response(INIT, { headers: { "Content-Type": "text/javascript; charset=utf-8" } });
  }
  const type = FILES[asset];
  if (!type) return new Response("Not found", { status: 404 });
  try {
    const body = await readFile(join(process.cwd(), "node_modules", "swagger-ui-dist", asset));
    return new Response(body, { headers: { "Content-Type": type, "Cache-Control": "public, max-age=86400" } });
  } catch {
    return new Response("Swagger UI is not installed on this server. Run: npm ci", { status: 503 });
  }
}
