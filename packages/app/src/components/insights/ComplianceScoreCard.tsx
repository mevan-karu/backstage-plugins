import useAsync from 'react-use/lib/useAsync';
import Box from '@material-ui/core/Box';
import CircularProgress from '@material-ui/core/CircularProgress';
import Link from '@material-ui/core/Link';
import Typography from '@material-ui/core/Typography';
import { InfoCard } from '@backstage/core-components';
import { useApi } from '@backstage/core-plugin-api';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { maturityApiRef } from '@backstage-community/plugin-tech-insights-maturity';
import { useChoreoTokens } from '@openchoreo/backstage-design-system';

interface ComplianceScoreCardProps {
  onViewBreakdown: () => void;
}

/**
 * Aggregate pass-rate gauge across all Components' published checks. This is
 * a literal "checks passed / checks total" percentage, not a
 * severity-weighted score — deliberately not synthesized from maturity ranks
 * (that model was already rejected in favor of the Bronze/Silver/Gold
 * staircase used elsewhere in this UI), and labeled for what it actually is.
 */
export function ComplianceScoreCard({ onViewBreakdown }: ComplianceScoreCardProps) {
  const catalogApi = useApi(catalogApiRef);
  const maturityApi = useApi(maturityApiRef);
  const tokens = useChoreoTokens();

  const { value, loading } = useAsync(async () => {
    const { items } = await catalogApi.getEntities({
      filter: { kind: 'Component' },
    });
    if (items.length === 0) {
      return { percentage: 0, passed: 0, total: 0, componentCount: 0 };
    }
    const summaries = await maturityApi.getBulkMaturitySummary(items);
    const passed = summaries.reduce(
      (sum, s) => sum + s.summary.progress.passedChecks,
      0,
    );
    const total = summaries.reduce(
      (sum, s) => sum + s.summary.progress.totalChecks,
      0,
    );
    return {
      percentage: total === 0 ? 0 : Math.round((passed / total) * 100),
      passed,
      total,
      componentCount: items.length,
    };
  }, [catalogApi, maturityApi]);

  const percentage = loading ? 0 : value?.percentage ?? 0;

  return (
    <InfoCard>
      <Box display="flex" alignItems="center">
        <Box position="relative" display="inline-flex" mr={3}>
          <CircularProgress
            variant="determinate"
            value={percentage}
            size={96}
            thickness={4}
            style={{ color: tokens.status.gold }}
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
          <Typography variant="h6">Checks passing across catalog</Typography>
          {!loading && value && (
            <Typography variant="body2" color="textSecondary">
              {value.passed}/{value.total} checks passing across{' '}
              {value.componentCount} component
              {value.componentCount === 1 ? '' : 's'}
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
