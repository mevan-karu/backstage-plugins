# @openchoreo/backstage-plugin-tech-insights-scorecards

Scorecards over Backstage Tech Insights: a catalog-wide page with a pass-rate summary, a
per-entity tier breakdown, the checks table and editor (draft, dry-run, publish), and a Data
sources panel; plus a scorecard tab on each entity page. Checks are managed through
`@openchoreo/backstage-plugin-tech-insights-backend-module-dynamic-checks`, without a config
change or restart.

## Install

The plugin supports the New Frontend System and frontend feature discovery:

```bash
yarn --cwd packages/app add @openchoreo/backstage-plugin-tech-insights-scorecards \
  @backstage-community/plugin-tech-insights-maturity
```

The maturity plugin provides the scores API this plugin reads. To hide the maturity plugin's own
views:

```yaml
app:
  extensions:
    - page:tech-insights-maturity: false
    - entity-content:tech-insights-maturity/maturity: false
    - entity-content:tech-insights-maturity/summary: false
    - entity-card:tech-insights-maturity/maturity-summary: false
```

Backend: `@backstage-community/plugin-tech-insights-backend`,
`@openchoreo/backstage-plugin-tech-insights-backend-module-dynamic-checks`, and any fact
collector modules, each with a `techInsights.factRetrievers.<id>` schedule.

## Configure

| Extension                                 | Config                                                                                                                                              |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `page:tech-insights-scorecards`           | `path` (default `/scorecards`), `title` (default `Scorecards`), `kinds` (entity kinds scored, default `[Component]`), `showChecks` (default `true`) |
| `entity-content:tech-insights-scorecards` | `title`, `group`, `filter`, `icon`. Keep the default `path` (`/scorecards`); the page's breakdown links to it.                                      |

```yaml
app:
  extensions:
    - page:tech-insights-scorecards:
        config:
          path: /compliance
          title: Compliance
          kinds: [Component, API]
    - entity-content:tech-insights-scorecards:
        config:
          title: Compliance
```

Set `showChecks: false` when checks aren't stored by the dynamic-checks module, for example when
the portal keeps checks in `app-config` with the upstream jsonfc checker.

## Permissions

Check management is guarded by the permissions in
`@openchoreo/backstage-plugin-tech-insights-dynamic-checks-common`. The page hides the checks
table from users without `tech-insights.dynamic-check.read` and disables the actions a user isn't
allowed to take; the backend enforces the same permissions.
