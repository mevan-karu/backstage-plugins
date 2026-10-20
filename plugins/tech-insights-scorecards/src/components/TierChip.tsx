import Chip from '@material-ui/core/Chip';
import { useTheme } from '@material-ui/core/styles';
import { TIER_LABEL, getTierColor } from '../tierPalette';

export interface TierChipProps {
  rank: number;
  /**
   * `filled` for a summary (an entity's tier, a tier count), `outlined` for a
   * tier shown on a row (a check's tier). Defaults to `outlined`.
   */
  emphasis?: 'filled' | 'outlined';
  /** Replaces the tier name, e.g. "Bronze: 3" for a count. */
  label?: string;
}

/** A Bronze/Silver/Gold/Stone tier chip, coloured per tier for the theme. */
export function TierChip({
  rank,
  emphasis = 'outlined',
  label,
}: TierChipProps) {
  const theme = useTheme();
  const color = getTierColor(rank, theme);
  const text = label ?? TIER_LABEL[rank] ?? String(rank);
  return emphasis === 'filled' ? (
    <Chip
      size="small"
      label={text}
      style={{
        backgroundColor: color,
        color: theme.palette.getContrastText(color),
        fontWeight: 600,
      }}
    />
  ) : (
    <Chip
      size="small"
      variant="outlined"
      label={text}
      style={{ borderColor: color, color }}
    />
  );
}
