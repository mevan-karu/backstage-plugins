import {
  coreServices,
  createBackendModule,
  resolvePackagePath,
} from '@backstage/backend-plugin-api';
import { catalogServiceRef } from '@backstage/plugin-catalog-node';
import { techInsightsFactCheckerFactoryExtensionPoint } from '@backstage-community/plugin-tech-insights-node';
import { JsonRulesEngineFactCheckerFactory } from '@backstage-community/plugin-tech-insights-backend-module-jsonfc';
import { DynamicCheckRegistry } from './DynamicCheckRegistry';
import { createDynamicChecksRouter } from './router';

const migrationsDir = resolvePackagePath(
  '@openchoreo/backstage-plugin-tech-insights-backend-module-dynamic-checks',
  'migrations',
);

export const techInsightsModuleDynamicChecks = createBackendModule({
  pluginId: 'tech-insights',
  moduleId: 'dynamic-checks',
  register(reg) {
    reg.registerInit({
      deps: {
        factCheckerFactory: techInsightsFactCheckerFactoryExtensionPoint,
        database: coreServices.database,
        logger: coreServices.logger,
        httpRouter: coreServices.httpRouter,
        discovery: coreServices.discovery,
        auth: coreServices.auth,
        catalog: catalogServiceRef,
      },
      async init({
        factCheckerFactory,
        database,
        logger,
        httpRouter,
        discovery,
        auth,
        catalog,
      }) {
        const client = await database.getClient();
        if (!database.migrations?.skip) {
          // A module sharing its host plugin's pluginId also shares that
          // plugin's database — including the default `knex_migrations`
          // ledger table. Running `migrate.latest()` against the shared
          // table with our own migrations directory corrupts the host
          // plugin's own migration validation (it cross-checks the ledger
          // against files in ITS directory and errors on unrecognized
          // entries). A distinct tableName keeps our migration history
          // separate within the same physical database.
          await client.migrate.latest({
            directory: migrationsDir,
            tableName: 'dynamic_checks_migrations',
          });
        }

        const registry = new DynamicCheckRegistry(client);

        // Reuse jsonfc's own evaluation class rather than reimplementing
        // json-rules-engine evaluation — see
        // tech-insights-backend-module-dynamic-checks.md for why this avoids
        // the dry-run/live-check drift risk entirely instead of just
        // mitigating it with a shared function.
        factCheckerFactory.setFactCheckerFactory(
          new JsonRulesEngineFactCheckerFactory({
            checks: [],
            logger,
            checkRegistry: registry,
            catalog,
            auth,
          }),
        );

        httpRouter.use(
          await createDynamicChecksRouter({ logger, registry, discovery, auth }),
        );
      },
    });
  },
});
