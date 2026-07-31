import type { Theme } from '@material-ui/core/styles';

/**
 * Bronze/Silver/Gold/Stone maturity-tier labels and colors, shared by every
 * view that renders a tier chip (this plugin's CheckPolicyTable/CheckForm,
 * and the host app's EntityInsightsContent/ComplianceOverviewContent).
 *
 * Deliberately not sourced from `@openchoreo/backstage-design-system` —
 * this package has zero `@openchoreo/*` dependencies by design (donation
 * guardrail), and tier colors are a generic maturity-model concept, not
 * OpenChoreo branding. Mode-aware via `theme.palette.type` (a plain MUI
 * concept) rather than a fixed hex per tier, since a literal color is wrong
 * in whichever theme it wasn't chosen for.
 *
 * Single source of truth to avoid the exact bug this replaced: two
 * independent copies of this map had drifted so Stone and Silver rendered
 * as the identical grey.
 */
export const TIER_LABEL: Record<number, string> = {
  0: 'Stone',
  1: 'Bronze',
  2: 'Silver',
  3: 'Gold',
};

const LIGHT_TIER_COLOR: Record<number, string> = {
  0: '#9ca3af',
  1: '#9a5b23',
  2: '#5b6472',
  3: '#a3720b',
};

const DARK_TIER_COLOR: Record<number, string> = {
  0: '#6b7280',
  1: '#d8a367',
  2: '#cbd5e1',
  3: '#f3ba37',
};

export function getTierColor(rank: number, theme: Theme): string {
  const palette = theme.palette.type === 'dark' ? DARK_TIER_COLOR : LIGHT_TIER_COLOR;
  return palette[rank] ?? theme.palette.text.secondary;
}
