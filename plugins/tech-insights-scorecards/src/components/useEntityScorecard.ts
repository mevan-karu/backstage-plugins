import useAsync from 'react-use/lib/useAsync';
import useAsyncRetry from 'react-use/lib/useAsyncRetry';
import { configApiRef, useApi } from '@backstage/core-plugin-api';
import { getCompoundEntityRef, type Entity } from '@backstage/catalog-model';
import { maturityApiRef } from '@backstage-community/plugin-tech-insights-maturity';
import type {
  EntityMaturityCheckResult,
  MaturityCheckResult,
  Rank,
} from '@backstage-community/plugin-tech-insights-maturity-common';
import {
  progressByCategory,
  progressOf,
  rankOf,
  type CategoryProgress,
  type CheckProgress,
} from '../scoring';

/** Kinds the maturity client rolls up from the entities that belong to them. */
export const ROLLUP_KINDS = ['System', 'Domain', 'Group'];

export interface EntityScorecard {
  /** The entity's own check results, listed check by check. */
  ownChecks: MaturityCheckResult[];
  /** Per-entity results of what belongs to a System, Domain or Group. */
  children?: EntityMaturityCheckResult[];
  /** The tier and progress to show for the entity as a whole. */
  headline: {
    rank: Rank;
    progress: CheckProgress;
    categories: CategoryProgress[];
    /** `children` when the headline combines the entities that belong to it. */
    source: 'own' | 'children';
  };
}

/**
 * An entity's scores. For a System, Domain or Group the maturity client
 * either combines the results of the entities that belong to it, or, with
 * `techInsights.maturity.enableCompoundEntityCheck`, runs the entity's own
 * checks; the per-entity rollup is fetched separately in both cases.
 */
export function useEntityScorecard(entity: Entity) {
  const api = useApi(maturityApiRef);
  const compound =
    useApi(configApiRef).getOptionalBoolean(
      'techInsights.maturity.enableCompoundEntityCheck',
    ) ?? false;
  const isRollupKind = ROLLUP_KINDS.includes(entity.kind);

  return useAsyncRetry(async (): Promise<EntityScorecard> => {
    const [score, children] = await Promise.all([
      api.getMaturityScore(entity),
      isRollupKind
        ? api.getChildMaturityCheckResults(entity)
        : Promise.resolve(undefined),
    ]);
    // Without compound checks, a rollup kind's score is its children's
    // results merged into one list, which can't be shown check by check.
    const ownChecks = !isRollupKind || compound ? score.checks : [];
    const useChildren = isRollupKind && compound && ownChecks.length === 0;
    const headlineChecks = useChildren
      ? (children ?? []).flatMap(c => c.checks)
      : score.checks;
    return {
      ownChecks,
      children,
      headline: {
        rank: useChildren ? rankOf(headlineChecks) : score.rank.rank,
        progress: progressOf(headlineChecks),
        categories: progressByCategory(headlineChecks),
        source:
          isRollupKind && !(compound && ownChecks.length) ? 'children' : 'own',
      },
    };
  }, [api, entity, compound, isRollupKind]);
}

/**
 * When each fact retriever's facts were last collected for the entity,
 * keyed by retriever id. Loaded apart from the scores so that a failure, or
 * a missing permission to read facts, only leaves the times out.
 */
export function useFactCollectionTimes(
  entity: Entity,
  checks: MaturityCheckResult[] | undefined,
) {
  const api = useApi(maturityApiRef);
  const retrieverIds = Array.from(
    new Set((checks ?? []).flatMap(c => c.check.factIds)),
  ).sort();
  const key = retrieverIds.join(',');

  return useAsync(async (): Promise<Record<string, string>> => {
    if (!key) return {};
    try {
      const facts = await api.getFacts(
        getCompoundEntityRef(entity),
        key.split(','),
      );
      return Object.fromEntries(
        Object.entries(facts).map(([id, fact]) => [id, fact.timestamp]),
      );
    } catch {
      return {};
    }
  }, [api, entity, key]).value;
}
