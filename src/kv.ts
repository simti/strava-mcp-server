export interface StravaTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number; // Unix timestamp in seconds
  athlete_id: number;
}

const KV_KEY = "strava_tokens";

export async function getTokens(kv: KVNamespace): Promise<StravaTokens | null> {
  const raw = await kv.get(KV_KEY, "json");
  return raw as StravaTokens | null;
}

export async function saveTokens(kv: KVNamespace, tokens: StravaTokens): Promise<void> {
  await kv.put(KV_KEY, JSON.stringify(tokens));
}

export function isExpired(tokens: StravaTokens): boolean {
  // Refresh 5 minutes before actual expiry
  const bufferSeconds = 5 * 60;
  return Date.now() / 1000 >= tokens.expires_at - bufferSeconds;
}
