/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface TimeRange {
  start: string;
  end: string;
}

export interface AnnualizationResult {
  annualized_usd: number;
  observed_duration_hours: number;
  observed_duration_days: number;
  is_annualized: boolean;
  methodology_description: string;
  conservative_assumption?: string;
}

/**
 * Minimum observation duration required to extrapolate annual figures (1 hour).
 * Windows under 1 hour are too narrow to yield a truthful annual projection.
 */
export const MIN_ANNUALIZATION_HOURS = 1.0;

/**
 * Annualize observed savings based strictly on the actual telemetry time range.
 * Formula: (observed_savings_usd / observed_days) * 365
 * 
 * Rules:
 * 1. Zero observed savings -> $0.00 projection.
 * 2. Missing, zero, negative, or invalid time range -> $0.00 projection with conservative assumption.
 * 3. Narrow window (< 1 hour) -> $0.00 projection with insufficient observation window assumption.
 * 4. Observed window >= 1 hour -> (observed_savings_usd / observed_days) * 365.
 */
export function annualizeSavings(
  observedSavingsUsd: number,
  timeRange?: TimeRange
): AnnualizationResult {
  if (observedSavingsUsd <= 0) {
    return {
      annualized_usd: 0,
      observed_duration_hours: 0,
      observed_duration_days: 0,
      is_annualized: false,
      methodology_description: 'Zero observed savings to extrapolate.',
    };
  }

  if (!timeRange || !timeRange.start || !timeRange.end || timeRange.start === 'N/A' || timeRange.end === 'N/A') {
    return {
      annualized_usd: 0,
      observed_duration_hours: 0,
      observed_duration_days: 0,
      is_annualized: false,
      methodology_description: 'Observation window undefined; annualized projection withheld.',
      conservative_assumption: 'Telemetry lacks valid timestamp bounds; annualized projection held at $0.00 until a bounded observation window is established.',
    };
  }

  const startTime = new Date(timeRange.start).getTime();
  const endTime = new Date(timeRange.end).getTime();

  if (isNaN(startTime) || isNaN(endTime) || endTime <= startTime) {
    return {
      annualized_usd: 0,
      observed_duration_hours: 0,
      observed_duration_days: 0,
      is_annualized: false,
      methodology_description: 'Observation window duration is zero or invalid.',
      conservative_assumption: 'Observation window has non-positive duration; annualized projection held at $0.00.',
    };
  }

  const durationMs = endTime - startTime;
  const durationHours = durationMs / (1000 * 60 * 60);
  const durationDays = durationHours / 24;

  if (durationHours < MIN_ANNUALIZATION_HOURS) {
    const minutes = Math.max(1, Math.round(durationHours * 60));
    return {
      annualized_usd: 0,
      observed_duration_hours: Number(durationHours.toFixed(2)),
      observed_duration_days: Number(durationDays.toFixed(4)),
      is_annualized: false,
      methodology_description: `Observation window (${minutes} min) is below minimum threshold (${MIN_ANNUALIZATION_HOURS}h) for annual extrapolation.`,
      conservative_assumption: `Observation window (${minutes} min) is too short (< ${MIN_ANNUALIZATION_HOURS} hour) to project annualized savings conservatively. Extrapolated projection held at $0.00.`,
    };
  }

  const annualized = Number(((observedSavingsUsd / durationDays) * 365).toFixed(2));

  return {
    annualized_usd: annualized,
    observed_duration_hours: Number(durationHours.toFixed(2)),
    observed_duration_days: Number(durationDays.toFixed(4)),
    is_annualized: true,
    methodology_description: `Observed recovery opportunity of $${observedSavingsUsd.toFixed(2)} across ${durationHours.toFixed(1)} hours (${durationDays.toFixed(2)} days) annualized to 365 calendar days (($${observedSavingsUsd.toFixed(2)} / ${durationDays.toFixed(3)} days) * 365).`,
  };
}
