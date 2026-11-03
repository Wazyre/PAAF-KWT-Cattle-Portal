// Small JSON POST helper for calls to PAAF/PACI servers.
//
// PAAF's e-services server (eservices.paaf.gov.kw) presents its own certificate without the Sectigo intermediate that
// signed it. Browsers fetch the missing piece themselves; Node does not, and fails with UNABLE_TO_VERIFY_LEAF_SIGNATURE.
// certs/sectigo-dv-r36.pem is that public intermediate; it is added to the trusted list. Certificate checking stays on.
import http from "node:http";
import https from "node:https";
import tls from "node:tls";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

let trusted: string[] | undefined;

function trustedCertificates(): string[] {
  if (!trusted) {
    trusted = [...tls.rootCertificates];
    const extra = path.join(process.cwd(), "certs", "sectigo-dv-r36.pem");
    if (existsSync(extra)) trusted.push(readFileSync(extra, "utf8"));
  }
  return trusted;
}

export interface JsonReply {
  status: number;
  text: string;
}

/** POSTs JSON and resolves with the status and body text. Rejects on network or TLS errors (error.code is set when known). */
export function postJson(url: string, body: unknown, headers: Record<string, string> = {}, timeoutMs = 10000): Promise<JsonReply> {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const data = JSON.stringify(body);
    const secure = target.protocol === "https:";
    const req = (secure ? https : http).request(
      target,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers, "Content-Length": Buffer.byteLength(data) },
        ...(secure ? { ca: trustedCertificates() } : {}),
        timeout: timeoutMs
      },
      (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (text += chunk));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, text }));
      }
    );
    req.on("timeout", () => req.destroy(Object.assign(new Error("timed out"), { code: "ETIMEDOUT" })));
    req.on("error", reject);
    req.end(data);
  });
}
