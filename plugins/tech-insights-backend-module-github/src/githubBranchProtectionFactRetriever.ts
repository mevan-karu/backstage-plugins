import type { FactRetriever } from '@backstage-community/plugin-tech-insights-node';
import { collectGithubFacts } from './collectGithubFacts';
import { encodeBranch } from './githubApi';
import { resolveBranch } from './repository';
import {
  branchProtectionFacts,
  PROTECTING_RULE_TYPES,
  type BranchRule,
} from './branchProtectionFacts';

export const githubBranchProtectionFactRetriever: FactRetriever = {
  id: 'githubBranchProtectionFactRetriever',
  version: '0.1.0',
  title: 'GitHub Branch Protection',
  description:
    'Branch protection and ruleset settings of the branch a component builds from, read from the GitHub REST API.',
  entityFilter: [{ kind: 'component' }],
  schema: {
    githubBranch: {
      type: 'string',
      description:
        'Branch evaluated: from a configured branch annotation, else the ref in the repository URL, else the default branch',
    },
    githubBranchProtected: {
      type: 'boolean',
      description: `Whether the branch has classic branch protection or an active ruleset rule of type ${PROTECTING_RULE_TYPES.join(
        ', ',
      )}`,
    },
    githubRequiresPullRequest: {
      type: 'boolean',
      description: 'Whether changes must go through a pull request',
    },
    githubRequiredApprovingReviewCount: {
      type: 'integer',
      description: 'Approving reviews required before merging',
    },
    githubRequiresCodeOwnerReviews: {
      type: 'boolean',
      description: 'Whether code owner review is required',
    },
    githubRequiresStatusChecks: {
      type: 'boolean',
      description: 'Whether status checks must pass before merging',
    },
    githubAllowsForcePushes: {
      type: 'boolean',
      description: 'Whether force pushes to the branch are allowed',
    },
    githubAllowsDeletions: {
      type: 'boolean',
      description: 'Whether the branch can be deleted',
    },
  },
  handler: context =>
    collectGithubFacts(
      context,
      async ({ entity, repository, api, options }) => {
        const slug = `${repository.owner}/${repository.name}`;
        let branch = resolveBranch(
          entity,
          repository,
          options.branchAnnotations,
        );
        if (!branch) {
          const repo = await api.getRepo(repository);
          if (repo.status !== 200) {
            throw new Error(
              `GET repository ${slug} returned HTTP ${repo.status}`,
            );
          }
          branch = String(repo.body.default_branch);
        }
        const encoded = encodeBranch(branch);

        const branchResponse = await api.getRepo(
          repository,
          `/branches/${encoded}`,
        );
        if (branchResponse.status !== 200) {
          throw new Error(
            `GET branch '${branch}' of ${slug} returned HTTP ${branchResponse.status}`,
          );
        }
        const rulesResponse = await api.getRepo(
          repository,
          `/rules/branches/${encoded}`,
        );
        if (rulesResponse.status !== 200) {
          throw new Error(
            `GET rules for branch '${branch}' of ${slug} returned HTTP ${rulesResponse.status}`,
          );
        }

        const classicProtected = Boolean(branchResponse.body.protected);
        let classic;
        if (classicProtected) {
          const protection = await api.getRepo(
            repository,
            `/branches/${encoded}/protection`,
          );
          if (protection.status === 200) {
            classic = protection.body;
          } else {
            context.logger.debug(
              `Branch protection details for ${slug}@${branch} unreadable (HTTP ${protection.status}); needs Administration: read`,
            );
            classic = 'unknown' as const;
          }
        }

        return branchProtectionFacts({
          branch,
          classicProtected,
          classic,
          rules: rulesResponse.body as BranchRule[],
        });
      },
    ),
};
