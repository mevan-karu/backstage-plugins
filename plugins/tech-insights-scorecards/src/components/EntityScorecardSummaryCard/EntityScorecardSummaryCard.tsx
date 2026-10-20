import Box from '@material-ui/core/Box';
import LinearProgress from '@material-ui/core/LinearProgress';
import Typography from '@material-ui/core/Typography';
import { InfoCard, Progress } from '@backstage/core-components';
import { useRouteRef } from '@backstage/core-plugin-api';
import { entityRouteRef, useEntity } from '@backstage/plugin-catalog-react';
import { getCompoundEntityRef } from '@backstage/catalog-model';
import { DEFAULT_ENTITY_TAB_PATH } from '../../routes';
import { LoadErrorState } from '../LoadErrorState';
import { TierChip } from '../TierChip';
import { useEntityScorecard } from '../useEntityScorecard';

export interface EntityScorecardSummaryCardProps {
  title: string;
}

/**
 * An entity's tier and pass rate per category, linking to its scorecard
 * tab. For a System, Domain or Group without checks of its own, it combines
 * the entities that belong to it.
 */
export function EntityScorecardSummaryCard({
  title,
}: EntityScorecardSummaryCardProps) {
  const { entity } = useEntity();
  const entityRoute = useRouteRef(entityRouteRef);
  const { value, loading, error, retry } = useEntityScorecard(entity);
  const ref = getCompoundEntityRef(entity);
  const link = `${entityRoute({
    kind: ref.kind.toLocaleLowerCase('en-US'),
    namespace: ref.namespace,
    name: ref.name,
  })}${DEFAULT_ENTITY_TAB_PATH}`;

  let content;
  if (loading) {
    content = <Progress />;
  } else if (error) {
    content = (
      <LoadErrorState
        title="Couldn't load scores"
        error={error}
        onRetry={retry}
      />
    );
  } else if (!value || value.headline.progress.totalChecks === 0) {
    content = (
      <Typography variant="body2" color="textSecondary">
        No checks apply yet.
      </Typography>
    );
  } else {
    const { rank, progress, categories, source } = value.headline;
    content = (
      <Box display="flex" flexDirection="column" style={{ gap: 12 }}>
        <Box display="flex" alignItems="center" style={{ gap: 8 }}>
          <TierChip rank={rank} emphasis="filled" />
          <Typography variant="body2">
            {progress.passedChecks}/{progress.totalChecks} checks passing (
            {progress.percentage}%)
          </Typography>
        </Box>
        {source === 'children' && (
          <Typography variant="caption" color="textSecondary">
            Combined from the entities in this {entity.kind}.
          </Typography>
        )}
        {categories.map(category => (
          <Box key={category.category}>
            <Box display="flex" justifyContent="space-between">
              <Typography variant="body2">{category.category}</Typography>
              <Typography variant="body2" color="textSecondary">
                {category.passedChecks}/{category.totalChecks}
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={category.percentage}
              aria-label={`${category.category}: ${category.percentage}% of checks passing`}
            />
          </Box>
        ))}
      </Box>
    );
  }

  return (
    <InfoCard title={title} deepLink={{ title: 'View details', link }}>
      {content}
    </InfoCard>
  );
}
