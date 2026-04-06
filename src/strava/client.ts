const BASE_URL = "https://www.strava.com/api/v3";

async function stravaFetch<T>(path: string, accessToken: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Strava API error (${res.status}): ${err}`);
  }

  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Activity {
  id: number;
  name: string;
  type: string;
  sport_type: string;
  distance: number;          // meters
  moving_time: number;       // seconds
  elapsed_time: number;      // seconds
  total_elevation_gain: number;
  start_date_local: string;
  average_speed: number;     // m/s
  max_speed: number;         // m/s
  average_heartrate?: number;
  max_heartrate?: number;
  suffer_score?: number;
  workout_type?: number;
  achievement_count: number;
  pr_count: number;
  map: { summary_polyline: string };
}

export interface DetailedActivity extends Activity {
  description?: string;
  calories?: number;
  device_name?: string;
  gear_id?: string;
  laps?: Lap[];
}

export interface Lap {
  id: number;
  lap_index: number;
  distance: number;
  elapsed_time: number;
  moving_time: number;
  average_speed: number;
  max_speed: number;
  average_heartrate?: number;
  pace_zone?: number;
}

export interface ActivityStreams {
  time?: { data: number[]; original_size: number };
  distance?: { data: number[]; original_size: number };
  velocity_smooth?: { data: number[]; original_size: number };
  heartrate?: { data: number[]; original_size: number };
  altitude?: { data: number[]; original_size: number };
  cadence?: { data: number[]; original_size: number };
  watts?: { data: number[]; original_size: number };
}

export interface AthleteStats {
  recent_run_totals: PeriodTotals;
  ytd_run_totals: PeriodTotals;
  all_run_totals: PeriodTotals;
  recent_ride_totals: PeriodTotals;
  ytd_ride_totals: PeriodTotals;
  all_ride_totals: PeriodTotals;
}

export interface PeriodTotals {
  count: number;
  distance: number;      // meters
  moving_time: number;   // seconds
  elapsed_time: number;
  elevation_gain: number;
}

// ---------------------------------------------------------------------------
// API methods
// ---------------------------------------------------------------------------

/**
 * Fetch the authenticated athlete's recent activities.
 * @param perPage Number of activities to return (max 200).
 * @param page Page number (default 1).
 */
export async function getRecentActivities(
  accessToken: string,
  perPage = 10,
  page = 1
): Promise<Activity[]> {
  return stravaFetch<Activity[]>(
    `/athlete/activities?per_page=${perPage}&page=${page}`,
    accessToken
  );
}

/**
 * Fetch a single activity by ID with full detail including laps.
 */
export async function getActivity(
  activityId: number,
  accessToken: string
): Promise<DetailedActivity> {
  return stravaFetch<DetailedActivity>(`/activities/${activityId}`, accessToken);
}

/**
 * Fetch time-series stream data for an activity.
 * Returns per-second data for pace, HR, altitude, cadence — key for interval analysis.
 */
export async function getActivityStreams(
  activityId: number,
  accessToken: string
): Promise<ActivityStreams> {
  const keys = "time,distance,velocity_smooth,heartrate,altitude,cadence";
  const raw = await stravaFetch<Record<string, { data: unknown[]; original_size: number }>>(
    `/activities/${activityId}/streams?keys=${keys}&key_by_type=true`,
    accessToken
  );

  // Cast to typed structure
  return raw as unknown as ActivityStreams;
}

/**
 * Fetch lifetime and recent totals for the authenticated athlete.
 */
export async function getAthleteStats(
  athleteId: number,
  accessToken: string
): Promise<AthleteStats> {
  return stravaFetch<AthleteStats>(`/athletes/${athleteId}/stats`, accessToken);
}
