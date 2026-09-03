# `tech-insights-backend-module-github`

**Phase:** 1 (first to build) · **Donatable:** yes · **Status:** `githubRepoMetadataFactRetriever` implemented and verified end-to-end; `githubBranchProtectionFactRetriever` build-ready, blocked on a real PAT

## Purpose

Fact retrievers that answer "what does GitHub actually say about this component's repo" —
starting with repo metadata and branch protection. Today's static checks
(`titleCheck`, `descriptionCheck`, `groupOwnerCheck`, `techDocsCheck`) only look at catalog
metadata; this package is what makes a check reflect real external state.

## Package identity

- Directory: `plugins/tech-insights-backend-module-github`
- Package name: `@openchoreo/backstage-plugin-tech-insights-backend-module-github`
  (rename target if donated: `@backstage-community/plugin-tech-insights-backend-module-github`)
- Role: `backend-plugin-module` (scaffolded via `yarn backstage-cli new --select backend-plugin-module
  --option pluginId=tech-insights --option moduleId=github --option
  pluginPackage=@backstage-community/plugin-tech-insights-backend` — the scaffold's own template
  ID is `backend-plugin-module`, not `backend-module`; it also auto-inserted the `backend.add(...)`
  line in `packages/backend/src/index.ts`, no manual wiring needed)
- Guardrail 1 check: `package.json` depends only on `@backstage/*` and
  `@backstage-community/plugin-tech-insights-node` plus `luxon`. **Zero `@openchoreo/*`
  dependencies** — confirmed as of this write-up.

## Dependencies (as actually installed)

- `@backstage-community/plugin-tech-insights-node` (`^2.8.0`) — `techInsightsFactRetrieversExtensionPoint`,
  `FactRetriever` type.
- `@backstage/catalog-client` (`^1.15.1`) — same `CatalogClient` the built-in
  `entityMetadataFactRetriever` uses internally (confirmed by reading its compiled source), rather
  than a raw `fetch` against the catalog's HTTP API.
- `@backstage/integration` (`^2.0.2`) — `ScmIntegrations.fromConfig(config).github.byHost('github.com')`
  to read the same `integrations.github` token/apiBaseUrl config as the rest of the app.
- `luxon` (`^3.7.2`) — `DateTime.now()` for the fact timestamp, matching the built-in retrievers'
  convention.
- No `@octokit/rest` — plain `fetch` against the GitHub REST API was sufficient and avoids an
  extra dependency; can be added later if a heavier call (e.g. paginated results) makes it worthwhile.

## Confirmed technical facts this package depends on (found while implementing, not assumed)

Two non-obvious requirements surfaced only by getting a real retriever running end-to-end —
worth stating explicitly since they'll trip up every future retriever in this plan, not just this
one:

1. **A retriever registered via the extension point is silently dropped unless it also has an
   entry under `techInsights.factRetrievers.<id>` in config.** Read from
   `createFactRetrieverRegistrationFromConfig` in the installed
   `@backstage-community/plugin-tech-insights-backend` package: every retriever — built-in or
   added via `addFactRetrievers` — is converted to a schedulable registration by looking up
   `techInsights.factRetrievers.<name>` in config; if that key doesn't exist, the retriever is
   filtered out with **no error, warning, or log line** — it just never appears in the "Scheduled
   N/N fact retrievers" count. `addFactRetrievers` makes a retriever *known*; config makes it
   *scheduled*. Both are required.
2. **Fact field names share one flat namespace across every retriever, not a namespace per
   retriever ID.** Read from `JsonRulesEngineFactChecker.runChecks` in the installed
   `tech-insights-backend-module-jsonfc` package: `factValues` is built as
   `Object.values(facts).reduce((acc, it) => ({...acc, ...it.facts}), {})` — every retriever's
   `facts` object is merged into one flat object before being handed to `json-rules-engine`. A
   check condition references the **field name directly** (e.g. `fact: githubIsArchived`), never
   the retriever ID, and never `retrieverId` + JSONPath `path`. This means **field names must be
   globally unique across every retriever in the system**, not just retriever IDs — hence this
   package's fields are prefixed `github*` (`githubIsArchived`, `githubVisibility`,
   `githubOpenIssuesCount`) rather than generic names like `isArchived`, which a future
   `openchoreo-scoring-backend` collector could plausibly also want to call `isArchived`.

## How it fits the existing wiring

```ts
// packages/backend/src/index.ts — inserted automatically by the scaffold tool
backend.add(import('@openchoreo/backstage-plugin-tech-insights-backend-module-github'));
```

```yaml
# app-config.yaml — required in addition to the module registration (see confirmed fact #1)
techInsights:
  factRetrievers:
    githubRepoMetadataFactRetriever:
      cadence: '*/5 * * * *'
      initialDelay: { seconds: 20 }
      lifecycle: { timeToLive: { days: 1 } }
```

## Fact retrievers

### `githubRepoMetadataFactRetriever` — implemented, verified against a real repo

| | |
|---|---|
| `id` | `githubRepoMetadataFactRetriever` |
| `entityFilter` | `[{ kind: 'component' }]` |
| Facts | `githubIsArchived: boolean`, `githubVisibility: string`, `githubOpenIssuesCount: integer` |
| API call | `GET {apiBaseUrl}/repos/{slug}` — unauthenticated if no token is configured (works fine for public repos, just tighter rate limits) |
| Verified output | Running against `component:default/backstage-plugins` (`mevan-karu/backstage-plugins`, public, unauthenticated): `{githubIsArchived: false, githubVisibility: "public", githubOpenIssuesCount: 0}`, and the derived check `repoNotArchivedCheck` returned `result: true` end-to-end through `/checks/run/:namespace/:kind/:name` |

### `githubBranchProtectionFactRetriever` — build-ready, not yet implemented

| | |
|---|---|
| `id` | `githubBranchProtectionFactRetriever` |
| `entityFilter` | same as above |
| Facts | `githubDefaultBranchProtected: boolean`, `githubRequiredApprovingReviewCount: number`, `githubRequiresCodeOwnerReviews: boolean`, `githubEnforcesAdmins: boolean` |
| API calls | `GET /repos/{slug}` (resolve default branch) → `GET /repos/{slug}/branches/{branch}/protection` |
| Auth | Requires a token with **push access** to the repo — GitHub's protection endpoint 404s for read-only tokens even on public repos. **Blocked on the user supplying a real PAT** with push access to `mevan-karu/backstage-plugins` in `app-config.local.yaml`'s `integrations.github` block — not something this doc or any amount of code can substitute for. |

Both retrievers read `metadata.annotations['github.com/project-slug']` — the exact annotation
this repo's own GitHub Actions CI tab already reads, so components don't need a second annotation
just for scoring.

## Missing-data rule (implemented)

```ts
const slug = entity.metadata.annotations?.[GITHUB_PROJECT_SLUG_ANNOTATION];
if (!slug) continue; // no repo configured — omit, don't emit a fallback value
// ...
if (!response.ok) continue; // repo unreachable — same rule
```

Matches the confirmed checker behavior from earlier this session: checks referencing a missing
fact are skipped for that entity rather than evaluated as failing.

## Real implementation reference (`src/githubRepoMetadataFactRetriever.ts`)

```ts
import { CatalogClient } from '@backstage/catalog-client';
import { ScmIntegrations } from '@backstage/integration';
import { DateTime } from 'luxon';
import type { FactRetriever } from '@backstage-community/plugin-tech-insights-node';

export const githubRepoMetadataFactRetriever: FactRetriever = {
  id: 'githubRepoMetadataFactRetriever',
  version: '0.1.0',
  entityFilter: [{ kind: 'component' }],
  schema: {
    githubIsArchived: { type: 'boolean', description: '...' },
    githubVisibility: { type: 'string', description: '...' },
    githubOpenIssuesCount: { type: 'integer', description: '...' },
  },
  handler: async ({ config, discovery, auth, entityFilter }) => {
    const github = ScmIntegrations.fromConfig(config).github.byHost('github.com');
    const apiBaseUrl = github?.config.apiBaseUrl ?? 'https://api.github.com';
    const token = github?.config.token;

    const { token: catalogToken } = await auth.getPluginRequestToken({
      onBehalfOf: await auth.getOwnServiceCredentials(),
      targetPluginId: 'catalog',
    });
    const entities = await new CatalogClient({ discoveryApi: discovery })
      .getEntities({ filter: entityFilter }, { token: catalogToken });

    const results = [];
    for (const entity of entities.items) {
      const slug = entity.metadata.annotations?.['github.com/project-slug'];
      if (!slug) continue;
      const res = await fetch(`${apiBaseUrl}/repos/${slug}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) continue;
      const repo = await res.json();
      results.push({
        entity: { namespace: entity.metadata.namespace ?? 'default', kind: entity.kind, name: entity.metadata.name },
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
```

This is the pattern the real `entityMetadataFactRetriever` built-in uses (confirmed by reading its
compiled source) — `CatalogClient` + `auth.getPluginRequestToken`, not a raw `fetch` against the
catalog's own HTTP API.

## Sample check (verified working, using flat field-name references — not `retrieverId` + JSONPath)

```yaml
techInsights:
  factChecker:
    checks:
      repoNotArchivedCheck:
        type: json-rules-engine
        name: Repository Is Active
        factIds: [githubRepoMetadataFactRetriever]
        metadata: { category: Security, rank: 2 }
        rule:
          conditions:
            all:
              - fact: githubIsArchived
                operator: equal
                value: false
```

**Correction from the original draft of this doc:** an earlier version of this check used
`fact: githubRepoMetadataFactRetriever` with `path: $.githubIsArchived`, following what looked
like a reasonable reading of the engine's JSONPath/fact-to-fact comparison capability from
earlier in this session. That form throws `Not all facts are defined: <retrieverId>` at check-run
time, because (per confirmed fact #2 above) there is no top-level key named after the retriever ID
in the flattened `factValues` object — only the individual field names exist. The existing static
checks (`titleCheck` referencing `fact: hasTitle`, etc.) already used the correct flat form; this
package's first draft didn't follow that precedent closely enough. Branch-protection checks for
`githubBranchProtectionFactRetriever`, once implemented, must use the same flat form (e.g.
`fact: githubDefaultBranchProtected`), not a retriever-id-plus-path form.

## Test data (in place)

- `catalog-info.yaml` (repo root) now carries `github.com/project-slug: mevan-karu/backstage-plugins`
  and is registered as a `catalog.locations` entry in `app-config.local.yaml`.
- `integrations.github` in `app-config.local.yaml` is present but has its `token` line commented
  out — deliberately, since a literal placeholder token causes GitHub to 401 even on calls that
  would otherwise succeed unauthenticated. `githubRepoMetadataFactRetriever` works today with no
  token. `githubBranchProtectionFactRetriever` needs a real PAT with push access — **still an open
  ask to the user**, not something resolved by this doc.

## Testing approach

- Unit test the retriever's `handler` against a mocked `fetch`/`CatalogClient` — assert the
  skip-on-missing-annotation and skip-on-non-ok-response behaviors explicitly.
- Live smoke test (already performed manually this session):
  `curl -X POST localhost:7007/api/tech-insights/checks/run/default/component/backstage-plugins -d '{"checks":["repoNotArchivedCheck"]}'`
  and confirm `result: true` against real GitHub data, not a mocked/default value.

## Non-goals for this phase

- Rate-limit handling beyond default `fetch` behavior — fine at demo scale (one repo, unauthenticated
  ~60 req/hr limit not a concern at a 5-minute cadence).
- GitHub Apps / installation-token auth — a PAT via `integrations.github` is sufficient for the
  demo and matches how the rest of the app already authenticates to GitHub.
