import {
  createApiFactory,
  createPlugin,
  createRoutableExtension,
  discoveryApiRef,
  fetchApiRef,
} from '@backstage/core-plugin-api';
import { dynamicChecksApiRef } from './api/DynamicChecksApi';
import { DynamicChecksClient } from './api/DynamicChecksClient';
import { rootRouteRef } from './routes';

export const techInsightsCheckEditorPlugin = createPlugin({
  id: 'tech-insights-check-editor',
  routes: {
    root: rootRouteRef,
  },
  apis: [
    createApiFactory({
      api: dynamicChecksApiRef,
      deps: { discoveryApi: discoveryApiRef, fetchApi: fetchApiRef },
      factory: ({ discoveryApi, fetchApi }) =>
        new DynamicChecksClient(discoveryApi, fetchApi),
    }),
  ],
});

export const CheckEditorPage = techInsightsCheckEditorPlugin.provide(
  createRoutableExtension({
    name: 'CheckEditorPage',
    component: () =>
      import('./components/CheckEditorPage').then(m => m.CheckEditorPage),
    mountPoint: rootRouteRef,
  }),
);
