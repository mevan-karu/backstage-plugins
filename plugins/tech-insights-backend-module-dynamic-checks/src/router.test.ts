import express from 'express';
import request from 'supertest';
import { mockErrorHandler, mockServices } from '@backstage/backend-test-utils';
import { ConflictError } from '@backstage/errors';
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import type { CatalogService } from '@backstage/plugin-catalog-node';
import type { DynamicCheckRegistry } from './DynamicCheckRegistry';
import type { CheckEvaluation } from './dryRun';
import { createDynamicChecksRouter } from './router';

function setup(options: {
  result: AuthorizeResult.ALLOW | AuthorizeResult.DENY;
  triggerTask?: jest.Mock;
}) {
  const registry = {
    listAll: jest.fn().mockResolvedValue([]),
    register: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    publish: jest.fn().mockResolvedValue(undefined),
    unpublish: jest.fn(),
  } as unknown as DynamicCheckRegistry;
  const scheduler = mockServices.scheduler.mock({
    triggerTask: options.triggerTask ?? jest.fn().mockResolvedValue(undefined),
  });
  const evaluation = {
    checker: {},
    store: {
      getLatestSchemas: jest
        .fn()
        .mockImplementation(async (ids: string[]) =>
          ids.includes('githubRepoMetadataFactRetriever')
            ? [{ id: 'githubRepoMetadataFactRetriever' }]
            : [],
        ),
    },
  } as unknown as CheckEvaluation;

  return createDynamicChecksRouter({
    logger: mockServices.logger.mock(),
    registry,
    catalog: {} as CatalogService,
    httpAuth: mockServices.httpAuth(),
    permissions: mockServices.permissions({ result: options.result }),
    scheduler,
    getEvaluation: () => evaluation,
  }).then(router => ({
    app: express().use(router).use(mockErrorHandler()),
    registry,
    scheduler,
  }));
}

describe('createDynamicChecksRouter permissions', () => {
  it('lists checks when allowed', async () => {
    const { app } = await setup({ result: AuthorizeResult.ALLOW });
    const response = await request(app).get('/dynamic-checks');
    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it.each([
    ['get', '/dynamic-checks'],
    ['post', '/dynamic-checks'],
    ['put', '/dynamic-checks/check-1'],
    ['delete', '/dynamic-checks/check-1'],
    ['post', '/dynamic-checks/check-1/publish'],
    ['post', '/dynamic-checks/check-1/unpublish'],
    ['post', '/dynamic-checks/dry-run'],
    [
      'post',
      '/dynamic-checks/fact-retrievers/githubRepoMetadataFactRetriever/trigger',
    ],
  ] as const)('denies %s %s without the permission', async (method, path) => {
    const { app, registry } = await setup({ result: AuthorizeResult.DENY });
    const response = await request(app)[method](path).send({});
    expect(response.status).toBe(403);
    expect(registry.publish).not.toHaveBeenCalled();
  });
});

describe('POST /dynamic-checks/fact-retrievers/:id/trigger', () => {
  it('starts a registered fact retriever', async () => {
    const { app, scheduler } = await setup({ result: AuthorizeResult.ALLOW });
    const response = await request(app).post(
      '/dynamic-checks/fact-retrievers/githubRepoMetadataFactRetriever/trigger',
    );
    expect(response.status).toBe(202);
    expect(scheduler.triggerTask).toHaveBeenCalledWith(
      'githubRepoMetadataFactRetriever',
    );
  });

  it('refuses a task that is not a fact retriever', async () => {
    const { app, scheduler } = await setup({ result: AuthorizeResult.ALLOW });
    const response = await request(app).post(
      '/dynamic-checks/fact-retrievers/some-other-task/trigger',
    );
    expect(response.status).toBe(404);
    expect(scheduler.triggerTask).not.toHaveBeenCalled();
  });

  it('reports a run already in progress as a conflict', async () => {
    const { app } = await setup({
      result: AuthorizeResult.ALLOW,
      triggerTask: jest
        .fn()
        .mockRejectedValue(new ConflictError('Task is currently running')),
    });
    const response = await request(app).post(
      '/dynamic-checks/fact-retrievers/githubRepoMetadataFactRetriever/trigger',
    );
    expect(response.status).toBe(409);
  });
});

describe('POST /dynamic-checks', () => {
  const check = {
    name: 'Default branch protected',
    factIds: ['githubBranchProtectionFactRetriever'],
    metadata: { rank: 1, category: 'Security', solution: 'Protect it.' },
    rule: {
      conditions: {
        all: [{ fact: 'branchProtected', operator: 'equal', value: true }],
      },
    },
  };

  it('stores links and success and failure metadata', async () => {
    const { app, registry } = await setup({ result: AuthorizeResult.ALLOW });
    (registry.register as jest.Mock).mockImplementation(async c => c);
    const body = {
      ...check,
      links: [{ title: 'Branch protection', url: 'https://docs.github.com/' }],
      successMetadata: { message: 'Protected.' },
      failureMetadata: { message: 'Not protected.' },
    };
    const response = await request(app).post('/dynamic-checks').send(body);
    expect(response.status).toBe(201);
    expect(registry.register).toHaveBeenCalledWith(
      expect.objectContaining({
        links: body.links,
        successMetadata: body.successMetadata,
        failureMetadata: body.failureMetadata,
      }),
    );
  });

  it.each([
    ['a link without a URL', { links: [{ title: 'Docs', url: '' }] }],
    ['links that are not an array', { links: { title: 'Docs' } }],
    ['failure metadata that is not an object', { failureMetadata: 'x' }],
    ['a rank in success metadata', { successMetadata: { rank: 3 } }],
    ['a category in failure metadata', { failureMetadata: { category: 'X' } }],
  ])('rejects %s', async (_label, extra) => {
    const { app, registry } = await setup({ result: AuthorizeResult.ALLOW });
    const response = await request(app)
      .post('/dynamic-checks')
      .send({ ...check, ...extra });
    expect(response.status).toBe(400);
    expect(registry.register).not.toHaveBeenCalled();
  });
});
