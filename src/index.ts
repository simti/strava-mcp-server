import { Hono } from "hono";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { buildAuthorizationUrl, exchangeCodeForTokens, type Env } from "./strava/auth";
import { registerStravaTools } from "./strava/tools";

const app = new Hono<{ Bindings: Env }>();

// ---------------------------------------------------------------------------
// MCP endpoint — all MCP traffic goes through POST /mcp
// ---------------------------------------------------------------------------
app.post("/mcp", async (c) => {
  const env = c.env;

  const server = new McpServer({
    name: "strava-mcp-server",
    version: "1.0.0",
  });

  registerStravaTools(server, env);

  // Stateless transport — each request is independent (suits CF Workers)
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  await server.connect(transport);

  const response = await transport.handleRequest(c.req.raw);
  return response;
});

// MCP spec requires GET /mcp to return 405 (method not allowed for SSE-less servers)
app.get("/mcp", (c) => {
  return c.json({ error: "Use POST for MCP requests" }, 405);
});

// ---------------------------------------------------------------------------
// OAuth routes
// ---------------------------------------------------------------------------

// Step 1 — redirect user to Strava consent page
app.get("/auth", (c) => {
  const redirectUri = `${new URL(c.req.url).origin}/auth/callback`;
  const url = buildAuthorizationUrl(c.env.STRAVA_CLIENT_ID, redirectUri);
  return c.redirect(url);
});

// Step 2 — handle Strava callback with authorization code
app.get("/auth/callback", async (c) => {
  const code = c.req.query("code");
  const error = c.req.query("error");

  if (error) {
    return c.text(`Strava OAuth error: ${error}`, 400);
  }

  if (!code) {
    return c.text("Missing authorization code", 400);
  }

  try {
    const tokens = await exchangeCodeForTokens(code, c.env);
    return c.html(`
      <html>
        <body style="font-family: sans-serif; padding: 2rem;">
          <h2>✅ Connected to Strava!</h2>
          <p>Athlete ID: <strong>${tokens.athlete_id}</strong></p>
          <p>Your MCP server is ready. You can now use it with Claude.</p>
          <p><small>Token expires at: ${new Date(tokens.expires_at * 1000).toLocaleString()}</small></p>
        </body>
      </html>
    `);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.text(`Token exchange failed: ${message}`, 500);
  }
});

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
app.get("/", (c) => {
  return c.json({
    name: "strava-mcp-server",
    status: "ok",
    endpoints: {
      mcp: "POST /mcp",
      auth: "GET /auth",
    },
  });
});

export default app;
