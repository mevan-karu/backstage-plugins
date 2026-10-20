export type CheckStatus = 'draft' | 'published';

export interface DynamicCheckRule {
  conditions: unknown;
}

export interface CheckLink {
  title: string;
  url: string;
}

export interface DynamicCheckInput {
  name: string;
  description?: string;
  factIds: string[];
  /** `rank` and `category` place the check; `solution` says how to pass it. */
  metadata?: Record<string, unknown>;
  filter?: unknown;
  rule: DynamicCheckRule;
  links?: CheckLink[];
  /** Merged into `metadata` in the results of entities that pass. */
  successMetadata?: Record<string, unknown>;
  /** Merged into `metadata` in the results of entities that fail. */
  failureMetadata?: Record<string, unknown>;
}

export interface DynamicCheck extends DynamicCheckInput {
  id: string;
  type: string;
  status?: CheckStatus;
}

export interface FactSchemaField {
  type: string;
  description?: string;
}

/**
 * One registered fact retriever's schema, as returned by the host
 * tech-insights plugin's own `/fact-schemas` endpoint. Fact names are
 * dynamic keys alongside the fixed `id`/`version`/`entityFilter` fields —
 * see `factFieldsOf` for how callers pull just the fact names back out.
 */
export interface FactSchema {
  id: string;
  version: string;
  entityFilter?: unknown;
  [factName: string]: unknown;
}

const FACT_SCHEMA_FIXED_KEYS = new Set(['id', 'version', 'entityFilter']);

export function factFieldsOf(
  schema: FactSchema,
): Array<{ name: string; field: FactSchemaField }> {
  return Object.entries(schema)
    .filter(([key]) => !FACT_SCHEMA_FIXED_KEYS.has(key))
    .map(([name, field]) => ({ name, field: field as FactSchemaField }));
}

/**
 * A fact retriever's scheduled collection task, as reported by the host
 * plugin's scheduler (`/.backstage/scheduler/v1/tasks`). The schedule is
 * read-only here; it is set by platform configuration.
 */
export interface FactCollector {
  /** The fact retriever id, which is also its scheduler task id. */
  id: string;
  /** Cron expression the collection runs on. */
  cadence?: string;
  status: 'idle' | 'running';
  nextRunAt?: string;
  startedAt?: string;
  lastRunEndedAt?: string;
}

export type TriggerCollectionResult = 'started' | 'already-running';

/**
 * `not-applicable`: the check produced no result for the entity (filtered
 * out, or facts missing). `invalid`: the check can't be evaluated as written.
 */
export type DryRunStatus = 'passed' | 'failed' | 'not-applicable' | 'invalid';

export interface DryRunReason {
  code:
    | 'unknown-retriever'
    | 'unknown-fact'
    | 'evaluation-error'
    | 'entity-filtered'
    | 'retriever-not-covering'
    | 'no-facts'
    | 'missing-fact-values'
    | 'no-result';
  message: string;
  factRetrieverId?: string;
}

export interface DryRunResult {
  status: DryRunStatus;
  entityRef: string;
  reasons: DryRunReason[];
  /**
   * The rule's conditions as evaluated: `all`/`any`/`not` nodes, with each
   * leaf condition carrying its `factResult` and `result`.
   */
  conditions?: unknown;
  /** Latest collection time per selected fact retriever, ISO 8601. */
  collectedAt: Record<string, string>;
}
