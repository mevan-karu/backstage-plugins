import { DiscoveryApi, FetchApi } from '@backstage/core-plugin-api';
import type { DynamicChecksApi } from './DynamicChecksApi';
import type {
  DryRunResult,
  DynamicCheck,
  DynamicCheckInput,
  FactSchema,
} from './types';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

export class DynamicChecksClient implements DynamicChecksApi {
  constructor(
    private readonly discovery: DiscoveryApi,
    private readonly fetchApi: FetchApi,
  ) {}

  private async apiFetch<T = unknown>(
    endpoint: string,
    options?: { method?: HttpMethod; body?: unknown },
  ): Promise<T> {
    const baseUrl = await this.discovery.getBaseUrl('tech-insights');
    const response = await this.fetchApi.fetch(`${baseUrl}${endpoint}`, {
      method: options?.method ?? 'GET',
      headers: options?.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed (${response.status}): ${errorText}`);
    }

       if (response.status === 204) {
      return undefined as T;
    }
    const text = await response.text();
    if (!text) {
      return undefined as T;
    }
    return JSON.parse(text) as T;

  }

  async listChecks(): Promise<DynamicCheck[]> {
    return this.apiFetch<DynamicCheck[]>('/dynamic-checks');
  }

  async createCheck(input: DynamicCheckInput): Promise<DynamicCheck> {
    return this.apiFetch<DynamicCheck>('/dynamic-checks', {
      method: 'POST',
      body: input,
    });
  }

  async updateCheck(id: string, input: DynamicCheckInput): Promise<DynamicCheck> {
    return this.apiFetch<DynamicCheck>(`/dynamic-checks/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: input,
    });
  }

  async deleteCheck(id: string): Promise<void> {
    await this.apiFetch<void>(`/dynamic-checks/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  async publishCheck(id: string): Promise<void> {
    await this.apiFetch<void>(`/dynamic-checks/${encodeURIComponent(id)}/publish`, {
      method: 'POST',
    });
  }

  async unpublishCheck(id: string): Promise<void> {
    await this.apiFetch<void>(`/dynamic-checks/${encodeURIComponent(id)}/unpublish`, {
      method: 'POST',
    });
  }

  async dryRun(entityRef: string, check: DynamicCheckInput): Promise<DryRunResult> {
    return this.apiFetch<DryRunResult>('/dynamic-checks/dry-run', {
      method: 'POST',
      body: { entity: entityRef, check },
    });
  }

  async listFactSchemas(): Promise<FactSchema[]> {
    return this.apiFetch<FactSchema[]>('/fact-schemas');
  }
}
