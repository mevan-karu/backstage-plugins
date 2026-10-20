import { CatalogClient } from '@backstage/catalog-client';
import { stringifyEntityRef, type Entity } from '@backstage/catalog-model';
import { ScmIntegrations } from '@backstage/integration';
import { DateTime } from 'luxon';
import type {
  FactRetrieverContext,
  TechInsightFact,
} from '@backstage-community/plugin-tech-insights-node';
import {
  createGithubApi,
  GithubRateLimitError,
  type GithubApi,
} from './githubApi';
import { readGithubFactsOptions, type GithubFactsOptions } from './options';
import { resolveGithubRepository, type GithubRepository } from './repository';

export interface GithubFactCollectorInput {
  entity: Entity;
  repository: GithubRepository;
  api: GithubApi;
  options: GithubFactsOptions;
}

/**
 * Runs `collect` for every catalog entity matching the retriever's filter
 * that resolves to a GitHub repository.
 *
 * Failures are contained per entity: tech-insights stores nothing for a run
 * whose handler throws, so one unreachable repository must not discard the
 * facts of every other entity. An entity whose facts cannot be determined is
 * left out of the result, which makes checks skip it rather than fail it.
 * A rate-limit error ends the run early with the facts collected so far.
 */
export async function collectGithubFacts(
  context: FactRetrieverContext,
  collect: (
    input: GithubFactCollectorInput,
  ) => Promise<TechInsightFact['facts'] | undefined>,
): Promise<TechInsightFact[]> {
  const { config, discovery, auth, logger, entityFilter } = context;
  const integrations = ScmIntegrations.fromConfig(config);
  const options = readGithubFactsOptions(config);
  const api = createGithubApi(integrations);

  const { token } = await auth.getPluginRequestToken({
    onBehalfOf: await auth.getOwnServiceCredentials(),
    targetPluginId: 'catalog',
  });
  const { items } = await new CatalogClient({
    discoveryApi: discovery,
  }).getEntities({ filter: entityFilter }, { token });

  const results: TechInsightFact[] = [];
  for (const entity of items) {
    const entityRef = stringifyEntityRef(entity);
    try {
      const repository = resolveGithubRepository(
        entity,
        integrations,
        options.repoAnnotations,
      );
      if (!repository) {
        continue;
      }
      const facts = await collect({ entity, repository, api, options });
      if (!facts) {
        continue;
      }
      results.push({
        entity: {
          namespace: entity.metadata.namespace ?? 'default',
          kind: entity.kind,
          name: entity.metadata.name,
        },
        facts,
        timestamp: DateTime.now(),
      });
    } catch (error) {
      if (error instanceof GithubRateLimitError) {
        logger.warn(
          `${error.message}; stopping after ${results.length} entities, the rest are retried next run`,
        );
        break;
      }
      logger.warn(`Skipping ${entityRef}: ${(error as Error).message}`);
    }
  }
  return results;
}
