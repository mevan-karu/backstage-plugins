# `openchoreo-scoring` (frontend)

**Phase:** 2 (build alongside/after `openchoreo-scoring-backend`) · **Donatable:** no · **Status:** build-ready

## Purpose

The branded per-component compliance page — the thing the team actually demos. Composes
Phase 1's real collector output and today's existing static checks (via
`openchoreo-scoring-backend`'s aggregation route) into one page that looks like an OpenChoreo
feature, not a bare upstream widget dropped onto an entity page.

## Package identity

- Directory: `plugins/openchoreo-scoring`
- Package name: `@openchoreo/backstage-plugin-openchoreo-scoring`
- Role: `frontend-plugin`

## Dependencies

- `@openchoreo/backstage-plugin-openchoreo-scoring-backend` — the aggregation API this page
  renders; this cross-package dependency alone is why this package can never be donated as-is
  (Guardrail 1 from the master plan: any `@openchoreo/*` dependency disqualifies a package).
- `@openchoreo/backstage-design-system` — `Card`, `StatusBadge`, `Skeleton`/`Spinner`/`PageLoader`
  for loading states, `VerticalTabNav` if the compliance categories end up as sub-tabs rather than
  one scrolling page. Confirmed exports as of this write-up (`packages/design-system/src/index.ts`).
- `@backstage-community/plugin-tech-insights-maturity` — only if branding decision (below) lands
  on "wrap the upstream component", not "replace it."
- `@openchoreo/openchoreo-react` — shared hooks (`useEntityDetails`) if this page needs the same
  entity-to-OpenChoreo-identity resolution already used elsewhere in the app.

## Recommended branding approach (proposes a resolution to master plan open question #2 — pending team sign-off)

Confirmed technical fact from this session: `MaturitySummaryInfoCard`/`MaturityRankChip` hardcode
the string "Maturity" and the raw `Rank[rank]` enum name with no override prop. `MaturityRankInfoCard`
(the fuller detail page component) already reads `techInsights.maturity.rank.*.title` from config,
so tier-name renaming works there today without any code change.

**Recommendation: don't wrap the upstream compact card at all — build our own summary
card in this package that calls `maturityApiRef` directly.** Reasoning:

- The compact card is exactly the piece with the hardcoded "Maturity" label, so wrapping it still
  requires either an upstream PR or CSS/DOM overlay hacks to relabel it — neither is clean.
- This package already needs a custom layout to combine the maturity rank with Phase 1/2 fact
  categories in one aggregated view (`openchoreo-scoring-backend`'s `/compliance` route returns
  exactly this combined shape) — so a from-scratch card is barely more work than a wrapper would
  have been, and avoids depending on upstream internals that could change.
- Keeps the "no upstream PR required for the demo" non-goal (master plan §5) intact — this was
  flagged as optional/deferred, and building our own card makes it fully unnecessary rather than
  partially necessary.

This also directly answers the user's earlier request ("is it possible to rename the maturity to
something meaningful such as Compliancy") — the answer becomes "yes, trivially, because we're not
using the upstream label at all here", rather than "only on the detail page, not the summary card."

## Page structure

Single entity-scoped tab, `EntityLayout.Route path="/compliance"` (new route, alongside the
existing `/tech-insights` route from the current wiring — not a replacement, since raw
tech-insights scorecard access is still useful for debugging individual checks):

- **Header**: overall rank (Bronze/Silver/Gold, our own chip component, config-driven title per
  the `MaturityRankInfoCard` pattern already confirmed to support this) + last-evaluated timestamp.
- **Category sections**: one per `metadata.category` value already present in today's check config
  (`Security`, `Ownership`, `Documentation`, etc.) — each listing its checks with pass/fail
  `StatusBadge`s. This structure only works because `openchoreo-scoring-backend`'s aggregation
  route groups by category server-side; this package does no grouping logic of its own.
- **Phase 4 demo-lite slot**: a small read-only panel, "Score history (from Kubernetes)", rendering
  the hand-applied sample `ComponentScore` CR — see `openchoreo-scoring-backend.md`'s Phase 4
  section. Present as a visually distinct, clearly-labeled "preview of the CR-backed future state"
  block, not blended into the live compliance data, so the demo doesn't imply a write path exists
  when it doesn't yet.

## Why not the packaged `MaturityPage`

Confirmed from this session: the packaged `MaturityPage`/`EntityMaturitySummaryCard` hardcode
`kind: ['Component']` with no override prop. Building our own combined page here means System,
Domain, and Group entities (already wired to show `EntityMaturitySummaryCard` today per the
current `EntityPage.tsx` wiring) render consistently through the same component instead of two
divergent paths. This page becomes the one true entity compliance view; the raw upstream
`/tech-insights` and `/maturity` standalone pages stay as-is for debugging, not for the main demo
flow.

## EntityPage wiring (mirrors the existing pattern exactly)

```tsx
// packages/app/src/components/catalog/EntityPage.tsx
import { EntityComplianceContent } from '@openchoreo/backstage-plugin-openchoreo-scoring';

// added alongside the existing:
//   <EntityLayout.Route path="/tech-insights" title="Insights">
//     <EntityTechInsightsScorecardContent title="Scorecard" />
//   </EntityLayout.Route>
<EntityLayout.Route path="/compliance" title="Compliance">
  <EntityComplianceContent />
</EntityLayout.Route>
```

Applied to the same four page trees as the current tech-insights wiring
(`ServiceEntityPage`, `GenericComponentEntityPage`, `systemPage`, `defaultEntityPage`) — confirmed
locations by line in the current file (161–162 imports; 459–460, 586–587, 610–611, 817–818 route
insertions).

## Testing approach

- Component tests for the category-grouped rendering against a mocked `/compliance` response
  (both a fully-passing and a mixed-result fixture).
- Manual verification against the real backend once Phase 1 + `openchoreo-scoring-backend` are
  live — no dev-mode mock is a substitute for seeing real GitHub/K8s fact data render correctly,
  per this repo's own standing rule to verify UI changes in a running browser before calling them
  done.

## Open item carried from the master plan

This doc proposes a resolution to master plan open question #2 ("how far must Compliance
branding reach"): build our own card instead of wrapping the upstream one, so no upstream PR is
needed even post-demo, unless the standalone `/maturity` page itself later needs the same rename.
**This is a recommendation for the team demo discussion, not a decision already made** — flag it
explicitly when presenting this doc, since the master plan reserved this question for the team.
