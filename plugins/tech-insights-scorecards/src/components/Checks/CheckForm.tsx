import { useState } from 'react';
import Grid from '@material-ui/core/Grid';
import TextField from '@material-ui/core/TextField';
import Button from '@material-ui/core/Button';
import MenuItem from '@material-ui/core/MenuItem';
import Autocomplete from '@material-ui/lab/Autocomplete';
import Alert from '@material-ui/lab/Alert';
import Chip from '@material-ui/core/Chip';
import Typography from '@material-ui/core/Typography';
import Divider from '@material-ui/core/Divider';
import Box from '@material-ui/core/Box';
import Tooltip from '@material-ui/core/Tooltip';
import IconButton from '@material-ui/core/IconButton';
import AddIcon from '@material-ui/icons/Add';
import DeleteIcon from '@material-ui/icons/Delete';
import { InfoCard } from '@backstage/core-components';
import { useApi } from '@backstage/core-plugin-api';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import useAsync from 'react-use/lib/useAsync';
import { dynamicChecksApiRef } from '../../api/DynamicChecksApi';
import { DEFAULT_CHECK_CATEGORIES } from '../../constants';
import {
  NOT_ALLOWED_TOOLTIP,
  useCheckPermissions,
} from '../useCheckPermissions';
import { DryRunResultView } from './DryRunResultView';
import {
  factFieldsOf,
  type CheckLink,
  type DryRunResult,
  type DynamicCheck,
  type DynamicCheckInput,
  type FactSchema,
} from '../../api/types';

interface CheckFormProps {
  check: DynamicCheck | null;
  factSchemas: FactSchema[];
  existingCategories: string[];
  onSaved: (check: DynamicCheck) => void;
  onPublished: () => void;
  /**
   * Hides the form's own InfoCard title, for a full-page editor that already
   * shows "New check"/"Edit check: <name>" so it isn't repeated.
   */
  showTitle?: boolean;
  /**
   * Renders a Cancel button alongside the save actions when provided.
   * CheckFormDialog relies on its own close button instead.
   */
  onCancel?: () => void;
}

function defaultRuleJson() {
  return JSON.stringify(
    { conditions: { all: [{ fact: '', operator: 'equal', value: true }] } },
    null,
    2,
  );
}

const DEFAULT_KINDS = ['Component'];

interface FilterFormState {
  kinds: string[];
  extraJson: string;
  /**
   * True when the stored filter can't be split into kinds plus extra
   * criteria (e.g. an array of filters, which jsonfc ORs together), so it is
   * edited as raw JSON to round-trip unchanged.
   */
  raw: boolean;
}

function isStringOrStringArray(value: unknown): value is string | string[] {
  return (
    typeof value === 'string' ||
    (Array.isArray(value) && value.every(v => typeof v === 'string'))
  );
}

function toFilterFormState(filter: unknown): FilterFormState {
  if (filter === undefined || filter === null) {
    return { kinds: [], extraJson: '', raw: false };
  }
  if (
    typeof filter !== 'object' ||
    Array.isArray(filter) ||
    ('kind' in filter && !isStringOrStringArray(filter.kind))
  ) {
    return { kinds: [], extraJson: JSON.stringify(filter, null, 2), raw: true };
  }
  const { kind, ...rest } = filter as Record<string, unknown>;
  return {
    kinds: kind === undefined ? [] : ([] as string[]).concat(kind as string),
    extraJson:
      Object.keys(rest).length > 0 ? JSON.stringify(rest, null, 2) : '',
    raw: false,
  };
}

export function CheckForm(props: CheckFormProps) {
  const {
    check,
    factSchemas,
    existingCategories,
    onSaved,
    onPublished,
    showTitle = true,
    onCancel,
  } = props;
  const api = useApi(dynamicChecksApiRef);

  const [name, setName] = useState(check?.name ?? '');
  const [description, setDescription] = useState(check?.description ?? '');
  const [category, setCategory] = useState(
    (check?.metadata?.category as string | undefined) ?? '',
  );
  const categoryOptions = Array.from(
    new Set([...DEFAULT_CHECK_CATEGORIES, ...existingCategories]),
  ).sort();
  const [rank, setRank] = useState<string>(
    check?.metadata?.rank !== undefined ? String(check.metadata.rank) : '1',
  );
  const [solution, setSolution] = useState(
    typeof check?.metadata?.solution === 'string'
      ? check.metadata.solution
      : '',
  );
  const [links, setLinks] = useState<CheckLink[]>(check?.links ?? []);
  const [factIds, setFactIds] = useState<string[]>(check?.factIds ?? []);
  const [ruleJson, setRuleJson] = useState(
    check ? JSON.stringify(check.rule, null, 2) : defaultRuleJson(),
  );
  const [initialFilter] = useState(() =>
    check
      ? toFilterFormState(check.filter)
      : { kinds: DEFAULT_KINDS, extraJson: '', raw: false },
  );
  const [kinds, setKinds] = useState<string[]>(initialFilter.kinds);
  const [filterJson, setFilterJson] = useState(initialFilter.extraJson);
  const rawFilter = initialFilter.raw;
  const [entityRef, setEntityRef] = useState('component:default/');

  const catalogApi = useApi(catalogApiRef);
  const { value: kindOptions = DEFAULT_KINDS } = useAsync(async () => {
    const { facets } = await catalogApi.getEntityFacets({ facets: ['kind'] });
    return (facets.kind ?? []).map(f => f.value).sort();
  }, [catalogApi]);

  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Set once a new check is created, so a retry after a failed publish
  // updates that check instead of creating a duplicate.
  const [savedId, setSavedId] = useState<string | undefined>(check?.id);
  const published = check?.status === 'published';
  const { canManage } = useCheckPermissions();
  const [dryRunError, setDryRunError] = useState<string | null>(null);
  const [dryRunning, setDryRunning] = useState(false);
  const [dryRunResult, setDryRunResult] = useState<DryRunResult | null>(null);

  function buildInput(): DynamicCheckInput | null {
    let rule;
    try {
      rule = JSON.parse(ruleJson);
    } catch (e) {
      setSaveError(`Rule is not valid JSON: ${(e as Error).message}`);
      return null;
    }
    let filter;
    let extra;
    if (filterJson.trim()) {
      try {
        extra = JSON.parse(filterJson);
      } catch (e) {
        setSaveError(`Filter is not valid JSON: ${(e as Error).message}`);
        return null;
      }
    }
    if (rawFilter) {
      filter = extra;
    } else {
      if (
        extra !== undefined &&
        (typeof extra !== 'object' || extra === null || Array.isArray(extra))
      ) {
        setSaveError(
          'Additional entity criteria must be a JSON object, e.g. {"spec.lifecycle": "production"}.',
        );
        return null;
      }
      if (extra && 'kind' in extra) {
        setSaveError(
          'Set kinds with the "Entity kinds" field, not in the additional criteria.',
        );
        return null;
      }
      if (kinds.length > 0) {
        filter = { ...extra, kind: kinds.length === 1 ? kinds[0] : kinds };
      } else if (extra && Object.keys(extra).length > 0) {
        filter = extra;
      }
    }
    if (!name.trim()) {
      setSaveError('Name is required.');
      return null;
    }
    if (factIds.length === 0) {
      setSaveError('At least one fact retriever is required.');
      return null;
    }
    const enteredLinks = links
      .map(link => ({ title: link.title.trim(), url: link.url.trim() }))
      .filter(link => link.title || link.url);
    if (enteredLinks.some(link => !link.title || !link.url)) {
      setSaveError('Each reference link needs a title and a URL.');
      return null;
    }
    // Keys the form doesn't edit are kept, so a check written through the
    // API doesn't lose them when saved here.
    const {
      category: _category,
      solution: _solution,
      ...otherMetadata
    } = check?.metadata ?? {};
    const metadata: Record<string, unknown> = {
      ...otherMetadata,
      rank: Number(rank),
    };
    if (category.trim()) metadata.category = category.trim();
    if (solution.trim()) metadata.solution = solution.trim();
    return {
      name: name.trim(),
      description: description.trim() || undefined,
      factIds,
      metadata,
      filter,
      rule,
      links: enteredLinks.length ? enteredLinks : undefined,
      successMetadata: check?.successMetadata,
      failureMetadata: check?.failureMetadata,
    };
  }

  async function persist(input: DynamicCheckInput): Promise<DynamicCheck> {
    if (savedId) {
      return api.updateCheck(savedId, input);
    }
    const created = await api.createCheck(input);
    setSavedId(created.id);
    return created;
  }

  async function handleSave(publish: boolean) {
    setSaveError(null);
    const input = buildInput();
    if (!input) return;

    setSaving(true);
    try {
      const saved = await persist(input);
      if (publish) {
        await api.publishCheck(saved.id);
        onPublished();
      } else {
        onSaved(saved);
      }
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDryRun() {
    setDryRunError(null);
    setDryRunResult(null);
    const input = buildInput();
    if (!input) return;
    if (!entityRef.trim()) {
      setDryRunError(
        'Enter an entity ref to dry-run against, e.g. component:default/my-service.',
      );
      return;
    }

    setDryRunning(true);
    try {
      const result = await api.dryRun(entityRef.trim(), input);
      setDryRunResult(result);
    } catch (e) {
      setDryRunError((e as Error).message);
    } finally {
      setDryRunning(false);
    }
  }

  const title = check ? `Edit: ${check.name}` : 'New check';

  return (
    <InfoCard title={showTitle ? title : undefined}>
      <Grid container spacing={2}>
        {/* About */}
        <Grid item xs={12}>
          <SectionLabel>About</SectionLabel>
        </Grid>
        <Grid item xs={12}>
          <TextField
            label="Name"
            fullWidth
            value={name}
            onChange={e => setName(e.target.value)}
          />
        </Grid>
        <Grid item xs={12}>
          <TextField
            label="Description"
            fullWidth
            multiline
            minRows={2}
            value={description}
            onChange={e => setDescription(e.target.value)}
          />
        </Grid>

        <Grid item xs={12}>
          <Box my={1}>
            <Divider />
          </Box>
        </Grid>

        {/* Classification */}
        <Grid item xs={12}>
          <SectionLabel>Classification</SectionLabel>
        </Grid>
        <Grid item xs={6}>
          <TextField
            select
            label="Category"
            fullWidth
            value={category}
            onChange={e => setCategory(e.target.value)}
            helperText="Groups checks on an entity's scorecard"
          >
            <MenuItem value="">
              <em>None</em>
            </MenuItem>
            {categoryOptions.map(option => (
              <MenuItem key={option} value={option}>
                {option}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid item xs={6}>
          <TextField
            select
            required
            label="Maturity tier"
            fullWidth
            value={rank}
            onChange={e => setRank(e.target.value)}
            helperText="Checks with no tier are excluded from the Bronze/Silver/Gold breakdown"
          >
            <MenuItem value="1">Bronze</MenuItem>
            <MenuItem value="2">Silver</MenuItem>
            <MenuItem value="3">Gold</MenuItem>
          </TextField>
        </Grid>

        <Grid item xs={12}>
          <Box my={1}>
            <Divider />
          </Box>
        </Grid>

        {/* Guidance */}
        <Grid item xs={12}>
          <SectionLabel>Guidance</SectionLabel>
        </Grid>
        <Grid item xs={12}>
          <TextField
            label="How to pass"
            fullWidth
            multiline
            minRows={2}
            value={solution}
            onChange={e => setSolution(e.target.value)}
            helperText="Shown with the check on each entity's scorecard, e.g. the setting to change or the command to run."
          />
        </Grid>
        <Grid item xs={12}>
          <Typography variant="body2" color="textSecondary">
            Reference links
          </Typography>
        </Grid>
        {links.map((link, index) => (
          <Grid item xs={12} key={index}>
            <Box display="flex" alignItems="center" style={{ gap: 8 }}>
              <TextField
                label="Title"
                value={link.title}
                onChange={e =>
                  setLinks(
                    links.map((l, i) =>
                      i === index ? { ...l, title: e.target.value } : l,
                    ),
                  )
                }
                style={{ flex: 1 }}
              />
              <TextField
                label="URL"
                value={link.url}
                onChange={e =>
                  setLinks(
                    links.map((l, i) =>
                      i === index ? { ...l, url: e.target.value } : l,
                    ),
                  )
                }
                style={{ flex: 2 }}
              />
              <IconButton
                aria-label="Remove link"
                onClick={() => setLinks(links.filter((_l, i) => i !== index))}
              >
                <DeleteIcon />
              </IconButton>
            </Box>
          </Grid>
        ))}
        <Grid item xs={12}>
          <Button
            size="small"
            startIcon={<AddIcon />}
            onClick={() => setLinks([...links, { title: '', url: '' }])}
          >
            Add link
          </Button>
        </Grid>

        <Grid item xs={12}>
          <Box my={1}>
            <Divider />
          </Box>
        </Grid>

        {/* Applies to */}
        <Grid item xs={12}>
          <SectionLabel>Applies to</SectionLabel>
        </Grid>
        {rawFilter ? (
          <Grid item xs={12}>
            <Alert severity="info">
              This check's entity filter uses a form the kind picker can't show,
              so it is edited as JSON below.
            </Alert>
          </Grid>
        ) : (
          <Grid item xs={12}>
            <Autocomplete
              multiple
              freeSolo
              forcePopupIcon
              openOnFocus
              filterSelectedOptions
              options={kindOptions}
              value={kinds}
              onChange={(_e, value) => setKinds(value)}
              renderTags={(value, getTagProps) =>
                value.map((option, index) => (
                  <Chip
                    label={option}
                    size="small"
                    {...getTagProps({ index })}
                  />
                ))
              }
              renderInput={params => (
                <TextField
                  {...params}
                  label="Entity kinds"
                  helperText="The check runs only against entities of these kinds. Leave empty to run against every entity the chosen facts cover."
                />
              )}
            />
          </Grid>
        )}
        <Grid item xs={12}>
          <TextField
            label={rawFilter ? 'Entity filter (JSON)' : undefined}
            fullWidth
            multiline
            minRows={rawFilter ? 4 : 2}
            placeholder={
              'Additional entity filtering criteria (optional)\ne.g. {"spec.lifecycle": "production"}'
            }
            helperText={
              rawFilter
                ? 'Leave empty to apply to all entities the chosen facts support.'
                : 'JSON object of entity fields that must also match, keyed by path, e.g. spec.type or metadata.annotations["backstage.io/techdocs-ref"]. Matching is case-insensitive; an array value matches any of its entries.'
            }
            value={filterJson}
            onChange={e => setFilterJson(e.target.value)}
            InputProps={{ style: { fontFamily: 'monospace', fontSize: 13 } }}
          />
        </Grid>

        <Grid item xs={12}>
          <Box my={1}>
            <Divider />
          </Box>
        </Grid>

        {/* Define the check */}
        <Grid item xs={12}>
          <SectionLabel>Define the check</SectionLabel>
        </Grid>
        <Grid item xs={12}>
          <Autocomplete
            multiple
            options={factSchemas.map(f => f.id)}
            value={factIds}
            onChange={(_e, value) => setFactIds(value)}
            renderTags={(value, getTagProps) =>
              value.map((option, index) => (
                <Chip label={option} size="small" {...getTagProps({ index })} />
              ))
            }
            renderInput={params => (
              <TextField
                {...params}
                label="Fact retrievers"
                helperText="Populated from the running backend's registered fact retrievers. Pick these first — the rule below references their fields."
              />
            )}
          />
        </Grid>
        {factIds.length > 0 && (
          <Grid item xs={12}>
            <Typography variant="caption" color="textSecondary">
              Available facts for reference in the rule below:
            </Typography>
            {factIds.map(id => {
              const schema = factSchemas.find(f => f.id === id);
              if (!schema) return null;
              return (
                <Typography key={id} variant="body2" component="div">
                  <strong>{id}</strong>:{' '}
                  {factFieldsOf(schema)
                    .map(f => `${f.name} (${f.field.type})`)
                    .join(', ')}
                </Typography>
              );
            })}
          </Grid>
        )}
        <Grid item xs={12}>
          <TextField
            label="Rule (json-rules-engine conditions)"
            fullWidth
            multiline
            minRows={8}
            value={ruleJson}
            onChange={e => setRuleJson(e.target.value)}
            InputProps={{ style: { fontFamily: 'monospace', fontSize: 13 } }}
          />
        </Grid>
        <Grid item xs={12}>
          <Box my={1}>
            <Divider />
          </Box>
        </Grid>

        {/* Test it */}
        <Grid item xs={12}>
          <SectionLabel>Test it</SectionLabel>
        </Grid>
        <Grid item xs={12}>
          <Grid container spacing={2} alignItems="flex-end">
            <Grid item xs={12} sm={8}>
              <TextField
                label="Dry-run against entity ref"
                fullWidth
                value={entityRef}
                onChange={e => setEntityRef(e.target.value)}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <Tooltip title={canManage ? '' : NOT_ALLOWED_TOOLTIP}>
                <span>
                  <Button
                    variant="outlined"
                    onClick={handleDryRun}
                    disabled={dryRunning || !canManage}
                  >
                    Dry run
                  </Button>
                </span>
              </Tooltip>
            </Grid>
          </Grid>
        </Grid>

        {dryRunError && (
          <Grid item xs={12}>
            <Alert severity="error">{dryRunError}</Alert>
          </Grid>
        )}
        {dryRunResult && (
          <Grid item xs={12}>
            <DryRunResultView result={dryRunResult} />
          </Grid>
        )}

        <Grid item xs={12}>
          <Box my={1}>
            <Divider />
          </Box>
        </Grid>

        {/* Save */}
        {saveError && (
          <Grid item xs={12}>
            <Alert severity="error">{saveError}</Alert>
          </Grid>
        )}
        <Grid item xs={12}>
          <Box
            display="flex"
            alignItems="center"
            justifyContent="flex-end"
            style={{ gap: 8 }}
          >
            <Box flexGrow={1}>
              <Typography variant="body2" color="textSecondary">
                {published
                  ? 'Published: saved changes apply to scores immediately.'
                  : 'Drafts are not evaluated. Publish to include this check in scores.'}
              </Typography>
            </Box>
            {onCancel && (
              <Button onClick={onCancel} disabled={saving}>
                Cancel
              </Button>
            )}
            {published ? (
              <Tooltip title={canManage ? '' : NOT_ALLOWED_TOOLTIP}>
                <span>
                  <Button
                    variant="contained"
                    color="primary"
                    onClick={() => handleSave(false)}
                    disabled={saving || !canManage}
                  >
                    Save changes
                  </Button>
                </span>
              </Tooltip>
            ) : (
              <>
                <Tooltip title={canManage ? '' : NOT_ALLOWED_TOOLTIP}>
                  <span>
                    <Button
                      variant="outlined"
                      color="primary"
                      onClick={() => handleSave(false)}
                      disabled={saving || !canManage}
                    >
                      {check ? 'Save draft' : 'Save as draft'}
                    </Button>
                  </span>
                </Tooltip>
                <Tooltip title={canManage ? '' : NOT_ALLOWED_TOOLTIP}>
                  <span>
                    <Button
                      variant="contained"
                      color="primary"
                      onClick={() => handleSave(true)}
                      disabled={saving || !canManage}
                    >
                      Publish
                    </Button>
                  </span>
                </Tooltip>
              </>
            )}
          </Box>
        </Grid>
      </Grid>
    </InfoCard>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <Typography
      variant="subtitle2"
      color="textSecondary"
      style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}
    >
      {children}
    </Typography>
  );
}
