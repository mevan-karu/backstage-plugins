import { z } from 'zod';
import AssessmentIcon from '@material-ui/icons/Assessment';
import {
  ApiBlueprint,
  configApiRef,
  createFrontendFeatureLoader,
  createFrontendModule,
  createFrontendPlugin,
  discoveryApiRef,
  fetchApiRef,
  identityApiRef,
  PageBlueprint,
} from '@backstage/frontend-plugin-api';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import {
  EntityCardBlueprint,
  EntityContentBlueprint,
} from '@backstage/plugin-catalog-react/alpha';
import {
  maturityApiRef,
  MaturityClient,
} from '@backstage-community/plugin-tech-insights-maturity';
import { dynamicChecksApiRef } from './api/DynamicChecksApi';
import { DynamicChecksClient } from './api/DynamicChecksClient';
import { DEFAULT_ENTITY_TAB_PATH, rootRouteRef } from './routes';

const DEFAULT_TITLE = 'Scorecards';

const dynamicChecksApi = ApiBlueprint.make({
  name: 'dynamic-checks',
  params: defineParams =>
    defineParams({
      api: dynamicChecksApiRef,
      deps: { discoveryApi: discoveryApiRef, fetchApi: fetchApiRef },
      factory: ({ discoveryApi, fetchApi }) =>
        new DynamicChecksClient(discoveryApi, fetchApi),
    }),
});

/**
 * Configurable under `app.extensions` as `page:tech-insights-scorecards`:
 * `path` and `title` (built in), `kinds` (entity kinds the overview scores,
 * default `[Component]`) and `showChecks` (default `true`).
 */
const scorecardsPage = PageBlueprint.makeWithOverrides({
  configSchema: {
    kinds: z.array(z.string()).optional(),
    showChecks: z.boolean().optional(),
  },
  factory(originalFactory, { config }) {
    const title = config.title ?? DEFAULT_TITLE;
    return originalFactory({
      path: '/scorecards',
      routeRef: rootRouteRef,
      title: DEFAULT_TITLE,
      icon: <AssessmentIcon />,
      // The page renders its own <Page><Header>.
      noHeader: true,
      loader: () =>
        import('./components/ScorecardsPage').then(m => (
          <m.ScorecardsPage
            title={title}
            kinds={config.kinds?.length ? config.kinds : ['Component']}
            showChecks={config.showChecks ?? true}
          />
        )),
    });
  },
});

/**
 * Configurable under `app.extensions` as
 * `entity-content:tech-insights-scorecards`. Keep the default `path`: the
 * page's breakdown links to it.
 */
const entityScorecardContent = EntityContentBlueprint.make({
  params: {
    path: DEFAULT_ENTITY_TAB_PATH,
    title: DEFAULT_TITLE,
    loader: () =>
      import('./components/EntityScorecardContent').then(m => (
        <m.EntityScorecardContent />
      )),
  },
});

/**
 * Configurable under `app.extensions` as
 * `entity-card:tech-insights-scorecards/summary`: `title`, plus the built-in
 * `filter` (default: Systems, Domains and Groups) and `type`.
 */
const entityScorecardSummaryCard = EntityCardBlueprint.makeWithOverrides({
  name: 'summary',
  configSchema: {
    title: z.string().optional(),
  },
  factory(originalFactory, { config }) {
    return originalFactory({
      type: 'info',
      filter: { kind: { $in: ['System', 'Domain', 'Group'] } },
      loader: () =>
        import('./components/EntityScorecardSummaryCard').then(m => (
          <m.EntityScorecardSummaryCard title={config.title ?? DEFAULT_TITLE} />
        )),
    });
  },
});

/**
 * Scorecards over Tech Insights: a catalog-wide page with check management,
 * a per-entity tab, and a summary card for Systems, Domains and Groups.
 *
 * @alpha
 */
export const techInsightsScorecardsPlugin = createFrontendPlugin({
  pluginId: 'tech-insights-scorecards',
  routes: { root: rootRouteRef },
  extensions: [
    dynamicChecksApi,
    scorecardsPage,
    entityScorecardContent,
    entityScorecardSummaryCard,
  ],
});

/**
 * Replaces `@backstage-community/plugin-tech-insights-maturity`'s own
 * `maturityApiRef` factory, which never passes `enableCompoundEntityCheck`,
 * so `techInsights.maturity.enableCompoundEntityCheck` would otherwise be
 * ignored. API overrides must come from a module of the owning plugin.
 *
 * @alpha
 */
export const techInsightsMaturityApiModule = createFrontendModule({
  pluginId: 'tech-insights-maturity',
  extensions: [
    ApiBlueprint.make({
      params: defineParams =>
        defineParams({
          api: maturityApiRef,
          deps: {
            catalogApi: catalogApiRef,
            configApi: configApiRef,
            discoveryApi: discoveryApiRef,
            identityApi: identityApiRef,
          },
          factory: ({ catalogApi, configApi, discoveryApi, identityApi }) =>
            new MaturityClient({
              catalogApi,
              discoveryApi,
              identityApi,
              enableCompoundEntityCheck: configApi.getOptionalBoolean(
                'techInsights.maturity.enableCompoundEntityCheck',
              ),
            }),
        }),
    }),
  ],
});

/**
 * Feature discovery reads only the default export, so the maturity API
 * module ships alongside the plugin rather than as a separate named export.
 *
 * @alpha
 */
export default createFrontendFeatureLoader({
  loader: () => [techInsightsScorecardsPlugin, techInsightsMaturityApiModule],
});
