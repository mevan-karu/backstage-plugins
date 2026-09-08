import { useState } from 'react';
import Box from '@material-ui/core/Box';
import { Content, Header, Page } from '@backstage/core-components';
import {
  CheckPolicyTable,
  type DynamicCheck,
  type FactSchema,
} from '@openchoreo/backstage-plugin-tech-insights-react-check-editor';
import { ComplianceScoreCard } from './ComplianceScoreCard';
import { ComplianceOverviewContent } from './ComplianceOverviewContent';
import { CheckEditPage } from './CheckEditPage';

type View = 'checks' | 'breakdown' | 'editCheck';

/**
 * Security-manager-facing Insights page, the single nav-bar entry for
 * checks/compliance: a compliance score at top, and a filterable check
 * (policy) table beneath it — check configuration and the catalog-wide score
 * live together here, not split into tabs or a separate top-level page.
 * "View full breakdown" swaps in the per-component maturity breakdown, and
 * "New check"/edit swaps in the full-page CheckEditPage — all via local view
 * state (no dedicated routes). Per-component results (which checks failed
 * for that component, grouped by category/tier) live on each entity's own
 * "Insights" tab instead (see EntityInsightsContent).
 */
export function InsightsPage() {
  const [view, setView] = useState<View>('checks');
  const [editingCheck, setEditingCheck] = useState<DynamicCheck | null>(null);
  const [editingFactSchemas, setEditingFactSchemas] = useState<FactSchema[]>([]);
  const [editingCategories, setEditingCategories] = useState<string[]>([]);

  function openEditor(
    check: DynamicCheck | null,
    factSchemas: FactSchema[],
    existingCategories: string[],
  ) {
    setEditingCheck(check);
    setEditingFactSchemas(factSchemas);
    setEditingCategories(existingCategories);
    setView('editCheck');
  }

  return (
    <Page themeId="home">
      <Header
        title="Insights"
        subtitle="Compliance scores and check configuration across the catalog"
      />
      <Content>
        {view !== 'editCheck' && (
          <Box mb={2}>
            <ComplianceScoreCard onViewBreakdown={() => setView('breakdown')} />
          </Box>
        )}
        {view === 'checks' && (
          <CheckPolicyTable
            onNewCheck={(factSchemas, existingCategories) =>
              openEditor(null, factSchemas, existingCategories)
            }
            onEditCheck={(check, factSchemas, existingCategories) =>
              openEditor(check, factSchemas, existingCategories)
            }
          />
        )}
        {view === 'breakdown' && (
          <ComplianceOverviewContent onBack={() => setView('checks')} />
        )}
        {view === 'editCheck' && (
          <CheckEditPage
            check={editingCheck}
            factSchemas={editingFactSchemas}
            existingCategories={editingCategories}
            onBack={() => setView('checks')}
            onSaved={() => setView('checks')}
            onPublished={() => setView('checks')}
          />
        )}
      </Content>
    </Page>
  );
}
