import { exec } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import { OAuth2Client } from "google-auth-library";
import { GOOGLE_SCOPES, TOKEN_FILE, env } from "./config";

const OAUTH_PORT = 4571;
const REDIRECT_URI = `http://localhost:${OAUTH_PORT}/oauth2callback`;

function openInBrowser(url: string): void {
  const cmd =
    process.platform === "darwin"
      ? `open "${url}"`
      : process.platform === "win32"
        ? `start "" "${url}"`
        : `xdg-open "${url}"`;
  exec(cmd, () => {
    /* if it fails, the URL is printed below anyway */
  });
}

/**
 * Returns an authorized OAuth2 client for Sheets + Drive.
 * Uses a cached refresh token when present; otherwise runs a one-time
 * loopback consent flow (opens the browser, captures the code locally).
 */
export async function getGoogleAuth(): Promise<OAuth2Client> {
  if (!env.clientId || !env.clientSecret) {
    throw new Error(
      "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set. Add them to .env " +
        "(Google Cloud Console > Credentials > OAuth client ID > Desktop app).",
    );
  }

  const client = new OAuth2Client(env.clientId, env.clientSecret, REDIRECT_URI);

  // Reuse cached tokens.
  if (fs.existsSync(TOKEN_FILE)) {
    try {
      const tokens = JSON.parse(fs.readFileSync(TOKEN_FILE, "utf8"));
      client.setCredentials(tokens);
      // Persist refreshed access tokens automatically.
      client.on("tokens", (t) => {
        const merged = { ...tokens, ...t };
        fs.writeFileSync(TOKEN_FILE, JSON.stringify(merged, null, 2));
      });
      return client;
    } catch {
      // fall through to fresh consent
    }
  }

  const authUrl = client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GOOGLE_SCOPES,
  });

  const code = await new Promise<string>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const url = new URL(req.url ?? "", REDIRECT_URI);
        if (!url.pathname.startsWith("/oauth2callback")) {
          res.writeHead(404).end();
          return;
        }
        const c = url.searchParams.get("code");
        const err = url.searchParams.get("error");
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          "<html><body style='font-family:sans-serif'><h2>Authorized ✓</h2>" +
            "<p>You can close this tab and return to the terminal.</p></body></html>",
        );
        server.close();
        if (err) reject(new Error(`OAuth error: ${err}`));
        else if (c) resolve(c);
        else reject(new Error("No authorization code returned."));
      } catch (e) {
        reject(e as Error);
      }
    });
    server.listen(OAUTH_PORT, () => {
      console.log("\n🔐 Opening Google consent screen in your browser…");
      console.log(`   If it doesn't open, visit:\n   ${authUrl}\n`);
      openInBrowser(authUrl);
    });
    server.on("error", reject);
  });

  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));
  console.log("✓ Google authorization saved to .gtoken.json\n");
  return client;
}
