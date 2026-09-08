# `tech-insights-react-check-editor`

**Phase:** 3 (build alongside `tech-insights-backend-module-dynamic-checks`) · **Donatable:** yes · **Status:** built, verified end-to-end against a real backend

## Status update — what actually got built (differs from the original design below)

The original design (single-flow wizard: About → Conditions → Dry Run → Applies-to →
Draft/Publish) was simplified to **one page, two columns** — `CheckList` (left) + `CheckForm`
(right) — after building the wizard and finding a single-page form with a Dry Run action button
covers the same ground without step-navigation overhead. This matches the UX reference this plan
was built against (openchoreo/openchoreo discussion #4049's own UX section specifies single-page
create/edit, not a stepper).

Two fields were added beyond the original design, both required (not optional), because
`@backstage-community/plugin-tech-insights-maturity`'s `ScoringDataFormatter` reads
`check.metadata.rank`/`.category` to compute an entity's Bronze/Silver/Gold tier:

- **Category**: a `TextField select` seeded from `constants.ts`'s `DEFAULT_CHECK_CATEGORIES`
  (Security/Ownership/Documentation/Metadata/Reliability), merged at render time with any category
  already present on an existing check — Guardrail 2 still holds, since this merge means the list
  is never purely a hardcoded enum; unknown/legacy categories still display and remain selectable.
- **Maturity tier** (Bronze/Silver/Gold, required, no "None"): omitting it doesn't just leave a
  check unranked — `MaturityCheckTable` (the vendor's own per-tier accordion, not used by this
  repo's final entity view, see below) silently excludes unranked checks from its Bronze/Silver/
  Gold breakdown while still counting them in the overall percentage. Defaulting new checks to
  Bronze avoids authoring a check that's invisible in any tier-based view.

`DynamicCheckRegistry.rowToCheck` (backend) was also fixed to return `metadata: {}` rather than
`undefined` when a check has neither field set — the maturity plugin accesses
`checkResult.check.metadata.rank` with no null-guard, so `metadata: undefined` would throw and
break the maturity computation for every entity scored against that check.

**Final nav structure** (per explicit user correction — check management belongs at the top-level
Insights nav item, not on each component, since it's a security-manager task, not a per-component
one; final layout per a concrete reference screenshot the user provided — a security/compliance
policy console: score gauge, then search/filter bar, then a policy table with severity, stage,
enabled toggle, and edit/delete actions):

- `Root.tsx`'s sidebar has a single "Insights" entry (`/tech-insights`), replacing the old separate
  Insights/Maturity/Check Editor items.
- That route renders `packages/app/src/components/insights/InsightsPage.tsx` — **not tabs**, a
  single stacked view: `ComplianceScoreCard` (aggregate `passedChecks/totalChecks` percentage
  gauge across all Components, reading `maturityApiRef.getBulkMaturitySummary` — deliberately a
  literal pass-rate, not a severity-weighted score) with a "View full breakdown" link, then
  `CheckPolicyTable` by default. The link swaps in `ComplianceOverviewContent` (the per-Component
  tier-distribution + table, with a "Back to checks" button) via local `view` state — no dedicated
  route, to avoid the routable-extension discovery cost paid twice already in this plugin's history
  (see below).
- `CheckPolicyTable` (`src/components/CheckEditorPage/CheckPolicyTable.tsx`, new) is the
  security-manager's check-configuration surface: search box, Category/Tier filter selects, a
  refresh button, "+ New check", and a table (Tier chip | Check name+description | Category chip |
  Enabled switch | Edit/Delete actions). The Enabled switch calls `publishCheck`/`unpublishCheck`
  directly — added `unpublish()` to `DynamicCheckRegistry` (backend) specifically for this, since a
  toggle needs both directions and the registry previously only had one-way `publish()`. Verified
  via curl that unpublishing reverts `status` to `draft` and the check disappears from `list()` (so
  it stops being evaluated for every entity), then confirmed the same in the browser.
- "New check"/row-edit open `CheckFormDialog` (new), a `Dialog` (`fullWidth maxWidth="md"`,
  scrolling `DialogContent`) wrapping the existing `CheckForm` — same form, modal presentation
  instead of an inline side panel.
- The original split-panel `CheckList`/`CheckForm`/`CheckManagementPanel` combo (see "Extraction for
  embedding" below) is **left in place, unused by this app** — `CheckPolicyTable` is a new,
  additional presentation of the same data, not a replacement; nothing was deleted just because a
  newer thing exists.
- Each **entity's own** "Insights" tab (`packages/app/src/components/catalog/EntityInsightsContent.tsx`)
  is read-only: rank chip at top, checks grouped by category beneath, sorted so any category with a
  tier-blocking failure sorts first. No check-management affordance there — that was tried first
  (a "Manage checks" button linking out) and explicitly removed per user feedback that check
  configuration is a nav-bar-level, not a per-component, concern.
- None of the above embeds `@backstage-community/plugin-tech-insights-maturity`'s
  `EntityMaturityScorecardContent`/`EntityMaturitySummaryContent` — both are *routable* extensions
  sharing that plugin's `rootRouteRef`, which needs an NFS route binding under
  `convertLegacyAppRoot` to satisfy Backstage's routable-extension discovery ("Routable extension
  component ... was not discovered in the app element tree"), confirmed even with a dedicated
  standalone top-level mount point. `maturityApiRef` is a plain API ref with no such requirement, so
  every maturity-reading view here calls it directly instead.
- **Consequence of dropping those extensions entirely**: nothing in the app renders any
  routable/component extension from `@backstage-community/plugin-tech-insights-maturity` or from
  this package's own `CheckEditorPage` anymore, so neither plugin's `apis: [...]` factory
  registration is ever visited by the plugin loader (same documented gotcha as `perchAgentApiRef` in
  `apis.ts` — a plugin's own `apis` array is only picked up if *some* routable/component extension
  from that plugin is actually rendered). Both `maturityApiRef` and `dynamicChecksApiRef` are
  registered explicitly in `packages/app/src/apis.ts` instead of relying on plugin auto-discovery.
- `/check-editor` (the standalone routed `CheckEditorPage`) and `/maturity` (vendor `MaturityPage`)
  were removed from `App.tsx` — nothing links to them anymore now that check management is embedded
  directly and the compliance overview is purpose-built.

**Extraction for embedding**: `CheckEditorPage`'s state management + `CheckList`/`CheckForm` layout
was pulled into a plain (non-routable) component, `CheckManagementPanel`
(`src/components/CheckEditorPage/CheckManagementPanel.tsx`), exported alongside `CheckEditorPage`.
`CheckEditorPage` itself now just wraps `CheckManagementPanel` in `Page`/`Header`/`ContentHeader`
chrome — kept for anyone who wants a standalone routed page, but no longer used by this app.

**Local dev gotcha hit mid-build, unrelated to the code above but worth recording**: an earlier
`yarn install` (to add `@backstage-community/plugin-tech-insights-maturity-common` as an explicit
dependency) ran under the shell's default Node (20.x, since `nvm use 22.22` isn't sticky across
tool calls) instead of the pinned 22.22, silently rebuilding `better-sqlite3`'s native binding
against the wrong `NODE_MODULE_VERSION` and crashing every plugin's database on the next backend
restart. Fixed with `nvm use 22.22 && yarn rebuild`. Anyone hitting `NODE_MODULE_VERSION` mismatch
errors after an install should check which Node was active for that install first.

**`CheckForm` reorganized into a 5-section flow** (About → Classification → Define the check →
Test it → Save, each with a `SectionLabel` heading and a `Divider` between sections), replacing the
original flat field grid — requested explicitly because the flat layout didn't read as an authoring
sequence. The entity filter (an advanced/optional field) moved into a collapsible `Accordion` so it
doesn't compete with the required fields above it.

**Theming audit**: every color in this package and its app-level consumers was originally a literal
hex, picked ad hoc while building. Reconciled against two different sources of truth depending on
which side of the donation boundary the component sits on:

- This package (`tech-insights-react-check-editor`) has zero `@openchoreo/*` dependencies by design
  (Guardrail 1), so it cannot read `@openchoreo/backstage-design-system`'s tokens. Its tier chip
  colors now live in one place, `src/tierPalette.ts` (`TIER_LABEL`, `getTierColor(rank, theme)`),
  branching only on the plain-MUI `theme.palette.type` from `useTheme()` — the same mechanism that
  makes every other color in this package (buttons' `color="primary"`, etc.) automatically pick up
  whichever shell app's theme is installed, OpenChoreo's or otherwise. `CheckPolicyTable` renders
  tier chips `variant="outlined"` (border+text only, no fill) rather than a filled medal-colored
  pill — closer to the vendor maturity plugin's own `MaturityRankChip` (`Chip color={isMaxRank ?
  'success' : 'default'}`, no custom hex at all) than the original design.
- `packages/app`'s consumers (`EntityInsightsContent`, `ComplianceOverviewContent`,
  `ComplianceScoreCard`) *are* the OpenChoreo shell, so they pull from `useChoreoTokens()` directly:
  the compliance gauge and pass/fail check icons now read `tokens.status.gold`/`.ok`/`.error`
  instead of inlined hex. They also import `TIER_LABEL`/`getTierColor` from this package (exported
  from its `index.ts`) rather than keeping a second copy — the original app-level code had two
  independent `RANK_COLOR` maps that had drifted enough that Stone and Silver rendered as the exact
  same grey; there is now exactly one tier-color source, reused everywhere. Headline/single-emphasis
  chips (the per-entity "Maturity: X" badge, the 4-chip tier-distribution summary) stay filled, using
  `theme.palette.getContrastText()` to pick readable text against whichever tier color that theme
  resolves to, rather than a hardcoded white that would fail against the lighter tier colors dark
  mode uses.
- Did **not** add a new slot to `packages/design-system`'s `ThemeTokens` for tier colors — that file
  is shared by 20+ plugins and a 4-color addition for one feature's chips didn't warrant widening a
  shared contract; `tierPalette.ts`'s gold value was chosen to match `tokens.status.gold` (`#f3ba37`,
  itself identical in both light and dark) for visual consistency without an actual dependency.

Also fixed the Dry Run button's alignment in the Test It section: it sat in the same `Grid item`
row as the entity-ref `TextField`, but the outer form `Grid container` has no `alignItems`, so the
field's floating label pushed it out of line with the plain button beside it. Nested that pair in
its own `<Grid container spacing={2} alignItems="flex-end">` and dropped the button's `fullWidth` (it
was rendering as an oversized block relative to the field). Same pattern `CheckPolicyTable`'s filter
bar already used, just not carried over to this row when the form was restructured.

Verified all of the above live (both light and dark theme) against the running dev servers via
Playwright — the gauge, both chip styles, the entity-page rank/check chips, and the Dry Run row.

**Create/edit moved from a modal to a full page**, per explicit user feedback that it should match
this app's own house pattern for creation flows rather than a popup. Research into how OpenChoreo's
other domain-entity creation flows are built (cluster role bindings, environment overrides, workload
config, etc.) found there's no routed "New X" page anywhere in this app — the actual pattern is a
shared layout component, `DetailPageLayout` (`plugins/openchoreo-react/src/components/DetailPageLayout`),
swapped into view via local `useState` rather than a route (e.g. `BindingWizardPage`, mounted by a
boolean toggle in `NamespaceRoleBindingsContent`). No `Page`/`Header`/`Content` chrome, no new
`App.tsx` route — a back arrow (+ Esc) in a header bar, title/subtitle, and the form body beneath.

- `CheckPolicyTable` gained optional `onNewCheck?(factSchemas, existingCategories)` /
  `onEditCheck?(check, factSchemas, existingCategories)` props. When provided, "New check"/row-edit
  call them instead of opening the built-in `CheckFormDialog`, so a host app can supply its own
  full-page navigation — this package still can't import `@openchoreo/backstage-plugin-react`
  (Guardrail 1), so it can't render `DetailPageLayout` itself; it just hands the host everything
  needed (the check, and the factSchemas/categories it already fetched, so the host doesn't
  re-fetch them) and lets the host decide how to present it. Falls back to the internal dialog when
  the props are omitted, so the component is still usable standalone.
- New app-level `packages/app/src/components/insights/CheckEditPage.tsx` wraps `CheckForm` in
  `DetailPageLayout`, title flipping `"New check"` / `"Edit check: <name>"` per the `BindingWizardPage`
  convention.
- `InsightsPage`'s local view state extended from `'checks' | 'breakdown'` to add `'editCheck'`
  (plus `editingCheck`/`editingFactSchemas`/`editingCategories` state, populated by
  `onNewCheck`/`onEditCheck`) — same no-route approach already used for the breakdown view. The
  compliance score card is now gated to `view !== 'editCheck'`, since `DetailPageLayout` is a
  full-bleed take-over screen that a gauge floating above it would visually fight.
- `CheckForm` gained an optional `showTitle` prop (default `true`) so `CheckEditPage` can suppress
  its own `InfoCard` title — `DetailPageLayout`'s header already shows "New check"/"Edit check: X",
  and without this the same text rendered twice.
- Deliberately did **not** hoist `CheckForm`'s Save/Publish buttons into `DetailPageLayout`'s header
  `actions` slot, even though that's `BindingWizardPage`'s convention (primary action lives in the
  header, not the form body) — doing so would mean `CheckForm` handing its internal save/publish
  handlers out through new props, which isn't worth restructuring for a header-placement convention
  alone. `CheckForm` keeps its own Section 5 Save/Publish buttons.
- `CheckFormDialog` and `CheckManagementPanel` are both still exported, unused by this app — same
  precedent as before: nothing is deleted just because a newer presentation exists.
- Verified live: new-check page renders correctly, edit pre-populates every field (name, category,
  tier, fact retrievers) from the existing check, the back arrow returns to the table with the score
  card restored, and Save returns to the table showing the (unchanged) row — confirming the
  save→redirect path actually refreshes rather than showing stale data.

**Create/Cancel moved to a bottom-right button row**, per explicit user request — this is a
deliberate divergence from the house convention, not an oversight. Researched every other
`DetailPageLayout` consumer (`BindingWizardPage`, `EnvironmentOverridesPage`, `ReleaseDetailsPage`,
`WorkloadConfigPage`, `ProjectParametersConfigPage`, `ResourceParametersConfigPage`,
`WorkflowConfigPage`) to answer the user's own question about whether the back-arrow/Esc convention
is used elsewhere: **yes, universally** — every one of those pages gets it for free from
`DetailPageLayout`, and it's the *only* cancel affordance any of them has; none render a separate
"Cancel" button, and all of them put their primary Save/Create button in `DetailPageLayout`'s header
`actions` slot rather than the form body. This page now does neither — Cancel is a real button, and
Save/Publish/Cancel all live in `CheckForm`'s own body, not the header.

- `CheckForm` gained `onCancel?: () => void`. When provided, a "Cancel" button renders in a new
  `Box display="flex" justifyContent="flex-end"` row at the bottom of the Save section, ordered
  Cancel → Publish → Save/Create (Cancel plain-text, Publish outlined, Save/Create contained
  primary) — matching this codebase's existing `DialogActions` button-order convention
  (`WorkflowConfigPage`'s confirm dialog) rather than inventing a new one. `saveError`'s `Alert`
  stays a separate full-width `Grid item` above the row, not folded into the flex row.
- `CheckEditPage` passes the same `onBack` function to both `DetailPageLayout`'s `onBack` and
  `CheckForm`'s `onCancel` — the header back-arrow/Esc and the new bottom Cancel button are two
  entry points to the identical action, not competing behaviors.
- Net effect: this page now has three ways to abandon the editor (arrow, Esc, Cancel) where every
  other `DetailPageLayout` page has one. Flagged to the user rather than silently resolved — worth
  revisiting if it reads as redundant once more checks/policies exist to test against.
- `CheckFormDialog`/`CheckManagementPanel` are unaffected — `onCancel` is optional and only
  `CheckEditPage` passes it.
- Verified with an unpublished check specifically (both existing seed checks are published, so the
  three-button row — Cancel/Publish/Save — never renders for them): created a fresh draft check,
  confirmed the two-button row (Cancel/Create) on the new-check page, then edited that draft and
  confirmed all three buttons render bottom-right in the correct order.

## Original design (superseded above where noted)

## Purpose

The UI half of "manage checks from the UI without a restart" — the frontend counterpart to
Roadie's commercial "Add Check" flow (`https://roadie.io/docs/tech-insights/add-check/`), built
against the OSS `tech-insights-backend-module-dynamic-checks` package instead.

## Package identity

- Directory: `plugins/tech-insights-react-check-editor`
- Package name: `@openchoreo/backstage-plugin-tech-insights-react-check-editor`
  (rename target if donated: `@backstage-community/plugin-tech-insights-react-check-editor`)
- Role: `frontend-plugin`

## Guardrail 2 — the specific risk this package must design against

This is the package the master plan calls out by name for the semantic donation check (§1,
Guardrail 2), because it's the one place a donatable package can quietly become
OpenChoreo-specific without ever importing an `@openchoreo/*` package (which would at least be
caught by Guardrail 1's dependency grep):

> Its category dropdown and fact-ID picker must be **populated at runtime from the backend's
> actual registered facts/categories via API**, never **enumerated at build time** as a hardcoded
> list. A hardcoded `['Ownership', 'Security', 'OpenChoreo Deployment Health', ...]` select option
> would pass the dependency check and still make the component useless to anyone outside this org.

Concretely, this means:

- The category picker must call an endpoint that lists categories actually present across
  registered checks (or a dedicated categories endpoint, if `dynamic-checks` adds one) — not a
  constant array in this package's source.
- The fact-ID picker must be populated from whatever fact retrievers are actually registered in
  the running backend (all of tech-insights core's built-ins, Phase 1's GitHub/K8s collectors,
  *and* `openchoreo-scoring-backend`'s OpenChoreo-specific collectors, once Phase 2 exists) —
  fetched from the registry, not imported as a list of known retriever IDs.
- Review this package against that explicitly before the demo, not after — the master plan is
  emphatic on this point precisely because it's the kind of thing that's easy to get right by
  accident during initial development (when only OpenChoreo's own facts exist to test against)
  and easy to regress later without anyone noticing, since a hardcoded list still "works" for as
  long as nobody outside this org tries to use the package.

## Scope (UX flow, modeled on the Roadie UX already researched this session)

About → Conditions → Dry Run → Applies-to → Draft/Publish:

- **About**: name, description, category (runtime-discovered per Guardrail 2).
- **Conditions**: build the `rule.conditions` tree against runtime-discovered fact IDs and their
  schemas — operator choices limited to what `json-rules-engine` actually supports (confirmed
  this session: `equal, notEqual, in, notIn, contains, doesNotContain, lessThan,
  lessThanInclusive, greaterThan, greaterThanInclusive`), so the UI can't construct a condition the
  engine would reject.
- **Dry Run**: calls the backend's shared-`evaluate()`-backed dry-run endpoint (see
  `tech-insights-backend-module-dynamic-checks.md`) against a chosen sample entity, showing
  pass/fail before the check is saved. This is the step that only works correctly if the backend
  package's parity guarantee (dry-run and live checker share one evaluation function) holds — this
  package has no way to verify that guarantee itself, it just depends on it being true.
- **Applies-to**: entity filter builder (`kind`, annotation presence, etc.) — maps to the same
  `entityFilter` shape already used by every retriever in this plan.
- **Draft/Publish**: two-state lifecycle, so a check can be built and dry-run-tested before it
  starts affecting real scorecards.

## Dependency on the backend package's open design questions

This package cannot be made build-ready independently of
`tech-insights-backend-module-dynamic-checks` resolving its own open questions first, because:

- The **permissions** question (who can create/edit/publish) determines whether this UI needs
  role-gated affordances (hide/disable Draft→Publish for non-authorized users) or whether that's
  entirely enforced server-side with the UI just reflecting a 403.
- The **concurrency** question determines whether this UI needs any "someone else edited this
  check" conflict UI, or whether last-write-wins is acceptable for now.
- The **check-coexistence** question (migrating static checks as seed data) determines whether
  this editor's initial check list includes the 4 existing static checks as editable entries from
  day one, or whether those remain config-only and only newly-created checks appear here.

None of these block *starting* this package's component structure and the Guardrail-2-compliant
data-fetching layer, but they do block finalizing the About/Draft-Publish steps.

## Testing approach (once build-ready)

- Component tests for the category/fact-ID pickers explicitly asserting they render from mocked
  API responses and contain **zero** hardcoded OpenChoreo-specific strings — this is the concrete,
  automatable form of Guardrail 2's semantic check, and should run as part of this package's own
  test suite so a regression is caught in CI, not just at demo-review time.
- Manual verification of the full About→Publish flow against a running backend once
  `dynamic-checks` is build-ready.

## Non-goals for the demo

- Full permissions/audit UI — depends on the backend package's unresolved design question; fine to
  demo without it, not fine to ship past the demo without an owner assigned (master plan §5/§6).
