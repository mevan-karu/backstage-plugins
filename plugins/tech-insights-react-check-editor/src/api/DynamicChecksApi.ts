import { createApiRef } from '@backstage/core-plugin-api';
import type {
  DryRunResult,
  DynamicCheck,
  DynamicCheckInput,
  FactSchema,
} from './types';

/**
 * Client for the dynamic-checks HTTP API, mounted by
 * `tech-insights-backend-module-dynamic-checks` under the `tech-insights`
 * plugin's own base path.
 */
export interface DynamicChecksApi {
  listChecks(): Promise<DynamicCheck[]>;
  createCheck(input: DynamicCheckInput): Promise<DynamicCheck>;
  updateCheck(id: string, input: DynamicCheckInput): Promise<DynamicCheck>;
  deleteCheck(id: string): Promise<void>;
  publishCheck(id: string): Promise<void>;
  unpublishCheck(id: string): Promise<void>;
  dryRun(entityRef: string, check: DynamicCheckInput): Promise<DryRunResult>;
  /** Runtime-registered fact retrievers — see Guardrail 2 in the design doc: never hardcode this list. */
  listFactSchemas(): Promise<FactSchema[]>;
}

export const dynamicChecksApiRef = createApiRef<DynamicChecksApi>({
  id: 'plugin.tech-insights-check-editor.dynamic-checks-client',
});
