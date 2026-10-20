import { randomUUID } from 'crypto';
import type { Entity } from '@backstage/catalog-model';
import type { TechInsightsStore } from '@backstage-community/plugin-tech-insights-node';
import type {
  JsonRulesEngineFactChecker,
  TechInsightJsonRuleCheck,
} from '@backstage-community/plugin-tech-insights-backend-module-jsonfc';
import type { DynamicCheckRegistry } from './DynamicCheckRegistry';

/** The running checker and the fact store tech-insights built it with. */
export interface CheckEvaluation {
  checker: JsonRulesEngineFactChecker;
  store: TechInsightsStore;
}

export type DryRunStatus = 'passed' | 'failed' | 'not-applicable' | 'invalid';

export type DryRunReasonCode =
  | 'unknown-retriever'
  | 'unknown-fact'
  | 'evaluation-error'
  | 'entity-filtered'
  | 'retriever-not-covering'
  | 'no-facts'
  | 'missing-fact-values'
  | 'no-result';

export interface DryRunReason {
  code: DryRunReasonCode;
  message: string;
  factRetrieverId?: string;
}

export interface DryRunResponse {
  status: DryRunStatus;
  entityRef: string;
  reasons: DryRunReason[];
  /** The rule's conditions with each leaf's `factResult` and `result`. */
  conditions?: unknown;
  /** Latest collection time per selected fact retriever, ISO 8601. */
  collectedAt: Record<string, string>;
}

type DraftCheck = Omit<TechInsightJsonRuleCheck, 'id'>;

const SCHEMA_METADATA_KEYS = new Set(['id', 'version', 'entityFilter']);

function factNamesIn(condition: unknown): string[] {
  if (!condition || typeof condition !== 'object') return [];
  const node = condition as Record<string, unknown>;
  if (Array.isArray(node.all)) return node.all.flatMap(factNamesIn);
  if (Array.isArray(node.any)) return node.any.flatMap(factNamesIn);
  if ('not' in node) return factNamesIn(node.not);
  if ('condition' in node) return [];
  return typeof node.fact === 'string' ? [node.fact] : [];
}

/*
 * Mirrors jsonfc's filter matching (dot paths, case-insensitive strings,
 * array values as any-of, an array of filters ORed). Used only to explain an
 * empty result; jsonfc itself decides what runs.
 */
function valueAt(entity: Entity, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (value, key) =>
        value && typeof value === 'object'
          ? (value as Record<string, unknown>)[key]
          : undefined,
      entity,
    );
}

function valuesMatch(entityValue: unknown, filterValue: unknown): boolean {
  if (Array.isArray(entityValue)) {
    return entityValue.some(v => valuesMatch(v, filterValue));
  }
  if (typeof entityValue === 'string' && typeof filterValue === 'string') {
    return entityValue.toLowerCase() === filterValue.toLowerCase();
  }
  return entityValue === filterValue;
}

function mismatchedKeys(
  entity: Entity,
  filter: Record<string, unknown>,
): string[] {
  return Object.entries(filter)
    .filter(([key, expected]) => {
      const actual = valueAt(entity, key);
      if (actual === undefined || actual === null) return true;
      const options = Array.isArray(expected) ? expected : [expected];
      return !options.some(option => valuesMatch(actual, option));
    })
    .map(([key]) => key);
}

function describeFilterMismatch(
  entity: Entity,
  filter: unknown,
): string | undefined {
  const filters = (Array.isArray(filter) ? filter : [filter]).filter(
    (f): f is Record<string, unknown> => !!f && typeof f === 'object',
  );
  if (filters.length === 0) return undefined;
  const mismatches = filters.map(f => ({
    filter: f,
    keys: mismatchedKeys(entity, f),
  }));
  if (mismatches.some(m => m.keys.length === 0)) return undefined;
  if (filters.length > 1) {
    return `matches none of the ${filters.length} alternatives`;
  }
  return mismatches[0].keys
    .map(key => {
      const actual = valueAt(entity, key);
      const expected = JSON.stringify(mismatches[0].filter[key]);
      return actual === undefined || actual === null
        ? `has no ${key} (expected ${expected})`
        : `has ${key} ${JSON.stringify(actual)} (expected ${expected})`;
    })
    .join(', ');
}

async function explainEmptyResult(
  check: DraftCheck,
  entity: Entity,
  entityRef: string,
  evaluation: CheckEvaluation,
  facts: Awaited<ReturnType<TechInsightsStore['getLatestFactsByIds']>>,
): Promise<DryRunReason[]> {
  const filterMismatch = check.filter
    ? describeFilterMismatch(entity, check.filter)
    : undefined;
  if (filterMismatch) {
    return [
      {
        code: 'entity-filtered',
        message: `The check's "Applies to" filter excludes ${entityRef}: it ${filterMismatch}.`,
      },
    ];
  }

  const reasons: DryRunReason[] = [];
  const schemas = await evaluation.store.getLatestSchemas(check.factIds);
  const referenced = new Set(factNamesIn(check.rule.conditions));

  for (const factRetrieverId of check.factIds) {
    const schema = schemas.find(s => s.id === (factRetrieverId as unknown));
    const coverage = schema?.entityFilter
      ? describeFilterMismatch(entity, schema.entityFilter)
      : undefined;
    if (coverage) {
      reasons.push({
        code: 'retriever-not-covering',
        factRetrieverId,
        message: `${factRetrieverId} doesn't collect facts for ${entityRef}: the entity ${coverage}.`,
      });
      continue;
    }
    const collected = facts[factRetrieverId];
    if (!collected) {
      reasons.push({
        code: 'no-facts',
        factRetrieverId,
        message: `${factRetrieverId} has no facts for ${entityRef}. Either it hasn't run since this entity appeared, or it skipped the entity because something it needs, such as an annotation or credentials, is missing.`,
      });
      continue;
    }
    const provided = Object.keys(schema ?? {}).filter(
      name => !SCHEMA_METADATA_KEYS.has(name),
    );
    const missing = provided.filter(
      name => referenced.has(name) && !(name in collected.facts),
    );
    if (missing.length > 0) {
      reasons.push({
        code: 'missing-fact-values',
        factRetrieverId,
        message: `${factRetrieverId} collected facts for ${entityRef} but didn't report ${missing.join(
          ', ',
        )}.`,
      });
    }
  }

  return reasons.length > 0
    ? reasons
    : [
        {
          code: 'no-result',
          message: `The check produced no result for ${entityRef}.`,
        },
      ];
}

/**
 * Checks the draft's retrievers and fact references against the fact
 * schemas, registers it under a temporary id, runs it through the same
 * checker that evaluates published checks, and explains an empty result.
 */
export async function dryRunCheck(options: {
  check: DraftCheck;
  entity: Entity;
  entityRef: string;
  evaluation: CheckEvaluation;
  registry: DynamicCheckRegistry;
}): Promise<DryRunResponse> {
  const { check, entity, entityRef, evaluation, registry } = options;
  const facts = await evaluation.store.getLatestFactsByIds(
    check.factIds,
    entityRef,
  );
  const collectedAt: Record<string, string> = {};
  for (const [id, fact] of Object.entries(facts)) {
    const iso = fact.timestamp?.toISO();
    if (iso) collectedAt[id] = iso;
  }
  const respond = (
    status: DryRunStatus,
    reasons: DryRunReason[],
    conditions?: unknown,
  ): DryRunResponse => ({
    status,
    entityRef,
    reasons,
    conditions,
    collectedAt,
  });

  const schemas = await evaluation.store.getLatestSchemas(check.factIds);
  const knownRetrievers = new Set(schemas.map(s => String(s.id)));
  const unknownRetrievers = check.factIds.filter(
    id => !knownRetrievers.has(id),
  );
  if (unknownRetrievers.length > 0) {
    return respond(
      'invalid',
      unknownRetrievers.map(factRetrieverId => ({
        code: 'unknown-retriever',
        factRetrieverId,
        message: `No fact retriever named ${factRetrieverId} is registered.`,
      })),
    );
  }

  const provided = new Set(schemas.flatMap(s => Object.keys(s)));
  const unknownFacts = [...new Set(factNamesIn(check.rule.conditions))].filter(
    name => !provided.has(name),
  );
  if (unknownFacts.length > 0) {
    const allSchemas = await evaluation.store.getLatestSchemas();
    return respond(
      'invalid',
      unknownFacts.map(name => {
        const owner = allSchemas.find(
          s => name in s && !SCHEMA_METADATA_KEYS.has(name),
        );
        return {
          code: 'unknown-fact' as const,
          ...(owner && { factRetrieverId: String(owner.id) }),
          message: owner
            ? `Fact ${name} comes from ${owner.id}, which isn't selected for this check.`
            : `No registered fact retriever provides a fact named ${name}.`,
        };
      }),
    );
  }

  const draft: TechInsightJsonRuleCheck = {
    ...check,
    type: check.type ?? 'json-rules-engine',
    id: `__dryrun__${randomUUID()}`,
  };
  await registry.register(draft);
  let results;
  try {
    results = await evaluation.checker.runChecks(entityRef, [draft.id]);
  } catch (e) {
    return respond('invalid', [
      { code: 'evaluation-error', message: (e as Error).message },
    ]);
  } finally {
    await registry.delete(draft.id);
  }

  const [result] = results;
  if (result) {
    return respond(
      result.result ? 'passed' : 'failed',
      [],
      result.check.rule?.conditions,
    );
  }
  return respond(
    'not-applicable',
    await explainEmptyResult(check, entity, entityRef, evaluation, facts),
  );
}
