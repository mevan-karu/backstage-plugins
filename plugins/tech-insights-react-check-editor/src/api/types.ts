export type CheckStatus = 'draft' | 'published';

export interface DynamicCheckRule {
  conditions: unknown;
}

export interface DynamicCheck {
  id: string;
  type: string;
  name: string;
  description?: string;
  factIds: string[];
  metadata?: Record<string, unknown>;
  filter?: unknown;
  rule: DynamicCheckRule;
  status?: CheckStatus;
}

export interface DynamicCheckInput {
  name: string;
  description?: string;
  factIds: string[];
  metadata?: Record<string, unknown>;
  filter?: unknown;
  rule: DynamicCheckRule;
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

export interface DryRunResult {
  facts: Record<string, { value: unknown; type: string; description?: string }>;
  result: boolean | null;
  check: DynamicCheck;
}
