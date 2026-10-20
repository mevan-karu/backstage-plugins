import type { FactRetriever } from '@backstage-community/plugin-tech-insights-node';
import { collectGithubFacts } from './collectGithubFacts';

export const githubRepoMetadataFactRetriever: FactRetriever = {
  id: 'githubRepoMetadataFactRetriever',
  version: '0.2.0',
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
  handler: context =>
    collectGithubFacts(context, async ({ repository, api }) => {
      const { status, body } = await api.getRepo(repository);
      if (status !== 200) {
        throw new Error(
          `GET repository ${repository.owner}/${repository.name} returned HTTP ${status}`,
        );
      }
      return {
        githubIsArchived: Boolean(body.archived),
        githubVisibility: String(body.visibility ?? 'public'),
        githubOpenIssuesCount: Number(body.open_issues_count ?? 0),
      };
    }),
};
