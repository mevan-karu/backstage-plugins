import { useMemo } from 'react';
import Box from '@material-ui/core/Box';
import { EmptyState, InfoCard, Progress } from '@backstage/core-components';
import { Rank } from '@backstage-community/plugin-tech-insights-maturity-common';
import { TIER_LABEL } from '../../tierPalette';
import { EntityScoreTable } from '../EntityScoreTable';
import { FullPageView } from '../FullPageView';
import { LoadErrorState } from '../LoadErrorState';
import { TierChip } from '../TierChip';
import type { EntityScore } from './useScoreResults';

interface ScoreBreakdownProps {
  title: string;
  kinds: string[];
  results?: EntityScore[];
  loading: boolean;
  error?: Error;
  onBack: () => void;
  onRetry: () => void;
}

/**
 * Per-entity tier breakdown, sorted lowest tier first so whatever needs
 * attention surfaces at the top. Each name links to that entity's scorecard
 * tab.
 */
export function ScoreBreakdown({
  title,
  kinds,
  results: value,
  loading,
  error,
  onBack,
  onRetry,
}: ScoreBreakdownProps) {
  const showKind = kinds.length > 1;

  const tierCounts = useMemo(() => {
    const counts: Record<Rank, number> = {
      [Rank.Stone]: 0,
      [Rank.Bronze]: 0,
      [Rank.Silver]: 0,
      [Rank.Gold]: 0,
    };
    (value ?? []).forEach(({ rank }) => {
      counts[rank] += 1;
    });
    return counts;
  }, [value]);

  let content;
  if (loading) {
    content = <Progress />;
  } else if (error) {
    content = (
      <LoadErrorState
        title="Couldn't load scores"
        error={error}
        onRetry={onRetry}
      />
    );
  } else if (!value || value.length === 0) {
    content = (
      <EmptyState
        missing="data"
        title="Nothing to score yet"
        description={`Scores appear here once ${kinds.join(
          ', ',
        )} entities are in the catalog.`}
      />
    );
  } else {
    content = (
      <>
        <Box mb={2}>
          <InfoCard title="Tier distribution">
            <Box display="flex" style={{ gap: 16 }}>
              {[Rank.Gold, Rank.Silver, Rank.Bronze, Rank.Stone].map(rank => (
                <TierChip
                  key={rank}
                  rank={rank}
                  emphasis="filled"
                  label={`${TIER_LABEL[rank]}: ${tierCounts[rank]}`}
                />
              ))}
            </Box>
          </InfoCard>
        </Box>
        <InfoCard title="Entities">
          <EntityScoreTable rows={value} showKind={showKind} />
        </InfoCard>
      </>
    );
  }

  return (
    <FullPageView
      title={`${title} breakdown`}
      subtitle="Each entity's tier and checks passing, lowest tier first."
      onBack={onBack}
    >
      {content}
    </FullPageView>
  );
}
