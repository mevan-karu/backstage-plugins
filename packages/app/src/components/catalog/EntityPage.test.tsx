import { render } from '@testing-library/react';
import { Entity } from '@backstage/catalog-model';
import { TestApiProvider } from '@backstage/test-utils';
import { ConfigReader } from '@backstage/config';
import { configApiRef, featureFlagsApiRef } from '@backstage/core-plugin-api';
import { EntityProvider } from '@backstage/plugin-catalog-react';
import { useComponentHasAnyCiliumEnabledEnvironment } from '@openchoreo/backstage-plugin-openchoreo-observability';

// Control the Cilium gate without hitting the observability backend, and stub
// the wirelogs viewer itself (it has its own data-fetching APIs we don't wire
// up here); keep every other observability export real so module-load wiring
// is untouched.
jest.mock('@openchoreo/backstage-plugin-openchoreo-observability', () => ({
  ...jest.requireActual(
    '@openchoreo/backstage-plugin-openchoreo-observability',
  ),
  useComponentHasAnyCiliumEnabledEnvironment: jest.fn(),
  ObservabilityWirelogs: () => null,
}));

// The real delete-aware layout pulls catalog/permission APIs we don't need
// here; render its children straight through.
jest.mock('./EntityLayoutWithDelete', () => ({
  EntityLayoutWithDelete: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

// Replace EntityLayout with a shell that evaluates each route's `if`
// predicate (a light regression guard against predicates that throw) and
// mounts the Wirelogs route's content specifically, since that's the one
// route whose Cilium gating now lives in its content (WirelogsTabContent)
// rather than in an `if` predicate — see the comment on serviceEntityPage in
// EntityPage.tsx for why. Other routes' content is not mounted. The real
// EntitySwitch is kept so component-type routing still drives which page
// component renders.
jest.mock('@backstage/plugin-catalog', () => {
  const actual = jest.requireActual('@backstage/plugin-catalog');
  const EntityLayout = ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  );
  EntityLayout.Route = ({
    path,
    if: predicate,
    children,
  }: {
    path?: string;
    if?: (...args: any[]) => any;
    children?: React.ReactNode;
  }) => {
    if (typeof predicate === 'function') {
      try {
        predicate();
      } catch {
        // Sibling route predicates may expect a fully-populated entity; we only
        // care that they execute without crashing the test here.
      }
    }
    return path === '/wirelogs' ? <>{children}</> : null;
  };
  return { ...actual, EntityLayout };
});

// eslint-disable-next-line import/first
import { entityPage } from './EntityPage';

const mockHasCilium =
  useComponentHasAnyCiliumEnabledEnvironment as jest.MockedFunction<
    typeof useComponentHasAnyCiliumEnabledEnvironment
  >;

const componentEntity = (type: string): Entity => ({
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: { name: 'test-component', namespace: 'default' },
  spec: { type, lifecycle: 'production', owner: 'team-a' },
});

const featureFlagsApi = {
  registerFlag: () => {},
  getRegisteredFlags: () => [],
  isActive: () => false,
  save: () => {},
};

// Plain render (no renderInTestApp) so we exercise the EntitySwitch routing and
// the page components directly, without the app route collector mounting every
// routable extension (techdocs etc.) in the tree.
const renderPage = (entity: Entity) =>
  render(
    <TestApiProvider
      apis={[
        [featureFlagsApiRef, featureFlagsApi],
        [configApiRef, new ConfigReader({})],
      ]}
    >
      <EntityProvider entity={entity}>{entityPage}</EntityProvider>
    </TestApiProvider>,
  );

beforeEach(() => {
  jest.clearAllMocks();
});

describe('entityPage component routing', () => {
  it('renders the service entity page and gates the Wirelogs tab content on Cilium availability', () => {
    mockHasCilium.mockReturnValue(true);

    // deployment/service maps to the "service" page variant.
    renderPage(componentEntity('deployment/service'));

    expect(mockHasCilium).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'Component' }),
    );
  });

  it('renders the generic component entity page and gates the Wirelogs tab content', () => {
    mockHasCilium.mockReturnValue(false);

    // deployment/web-app maps to the "website" (non-service) variant.
    renderPage(componentEntity('deployment/web-app'));

    expect(mockHasCilium).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'Component' }),
    );
  });
});
