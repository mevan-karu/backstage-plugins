import { useMemo } from 'react';
import Accordion from '@material-ui/core/Accordion';
import AccordionSummary from '@material-ui/core/AccordionSummary';
import AccordionDetails from '@material-ui/core/AccordionDetails';
import Box from '@material-ui/core/Box';
import Grid from '@material-ui/core/Grid';
import Typography from '@material-ui/core/Typography';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import { EmptyState, InfoCard, Progress } from '@backstage/core-components';
import { useEntity } from '@backstage/plugin-catalog-react';
import type { MaturityCheckResult } from '@backstage-community/plugin-tech-insights-maturity-common';
import { UNCATEGORIZED, progressOf, rankOf } from '../../scoring';
import { EntityScoreTable } from '../EntityScoreTable';
import { LoadErrorState } from '../LoadErrorState';
import { TierChip } from '../TierChip';
import {
  ROLLUP_KINDS,
  useEntityScorecard,
  useFactCollectionTimes,
} from '../useEntityScorecard';
import { CheckResultItem } from './CheckResultItem';

/**
 * Read-only scorecard for one entity: its tier, then its check results
 * grouped by category. Check management lives on the scorecards page. A
 * System, Domain or Group also lists the entities that belong to it, each
 * with its own tier.
 *
 * A category with a check failing at or below the entity's next achievable
 * tier sorts first and starts expanded. That makes the tier at the top
 * explicable from the list beneath it: a category showing "1/2" could be a
 * Gold aspiration or the Bronze check blocking the entity, and the sort
 * order and per-check tier chip tell them apart.
 */
export function EntityScorecardContent() {
  const { entity } = useEntity();
  const { value, loading, error, retry } = useEntityScorecard(entity);
  const collectedAt = useFactCollectionTimes(entity, value?.ownChecks);
  const isRollupKind = ROLLUP_KINDS.includes(entity.kind);

  const categoryGroups = useMemo(() => {
    if (!value) return [];
    const groups = new Map<string, MaturityCheckResult[]>();
    value.ownChecks.forEach(c => {
      const category = c.check.metadata?.category || UNCATEGORIZED;
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category)!.push(c);
    });
    const rank = rankOf(value.ownChecks);
    const maxRank = value.ownChecks.reduce(
      (max, c) => Math.max(max, c.check.metadata?.rank ?? 0),
      0,
    );
    const nextRank = rank === maxRank ? rank : rank + 1;
    return Array.from(groups.entries())
      .map(([category, checks]) => ({
        category,
        checks,
        hasBlockingFailure: checks.some(
          c => !c.result && c.check.metadata?.rank <= nextRank,
        ),
      }))
      .sort(
        (a, b) => Number(b.hasBlockingFailure) - Number(a.hasBlockingFailure),
      );
  }, [value]);

  const childRows = useMemo(
    () =>
      (value?.children ?? []).map(child => ({
        entity: child.entity,
        rank: child.rank,
        ...progressOf(child.checks),
      })),
    [value],
  );
  const childKinds = new Set(
    childRows.map(row => row.entity.split(':')[0].toLocaleLowerCase('en-US')),
  );

  return (
    <Grid container spacing={2}>
      <Grid item xs={12}>
        <Box display="flex" alignItems="center">
          <Typography variant="h6" style={{ marginRight: 8 }}>
            Tier:
          </Typography>
          {value && <TierChip rank={value.headline.rank} emphasis="filled" />}
          {value?.headline.source === 'children' && (
            <Box ml={1}>
              <Typography variant="body2" color="textSecondary">
                combined from the entities in this {entity.kind}
              </Typography>
            </Box>
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
          <LoadErrorState
            title="Couldn't load check results"
            error={error}
            onRetry={retry}
          />
        </Grid>
      )}
      {!loading &&
        !error &&
        value &&
        value.ownChecks.length === 0 &&
        !isRollupKind && (
          <Grid item xs={12}>
            <EmptyState
              missing="data"
              title="No checks apply yet"
              description="Published checks whose filter matches this entity, and whose facts have been collected for it, appear here."
            />
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
                  <Grid container spacing={2}>
                    {checks.map(c => (
                      <Grid item xs={12} key={c.check.id}>
                        <CheckResultItem result={c} collectedAt={collectedAt} />
                      </Grid>
                    ))}
                  </Grid>
                </AccordionDetails>
              </Accordion>
            ))}
          </InfoCard>
        </Grid>
      )}
      {!loading && !error && value && isRollupKind && (
        <Grid item xs={12}>
          <InfoCard
            title={`Entities in this ${entity.kind}`}
            subheader="Each entity's tier and checks passing, lowest tier first."
          >
            {childRows.length > 0 ? (
              <EntityScoreTable
                rows={childRows}
                showKind={childKinds.size > 1}
              />
            ) : (
              <EmptyState
                missing="data"
                title="Nothing to score yet"
                description={`Entities that belong to this ${entity.kind} appear here once checks apply to them.`}
              />
            )}
          </InfoCard>
        </Grid>
      )}
    </Grid>
  );
}
