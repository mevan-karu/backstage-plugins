# `tech-insights-backend-module-dynamic-checks`

**Phase:** 3 (now being built, ahead of Phase 2) · **Donatable:** yes · **Status:** build-ready

## Local dev persistence gotcha (not this module's bug, but blocks demoing "checks survive a restart")

The tracked `app-config.yaml`'s `backend.database.connection.filename: ':memory:'` and
`app-config.local.yaml`'s `backend.database.connection.directory: ./.backstage-db` merge into one
`connection` object with **both** keys present. Backstage's sqlite3 connector
(`Sqlite3Connector.getDatabaseName()`) checks `filename` first and short-circuits to `:memory:`
whenever it's set, before ever looking at `directory` — so **every plugin's local dev database is
in-memory today**, not just this module's. Confirmed by loading both config files through
Backstage's own `ConfigReader.fromConfigs` and inspecting the merged `backend.database.connection`.

Worked around locally (gitignored `app-config.local.yaml`, not in this repo) with a per-plugin
override: `backend.database.plugin.tech-insights.connection.filename: tech-insights.sqlite`, which
the connector honors regardless of the base `:memory:` setting. Fixing this project-wide would mean
changing the tracked `app-config.yaml`'s base database block — out of scope for this module, but
worth knowing if "restart the backend, checks are still there" doesn't work out of the box for
anyone else picking this up.

## Purpose

Replace "edit `app-config.yaml`, restart the backend" with UI-driven CRUD for checks — the
capability Roadie ships commercially (`https://roadie.io/docs/tech-insights/add-check/`) that the
OSS `tech-insights` package doesn't provide.

**Resequenced from the original plan.** The user chose to drop the static `app-config.yaml`
checks entirely and build the dynamic-checks backend + check-editor UI next, ahead of Phase 2's
compliance view. Reasoning stated: the K8s collector (Phase 1's second package) is deferred for
now, and OpenChoreo-specific fact collection (Phase 2) should first try to lean on catalog
entities' existing OpenChoreo annotations via a generic entity-attribute-style retriever rather
than a bespoke live-API collector — so dynamic check management is the more immediately valuable
next capability, and the walkthrough target is "the flow up through check evaluation."

## Package identity

- Directory: `plugins/tech-insights-backend-module-dynamic-checks`
- Package name: `@openchoreo/backstage-plugin-tech-insights-backend-module-dynamic-checks`
  (rename target if donated: `@backstage-community/plugin-tech-insights-backend-module-dynamic-checks`)
- Role: `backend-plugin-module` (same scaffold template as Phase 1's collectors —
  `--select backend-plugin-module --option pluginId=tech-insights --option
  moduleId=dynamic-checks --option pluginPackage=@backstage-community/plugin-tech-insights-backend`)
- Guardrail 1 applies exactly as in Phase 1: no `@openchoreo/*` dependency, ever — checks are
  generic `json-rules-engine` definitions regardless of what facts they reference.

## The key design decision: reuse `JsonRulesEngineFactChecker`, don't reimplement it

Confirmed by reading the installed `@backstage-community/plugin-tech-insights-backend-module-jsonfc`
package's public API (`node_modules/.../dist/index.d.ts`): it exports `JsonRulesEngineFactChecker`
and `JsonRulesEngineFactCheckerFactory` as `@public`, not just the config-driven
`techInsightsModuleJsonRulesEngineFactCheckerFactory` backend feature we've been using. Its own
factory options type says explicitly:

> "Implementation of checkRegistry is optional. If there is a need to use persistent storage for
> checks, it is recommended to inject a storage implementation here. Otherwise, an in-memory
> option is instantiated and used."

This is exactly this package's use case, built in on purpose. **Decision: depend on the jsonfc
package as a library (not its backend-feature module), construct our own
`JsonRulesEngineFactCheckerFactory` with a DB-backed `checkRegistry`, and register that via
`setFactCheckerFactory`.** This supersedes the original plan's idea of building a "shared
`evaluate()` function" from scratch — instead of two evaluation paths kept in sync by a shared
function, there is only **one** evaluation class (`JsonRulesEngineFactChecker`), used for both
live checks and dry-run. Same operators, same missing-fact skip behavior, same entity-filter
matching, same JSONPath/flattened-fact-namespace semantics already verified in Phase 1 — zero risk
of drift because there's no second implementation to drift.

**Dry-run mechanism, confirmed from `runChecks`'s actual implementation:** `runChecks(entity,
checks?: string[])` always resolves check objects via `this.checkRegistry.getAll(checks)` — it
never accepts an ad-hoc check object directly. So dry-run works by: (1) `checkRegistry.register()`
the draft check under a temporary id (e.g. `__draft__:<uuid>`), (2) call
`factChecker.runChecks(entityRef, [tempId])`, (3) delete the temp check from the registry
regardless of outcome. This still runs through the exact same `JsonRulesEngineFactChecker.runChecks`
method a real, saved check uses — not a parallel code path.

## Scope

- `DynamicCheckRegistry implements TechInsightCheckRegistry<TechInsightJsonRuleCheck>` — a Knex-backed
  registry using `coreServices.database` (own migrations, own `checks` table), supporting
  `register/get/getAll/list` (satisfies the upstream interface) plus `update`/`delete`/`listDrafts`
  (our own CRUD surface, not upstream-specified — confirmed the interface really is just those four
  methods, so this is additive, not an override).
- Construct `new JsonRulesEngineFactCheckerFactory({ checks: [], logger, checkRegistry, catalog, auth })`
  and register it via `setFactCheckerFactory` on `techInsightsFactCheckerFactoryExtensionPoint`.
- New HTTP routes (via `coreServices.httpRouter`, mounted under the `tech-insights` plugin's base
  path since that's this module's `pluginId`): `GET/POST /dynamic-checks`, `PUT/DELETE
  /dynamic-checks/:id`, `POST /dynamic-checks/:id/publish`, `POST /dynamic-checks/dry-run`
  (implements the mechanism above).
- Level/rank-tier CRUD is **deferred** — not part of this build pass. The walkthrough target is
  check evaluation, not maturity-tier editing; revisit once the check-editor loop is proven.

## Check coexistence — resolved

Original open question #3 ("migrate static checks into the dynamic store as seed data, or run in
parallel") is resolved by direct instruction: **drop the static checks entirely, no migration.**
Concretely:
- Remove `backend.add(import('@backstage-community/plugin-tech-insights-backend-module-jsonfc'))`
  from `packages/backend/src/index.ts` — that module is what reads `techInsights.factChecker.checks`
  from config and calls `setFactCheckerFactory`; leaving it registered would race this module for
  who wins `setFactCheckerFactory` (whichever module's `init` runs last silently wins — not a state
  to leave implicit).
- Remove the `techInsights.factChecker.checks` block from `app-config.yaml` (titleCheck,
  descriptionCheck, groupOwnerCheck, techDocsCheck, repoNotArchivedCheck).
- **Consequence:** `repoNotArchivedCheck` — Phase 1's proof that the GitHub collector's facts flow
  through to a real check result — disappears with the static config. Recreate it as the **first
  check authored through the new dynamic-checks UI** during the walkthrough. This keeps the
  GitHub fact → check chain demonstrated and doubles as the end-to-end test of the
  create → dry-run → publish → evaluate loop, rather than being lost work.
- **Intermediate state during the cutover:** once the jsonfc module and its config are removed but
  before this module's factory is registered, `/checks` endpoints disable themselves entirely
  (confirmed from the router's `if (factCheckerFactory) {...} else { logger.info("Starting tech
  insights module without fact checking endpoints.") }` branch) — land both changes in the same
  pass, don't ship the removal alone.

## Permissions, audit, concurrency — still open, deliberately deferred

Not resolved by the user's latest message, and not blocking this build pass per the original
plan's own framing ("fine to skip for the demo itself, but needs an owner before this moves toward
production" / "flag for design, not a demo blocker"). No optimistic locking, no permission checks
beyond whatever the `tech-insights` plugin's existing permission wiring already provides on its
routes, no audit trail. Revisit before this goes past the walkthrough.

## Testing approach

- Unit test `DynamicCheckRegistry`'s CRUD methods against a real (test) Knex/sqlite instance —
  this repo's existing plugins already have a pattern for this (`backend-test-utils`).
- Integration test: register a check via the CRUD route, dry-run it, publish it, then call the
  standard `/checks/run/:namespace/:kind/:name` endpoint and confirm the same result — this is the
  concrete proof that dry-run and live evaluation can't drift, since Phase 1's `repoNotArchivedCheck`
  recreated through this flow is the walkthrough's actual test case.
