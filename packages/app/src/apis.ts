import {
  ScmIntegrationsApi,
  scmIntegrationsApiRef,
  ScmAuth,
} from '@backstage/integration-react';
import {
  AnyApiFactory,
  configApiRef,
  createApiFactory,
  discoveryApiRef,
  oauthRequestApiRef,
  errorApiRef,
  identityApiRef,
  fetchApiRef,
  storageApiRef,
} from '@backstage/core-plugin-api';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { OAuth2, GithubAuth } from '@backstage/core-app-api';
import { githubAuthApiRef } from '@backstage/core-plugin-api';
import { VisitsWebStorageApi, visitsApiRef } from '@backstage/plugin-home';

// No explicit default theme id is seeded into localStorage. Backstage's
// user-settings panel renders a built-in Auto button that picks the first
// registered dark or light theme based on the OS `prefers-color-scheme`
// preference, which is exactly the behavior we want for new users.
import { UserSettingsStorage } from '@backstage/plugin-user-settings';
import { permissionApiRef } from '@backstage/plugin-permission-react';
import { OpenChoreoFetchApi } from './apis/OpenChoreoFetchApi';
import { OpenChoreoPermissionApi } from './apis/OpenChoreoPermissionApi';
import { openChoreoAuthApiRef } from './apis/authRefs';
// NOTE: ``perchAgentApiRef`` is also declared on
// ``openchoreoPerchPlugin.apis`` in plugins/openchoreo-portal-assistant/src/plugin.ts.
// That declaration is NOT picked up by the app at runtime because the plugin
// exports plain React components — it never registers a routable or
// component extension, so Backstage's plugin loader never visits its
// ``apis`` array. The app-level factory below is the one actually wired in;
// removing it causes ``NotImplementedError: No implementation available for
// apiRef{plugin.openchoreo-portal-assistant.service}`` in AssistantDrawerProvider.
import {
  perchAgentApiRef,
  PerchAgentClient,
} from '@openchoreo/backstage-plugin-openchoreo-portal-assistant';
// Same situation as perchAgentApiRef above: dynamicChecksApiRef is declared
// on techInsightsCheckEditorPlugin.apis, but CheckManagementPanel (embedded
// directly in InsightsPage) is a plain component, not a routable/component
// extension — so the plugin loader never visits that apis array. This
// explicit factory is the one actually wired in.
import {
  dynamicChecksApiRef,
  DynamicChecksClient,
} from '@openchoreo/backstage-plugin-tech-insights-react-check-editor';
// Same situation again: maturityApiRef is declared on
// techInsightsMaturityPlugin.apis, but nothing in this app renders any of
// that plugin's routable/component extensions anymore (EntityInsightsContent
// and ComplianceOverviewContent both call maturityApiRef directly instead) —
// so the plugin loader never visits its apis array either.
import {
  maturityApiRef,
  MaturityClient,
} from '@backstage-community/plugin-tech-insights-maturity';

export const apis: AnyApiFactory[] = [
  createApiFactory({
    api: scmIntegrationsApiRef,
    deps: { configApi: configApiRef },
    factory: ({ configApi }) => ScmIntegrationsApi.fromConfig(configApi),
  }),
  ScmAuth.createDefaultApiFactory(),

  // GitHub OAuth — needed so ScmAuth (and the githubActionsApiRef factory
  // registered by the `githubActionsPluginAlpha` NFS feature in App.tsx,
  // which the GitHub Actions card depends on) can obtain a per-user GitHub
  // token. Backend provider is already registered in
  // packages/backend/src/index.ts; this just wires up the frontend side.
  // NOTE: githubActionsApiRef itself must NOT be registered here too — the
  // vendor plugin's `/alpha` feature already provides an identical factory,
  // and Backstage's app plugin throws a hard API_FACTORY_CONFLICT at boot
  // if two extensions (this file's `app`-scoped one and the plugin's
  // `github-actions`-scoped one) both provide the same ApiRef.
  createApiFactory({
    api: githubAuthApiRef,
    deps: {
      discoveryApi: discoveryApiRef,
      oauthRequestApi: oauthRequestApiRef,
      configApi: configApiRef,
    },
    factory: ({ discoveryApi, oauthRequestApi, configApi }) =>
      GithubAuth.create({
        discoveryApi,
        oauthRequestApi,
        configApi,
        defaultScopes: ['read:user', 'repo'],
        environment: configApi.getOptionalString('auth.environment'),
      }),
  }),

  // Custom PermissionApi that injects IDP token for OpenChoreo authorization
  // This is needed because Backstage's default PermissionClient doesn't allow
  // custom headers to be injected (it uses cross-fetch directly)
  createApiFactory({
    api: permissionApiRef,
    deps: {
      configApi: configApiRef,
      discoveryApi: discoveryApiRef,
      identityApi: identityApiRef,
      oauthApi: openChoreoAuthApiRef,
    },
    factory: ({ configApi, discoveryApi, identityApi, oauthApi }) =>
      new OpenChoreoPermissionApi({
        config: configApi,
        discovery: discoveryApi,
        identity: identityApi,
        oauthApi,
      }),
  }),

  // Custom FetchApi that automatically injects auth tokens
  // This wraps all fetch calls to include Backstage token + IDP token
  // When openchoreo.features.auth.enabled is false, IDP token injection is skipped
  createApiFactory({
    api: fetchApiRef,
    deps: {
      identityApi: identityApiRef,
      oauthApi: openChoreoAuthApiRef,
      configApi: configApiRef,
    },
    factory: ({ identityApi, oauthApi, configApi }) =>
      new OpenChoreoFetchApi(identityApi, oauthApi, configApi),
  }),

  // OpenChoreo Auth provider - works with any OIDC-compliant IDP
  createApiFactory({
    api: openChoreoAuthApiRef,
    deps: {
      discoveryApi: discoveryApiRef,
      oauthRequestApi: oauthRequestApiRef,
      configApi: configApiRef,
    },
    factory: ({ discoveryApi, oauthRequestApi, configApi }) => {
      const env =
        configApi.getOptionalString('auth.environment') ?? 'development';
      const scopeStr = configApi.getOptionalString(
        'openchoreo.features.auth.scope',
      );
      const scopes = scopeStr?.split(/\s+/).filter(Boolean) ?? [];
      const defaultScopes = scopes.length
        ? scopes
        : ['openid', 'profile', 'email'];
      return OAuth2.create({
        discoveryApi,
        oauthRequestApi,
        configApi,
        provider: {
          id: 'openchoreo-auth',
          title: 'OpenChoreo',
          icon: () => null,
        },
        environment: env,
        defaultScopes,
      });
    },
  }),
  createApiFactory({
    api: visitsApiRef,
    deps: {
      identityApi: identityApiRef,
      errorApi: errorApiRef,
    },
    factory: ({ identityApi, errorApi }) =>
      VisitsWebStorageApi.create({ identityApi, errorApi }),
  }),
  // User settings storage - enables centralized storage for starred entities and preferences
  createApiFactory({
    api: storageApiRef,
    deps: {
      discoveryApi: discoveryApiRef,
      errorApi: errorApiRef,
      fetchApi: fetchApiRef,
      identityApi: identityApiRef,
    },
    factory: deps => UserSettingsStorage.create(deps),
  }),

  // Assistant Agent client (Perch). Mirrors the registration on
  // openchoreoPerchPlugin.apis — see the import-site comment for why
  // both exist.
  createApiFactory({
    api: perchAgentApiRef,
    deps: {
      discoveryApi: discoveryApiRef,
      fetchApi: fetchApiRef,
    },
    factory: ({ discoveryApi, fetchApi }) =>
      new PerchAgentClient({ discoveryApi, fetchApi }),
  }),

  // Dynamic checks API for CheckManagementPanel — see import-site comment.
  createApiFactory({
    api: dynamicChecksApiRef,
    deps: {
      discoveryApi: discoveryApiRef,
      fetchApi: fetchApiRef,
    },
    factory: ({ discoveryApi, fetchApi }) =>
      new DynamicChecksClient(discoveryApi, fetchApi),
  }),

  // Maturity API for EntityInsightsContent / ComplianceOverviewContent — see
  // import-site comment.
  createApiFactory({
    api: maturityApiRef,
    deps: {
      discoveryApi: discoveryApiRef,
      identityApi: identityApiRef,
      catalogApi: catalogApiRef,
      configApi: configApiRef,
    },
    factory: ({ discoveryApi, identityApi, catalogApi, configApi }) =>
      new MaturityClient({
        discoveryApi,
        identityApi,
        catalogApi,
        enableCompoundEntityCheck: configApi.getOptionalBoolean(
          'techInsights.maturity.enableCompoundEntityCheck',
        ),
      }),
  }),
];
