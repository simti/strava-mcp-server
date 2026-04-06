import { getTokens, saveTokens, isExpired, type StravaTokens } from "../kv";

const STRAVA_AUTH_URL = "https://www.strava.com/oauth/authorize";
const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token";

export interface Env {
  STRAVA_CLIENT_ID: string;
  STRAVA_CLIENT_SECRET: string;
  STRAVA_TOKENS: KVNamespace;
}

/**
 * Build the URL to redirect the user to for Strava OAuth consent.
 */
export function buildAuthorizationUrl(clientId: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    approval_prompt: "auto",
    scope: "read,activity:read_all",
  });
  return `${STRAVA_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange an authorization code for tokens after the OAuth callback.
 */
export async function exchangeCodeForTokens(
  code: string,
  env: Env
): Promise<StravaTokens> {
  const res = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: env.STRAVA_CLIENT_ID,
      client_secret: env.STRAVA_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token exchange failed: ${err}`);
  }

  const data = await res.json() as {
    access_token: string;
    refresh_token: string;
    expires_at: number;
    athlete: { id: number };
  };

  const tokens: StravaTokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at,
    athlete_id: data.athlete.id,
  };

  await saveTokens(env.STRAVA_TOKENS, tokens);
  return tokens;
}

/**
 * Refresh an expired access token using the stored refresh token.
 */
async function refreshAccessToken(tokens: StravaTokens, env: Env): Promise<StravaTokens> {
  const res = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: env.STRAVA_CLIENT_ID,
      client_secret: env.STRAVA_CLIENT_SECRET,
      refresh_token: tokens.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token refresh failed: ${err}`);
  }

  const data = await res.json() as {
    access_token: string;
    refresh_token: string;
    expires_at: number;
  };

  const refreshed: StravaTokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at,
    athlete_id: tokens.athlete_id,
  };

  await saveTokens(env.STRAVA_TOKENS, refreshed);
  return refreshed;
}

/**
 * Get a valid access token, refreshing automatically if expired.
 * Throws if no tokens are stored (user hasn't authenticated yet).
 */
export async function getValidAccessToken(env: Env): Promise<string> {
  const tokens = await getTokens(env.STRAVA_TOKENS);

  if (!tokens) {
    throw new Error("Not authenticated. Visit /auth to connect your Strava account.");
  }

  if (isExpired(tokens)) {
    const refreshed = await refreshAccessToken(tokens, env);
    return refreshed.access_token;
  }

  return tokens.access_token;
}
