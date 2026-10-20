import Box from '@material-ui/core/Box';
import CircularProgress from '@material-ui/core/CircularProgress';
import Link from '@material-ui/core/Link';
import Typography from '@material-ui/core/Typography';
import { useTheme } from '@material-ui/core/styles';
import { InfoCard } from '@backstage/core-components';
import { Rank } from '@backstage-community/plugin-tech-insights-maturity-common';
import { getTierColor } from '../../tierPalette';
import type { EntityScore } from './useScoreResults';

interface ScoreSummaryCardProps {
  results?: EntityScore[];
  loading: boolean;
  error?: Error;
  onViewBreakdown: () => void;
}

/**
 * Pass-rate gauge across every scored entity's published checks: a literal
 * "checks passed / checks total" percentage, not a weighted score.
 */
export function ScoreSummaryCard({
  results,
  loading,
  error,
  onViewBreakdown,
}: ScoreSummaryCardProps) {
  const theme = useTheme();

  const value = results && {
    passed: results.reduce((sum, r) => sum + r.passedChecks, 0),
    total: results.reduce((sum, r) => sum + r.totalChecks, 0),
    entityCount: results.length,
  };
  const percentage =
    loading || !value || value.total === 0
      ? 0
      : Math.round((value.passed / value.total) * 100);

  return (
    <InfoCard>
      <Box display="flex" alignItems="center">
        <Box position="relative" display="inline-flex" mr={3}>
          <CircularProgress
            variant="determinate"
            value={percentage}
            size={96}
            thickness={4}
            style={{ color: getTierColor(Rank.Gold, theme) }}
          />
          <Box
            position="absolute"
            top={0}
            left={0}
            bottom={0}
            right={0}
            display="flex"
            alignItems="center"
            justifyContent="center"
          >
            <Typography variant="h5" component="div">
              {loading ? '—' : `${percentage}%`}
            </Typography>
          </Box>
        </Box>
        <Box>
          <Typography variant="h6">
            Checks passing across the catalog
          </Typography>
          {!loading && error && (
            <Typography variant="body2" color="error">
              {error.message}
            </Typography>
          )}
          {!loading && value && (
            <Typography variant="body2" color="textSecondary">
              {value.passed}/{value.total} checks passing across{' '}
              {value.entityCount} entit
              {value.entityCount === 1 ? 'y' : 'ies'}
            </Typography>
          )}
          <Link component="button" variant="body2" onClick={onViewBreakdown}>
            View full breakdown &gt;
          </Link>
        </Box>
      </Box>
    </InfoCard>
  );
}
