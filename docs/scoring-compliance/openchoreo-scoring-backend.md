# `openchoreo-scoring-backend`

**Phase:** 2 (paused — dynamic-checks moved ahead of this in priority) · **Donatable:** no · **Status:** design partially superseded, see note below

## Purpose

OpenChoreo-specific fact collectors (deployment health, environment promotion status, trait/resource
compliance) plus the API this phase's frontend (`openchoreo-scoring`) consumes to render a
per-component compliance page. This is the package where "OpenChoreo" as a first-class concept
(projects, environments, component types, traits) is allowed to leak in — unlike Phase 1's two
collector packages, this one is not a donation candidate and doesn't need to pretend otherwise.

**Status update:** the user paused this phase to prioritize `tech-insights-backend-module-dynamic-checks`
+ its UI first (walkthrough target: "the flow until check evaluation"). Two things changed the
shape of this doc before any of it was built:

1. **Entity-sync research finding:** `OpenChoreoEntityProvider` already syncs `Component` and
   `Environment` (a custom entity kind) with real OpenChoreo state as annotations/spec today —
   contrary to this doc's original assumption that live API calls would be needed for most
   OpenChoreo facts. Component annotations already include `openchoreo.io/component-status`
   (Ready/Not Ready), project/namespace identity, source location; Environment spec already
   includes `isProduction`, `dataPlaneRef`, `dnsPrefix`. Constants are centralized in
   `plugins/openchoreo-common/src/constants.ts` (`CHOREO_ANNOTATIONS`/`CHOREO_LABELS`, ~45 keys).
   **Not yet synced anywhere:** deployment/release state and environment promotion status — these
   live only in `ProjectRelease`/`ResourceRelease` CRs reachable via
   `plugins/openchoreo-backend/src/services/ProjectReleaseService/ProjectReleaseInfoService.ts`,
   not stamped onto any catalog entity. So the three fact retrievers originally planned below are
   now split: `openchoreoTraitComplianceFactRetriever`-equivalent data may already be available as
   entity annotations (needs a *generic, donatable* annotation-reading retriever, not a bespoke
   OpenChoreo one — see note below); `openchoreoDeploymentHealthFactRetriever`/
   `openchoreoEnvironmentPromotionFactRetriever` still genuinely need a live API call, since that
   data isn't in the catalog.
2. **A new, generic donatable retriever may cover more ground than a bespoke OpenChoreo one.**
   Rather than a bespoke collector reading OpenChoreo's live API for state that's *already sitting
   on the entity as an annotation*, a small generic fact retriever that exposes an entity's
   annotations/spec fields as facts (e.g. one field `annotations: Record<string,string>`, checks
   reaching into it via `fact: annotations, path: $["openchoreo.io/environment-is-production"]`)
   would work against **any** entity kind — including custom ones like `Environment` — without
   ever importing an `@openchoreo/*` package. This wasn't built this session; flagging it here so
   it isn't lost, and because it changes where the donation boundary sits: such a retriever
   belongs in a small donatable module (or folded into `tech-insights-backend-module-github`'s
   sibling collectors), not in this non-donatable package. Not started — needs its own scoping
   pass before Phase 2 resumes.

The sections below are the **original** Phase 2 design, kept for reference; treat the fact
retriever list as provisional pending the split above.

## Package identity

- Directory: `plugins/openchoreo-scoring-backend`
- Package name: `@openchoreo/backstage-plugin-openchoreo-scoring-backend`
- Role: `backend-plugin` (own plugin, not a tech-insights module — it aggregates tech-insights
  output rather than feeding it, and needs its own routes for the compliance API)

## Dependencies

- `@openchoreo/openchoreo-client-node` — same `createOpenChoreoApiClient` used throughout
  `plugins/openchoreo-backend` (confirmed pattern: `plugins/openchoreo-backend/src/services/ProjectService/ProjectInfoService.ts`).
- `@openchoreo/openchoreo-auth` — `OpenChoreoTokenService`/`DefaultOpenChoreoTokenService` for
  background (no-user-context) service-to-service auth, the same pattern already used internally
  by `catalog-backend-module-openchoreo`'s `createAuthenticatedOpenChoreoApiClient` helper (that
  helper itself is not exported publicly, so this package re-implements the same ~15-line pattern
  rather than reaching into another plugin's internals).
- `@backstage-community/plugin-tech-insights-node` — to read fact/check results this package
  aggregates (via the `techInsightsServiceRef`/`TechInsightsService`, or the tech-insights HTTP
  API via `ctx.discovery` if a compile-time service ref isn't practical across plugin boundaries).
- `@openchoreo/backstage-plugin-common` — shared response types (`ProjectResponse` etc.), same as
  the rest of the backend.

## Fact retrievers (registered via the same public extension point as Phase 1)

### `openchoreoDeploymentHealthFactRetriever`

| | |
|---|---|
| `entityFilter` | `kind: component`, requires the component to resolve to a real OpenChoreo project/component via the existing `AnnotationStore` (already the source of truth this repo's catalog module uses to map catalog entities back to OpenChoreo namespace/project/component names) |
| Facts | `deploymentStatus: string`, `lastDeployedAt: string (ISO)`, `activeEnvironment: string` |
| Source | `client.GET('/api/v1/namespaces/{ns}/projects/{proj}/components/{comp}/...')` — exact path TBD against the current OpenAPI spec in `packages/openchoreo-client-node/src/generated/openchoreo/types.ts`; confirm the live path before implementing rather than assuming from this doc. |

### `openchoreoEnvironmentPromotionFactRetriever`

| | |
|---|---|
| Facts | `promotedToProduction: boolean`, `pendingEnvironments: string[]` |
| Source | deployment pipeline / environment status endpoints, same client |

### `openchoreoTraitComplianceFactRetriever`

| | |
|---|---|
| Facts | `hasResourceLimitsTrait: boolean`, `hasRunAsNonRootTrait: boolean` — this is the OpenChoreo-native equivalent of Phase 1's generic Kubernetes check, but read from the ComponentRelease/trait model directly rather than by inspecting the rendered Deployment. Keep both: the generic K8s check catches drift even if a trait was never applied or was overridden downstream; this one confirms intent at the OpenChoreo model level. |

All three follow the same missing-data skip rule as Phase 1's collectors, and the same auth
pattern: acquire a token via `OpenChoreoTokenService` (client-credentials grant, same
`openchoreo.auth.clientId/clientSecret/tokenUrl` config already in `app-config.local.yaml`), fall
back to an unauthenticated client with a logged warning if credentials aren't configured — mirrors
`createAuthenticatedOpenChoreoApiClient`'s existing behavior exactly.

## Compliance API (new routes, consumed by `openchoreo-scoring` frontend)

```
GET /api/openchoreo-scoring/components/:namespace/:project/:component/compliance
```

Response: aggregates the entity's tech-insights check results (grouped by `metadata.category`)
and its maturity rank (from `tech-insights-maturity`) into one payload, so the frontend doesn't
need to independently call three different plugin APIs and re-assemble them client-side. This
route is the actual "product" of Phase 2 — the rest of this package exists to feed it real data.

Confirmed technical constraint this route must respect: check results are **never persisted** by
tech-insights (verified this session) — every call recomputes live against current facts. This
route is a read-through aggregation, not a cache; latency is bounded by however many
`/checks/run/*` calls it fans out to underneath, which is fine at demo scale but worth noting for
later.

## `score-sink/` (Phase 4 — write path resolved, endpoint dependency still open)

Reserved directory for the future score-persistence write path. **Not part of the current build
pass** (dynamic-checks is being built first). Open question #1 from the master plan is now
resolved by direct instruction:

- **Resolved:** check results are pushed to the OpenChoreo API as CRDs — not via a direct
  in-cluster Kubernetes client. This keeps write access to cluster state behind the same
  control-plane API boundary the rest of `openchoreo-backend` already uses (matches the
  `createOpenChoreoApiClient`/`OpenChoreoTokenService` pattern this doc already specifies for
  fact retrievers), rather than granting this plugin its own direct cluster-write credentials.
- **Still open, and out of this repo's scope:** grepping the generated OpenChoreo API client
  types (`packages/openchoreo-client-node/src/generated/openchoreo/types.ts`) turns up no existing
  endpoint for scores, compliance, or check results. The write path requires a **new endpoint on
  the control-plane side** (a different repo) before `score-sink` has anywhere to push to — this
  doc can design the client-side call shape once that endpoint's contract is known, but can't
  build against an endpoint that doesn't exist yet. Flagged back to the user; treat as an external
  dependency to request, not something to route around locally.
- Once the endpoint exists: `score-sink` calls it after a check evaluation (via the dynamic-checks
  registry, once that ships), snapshotting the outcome per component/environment.

Stays inside this package rather than becoming its own package — it's non-donatable regardless of
implementation, so no donation boundary exists within this layer that a package split would need
to enforce (confirmed reasoning from master plan §4).

## Testing approach

- Unit test each fact retriever against a mocked `createOpenChoreoApiClient` (the existing test
  suites for `ProjectInfoService.test.ts` etc. are the pattern to follow — this codebase already
  mocks `openapi-fetch` clients this way).
- Integration-test the `/compliance` aggregation route against a running backend with Phase 1's
  collectors and the existing static checks — this is the natural point to verify the full chain
  end-to-end before the frontend is built.

## Open questions carried from the master plan (not resolved by this doc)

1. Control-plane API vs. direct in-cluster client for the **full** `score-sink` write path — team
   decision, needed before Phase 4 goes beyond demo-lite.
2. How far "Compliance" branding must reach (just this package's new aggregation, or also the
   upstream `tech-insights-maturity` compact card) — affects whether a small upstream PR is
   needed before Phase 2 ships. See `openchoreo-scoring.md` for the frontend-side resolution.
