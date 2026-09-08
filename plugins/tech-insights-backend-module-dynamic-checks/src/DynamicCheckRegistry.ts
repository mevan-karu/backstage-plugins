import { ConflictError, NotFoundError } from '@backstage/errors';
import type { DatabaseService } from '@backstage/backend-plugin-api';
import type { TechInsightCheckRegistry } from '@backstage-community/plugin-tech-insights-node';
import type { TechInsightJsonRuleCheck } from '@backstage-community/plugin-tech-insights-backend-module-jsonfc';

// Sourced from DatabaseService's own return type rather than importing the
// `knex` package directly — this package's own resolution of `knex` can end
// up as a structurally-identical but nominally distinct type from the one
// bundled with @backstage/backend-plugin-api, which TypeScript then treats
// as incompatible. Deriving the type this way guarantees a single source.
type Knex = Awaited<ReturnType<DatabaseService['getClient']>>;

const TABLE = 'dynamic_checks';

export type CheckStatus = 'draft' | 'published';

interface Row {
  id: string;
  type: string;
  name: string;
  description: string | null;
  fact_ids: string;
  metadata: string | null;
  filter: string | null;
  rule: string;
  status: CheckStatus;
}

function rowToCheck(row: Row): TechInsightJsonRuleCheck {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    description: row.description ?? '',
    factIds: JSON.parse(row.fact_ids),
    // Never undefined: @backstage-community/plugin-tech-insights-maturity's
    // ScoringDataFormatter reads check.metadata.rank/.category with no
    // null-guard — a check with neither set would otherwise crash the
    // maturity computation for every entity it runs against.
    metadata: row.metadata ? JSON.parse(row.metadata) : {},
    filter: row.filter ? JSON.parse(row.filter) : undefined,
    rule: JSON.parse(row.rule),
  };
}

function checkToRow(check: TechInsightJsonRuleCheck, status: CheckStatus) {
  return {
    id: check.id,
    type: check.type,
    name: check.name,
    description: check.description ?? null,
    fact_ids: JSON.stringify(check.factIds),
    metadata: check.metadata ? JSON.stringify(check.metadata) : null,
    filter: check.filter ? JSON.stringify(check.filter) : null,
    rule: JSON.stringify(check.rule),
    status,
  };
}

/**
 * DB-backed check registry, replacing app-config.yaml-defined checks.
 *
 * Satisfies TechInsightCheckRegistry (register/get/getAll/list) so it can be
 * handed straight to JsonRulesEngineFactCheckerFactory as its checkRegistry —
 * reusing that class's evaluation logic verbatim rather than reimplementing
 * json-rules-engine evaluation. update/delete/publish/listAll are additive,
 * not part of the upstream interface.
 */
export class DynamicCheckRegistry
  implements TechInsightCheckRegistry<TechInsightJsonRuleCheck>
{
  constructor(private readonly db: Knex) {}

  async register(check: TechInsightJsonRuleCheck): Promise<TechInsightJsonRuleCheck> {
    const existing = await this.db(TABLE).where({ id: check.id }).first();
    if (existing) {
      throw new ConflictError(`Check '${check.id}' is already registered.`);
    }
    await this.db(TABLE).insert(checkToRow(check, 'draft'));
    return check;
  }

  async update(
    checkId: string,
    check: TechInsightJsonRuleCheck,
  ): Promise<TechInsightJsonRuleCheck> {
    const existing = await this.db(TABLE).where({ id: checkId }).first();
    if (!existing) {
      throw new NotFoundError(`Check '${checkId}' is not registered.`);
    }
    await this.db(TABLE)
      .where({ id: checkId })
      .update({
        ...checkToRow(check, existing.status),
        updated_at: this.db.fn.now(),
      });
    return check;
  }

  async publish(checkId: string): Promise<void> {
    const count = await this.db(TABLE)
      .where({ id: checkId })
      .update({ status: 'published', updated_at: this.db.fn.now() });
    if (!count) {
      throw new NotFoundError(`Check '${checkId}' is not registered.`);
    }
  }

  /** Reverts a published check to draft — removes it from `list()`, so it
   * stops being evaluated for every entity until published again. */
  async unpublish(checkId: string): Promise<void> {
    const count = await this.db(TABLE)
      .where({ id: checkId })
      .update({ status: 'draft', updated_at: this.db.fn.now() });
    if (!count) {
      throw new NotFoundError(`Check '${checkId}' is not registered.`);
    }
  }

  async delete(checkId: string): Promise<void> {
    await this.db(TABLE).where({ id: checkId }).delete();
  }

  async get(checkId: string): Promise<TechInsightJsonRuleCheck> {
    const row = await this.db(TABLE).where({ id: checkId }).first();
    if (!row) {
      throw new NotFoundError(`Check '${checkId}' is not registered.`);
    }
    return rowToCheck(row);
  }

  async getAll(checks: string[]): Promise<TechInsightJsonRuleCheck[]> {
    const rows = await this.db(TABLE).whereIn('id', checks);
    return rows.map(rowToCheck);
  }

  /** Published checks only — this is what live scheduled evaluation sees. */
  async list(): Promise<TechInsightJsonRuleCheck[]> {
    const rows = await this.db(TABLE).where({ status: 'published' });
    return rows.map(rowToCheck);
  }

  /** Draft + published — for the check-editor UI's list view. */
  async listAll(): Promise<Array<TechInsightJsonRuleCheck & { status: CheckStatus }>> {
    const rows: Row[] = await this.db(TABLE).select();
    return rows.map(row => ({ ...rowToCheck(row), status: row.status }));
  }
}
