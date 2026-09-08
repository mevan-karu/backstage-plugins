import { useCallback, useEffect, useMemo, useState } from 'react';
import Box from '@material-ui/core/Box';
import Button from '@material-ui/core/Button';
import Chip from '@material-ui/core/Chip';
import Grid from '@material-ui/core/Grid';
import IconButton from '@material-ui/core/IconButton';
import MenuItem from '@material-ui/core/MenuItem';
import Switch from '@material-ui/core/Switch';
import Table from '@material-ui/core/Table';
import TableBody from '@material-ui/core/TableBody';
import TableCell from '@material-ui/core/TableCell';
import TableHead from '@material-ui/core/TableHead';
import TableRow from '@material-ui/core/TableRow';
import TextField from '@material-ui/core/TextField';
import Typography from '@material-ui/core/Typography';
import AddIcon from '@material-ui/icons/Add';
import DeleteIcon from '@material-ui/icons/Delete';
import EditIcon from '@material-ui/icons/Edit';
import RefreshIcon from '@material-ui/icons/Refresh';
import SearchIcon from '@material-ui/icons/Search';
import InputAdornment from '@material-ui/core/InputAdornment';
import { useTheme } from '@material-ui/core/styles';
import { InfoCard, Progress, ResponseErrorPanel } from '@backstage/core-components';
import { useApi } from '@backstage/core-plugin-api';
import { dynamicChecksApiRef } from '../../api/DynamicChecksApi';
import type { DynamicCheck, FactSchema } from '../../api/types';
import { CheckFormDialog } from './CheckFormDialog';
import { TIER_LABEL, getTierColor } from '../../tierPalette';

interface CheckPolicyTableProps {
  /**
   * When provided, "New check" calls this instead of opening the built-in
   * CheckFormDialog — lets a host app (which may want its own full-page
   * editor, e.g. matching its own house layout for create/edit flows)
   * take over navigation entirely. factSchemas/existingCategories are
   * passed along so the host doesn't have to re-fetch what this table
   * already loaded. Falls back to the built-in modal when omitted, so this
   * component stays usable standalone.
   */
  onNewCheck?: (factSchemas: FactSchema[], existingCategories: string[]) => void;
  onEditCheck?: (
    check: DynamicCheck,
    factSchemas: FactSchema[],
    existingCategories: string[],
  ) => void;
}

/**
 * Security-manager-facing check list: search/filter by category and tier, an
 * enabled toggle that publishes/unpublishes in place, and a "New check"
 * action that opens CheckFormDialog (or delegates to onNewCheck/onEditCheck,
 * see CheckPolicyTableProps) — the table-driven counterpart to
 * CheckManagementPanel's split-panel layout, for embedding in a page whose
 * overall structure is a filterable policy table (score card + search/filter
 * bar + table), not a list-and-form pair.
 */
export function CheckPolicyTable(props: CheckPolicyTableProps) {
  const { onNewCheck, onEditCheck } = props;
  const api = useApi(dynamicChecksApiRef);
  const theme = useTheme();

  const [checks, setChecks] = useState<DynamicCheck[]>([]);
  const [factSchemas, setFactSchemas] = useState<FactSchema[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | undefined>();

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [tierFilter, setTierFilter] = useState('');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogCheck, setDialogCheck] = useState<DynamicCheck | null>(null);

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

  const existingCategories = useMemo(
    () =>
      Array.from(
        new Set(
          checks
            .map(c => c.metadata?.category)
            .filter((c): c is string => typeof c === 'string' && c.length > 0),
        ),
      ).sort(),
    [checks],
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return checks.filter(c => {
      if (query && !c.name.toLowerCase().includes(query)) return false;
      if (categoryFilter && c.metadata?.category !== categoryFilter) return false;
      if (tierFilter && String(c.metadata?.rank ?? '') !== tierFilter) return false;
      return true;
    });
  }, [checks, search, categoryFilter, tierFilter]);

  async function handleToggleEnabled(check: DynamicCheck, enabled: boolean) {
    if (enabled) {
      await api.publishCheck(check.id);
    } else {
      await api.unpublishCheck(check.id);
    }
    await refresh();
  }

  async function handleDelete(id: string) {
    await api.deleteCheck(id);
    await refresh();
  }

  async function handleSaved() {
    setDialogOpen(false);
    await refresh();
  }

  async function handlePublished() {
    await refresh();
  }

  if (error) {
    return <ResponseErrorPanel error={error} />;
  }

  return (
    <>
      <InfoCard>
        <Grid container spacing={2} alignItems="flex-end">
          <Grid item xs={12} sm={4}>
            <TextField
              label="Search"
              placeholder="Search checks"
              fullWidth
              value={search}
              onChange={e => setSearch(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              }}
            />
          </Grid>
          <Grid item xs={6} sm={2}>
            <TextField
              select
              label="Category"
              fullWidth
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
            >
              <MenuItem value="">All categories</MenuItem>
              {existingCategories.map(c => (
                <MenuItem key={c} value={c}>
                  {c}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={6} sm={2}>
            <TextField
              select
              label="Tier"
              fullWidth
              value={tierFilter}
              onChange={e => setTierFilter(e.target.value)}
            >
              <MenuItem value="">All tiers</MenuItem>
              <MenuItem value="1">Bronze</MenuItem>
              <MenuItem value="2">Silver</MenuItem>
              <MenuItem value="3">Gold</MenuItem>
            </TextField>
          </Grid>
          <Grid item xs="auto">
            <IconButton onClick={refresh} aria-label="Refresh">
              <RefreshIcon />
            </IconButton>
          </Grid>
          <Grid item xs />
          <Grid item xs="auto">
            <Button
              variant="contained"
              color="primary"
              startIcon={<AddIcon />}
              onClick={() => {
                if (onNewCheck) {
                  onNewCheck(factSchemas, existingCategories);
                } else {
                  setDialogCheck(null);
                  setDialogOpen(true);
                }
              }}
            >
              New check
            </Button>
          </Grid>
        </Grid>
      </InfoCard>

      <Box mt={2}>
        <InfoCard>
          {loading && <Progress />}
          {!loading && filtered.length === 0 && (
            <Typography variant="body2" color="textSecondary">
              No checks match the current filters.
            </Typography>
          )}
          {!loading && filtered.length > 0 && (
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Tier</TableCell>
                  <TableCell>Check</TableCell>
                  <TableCell>Category</TableCell>
                  <TableCell>Enabled</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.map(check => {
                  const rank = check.metadata?.rank as number | undefined;
                  const category = (check.metadata?.category as string) || '—';
                  return (
                    <TableRow key={check.id}>
                      <TableCell>
                        {rank !== undefined && (
                          <Chip
                            label={TIER_LABEL[rank] ?? rank}
                            size="small"
                            variant="outlined"
                            style={{
                              borderColor: getTierColor(rank, theme),
                              color: getTierColor(rank, theme),
                            }}
                          />
                        )}
                      </TableCell>
                      <TableCell>
                        <Typography variant="body1">{check.name}</Typography>
                        {check.description && (
                          <Typography variant="body2" color="textSecondary">
                            {check.description}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Chip label={category} size="small" variant="outlined" />
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={check.status === 'published'}
                          onChange={(_e, checked) =>
                            handleToggleEnabled(check, checked)
                          }
                          color="primary"
                        />
                      </TableCell>
                      <TableCell align="right">
                        <IconButton
                          size="small"
                          aria-label="Edit"
                          onClick={() => {
                            if (onEditCheck) {
                              onEditCheck(check, factSchemas, existingCategories);
                            } else {
                              setDialogCheck(check);
                              setDialogOpen(true);
                            }
                          }}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton
                          size="small"
                          aria-label="Delete"
                          onClick={() => handleDelete(check.id)}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </InfoCard>
      </Box>

      <CheckFormDialog
        open={dialogOpen}
        check={dialogCheck}
        factSchemas={factSchemas}
        existingCategories={existingCategories}
        onClose={() => setDialogOpen(false)}
        onSaved={handleSaved}
        onPublished={handlePublished}
      />
    </>
  );
}
