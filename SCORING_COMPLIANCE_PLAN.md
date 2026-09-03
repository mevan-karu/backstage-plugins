# Scoring & Compliance — Implementation Plan

**Status:** Draft for team demo, reviewed once (Opus, high-effort pre-implementation review) — findings incorporated below
**Author context:** Follow-up to the architecture discussion covering fact collectors, CR-based storage, UI-driven check management, and per-component compliance views on top of `@backstage-community/plugin-tech-insights` (already wired into this repo's play environment).

## 1. Decision: real package separation from day one

**Reversed from the earlier draft.** This demo isn't just showing the feature — it's the vehicle for deciding, with the team, what actually gets donated. A described internal-folder boundary inside two combined packages asks the team to trust a convention; six real packages let them open an actual `package.json` and dependency graph and see exactly what would move to `backstage-community` with zero refactoring. That concreteness is worth the extra scaffolding cost.

So we create all six packages from the earlier architecture doc now, via `yarn new` (this repo's standard scaffold, matching the `plugins/<name>` → `@openchoreo/backstage-plugin-<name>` convention already used throughout):

| Package | Directory | Donatable | Not donatable |
|---|---|---|---|
| GitHub fact collectors | `plugins/tech-insights-backend-module-github` | ✅ | |
| Kubernetes fact collectors | `plugins/tech-insights-backend-module-kubernetes` | ✅ | |
| Dynamic check registry + dry-run | `plugins/tech-insights-backend-module-dynamic-checks` | ✅ | |
| Check-editor UI | `plugins/tech-insights-react-check-editor` | ✅ | |
| OpenChoreo fact collectors + score sink | `plugins/openchoreo-scoring-backend` | | ✅ |
| Compliance view branding/composition | `plugins/openchoreo-scoring` | | ✅ |

(A seventh piece — the `ComponentScore` CRD + controller — lives in the control-plane repo, not here; see Phase 4.)

Package names for the four donatable ones intentionally mirror what they'd be called if donated (`tech-insights-backend-module-github`, matching the existing upstream `tech-insights-backend-module-jsonfc` convention) — under our own org scope for now. Re-scoping to `@backstage-community/*` later is a rename, not a rewrite.

**Guardrail 1 — dependency check, now enforceable at the package-manager level, not just by convention.** Because these are real workspace packages, "does this depend on anything OpenChoreo-specific" is answerable by reading one file: `grep -l '"@openchoreo/' plugins/tech-insights-backend-module-{github,kubernetes,dynamic-checks}/package.json plugins/tech-insights-react-check-editor/package.json` should return nothing. Worth going further: add a Yarn constraints rule (`yarn.config.cjs`, not yet present in this repo) that fails `yarn constraints` in CI if any of the four donatable packages ever gains an `@openchoreo/*` dependency — turns a manual check into an automated one.

**Guardrail 2 — semantic check (a clean dependency graph can still leak specificity in code).** The dependency check alone doesn't catch a donatable component quietly baking in OpenChoreo's world view without ever importing an `@openchoreo/*` package. The concrete risk is inside `tech-insights-react-check-editor`: its category dropdown and fact-ID picker must be **populated at runtime from the backend's actual registered facts/categories via API**, never **enumerated at build time** as a hardcoded list. A hardcoded `['Ownership', 'Security', 'OpenChoreo Deployment Health', ...]` select option would pass Guardrail 1 and still make the component useless to anyone outside this org. Review this package against that explicitly before the demo, not after.

**Cost being accepted, stated plainly:** six `yarn new` scaffolds, six sets of `package.json`/`tsconfig`/README, and correspondingly more `backend.add(...)` lines in `packages/backend/src/index.ts` and more composition wiring in `packages/app` than the two-package version would have needed. Given the demo's actual purpose — a concrete donation-plan discussion — that ceremony is the point, not overhead to trim.

## 2. What already exists (from this session, not new work)

- `@backstage-community/plugin-tech-insights[-backend|-node|-common|-react]` installed and wired: backend plugin + jsonfc checker registered, 4 static checks in `app-config.yaml`, entity tabs on Service/Generic-Component/System/default pages, standalone `/tech-insights` page, sidebar nav.
- `@backstage-community/plugin-tech-insights-maturity[-common]` installed and wired: `EntityMaturitySummaryCard` on Component and System overview tabs, `enableCompoundEntityCheck: true` (needed since we have zero Component entities in this catalog today), checks tagged with `metadata.rank`/`metadata.category`.
- **Decision (not open):** pin local dev to Node **22.22**, matching the already-merged `.changeset/pin-node-22-22.md` (PR #649), which root-caused the same Node 22.23+ node-fetch keep-alive regression this session hit and worked around with an `Accept-Encoding`-stripping middleware in `packages/backend/src/index.ts`. Do this before or alongside Phase 1 and remove the workaround — it's redundant with a fix the team already shipped for the Docker image, we just hadn't matched it locally.

## 3. Confirmed technical facts this plan depends on

Verified by reading installed package source this session, not assumed from docs:

- `techInsightsFactRetrieversExtensionPoint`, `techInsightsFactCheckerFactoryExtensionPoint`, `techInsightsPersistenceContextExtensionPoint` are all public, designed for exactly this kind of extension — no upstream fork required for collectors, a custom checker, or a custom store.
- `TechInsightCheckRegistry` is `register/get/getAll/list` only (no `update`/`delete`) — our persistent registry implements extra methods beyond the interface; this is not a blocker, just means our concrete class is richer than the interface it satisfies.
- Dry-run of an **unsaved** check is not exposed anywhere upstream (`/checks/run/:ns/:kind/:name` only runs already-registered checks by ID).
- `tech-insights-maturity`'s `MaturitySummaryInfoCard`/`MaturityRankChip` hardcode the string "Maturity" and the raw `Rank[rank]` enum name with no override prop — renaming to "Compliance" on the compact card requires either an upstream PR or our own replacement component. `MaturityRankInfoCard` (used only in the fuller detailed page) already reads `techInsights.maturity.rank.*.title` from config, so tier renaming works there today.
- Check results are **never persisted** by tech-insights — every `/checks/run` call recomputes live against current facts. CR-based storage of scores is therefore new code regardless of approach (there's no store to "swap in" for results the way there is for facts).

**Correction from review — dry-run must not be a second evaluation path.** The original plan proposed building dry-run by fetching facts via `getFacts()` and then evaluating the draft check's `rule.conditions` with a *directly-imported* `json-rules-engine`, bypassing the registered checker entirely. Flagged risk: this manufactures two separate evaluation code paths (the dry-run's direct engine call vs. the real `FactCheckerFactory`'s), which can drift — engine version, missing-fact handling, type coercion — and produce "dry run passed, saved check failed" in front of the demo audience. **Fix, now part of Phase 3's design:** dry-run and the registered checker must call one shared `evaluate(checkDef, facts)` function. Build the dry-run endpoint and the custom `FactCheckerFactory` around that shared function from the start, and add a parity test running it against the 4 existing static checks as a regression backstop.

## 4. Priority-ordered phases

Reordered from the original draft per review: the compliance view depends only on Phase 1's real collector facts and today's existing static checks — it does not need dynamic check management to exist. Since it's also the cheaper, lower-risk, more visually compelling phase, it now comes before the larger dynamic-checks undertaking. This keeps the build demoable at every step instead of front-loading the riskiest phase.

### Phase 1 — External fact collectors
**Creates:** `plugins/tech-insights-backend-module-github`, `plugins/tech-insights-backend-module-kubernetes`
**Goal:** get checks running against real external signals instead of just catalog metadata, so every later phase has something meaningful to display.

- GitHub: branch protection on default branch, required PR reviewers — reading each component's own `github.com/project-slug` annotation (same annotation already used by this repo's GitHub Actions tab), so different components naturally check different repos.
- Kubernetes: generic object checks (resource limits set, replica count healthy) via the standard cluster locator — **must stay CRD-blind**, no OpenChoreo objects, to keep this a real donation candidate.
- Both register via `addFactRetrievers` on the existing `techInsightsFactRetrieversExtensionPoint` — two new `backend.add(...)` lines in `packages/backend/src/index.ts`, one per package.
- **Missing-data rule to build in from the start:** a fact retriever must skip entities it has no data for (e.g. no repo annotation) rather than emit a fallback `false` — filter them out of its own return array. This is what makes an unconfigured component's scorecard omit the check entirely instead of showing a false failure.
- **Roadmap note, not a blocker:** scheduled GitHub collection at scale will hit API rate limits eventually — fine for a demo-sized catalog, worth a card for later.

*Demo payoff:* real pass/fail results tied to actual GitHub/K8s state, not synthetic metadata checks.

### Phase 2 — Compliance view
**Creates:** `plugins/openchoreo-scoring-backend`, `plugins/openchoreo-scoring`
**Goal:** a per-component compliance page that looks and reads like an OpenChoreo feature, not a bare upstream widget. This is the phase we lead the demo with — the visible "product," ready sooner because it doesn't wait on Phase 3.

- `openchoreo-scoring-backend`: OpenChoreo-specific fact retrievers (deployment health, environment promotion status, trait/resource compliance) via the control-plane API client. Internally organized as `src/collectors/openchoreo/` + `src/score-sink/` (Phase 4) — both non-donatable, so no further package split needed within this one.
- `openchoreo-scoring` (frontend): composes upstream `tech-insights`/`tech-insights-maturity` components plus Phase 1's collector output into one branded page. Resolve the "Maturity" branding gap from §3 here: either a small upstream PR to `tech-insights-maturity`'s two components, or our own compact card calling `maturityApiRef` directly — decide based on how far branding needs to reach before this phase ships (see open question below).
- Build our own combined entity-scoped page/tab in `openchoreo-scoring` (rather than relying on the packaged `MaturityPage`, which hardcodes `kind: ['Component']` with no override) so System/Domain/Group entities and future Components all render consistently.

*Demo payoff:* the "here's your component's compliance score, broken down by category" view the team actually wants to show off — running against Phase 1's real collectors and today's existing static checks, no dependency on Phase 3.

### Phase 3 — Dynamic check management
**Creates:** `plugins/tech-insights-backend-module-dynamic-checks`, `plugins/tech-insights-react-check-editor`
**Goal:** replace "edit `app-config.yaml`, restart backend" with UI-driven CRUD. This is the largest and highest-risk phase of the four — sequenced after Phase 2 so there's already a working, demoable product before taking it on.

- `tech-insights-backend-module-dynamic-checks`: a `FactCheckerFactory` registered via `setFactCheckerFactory`, backed by a persistent registry (start with Backstage's own SQL database service — **not** CRs yet; keep this phase decoupled from the harder Phase 4 storage question). Built around the shared `evaluate()` function from §3, not a parallel path. Also hosts the new dry-run endpoint calling that same shared function.
- `tech-insights-react-check-editor`: About → Conditions → Dry Run → Applies-to → Draft/Publish, modeled on the Roadie UX already researched. Built against Guardrail 2 (§1): categories and fact IDs are runtime-discovered from the backend, never hardcoded in this package.
- **Explicitly in scope for this phase, not orphaned:** level/rank-tier definitions (Bronze/Silver/Gold titles, descriptions) get their own CRUD surface within `tech-insights-backend-module-dynamic-checks` — a second, separate data model from checks, not folded into the same store.
- **Design questions to resolve before starting, not during:**
  - *Check coexistence:* once the DB-backed registry exists, what happens to the 4 static `app-config.yaml` checks? Recommendation: migrate them into the dynamic store as seed data on first boot, so there's one registry going forward — not two checkers running in parallel, which risks checks silently duplicating or vanishing.
  - *Permissions & audit:* a UI that edits compliance/governance rules needs Backstage permission-framework integration (who can create/edit/publish a check) and some record of who changed what. Not required to *demo* as an admin-only feature, but a real gap before this goes past a demo.
  - *Concurrency:* no optimistic locking/versioning is specified yet on the richer registry — flag for design, not a demo blocker.

*Demo payoff:* add or edit a check live, see it evaluate immediately against real entities, no restart — the single most visible differentiator once it ships.

### Phase 4 — CR-based score storage
**Extends:** `plugins/openchoreo-scoring-backend` (its `score-sink/` directory); **new, separate repo:** control-plane `ComponentScore` CRD + controller
**Goal:** durable, `kubectl`-visible, GitOps-friendly score history — the OpenChoreo-native capability that can't be donated, and notably the user's original requirement #2 of four. Deferring it entirely risks the demo reading as "we wrapped a community plugin" rather than showing the differentiated capability — so this phase gets a cheap demo-lite version instead of a full cut.

- **Full version** (post-demo): `openchoreo-scoring-backend`'s `score-sink` module (calls the registry's evaluate path, snapshots the outcome) plus a new `ComponentScore` CRD + controller in the control-plane repo. Blocked on the open control-plane-API-vs-direct-client decision below — genuinely not cheap, spans two repos and real RBAC/reconcile design.
- **Demo-lite version (do this for the team demo):** hand-author one sample `ComponentScore` CR matching the shape a real controller would eventually write, apply it manually to the dev cluster, and add a small read-only view showing "the score as stored in Kubernetes" alongside the Phase 2 compliance tab. No controller, no write path, no cross-repo dependency — just enough to tell the GitOps story visually and prove the CR shape is sound, without taking on the unresolved architecture question mid-demo-prep.
- `score-sink` stays inside `openchoreo-scoring-backend` rather than becoming its own package — it's non-donatable regardless, so there's no donation boundary within Layer 2 that a package split would need to enforce.

## 5. Non-goals for the team demo

- Actually filing anything with `backstage-community` — the six-package split (§1) makes that decision concrete to discuss, but submitting/donating is a post-demo outcome, not a pre-demo one.
- Phase 4's full write path and control-plane controller — present as architecture/roadmap; ship only the demo-lite read-only CR view (§4).
- Upstream PRs to `tech-insights-maturity` — only needed if full "Compliance" branding must reach the compact card before the demo; otherwise defer.
- A `yarn.config.cjs` constraints rule automating Guardrail 1 (§1) — valuable, but the manual `grep` check is sufficient for the demo; add the automated version once the donation decision is made and it's worth hardening.

## 6. Open questions for the team

1. Control-plane API vs. direct in-cluster client for the **full** `score-sink` write path (Phase 4). Not needed for the demo-lite CR view, which is hand-applied — but needs an answer before Phase 4 goes beyond that.
2. How far must "Compliance" branding reach before Phase 2 ships — just the new combined page, or the existing upstream compact card too (§3, §4 Phase 2)?
3. Confirm the check-coexistence recommendation in Phase 3 (migrate static checks into the dynamic registry as seed data, one registry going forward) — or does the team want the two to run in parallel for some reason?
4. Permissions/audit-trail approach for check editing (Phase 3) — fine to skip for the demo itself, but needs an owner before this moves toward production.
