import { useCallback, useEffect, useState } from 'react';
import Grid from '@material-ui/core/Grid';
import { Progress, ResponseErrorPanel } from '@backstage/core-components';
import { useApi } from '@backstage/core-plugin-api';
import { dynamicChecksApiRef } from '../../api/DynamicChecksApi';
import type { DynamicCheck, FactSchema } from '../../api/types';
import { CheckList } from './CheckList';
import { CheckForm } from './CheckForm';

/**
 * Check list + create/edit/dry-run form, with no Page/Header chrome of its
 * own — embeddable as a sub-view (e.g. a tab on the top-level Insights page)
 * rather than only reachable as a standalone routed page. `CheckEditorPage`
 * wraps this for a standalone route; this is the piece other apps embed
 * directly.
 */
export function CheckManagementPanel() {
  const api = useApi(dynamicChecksApiRef);

  const [checks, setChecks] = useState<DynamicCheck[]>([]);
  const [factSchemas, setFactSchemas] = useState<FactSchema[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | undefined>();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [checksResult, factSchemasResult] = await Promise.all([
        api.listChecks(),
        api.listFactSchemas(),
      ]);
      setChecks(checksResult);
      setFactSchemas(factSchemasResult);
      setError(undefined);
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const selectedCheck = creatingNew
    ? null
    : checks.find(c => c.id === selectedId) ?? null;

  const existingCategories = Array.from(
    new Set(
      checks
        .map(c => c.metadata?.category)
        .filter((c): c is string => typeof c === 'string' && c.length > 0),
    ),
  );

  async function handleDelete(id: string) {
    await api.deleteCheck(id);
    if (selectedId === id) {
      setSelectedId(null);
    }
    await refresh();
  }

  async function handleSaved(saved: DynamicCheck) {
    setCreatingNew(false);
    setSelectedId(saved.id);
    await refresh();
  }

  async function handlePublished() {
    await refresh();
  }

  if (error) {
    return <ResponseErrorPanel error={error} />;
  }
  if (loading) {
    return <Progress />;
  }

  return (
    <Grid container spacing={2}>
      <Grid item xs={12} md={5}>
        <CheckList
          checks={checks}
          loading={loading}
          selectedId={creatingNew ? null : selectedId}
          onSelect={id => {
            setCreatingNew(false);
            setSelectedId(id);
          }}
          onNew={() => {
            setCreatingNew(true);
            setSelectedId(null);
          }}
          onDelete={handleDelete}
        />
      </Grid>
      <Grid item xs={12} md={7}>
        {(creatingNew || selectedCheck) && (
          <CheckForm
            key={selectedCheck?.id ?? 'new'}
            check={selectedCheck}
            factSchemas={factSchemas}
            existingCategories={existingCategories}
            onSaved={handleSaved}
            onPublished={handlePublished}
          />
        )}
      </Grid>
    </Grid>
  );
}
