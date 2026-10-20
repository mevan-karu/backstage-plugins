import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { configApiRef } from '@backstage/core-plugin-api';
import { ConfigReader } from '@backstage/core-app-api';
import { TestApiProvider } from '@backstage/test-utils';
import type { Entity } from '@backstage/catalog-model';
import { maturityApiRef } from '@backstage-community/plugin-tech-insights-maturity';
import type { MaturityCheckResult } from '@backstage-community/plugin-tech-insights-maturity-common';
import { useEntityScorecard } from './useEntityScorecard';

function result(rank: number, passed: boolean): MaturityCheckResult {
  return {
    result: passed,
    facts: {},
    check: {
      id: `check-${rank}-${passed}`,
      type: 'json-rules-engine',
      name: 'check',
      description: '',
      factIds: [],
      metadata: { rank, category: 'Security', solution: '', exp: 0 },
    },
  } as MaturityCheckResult;
}

const system: Entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'System',
  metadata: { name: 'payments', namespace: 'default' },
};
const component: Entity = { ...system, kind: 'Component' };

const childResults = [
  {
    entity: 'component:default/api',
    rank: 3,
    isMaxRank: true,
    checks: [result(1, true), result(3, true)],
  },
  {
    entity: 'component:default/worker',
    rank: 0,
    isMaxRank: false,
    checks: [result(1, false), result(3, true)],
  },
];

function setup(options: {
  compound: boolean;
  scoreChecks: MaturityCheckResult[];
  scoreRank: number;
}) {
  const maturityApi = {
    getMaturityScore: jest.fn().mockResolvedValue({
      checks: options.scoreChecks,
      rank: { rank: options.scoreRank, isMaxRank: false },
      summary: {},
    }),
    getChildMaturityCheckResults: jest.fn().mockResolvedValue(childResults),
  };
  const config = new ConfigReader({
    techInsights: {
      maturity: { enableCompoundEntityCheck: options.compound },
    },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <TestApiProvider
      apis={[
        [maturityApiRef, maturityApi],
        [configApiRef, config],
      ]}
    >
      {children}
    </TestApiProvider>
  );
  return { maturityApi, wrapper };
}

describe('useEntityScorecard', () => {
  it('lists a component’s own checks and fetches no children', async () => {
    const checks = [result(1, true), result(2, false)];
    const { maturityApi, wrapper } = setup({
      compound: false,
      scoreChecks: checks,
      scoreRank: 1,
    });
    const { result: hook } = renderHook(() => useEntityScorecard(component), {
      wrapper,
    });
    await waitFor(() => expect(hook.current.value).toBeDefined());
    expect(hook.current.value).toMatchObject({
      ownChecks: checks,
      children: undefined,
      headline: { rank: 1, source: 'own' },
    });
    expect(maturityApi.getChildMaturityCheckResults).not.toHaveBeenCalled();
  });

  it('shows a system’s merged children, not a check list, without compound checks', async () => {
    const merged = childResults.flatMap(c => c.checks);
    const { wrapper } = setup({
      compound: false,
      scoreChecks: merged,
      scoreRank: 0,
    });
    const { result: hook } = renderHook(() => useEntityScorecard(system), {
      wrapper,
    });
    await waitFor(() => expect(hook.current.value).toBeDefined());
    expect(hook.current.value).toMatchObject({
      ownChecks: [],
      children: childResults,
      headline: {
        rank: 0,
        source: 'children',
        progress: { passedChecks: 3, totalChecks: 4 },
      },
    });
  });

  it('shows a system’s own checks with compound checks', async () => {
    const own = [result(1, true), result(2, true)];
    const { wrapper } = setup({
      compound: true,
      scoreChecks: own,
      scoreRank: 2,
    });
    const { result: hook } = renderHook(() => useEntityScorecard(system), {
      wrapper,
    });
    await waitFor(() => expect(hook.current.value).toBeDefined());
    expect(hook.current.value).toMatchObject({
      ownChecks: own,
      children: childResults,
      headline: { rank: 2, source: 'own' },
    });
  });

  it('combines a system’s children when it has no checks of its own', async () => {
    const { wrapper } = setup({
      compound: true,
      scoreChecks: [],
      scoreRank: 0,
    });
    const { result: hook } = renderHook(() => useEntityScorecard(system), {
      wrapper,
    });
    await waitFor(() => expect(hook.current.value).toBeDefined());
    // The worker's failing Bronze check caps the combined tier at Stone.
    expect(hook.current.value).toMatchObject({
      ownChecks: [],
      headline: {
        rank: 0,
        source: 'children',
        progress: { passedChecks: 3, totalChecks: 4 },
      },
    });
  });
});
