import { useMemo } from 'react';
import useAsync from 'react-use/lib/useAsync';
import Accordion from '@material-ui/core/Accordion';
import AccordionSummary from '@material-ui/core/AccordionSummary';
import AccordionDetails from '@material-ui/core/AccordionDetails';
import Box from '@material-ui/core/Box';
import Chip from '@material-ui/core/Chip';
import Grid from '@material-ui/core/Grid';
import Typography from '@material-ui/core/Typography';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import CancelIcon from '@material-ui/icons/Cancel';
import { useTheme } from '@material-ui/core/styles';
import { InfoCard, Progress } from '@backstage/core-components';
import { useApi } from '@backstage/core-plugin-api';
import { useEntity } from '@backstage/plugin-catalog-react';
import { maturityApiRef } from '@backstage-community/plugin-tech-insights-maturity';
import type { MaturityCheckResult } from '@backstage-community/plugin-tech-insights-maturity-common';
import {
  TIER_LABEL,
  getTierColor,
} from '@openchoreo/backstage-plugin-tech-insights-react-check-editor';
import { useChoreoTokens } from '@openchoreo/backstage-design-system';

/**
 * Entity-scoped "Insights" tab: maturity rank at top, checks grouped by
 * category beneath it — read-only results for this component. Check
 * configuration lives on the top-level Insights nav item instead
 * (InsightsPage's "Manage checks" tab), not per-component.
 *
 * Deliberately does NOT use @backstage-community/plugin-tech-insights-maturity's
 * EntityMaturityScorecardContent/EntityMaturitySummaryContent — both are
 * routable extensions sharing that plugin's `rootRouteRef`, which requires an
 * NFS route binding under convertLegacyAppRoot to satisfy Backstage's
 * routable-extension discovery. That's unrelated infrastructure this app
 * doesn't otherwise need; confirmed by hitting "was not discovered in the app
 * element tree" even with a standalone top-level mount. maturityApiRef itself
 * is a plain API ref with no such requirement, so this reads from it directly.
 *
 * Categories are sorted so any category with a check failing at or below the
 * entity's next achievable rank sorts first — that's what makes the rank
 * chip at the top explicable from the list beneath it (a category showing
 * "1/2" could be a Gold aspiration or the Bronze check blocking the whole
 * entity; the sort order and per-check rank chip disambiguate it).
 */
export function EntityInsightsContent() {
  const { entity } = useEntity();
  const api = useApi(maturityApiRef);
  const theme = useTheme();
  const tokens = useChoreoTokens();
  const { value, loading, error } = useAsync(
    async () => api.getMaturityScore(entity),
    [api, entity],
  );

  const categoryGroups = useMemo(() => {
    if (!value) return [];
    const groups = new Map<string, MaturityCheckResult[]>();
    value.checks.forEach(c => {
      const category = c.check.metadata?.category || 'Uncategorized';
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category)!.push(c);
    });
    const nextRank = value.rank.isMaxRank
      ? value.rank.rank
      : value.rank.rank + 1;
    return Array.from(groups.entries())
      .map(([category, checks]) => ({
        category,
        checks,
        hasBlockingFailure: checks.some(
          c => !c.result && c.check.metadata?.rank <= nextRank,
        ),
      }))
      .sort((a, b) => Number(b.hasBlockingFailure) - Number(a.hasBlockingFailure));
  }, [value]);

  return (
    <Grid container spacing={2}>
      <Grid item xs={12}>
        <Box display="flex" alignItems="center">
          <Typography variant="h6" style={{ marginRight: 8 }}>
            Maturity:
          </Typography>
          {value && (
            <Chip
              label={TIER_LABEL[value.rank.rank]}
              style={{
                backgroundColor: getTierColor(value.rank.rank, theme),
                color: theme.palette.getContrastText(
                  getTierColor(value.rank.rank, theme),
                ),
                fontWeight: 600,
              }}
            />
          )}
        </Box>
      </Grid>

      {loading && (
        <Grid item xs={12}>
          <Progress />
        </Grid>
      )}
      {!!error && (
        <Grid item xs={12}>
          <Typography color="error">{error.message}</Typography>
        </Grid>
      )}
      {!loading && !error && value && value.checks.length === 0 && (
        <Grid item xs={12}>
          <InfoCard title="Checks">
            <Typography variant="body2" color="textSecondary">
              No published checks apply to this entity yet.
            </Typography>
          </InfoCard>
        </Grid>
      )}
      {!loading && !error && categoryGroups.length > 0 && (
        <Grid item xs={12}>
          <InfoCard title="Checks">
            {categoryGroups.map(({ category, checks, hasBlockingFailure }) => (
              <Accordion key={category} defaultExpanded={hasBlockingFailure}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography>
                    {category} ({checks.filter(c => c.result).length}/
                    {checks.length})
                  </Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Grid container spacing={1}>
                    {checks.map(c => (
                      <Grid item xs={12} key={c.check.id}>
                        <Box display="flex" alignItems="flex-start">
                          {c.result ? (
                            <CheckCircleIcon
                              style={{ color: tokens.status.ok, marginRight: 8 }}
                            />
                          ) : (
                            <CancelIcon
                              style={{ color: tokens.status.error, marginRight: 8 }}
                            />
                          )}
                          <Box flexGrow={1}>
                            <Box display="flex" alignItems="center">
                              <Typography variant="body1">
                                {c.check.name}
                              </Typography>
                              {c.check.metadata?.rank !== undefined && (
                                <Chip
                                  label={TIER_LABEL[c.check.metadata.rank]}
                                  size="small"
                                  variant="outlined"
                                  style={{
                                    marginLeft: 8,
                                    borderColor: getTierColor(
                                      c.check.metadata.rank,
                                      theme,
                                    ),
                                    color: getTierColor(
                                      c.check.metadata.rank,
                                      theme,
                                    ),
                                  }}
                                />
                              )}
                            </Box>
                            {c.check.description && (
                              <Typography
                                variant="body2"
                                color="textSecondary"
                              >
                                {c.check.description}
                              </Typography>
                            )}
                          </Box>
                        </Box>
                      </Grid>
                    ))}
                  </Grid>
                </AccordionDetails>
              </Accordion>
            ))}
          </InfoCard>
        </Grid>
      )}
    </Grid>
  );
}
