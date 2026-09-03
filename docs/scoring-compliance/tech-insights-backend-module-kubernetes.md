# `tech-insights-backend-module-kubernetes`

**Phase:** 1 (build alongside the GitHub collector) · **Donatable:** yes · **Status:** build-ready

## Purpose

Fact retrievers over generic Kubernetes object state — resource limits, replica health, and
pod-security settings like `runAsNonRoot` — using only the standard Backstage Kubernetes plugin
and vanilla object shapes. This directly answers the user's sample check #2 (deployment
`runAsNonRoot`) with a real fact source, without ever touching an OpenChoreo CRD.

## Package identity

- Directory: `plugins/tech-insights-backend-module-kubernetes`
- Package name: `@openchoreo/backstage-plugin-tech-insights-backend-module-kubernetes`
  (rename target if donated: `@backstage-community/plugin-tech-insights-backend-module-kubernetes`)
- Role: `backend-module` (module for the `tech-insights` backend plugin)
- **Must stay CRD-blind** — this is the one rule that makes this package a real donation
  candidate rather than OpenChoreo-specific in disguise: it reads Deployments/Pods/generic specs,
  never `Component`/`ComponentRelease`/any OpenChoreo CRD.

## Dependencies

- `@backstage-community/plugin-tech-insights-node` — extension point + types, same as the
  GitHub module.
- `@backstage/plugin-kubernetes-common` — for the `ObjectsByEntityResponse`/`KubernetesRequestBody`
  types shared with the already-installed `@backstage/plugin-kubernetes-backend` (confirmed
  present in `packages/backend/package.json` at `^0.21.4`).
- No direct Kubernetes client library dependency — see design decision below.

## Design decision: talk to the installed Kubernetes plugin, don't re-implement cluster access

Two ways to get object data:

1. **Re-implement cluster discovery/auth** with `@kubernetes/client-node` directly against
   `kubernetes.clusterLocatorMethods` config.
2. **Call the already-running `@backstage/plugin-kubernetes-backend`'s own HTTP API**, the same
   way `entityOwnershipFactRetriever` already calls the catalog backend's HTTP API rather than
   querying its database directly (confirmed from this session's boot log — retrievers reach
   other plugins via `ctx.discovery` + service-to-service auth, not direct imports).

**Chosen: option 2.** Verified by reading `KubernetesRouter.cjs.js` in the installed package:

```
POST /api/kubernetes/services/:serviceId
Body: { entity: Entity, auth?: KubernetesRequestAuth }
→ ObjectsByEntityResponse  (pods/deployments/etc. per matched cluster)
```

This is gated by `kubernetesResourcesReadPermission` in the router (confirmed in source), so the
retriever's service-to-service call needs valid plugin credentials — use
`ctx.auth.getPluginRequestToken({ onBehalfOf: await ctx.auth.getOwnServiceCredentials(),
targetPluginId: 'kubernetes' })` (both methods confirmed present on the `AuthService` type in
`@backstage/backend-plugin-api`) and confirm the permission policy allows service-to-service
`kubernetes.resources.read` — OpenChoreo's permission backend module falls back to ALLOW for
non-`openchoreo.*` permissions per its existing doc comment in `packages/backend/src/index.ts`,
so this should work without policy changes, but verify against a real call before assuming it.

Reusing the existing plugin means: no duplicate cluster-locator config, no duplicate auth-strategy
code, and the object matching (which cluster, which namespace, which objects) follows whatever
`backstage.io/kubernetes-id` / `backstage.io/kubernetes-namespace` annotation convention the
entity already uses for the Kubernetes tab — one annotation serves both features.

## Fact retrievers

**Field naming, confirmed the hard way while implementing the GitHub module (see
`tech-insights-backend-module-github.md`):** the checker merges every retriever's facts into one
flat namespace keyed by field name, not by retriever ID — `factValues` is built as
`Object.values(facts).reduce((acc, it) => ({...acc, ...it.facts}), {})`. A field called
`allContainersRunAsNonRoot` here would collide with any other retriever that happened to pick the
same name. Every field below is prefixed `k8s*` for exactly that reason.

### `kubernetesDeploymentSecurityFactRetriever`

| | |
|---|---|
| `id` | `kubernetesDeploymentSecurityFactRetriever` |
| `entityFilter` | `kind: component`, and only entities carrying `backstage.io/kubernetes-id` (the standard annotation, already meaningful if the Kubernetes tab is enabled for that component) |
| Facts | `k8sAllContainersRunAsNonRoot: boolean`, `k8sContainersWithoutSecurityContext: string[]` (names, for display) |
| Source | `ObjectsByEntityResponse.items[].resources` deployments — walk `spec.template.spec.containers[].securityContext.runAsNonRoot`, `false`/absent counts against the fact |

### `kubernetesResourceHealthFactRetriever`

| | |
|---|---|
| `id` | `kubernetesResourceHealthFactRetriever` |
| `entityFilter` | same as above |
| Facts | `k8sAllContainersHaveResourceLimits: boolean`, `k8sDesiredReplicas: number`, `k8sAvailableReplicas: number`, `k8sReplicasHealthy: boolean` (`available >= desired`) |
| Source | same Deployment objects — `spec.template.spec.containers[].resources.limits`, `status.replicas`/`status.availableReplicas` |

Same missing-data rule as the GitHub module: an entity with no `backstage.io/kubernetes-id`
annotation, or whose cluster lookup returns zero objects, is **omitted** from the retriever's
return array — not represented with a synthetic `false`.

**Also required, confirmed the hard way:** registering a retriever via `addFactRetrievers` is not
enough by itself — it must also have a `techInsights.factRetrievers.<id>` entry in `app-config.yaml`
(even just a `cadence`), or it's silently dropped before scheduling with no error or log line. See
`tech-insights-backend-module-github.md`'s "Confirmed technical facts" section for the exact
source location this was verified against.

## Sample check (answers the user's original sample check #2)

```yaml
techInsights:
  factRetrievers:
    kubernetesDeploymentSecurityFactRetriever:
      cadence: '*/5 * * * *'
      initialDelay: { seconds: 20 }
  factChecker:
    checks:
      runAsNonRootCheck:
        type: json-rules-engine
        name: Deployment containers run as non-root
        factIds: [kubernetesDeploymentSecurityFactRetriever]
        metadata: { category: Security, rank: 3 }
        rule:
          conditions:
            all:
              - fact: k8sAllContainersRunAsNonRoot
                operator: equal
                value: true
```

Single-fact, flat field-name check — confirmed well within engine capability. No multi-fact or
fact-to-fact comparison needed for this particular check, and note the flat `fact:` reference
(field name, not retriever ID + JSONPath `path` — the form the GitHub doc's first draft got wrong).

## Testing approach

- Unit test both retrievers against a mocked `ObjectsByEntityResponse` fixture (one with
  compliant containers, one with a mix, one entity with no `kubernetes-id` annotation to assert
  the skip behavior).
- Live smoke test requires a real cluster reachable via the configured
  `kubernetes.clusterLocatorMethods` — for local dev, the k3d cluster already used by the rest of
  this repo's OpenChoreo integration is the natural target, provided at least one Deployment
  exists there and the demo Component is annotated with its `kubernetes-id`.

## Open item carried from the master plan

None specific to this package beyond what's already flagged for Phase 1 generally (GitHub API
rate limits, not applicable here since this reads from the in-cluster API via the Kubernetes
plugin, not a rate-limited external API).
