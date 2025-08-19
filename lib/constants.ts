// Core constants for Calming Control Room (tunable via PRD)

// Cost model (USD per token). Example: $0.002 per 1K tokens => 0.000002 per token
export const COST_PER_TOKEN_USD = 0.00012;

// Concurrency and motion tuning
export const MAX_CONCURRENT = 10;
export const V_MIN = 0.003; // world units/frame
export const V_MAX = 0.012; // world units/frame
export const TRAIL_DECAY = 0.07; // alpha per frame on motion buffer

// Radar visuals
export const RING_COUNT = 6;

// Radar path curvature controls
// - RADAR_CURVE_AMOUNT: 0 = straight lines to center, 1 = max curve (half turn cap)
// - RADAR_MAX_TURNS: maximum rotations (in turns) allowed over full path. 0.5 = half rotation
// - RADAR_WOBBLE: proportion of the curve budget allocated to side-to-side wobble (random per agent)
export const RADAR_CURVE_AMOUNT = 0.65; // main knob to increase/decrease curvature [0..1]
export const RADAR_MAX_TURNS = 0.5;    // cap total spin to half a rotation
export const RADAR_WOBBLE = 0.25;      // 0 = pure spiral, 1 = mostly wobble

// Radar completion pulse controls
// A subtle expanding ring emitted at the center when an agent reaches the target.
export const RADAR_PULSE_MAX_RADIUS = 0.10; // as fraction of radar radius
export const RADAR_PULSE_DURATION_MS = 900; // total life of a pulse
export const RADAR_PULSE_WIDTH = 3;         // stroke width in px
export const RADAR_PULSE_SECONDARY = 0.5;   // second ring offset multiplier (0 to disable)

// Radar ping sound volume
export const RADAR_PING_VOLUME = 0.4;
export const RADAR_PING_AUDIO_PATH = '/audio/sonar_ping_3.mp3';

// Radar render/update cadence (UI only; not engine tick)
// Controls how often agent positions and effects update on the radar.
export const RADAR_REFRESH_HZ = 24; // e.g., 24 Hz; set 60 for smoother motion

// Engine tick rate (Hz). Worker internal loop cadence (not UI render).
export const ENGINE_TICK_HZ = 20;

// TPS dynamics (per-item throughput variability)
// - TPS_ALPHA: smoothing toward the current target per tick (higher = faster moves)
// - TPS_TARGET_HOLD_MS_*: how long to hold a sampled target before choosing a new one
// - TPS_JITTER_FRAC: small per-tick flutter around the held target (as fraction of range)
export const TPS_ALPHA = 0.25;
export const TPS_TARGET_HOLD_MS_MIN = 1800;
export const TPS_TARGET_HOLD_MS_MAX = 4200;
export const TPS_JITTER_FRAC = 0.03;

// Transport batching and store flush cadences (UI data pipeline)
// - BRIDGE_BATCH_MS: Coalesces raw worker messages before applying to the app store.
//   Higher values reduce churn (fewer updates) but can add latency.
// - STORE_FLUSH_INTERVAL_MS: How often coalesced diffs are committed to Zustand.
//   Keep similar to BRIDGE_BATCH_MS unless you want extra smoothing.
export const BRIDGE_BATCH_MS = 50;          // ms: batch worker messages
export const STORE_FLUSH_INTERVAL_MS = 50;  // ms: flush coalesced diffs to store

// Sectors and colors
export const SECTORS = ['PLANNING', 'BUILD', 'EVAL', 'DEPLOY'] as const;
export type Sector = typeof SECTORS[number];
export const SECTOR_COLORS: Record<Sector, string> = {
  PLANNING: '#6EE7B7',
  BUILD: '#93C5FD',
  EVAL: '#FCA5A5',
  DEPLOY: '#FDE68A',
};

// Keep stub flag to satisfy existing import smoke test
export const CONSTANTS_MODULE_LOADED = true;
