import useAsync from 'react-use/lib/useAsync';
import { useApi } from '@backstage/core-plugin-api';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { stringifyEntityRef, type Entity } from '@backstage/catalog-model';
import { maturityApiRef } from '@backstage-community/plugin-tech-insights-maturity';
import {
  Rank,
  type EntityMaturityCheckResult,
} from '@backstage-community/plugin-tech-insights-maturity-common';

export interface EntityScore {
  entity: Entity;
  rank: Rank;
  passedChecks: number;
  totalChecks: number;
  percentage: number;
}

/**
 * The client's bulk call loops with `i <= entities.length` in steps of 750,
 * so a list whose length is a multiple of 750 also sends `entities: []`,
 * which the backend treats as "every entity with facts". Chunks below 750
 * never hit that.
 */
const BULK_CHUNK_SIZE = 500;

const ENTITY_FIELDS = [
  'kind',
  'metadata.name',
  'metadata.namespace',
  'metadata.title',
  'spec.type',
];

/**
 * Scores for every catalog entity of the given kinds, evaluated through the
 * tech-insights bulk `POST /checks/run` endpoint so the fan-out happens
 * server-side rather than as one browser request per entity. `refreshKey`
 * re-runs the evaluation after checks or facts change; nothing is evaluated
 * until `enabled` is true.
 */
export function useScoreResults(
  kinds: string[],
  refreshKey: number,
  enabled: boolean,
) {
  const catalogApi = useApi(catalogApiRef);
  const maturityApi = useApi(maturityApiRef);
  const kindsKey = kinds.join(',');

  return useAsync(async (): Promise<EntityScore[] | undefined> => {
    if (!enabled) {
      return undefined;
    }
    const { items } = await catalogApi.getEntities({
      filter: { kind: kindsKey.split(',') },
      fields: ENTITY_FIELDS,
    });
    if (items.length === 0) {
      return [];
    }

    const byRef = new Map<string, EntityMaturityCheckResult>();
    for (let i = 0; i < items.length; i += BULK_CHUNK_SIZE) {
      const results = await maturityApi.getBulkMaturityCheckResults(
        items.slice(i, i + BULK_CHUNK_SIZE),
      );
      results.forEach(result => byRef.set(result.entity, result));
    }

    return items.map(entity => {
      const result = byRef.get(stringifyEntityRef(entity));
      const checks = result?.checks ?? [];
      const passedChecks = checks.filter(check => check.result).length;
      const totalChecks = checks.length;
      return {
        entity,
        rank: result?.rank ?? Rank.Stone,
        passedChecks,
        totalChecks,
        percentage:
          totalChecks === 0
            ? 0
            : Math.round((passedChecks / totalChecks) * 100),
      };
    });
  }, [catalogApi, maturityApi, kindsKey, refreshKey, enabled]);
}
