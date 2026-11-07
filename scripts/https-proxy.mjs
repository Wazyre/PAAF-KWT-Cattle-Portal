// Serves the portal over HTTPS: terminates TLS on port 443 and passes every request to the portal on 127.0.0.1:3000,
// so the address needs neither ":3000" nor a separate web server. Port 80 redirects to https.
// Usage: node scripts/https-proxy.mjs   (the Windows service starts it for you when a certificate is configured)
//
// Settings in .env (certificate files are read when this starts, and again whenever they change on disk, so a renewed
// certificate needs no restart):
//   TLS_CERT_FILE / TLS_KEY_FILE   PEM files: the certificate WITH its chain (fullchain), and the private key
//   TLS_PFX_FILE / TLS_PFX_PASSPHRASE   alternatively one .pfx file (e.g. exported from Windows)
//   HTTPS_PORT (443), HTTP_REDIRECT_PORT (80, "off" to skip), PORT (the portal's port, 3000)
import "dotenv/config";
import http from "node:http";
import https from "node:https";
import { existsSync, readFileSync, statSync } from "node:fs";

const env = process.env;
const HTTPS_PORT = Number(env.HTTPS_PORT || 443);
const REDIRECT_PORT = (env.HTTP_REDIRECT_PORT || "80").toLowerCase() === "off" ? 0 : Number(env.HTTP_REDIRECT_PORT || 80);
const UPSTREAM_PORT = Number(env.PORT || 3000);

const pfxFile = env.TLS_PFX_FILE?.trim();
const certFile = env.TLS_CERT_FILE?.trim();
const keyFile = env.TLS_KEY_FILE?.trim();
const files = pfxFile ? [pfxFile] : [certFile, keyFile];

function die(message) {
  console.error(`HTTPS: ${message}`);
  process.exit(1);
}

if (files.some((f) => !f)) die("set TLS_CERT_FILE and TLS_KEY_FILE (or TLS_PFX_FILE) in .env.");
for (const f of files) if (!existsSync(f)) die(`the file ${f} does not exist.`);

function loadContext() {
  return pfxFile
    ? { pfx: readFileSync(pfxFile), passphrase: env.TLS_PFX_PASSPHRASE || undefined }
    : { cert: readFileSync(certFile), key: readFileSync(keyFile) };
}

const stamp = () => files.map((f) => statSync(f).mtimeMs).join("|");
let loaded = stamp();

let options;
try {
  options = loadContext();
  https.createServer(options); // fails now, with a clear reason, if the files are unusable
} catch (e) {
  die(`cannot use the certificate: ${e.message}`);
}

const server = https.createServer(options, (req, res) => {
  // This is the edge: whatever the client claimed about itself is replaced, never trusted.
  const headers = { ...req.headers };
  delete headers["x-real-ip"];
  headers["x-forwarded-for"] = req.socket.remoteAddress?.replace(/^::ffff:/, "") ?? "unknown";
  headers["x-forwarded-proto"] = "https";
  headers["x-forwarded-host"] = req.headers.host ?? "";

  const upstream = http.request(
    { host: "127.0.0.1", port: UPSTREAM_PORT, method: req.method, path: req.url, headers },
    (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    }
  );
  upstream.on("error", (e) => {
    console.error(`HTTPS: the portal on port ${UPSTREAM_PORT} did not answer: ${e.code ?? e.message}`);
    if (!res.headersSent) res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("The portal is not available right now. Please try again in a moment.");
  });
  res.on("close", () => upstream.destroy());
  req.pipe(upstream);
});

server.on("tlsClientError", () => {}); // scanners and old clients; nothing useful to log
server.listen(HTTPS_PORT, () => console.log(`HTTPS: listening on port ${HTTPS_PORT}, forwarding to 127.0.0.1:${UPSTREAM_PORT}.`));
server.on("error", (e) => die(`cannot listen on port ${HTTPS_PORT}: ${e.code ?? e.message}${e.code === "EADDRINUSE" ? " (another program uses it)" : ""}`));

// Pick up a renewed certificate without a restart (checked every minute; a half-written file is retried).
setInterval(() => {
  try {
    const now = stamp();
    if (now === loaded) return;
    server.setSecureContext(loadContext());
    loaded = now;
    console.log("HTTPS: the certificate files changed; the new certificate is in use.");
  } catch (e) {
    console.error(`HTTPS: could not load the changed certificate (${e.message}); keeping the previous one.`);
  }
}, 60000).unref();

if (REDIRECT_PORT) {
  http
    .createServer((req, res) => {
      const host = (req.headers.host ?? "").replace(/:\d+$/, "");
      const target = `https://${host}${HTTPS_PORT === 443 ? "" : `:${HTTPS_PORT}`}${req.url}`;
      res.writeHead(308, { Location: target });
      res.end();
    })
    .on("error", (e) => console.error(`HTTPS: the http->https redirect on port ${REDIRECT_PORT} is off: ${e.code ?? e.message}`))
    .listen(REDIRECT_PORT);
}
