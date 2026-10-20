import type { Entity } from '@backstage/catalog-model';
import { TierChip } from './TierChip';
import { useEntityScorecard } from './useEntityScorecard';

export interface EntityScorecardRankChipProps {
  entity: Entity;
}

/**
 * An entity's tier as a chip, for entity headers and overview cards.
 * Renders nothing while loading or when no checks apply.
 */
export function EntityScorecardRankChip({
  entity,
}: EntityScorecardRankChipProps) {
  const { value } = useEntityScorecard(entity);
  if (!value || value.headline.progress.totalChecks === 0) return null;
  return <TierChip rank={value.headline.rank} emphasis="filled" />;
}
