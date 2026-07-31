import { useMemo } from 'react';
import useAsync from 'react-use/lib/useAsync';
import Box from '@material-ui/core/Box';
import Button from '@material-ui/core/Button';
import Chip from '@material-ui/core/Chip';
import Typography from '@material-ui/core/Typography';
import Table from '@material-ui/core/Table';
import TableBody from '@material-ui/core/TableBody';
import TableCell from '@material-ui/core/TableCell';
import TableHead from '@material-ui/core/TableHead';
import TableRow from '@material-ui/core/TableRow';
import ArrowBackIcon from '@material-ui/icons/ArrowBack';
import { useTheme } from '@material-ui/core/styles';
import { InfoCard, Progress } from '@backstage/core-components';
import { useApi } from '@backstage/core-plugin-api';
import { catalogApiRef, EntityRefLink } from '@backstage/plugin-catalog-react';
import { stringifyEntityRef } from '@backstage/catalog-model';
import { maturityApiRef } from '@backstage-community/plugin-tech-insights-maturity';
import { Rank } from '@backstage-community/plugin-tech-insights-maturity-common';
import {
  TIER_LABEL,
  getTierColor,
} from '@openchoreo/backstage-plugin-tech-insights-react-check-editor';

interface ComplianceOverviewContentProps {
  onBack: () => void;
}

/**
 * Per-component maturity breakdown — the "full breakdown" drilled into from
 * ComplianceScoreCard's link, sorted worst-tier-first so whatever needs
 * attention surfaces at the top. Not a tab: InsightsPage swaps this in for
 * the default checks table via local view state.
 */
export function ComplianceOverviewContent({
  onBack,
}: ComplianceOverviewContentProps) {
  const catalogApi = useApi(catalogApiRef);
  const maturityApi = useApi(maturityApiRef);
  const theme = useTheme();

  const { value, loading, error } = useAsync(async () => {
    const { items } = await catalogApi.getEntities({
      filter: { kind: 'Component' },
    });
    const summaries = await maturityApi.getBulkMaturitySummary(items);
    return items.map((entity, i) => ({ entity, summary: summaries[i].summary }));
  }, [catalogApi, maturityApi]);

  const tierCounts = useMemo(() => {
    const counts: Record<Rank, number> = {
      [Rank.Stone]: 0,
      [Rank.Bronze]: 0,
      [Rank.Silver]: 0,
      [Rank.Gold]: 0,
    };
    (value ?? []).forEach(({ summary }) => {
      counts[summary.rank] += 1;
    });
    return counts;
  }, [value]);

  if (loading) {
    return <Progress />;
  }
  if (error) {
    return <Typography color="error">{error.message}</Typography>;
  }
  if (!value || value.length === 0) {
    return (
      <Box>
        <Box mb={2}>
          <Button startIcon={<ArrowBackIcon />} onClick={onBack}>
            Back to checks
          </Button>
        </Box>
        <InfoCard title="Compliance overview">
          <Typography variant="body2" color="textSecondary">
            No Component entities registered yet.
          </Typography>
        </InfoCard>
      </Box>
    );
  }

  const sorted = [...value].sort((a, b) => a.summary.rank - b.summary.rank);

  return (
    <Box>
      <Box mb={2}>
        <Button startIcon={<ArrowBackIcon />} onClick={onBack}>
          Back to checks
        </Button>
      </Box>
      <Box mb={2}>
        <InfoCard title="Maturity tier distribution">
          <Box display="flex" style={{ gap: 16 }}>
            {[Rank.Gold, Rank.Silver, Rank.Bronze, Rank.Stone].map(rank => {
              const color = getTierColor(rank, theme);
              return (
                <Chip
                  key={rank}
                  label={`${TIER_LABEL[rank]}: ${tierCounts[rank]}`}
                  style={{
                    backgroundColor: color,
                    color: theme.palette.getContrastText(color),
                    fontWeight: 600,
                  }}
                />
              );
            })}
          </Box>
        </InfoCard>
      </Box>
      <InfoCard title="Components">
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Component</TableCell>
                <TableCell>Maturity</TableCell>
                <TableCell>Checks passing</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sorted.map(({ entity, summary }) => (
                <TableRow key={stringifyEntityRef(entity)}>
                  <TableCell>
                    <EntityRefLink entityRef={entity} />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={TIER_LABEL[summary.rank]}
                      size="small"
                      variant="outlined"
                      style={{
                        borderColor: getTierColor(summary.rank, theme),
                        color: getTierColor(summary.rank, theme),
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    {summary.progress.passedChecks}/
                    {summary.progress.totalChecks} (
                    {summary.progress.percentage}%)
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
      </InfoCard>
    </Box>
  );
}
