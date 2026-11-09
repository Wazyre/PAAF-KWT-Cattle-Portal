// GET /api/docs: Swagger UI for the declaration API. Its scripts and styles are served from this same server
// (see [asset]/route.ts), so it works on a network with no internet access.
export const dynamic = "force-dynamic";

const PAGE = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sheep Portal API</title>
  <link rel="icon" href="/api/docs/favicon-32x32.png">
  <link rel="stylesheet" href="/api/docs/swagger-ui.css">
  <style>body { margin: 0; }</style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="/api/docs/swagger-ui-bundle.js"></script>
  <script src="/api/docs/swagger-init.js"></script>
</body>
</html>`;

export function GET() {
  return new Response(PAGE, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
