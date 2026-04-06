import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getValidAccessToken, type Env } from "./auth";
import {
  getRecentActivities,
  getActivity,
  getActivityStreams,
  getAthleteStats,
} from "./client";
import { getTokens } from "../kv";

/**
 * Register all Strava MCP tools onto the given McpServer instance.
 */
export function registerStravaTools(server: McpServer, env: Env): void {
  // -------------------------------------------------------------------------
  // Tool: get_recent_activities
  // -------------------------------------------------------------------------
  server.tool(
    "get_recent_activities",
    "Fetch the athlete's most recent Strava activities. Returns distance, pace, time, elevation, and PR info for each.",
    {
      per_page: z.number().min(1).max(200).default(10).describe("Number of activities to return (max 200)"),
      page: z.number().min(1).default(1).describe("Page number for pagination"),
    },
    async ({ per_page, page }) => {
      const token = await getValidAccessToken(env);
      const activities = await getRecentActivities(token, per_page, page);

      // Format for readability inside Claude
      const formatted = activities.map((a) => ({
        id: a.id,
        name: a.name,
        type: a.sport_type,
        date: a.start_date_local,
        distance_km: (a.distance / 1000).toFixed(2),
        moving_time_min: Math.round(a.moving_time / 60),
        avg_pace_per_km: formatPace(a.average_speed),
        max_pace_per_km: formatPace(a.max_speed),
        elevation_gain_m: a.total_elevation_gain,
        avg_heartrate: a.average_heartrate ?? null,
        suffer_score: a.suffer_score ?? null,
        pr_count: a.pr_count,
        achievement_count: a.achievement_count,
      }));

      return {
        content: [{ type: "text", text: JSON.stringify(formatted, null, 2) }],
      };
    }
  );

  // -------------------------------------------------------------------------
  // Tool: get_activity
  // -------------------------------------------------------------------------
  server.tool(
    "get_activity",
    "Fetch full details for a single Strava activity by ID, including laps and description.",
    {
      activity_id: z.number().describe("The Strava activity ID"),
    },
    async ({ activity_id }) => {
      const token = await getValidAccessToken(env);
      const activity = await getActivity(activity_id, token);

      const result = {
        id: activity.id,
        name: activity.name,
        type: activity.sport_type,
        date: activity.start_date_local,
        description: activity.description ?? "",
        distance_km: (activity.distance / 1000).toFixed(2),
        moving_time_min: Math.round(activity.moving_time / 60),
        avg_pace_per_km: formatPace(activity.average_speed),
        max_pace_per_km: formatPace(activity.max_speed),
        elevation_gain_m: activity.total_elevation_gain,
        avg_heartrate: activity.average_heartrate ?? null,
        max_heartrate: activity.max_heartrate ?? null,
        calories: activity.calories ?? null,
        suffer_score: activity.suffer_score ?? null,
        device: activity.device_name ?? null,
        pr_count: activity.pr_count,
        laps: activity.laps?.map((lap) => ({
          index: lap.lap_index,
          distance_m: Math.round(lap.distance),
          moving_time_s: lap.moving_time,
          avg_pace_per_km: formatPace(lap.average_speed),
          max_pace_per_km: formatPace(lap.max_speed),
          avg_heartrate: lap.average_heartrate ?? null,
          pace_zone: lap.pace_zone ?? null,
        })) ?? [],
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // -------------------------------------------------------------------------
  // Tool: get_activity_streams
  // -------------------------------------------------------------------------
  server.tool(
    "get_activity_streams",
    "Fetch per-second time-series stream data for a Strava activity. Returns arrays of velocity, heartrate, altitude, and cadence over time. Use this for detailed interval analysis — e.g. detecting pace drop-off mid-interval.",
    {
      activity_id: z.number().describe("The Strava activity ID"),
    },
    async ({ activity_id }) => {
      const token = await getValidAccessToken(env);
      const streams = await getActivityStreams(activity_id, token);

      // Convert velocity stream (m/s) → pace (min/km) for easier analysis
      const velocityData = streams.velocity_smooth?.data ?? [];
      const paceData = velocityData.map((v) => (v > 0 ? +(60 / (v * 0.06)).toFixed(2) : null));

      const result = {
        data_points: streams.time?.original_size ?? 0,
        time_s: streams.time?.data ?? [],
        distance_m: streams.distance?.data ?? [],
        pace_min_per_km: paceData,
        velocity_m_per_s: streams.velocity_smooth?.data ?? [],
        heartrate_bpm: streams.heartrate?.data ?? [],
        altitude_m: streams.altitude?.data ?? [],
        cadence_spm: streams.cadence?.data ?? [],
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // -------------------------------------------------------------------------
  // Tool: get_athlete_stats
  // -------------------------------------------------------------------------
  server.tool(
    "get_athlete_stats",
    "Fetch lifetime, year-to-date, and recent 4-week totals for the athlete. Useful for tracking weekly mileage trends and overall training load.",
    {},
    async () => {
      const tokens = await getTokens(env.STRAVA_TOKENS);
      if (!tokens) {
        throw new Error("Not authenticated. Visit /auth to connect your Strava account.");
      }

      const token = await getValidAccessToken(env);
      const stats = await getAthleteStats(tokens.athlete_id, token);

      const fmt = (totals: typeof stats.recent_run_totals) => ({
        runs: totals.count,
        distance_km: (totals.distance / 1000).toFixed(1),
        moving_time_h: (totals.moving_time / 3600).toFixed(1),
        elevation_gain_m: Math.round(totals.elevation_gain),
      });

      const result = {
        recent_4_weeks: fmt(stats.recent_run_totals),
        year_to_date: fmt(stats.ytd_run_totals),
        all_time: fmt(stats.all_run_totals),
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

/**
 * Convert m/s to a "MM:SS /km" pace string.
 * Returns "--:--" for zero/invalid speed.
 */
function formatPace(speedMs: number): string {
  if (!speedMs || speedMs <= 0) return "--:--";
  const minPerKm = 1000 / speedMs / 60;
  const mins = Math.floor(minPerKm);
  const secs = Math.round((minPerKm - mins) * 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
