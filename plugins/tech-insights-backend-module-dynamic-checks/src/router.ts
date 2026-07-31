import { randomUUID } from 'crypto';
import express from 'express';
import Router from 'express-promise-router';
import type {
  AuthService,
  DiscoveryService,
  LoggerService,
} from '@backstage/backend-plugin-api';
import { parseEntityRef } from '@backstage/catalog-model';
import type { TechInsightJsonRuleCheck } from '@backstage-community/plugin-tech-insights-backend-module-jsonfc';
import { DynamicCheckRegistry } from './DynamicCheckRegistry';

interface RouterOptions {
  logger: LoggerService;
  registry: DynamicCheckRegistry;
  discovery: DiscoveryService;
  auth: AuthService;
}

function basicValidate(check: Partial<TechInsightJsonRuleCheck>): string | undefined {
  if (!check.name) return 'name is required';
  if (!Array.isArray(check.factIds) || check.factIds.length === 0) {
    return 'factIds must be a non-empty array';
  }
  if (!check.rule?.conditions) return 'rule.conditions is required';
  return undefined;
}

export async function createDynamicChecksRouter(
  options: RouterOptions,
): Promise<express.Router> {
  const { logger, registry, discovery, auth } = options;
  const router = Router();
  router.use(express.json());

  // Dry-run and any other in-process check evaluation goes through the same
  // running tech-insights checker via its own public HTTP endpoint, rather
  // than constructing a second FactChecker here — that endpoint is backed by
  // the real repository/fact store, which this module has no other way to
  // reach (the tech-insights-backend plugin builds it privately in its own
  // init and doesn't expose it as a service). One running checker instance,
  // reused for both live and dry-run evaluation.
  async function runChecksViaTechInsights(entity: string, checks: string[]) {
    const { namespace, kind, name } = parseEntityRef(entity);
    const baseUrl = await discovery.getBaseUrl('tech-insights');
    const { token } = await auth.getPluginRequestToken({
      onBehalfOf: await auth.getOwnServiceCredentials(),
      targetPluginId: 'tech-insights',
    });
    const res = await fetch(
      `${baseUrl}/checks/run/${namespace}/${kind}/${name}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ checks }),
      },
    );
    if (!res.ok) {
      throw new Error(`checks/run failed: ${res.status} ${await res.text()}`);
    }
    return res.json();
  }

  router.get('/dynamic-checks', async (_req, res) => {
    res.json(await registry.listAll());
  });

  router.post('/dynamic-checks', async (req, res) => {
    const check: TechInsightJsonRuleCheck = {
      type: 'json-rules-engine',
      ...req.body,
      id: req.body.id ?? randomUUID(),
    };
    const error = basicValidate(check);
    if (error) return res.status(400).json({ error });
    const created = await registry.register(check);
    return res.status(201).json(created);
  });

  router.put('/dynamic-checks/:id', async (req, res) => {
    const check: TechInsightJsonRuleCheck = {
      type: 'json-rules-engine',
      ...req.body,
      id: req.params.id,
    };
    const error = basicValidate(check);
    if (error) return res.status(400).json({ error });
    const updated = await registry.update(req.params.id, check);
    return res.json(updated);
  });

  router.delete('/dynamic-checks/:id', async (req, res) => {
    await registry.delete(req.params.id);
    res.status(204).end();
  });

  router.post('/dynamic-checks/:id/publish', async (req, res) => {
    await registry.publish(req.params.id);
    res.status(204).end();
  });

  router.post('/dynamic-checks/:id/unpublish', async (req, res) => {
    await registry.unpublish(req.params.id);
    res.status(204).end();
  });

  // Register the draft under a temporary id so it runs through the exact
  // same, already-running checker a saved check would (see
  // tech-insights-backend-module-dynamic-checks.md — this is what makes
  // dry-run and live evaluation provably identical, not just similar).
  router.post('/dynamic-checks/dry-run', async (req, res) => {
    const { entity, check } = req.body as {
      entity: string;
      check: Omit<TechInsightJsonRuleCheck, 'id'>;
    };
    const draft: TechInsightJsonRuleCheck = {
      ...check,
      type: check.type ?? 'json-rules-engine',
      id: `__dryrun__${randomUUID()}`,
    };
    const error = basicValidate(draft);
    if (error) return res.status(400).json({ error });
    await registry.register(draft);
    try {
      const [result] = await runChecksViaTechInsights(entity, [draft.id]);
      return res.json(result);
    } finally {
      await registry.delete(draft.id);
    }
  });

  logger.info('Dynamic checks router mounted');
  return router;
}
