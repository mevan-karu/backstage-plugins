import { CatalogClient } from '@backstage/catalog-client';
import { ScmIntegrations } from '@backstage/integration';
import { DateTime } from 'luxon';
import type { FactRetriever } from '@backstage-community/plugin-tech-insights-node';

const GITHUB_PROJECT_SLUG_ANNOTATION = 'github.com/project-slug';
const GITHUB_BRANCH_PROTECTION_TARGET_ANNOTATION =
  'github.com/branch-protection-target';

export const githubRepoMetadataFactRetriever: FactRetriever = {
  id: 'githubRepoMetadataFactRetriever',
  version: '0.3.0',
  // Bumped from 0.1.0 when githubDefaultBranchProtected was added — fact
  // schemas are write-once per (id, version) in TechInsightsDatabase
  // (insertFactSchema no-ops if a row already exists for that pair), so
  // adding a field without bumping the version leaves the stored schema
  // stale forever even though fact collection itself picks up the new field
  // immediately.
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
    githubDefaultBranchProtected: {
      type: 'boolean',
      description:
        'Whether the repository default branch has branch protection enabled',
    },
    githubTargetBranchProtected: {
      type: 'boolean',
      description:
        'Whether the branch named in the github.com/branch-protection-target annotation has branch protection enabled. Absent if the annotation is not set or the branch lookup fails.',
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

      const facts: Record<string, boolean | string | number> = {
        githubIsArchived: Boolean(repo.archived),
        githubVisibility: String(repo.visibility ?? 'public'),
        githubOpenIssuesCount: Number(repo.open_issues_count ?? 0),
      };

      // Uses the plain branch endpoint's `.protected` field rather than the
      // dedicated `/branches/:branch/protection` endpoint — that one 403s
      // for any token without push access to the repo, even on public repos.
      // If this call fails, the field is left out of `facts` entirely rather
      // than defaulted to false, same missing-data rule as above — an API
      // hiccup here shouldn't silently fail a branch-protection check while
      // the other three facts are still good.
      if (repo.default_branch) {
        const branchResponse = await fetch(
          `${apiBaseUrl}/repos/${slug}/branches/${repo.default_branch}`,
          { headers: token ? { Authorization: `Bearer ${token}` } : {} },
        );
        if (branchResponse.ok) {
          const branch = await branchResponse.json();
          facts.githubDefaultBranchProtected = Boolean(branch.protected);
        }
      }
      const targetBranch =
          entity.metadata.annotations?.[GITHUB_BRANCH_PROTECTION_TARGET_ANNOTATION];
      if (targetBranch) {
          const targetBranchResponse = await fetch(
            `${apiBaseUrl}/repos/${slug}/branches/${targetBranch}`,
              { headers: token ? { Authorization: `Bearer ${token}` } : {} },
            );
        if (targetBranchResponse.ok) {
          const branch = await targetBranchResponse.json();
          facts.githubTargetBranchProtected = Boolean(branch.protected);
        }
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
    }
    return results;
  },
};
