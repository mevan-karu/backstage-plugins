import {
  coreServices,
  createBackendModule,
  resolvePackagePath,
} from '@backstage/backend-plugin-api';
import { catalogServiceRef } from '@backstage/plugin-catalog-node';
import { techInsightsFactCheckerFactoryExtensionPoint } from '@backstage-community/plugin-tech-insights-node';
import { JsonRulesEngineFactCheckerFactory } from '@backstage-community/plugin-tech-insights-backend-module-jsonfc';
import { dynamicChecksPermissions } from '@openchoreo/backstage-plugin-tech-insights-dynamic-checks-common';
import { DynamicCheckRegistry } from './DynamicCheckRegistry';
import type { CheckEvaluation } from './dryRun';
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
        httpAuth: coreServices.httpAuth,
        auth: coreServices.auth,
        permissions: coreServices.permissions,
        permissionsRegistry: coreServices.permissionsRegistry,
        scheduler: coreServices.scheduler,
        catalog: catalogServiceRef,
      },
      async init({
        factCheckerFactory,
        database,
        logger,
        httpRouter,
        httpAuth,
        auth,
        permissions,
        permissionsRegistry,
        scheduler,
        catalog,
      }) {
        permissionsRegistry.addPermissions(dynamicChecksPermissions);

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
        const jsonfcFactory = new JsonRulesEngineFactCheckerFactory({
          checks: [],
          logger,
          checkRegistry: registry,
          catalog,
          auth,
        });
        // tech-insights builds its checker privately and exposes it only over
        // HTTP. Keeping the instance it constructs (with the fact store it
        // passed in) lets dry-run evaluate in-process and read facts and
        // schemas to explain an empty result.
        let evaluation: CheckEvaluation | undefined;
        factCheckerFactory.setFactCheckerFactory({
          construct(store) {
            const checker = jsonfcFactory.construct(store);
            evaluation = { checker, store };
            return checker;
          },
        });

        httpRouter.use(
          await createDynamicChecksRouter({
            logger,
            registry,
            catalog,
            httpAuth,
            permissions,
            scheduler,
            getEvaluation: () => evaluation,
          }),
        );
      },
    });
  },
});
