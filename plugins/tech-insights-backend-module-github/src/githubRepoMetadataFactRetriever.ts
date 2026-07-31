import { CatalogClient } from '@backstage/catalog-client';
import { ScmIntegrations } from '@backstage/integration';
import { DateTime } from 'luxon';
import type { FactRetriever } from '@backstage-community/plugin-tech-insights-node';

const GITHUB_PROJECT_SLUG_ANNOTATION = 'github.com/project-slug';

export const githubRepoMetadataFactRetriever: FactRetriever = {
  id: 'githubRepoMetadataFactRetriever',
  version: '0.1.0',
  title: 'GitHub Repository Metadata',
  description:
    'Facts about the state of the GitHub repository backing a component, read directly from the GitHub REST API.',
  entityFilter: [{ kind: 'component' }],
  // Field names are prefixed because the checker merges every retriever's
  // facts into one flat namespace keyed by field name (confirmed by reading
  // JsonRulesEngineFactChecker.runChecks) — a bare `isArchived` would collide
  // with any other retriever that happens to define the same field name.
  schema: {
    githubIsArchived: {
      type: 'boolean',
      description: 'Whether the repository is archived',
    },
    githubVisibility: {
      type: 'string',
      description: 'Repository visibility: public, private, or internal',
    },
    githubOpenIssuesCount: {
      type: 'integer',
      description: 'Number of open issues on the repository',
    },
  },
  handler: async ({ config, discovery, auth, entityFilter }) => {
    const integrations = ScmIntegrations.fromConfig(config);
    const github = integrations.github.byHost('github.com');
    const apiBaseUrl = github?.config.apiBaseUrl ?? 'https://api.github.com';
    const token = github?.config.token;

    const { token: catalogToken } = await auth.getPluginRequestToken({
      onBehalfOf: await auth.getOwnServiceCredentials(),
      targetPluginId: 'catalog',
    });
    const catalogClient = new CatalogClient({ discoveryApi: discovery });
    const entities = await catalogClient.getEntities(
      { filter: entityFilter },
      { token: catalogToken },
    );

    const results = [];
    for (const entity of entities.items) {
      const slug =
        entity.metadata.annotations?.[GITHUB_PROJECT_SLUG_ANNOTATION];
      if (!slug) {
        // No repo configured for this component — omit it entirely rather
        // than emitting a fallback/default value, so its scorecard skips
        // this check instead of showing a false failure.
        continue;
      }

      const response = await fetch(`${apiBaseUrl}/repos/${slug}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        // Repo unreachable (bad slug, private without a token, etc.) — skip
        // rather than guess, same missing-data rule as above.
        continue;
      }
      const repo = await response.json();

      results.push({
        entity: {
          namespace: entity.metadata.namespace ?? 'default',
          kind: entity.kind,
          name: entity.metadata.name,
        },
        facts: {
          githubIsArchived: Boolean(repo.archived),
          githubVisibility: String(repo.visibility ?? 'public'),
          githubOpenIssuesCount: Number(repo.open_issues_count ?? 0),
        },
        timestamp: DateTime.now(),
      });
    }
    return results;
  },
};
