import { useCallback, useEffect, useRef, useState } from 'react';
import Box from '@material-ui/core/Box';
import Button from '@material-ui/core/Button';
import CircularProgress from '@material-ui/core/CircularProgress';
import Table from '@material-ui/core/Table';
import TableBody from '@material-ui/core/TableBody';
import TableCell from '@material-ui/core/TableCell';
import TableHead from '@material-ui/core/TableHead';
import TableRow from '@material-ui/core/TableRow';
import Tooltip from '@material-ui/core/Tooltip';
import Typography from '@material-ui/core/Typography';
import AutorenewIcon from '@material-ui/icons/Autorenew';
import Alert from '@material-ui/lab/Alert';
import {
  InfoCard,
  Progress,
  ResponseErrorPanel,
} from '@backstage/core-components';
import { useApi } from '@backstage/core-plugin-api';
import { dynamicChecksApiRef } from '../../api/DynamicChecksApi';
import type { FactCollector } from '../../api/types';
import {
  NOT_ALLOWED_TOOLTIP,
  useCheckPermissions,
} from '../useCheckPermissions';
import { RelativeTime } from '../RelativeTime';

const POLL_INTERVAL_MS = 3000;
// A little over the scheduler's default 5 minute task timeout.
const POLL_TIMEOUT_MS = 6 * 60 * 1000;

interface PendingCollection {
  since: number;
  /** `lastRunEndedAt` when Collect now was pressed; a change means done. */
  previousRunEndedAt?: string;
}

export interface FactCollectorsPanelProps {
  /** Called after a collection started from this panel has finished. */
  onCollected?: () => void;
}

/**
 * Lists the scheduled fact retrievers with their schedule and last/next run,
 * and lets the viewer start a collection immediately. Schedules are
 * read-only: they come from platform configuration
 * (`techInsights.factRetrievers.<id>.cadence`).
 */
export function FactCollectorsPanel(props: FactCollectorsPanelProps) {
  const { onCollected } = props;
  const api = useApi(dynamicChecksApiRef);
  const { canManage } = useCheckPermissions();

  const [collectors, setCollectors] = useState<FactCollector[]>();
  const [loadError, setLoadError] = useState<Error>();
  const [pending, setPending] = useState<Record<string, PendingCollection>>({});
  const [notice, setNotice] = useState<{
    severity: 'info' | 'warning' | 'error';
    message: string;
  }>();

  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const onCollectedRef = useRef(onCollected);
  onCollectedRef.current = onCollected;

  const load = useCallback(async () => {
    try {
      const list = await api.listFactCollectors();
      setCollectors(list);
      setLoadError(undefined);
      return list;
    } catch (e) {
      setLoadError(e as Error);
      return undefined;
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const hasPending = Object.keys(pending).length > 0;
  useEffect(() => {
    if (!hasPending) {
      return undefined;
    }
    const timer = setInterval(async () => {
      const list = await load();
      if (!list) {
        return;
      }
      const next = { ...pendingRef.current };
      const finished: string[] = [];
      const timedOut: string[] = [];
      for (const [id, entry] of Object.entries(pendingRef.current)) {
        const collector = list.find(c => c.id === id);
        if (
          collector?.status === 'idle' &&
          collector.lastRunEndedAt !== entry.previousRunEndedAt
        ) {
          finished.push(id);
          delete next[id];
        } else if (Date.now() - entry.since > POLL_TIMEOUT_MS) {
          timedOut.push(id);
          delete next[id];
        }
      }
      if (finished.length === 0 && timedOut.length === 0) {
        return;
      }
      setPending(next);
      if (timedOut.length > 0) {
        setNotice({
          severity: 'warning',
          message: `No finished run seen for ${timedOut.join(
            ', ',
          )}; check the backend logs.`,
        });
      }
      if (finished.length > 0) {
        onCollectedRef.current?.();
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [hasPending, load]);

  async function handleCollect(collector: FactCollector) {
    setNotice(undefined);
    try {
      const result = await api.triggerFactCollector(collector.id);
      if (result === 'already-running') {
        setNotice({
          severity: 'info',
          message: `${collector.id} is already collecting; its results appear when that run finishes.`,
        });
      }
      setPending(current => ({
        ...current,
        [collector.id]: {
          since: Date.now(),
          previousRunEndedAt: collector.lastRunEndedAt,
        },
      }));
    } catch (e) {
      setNotice({ severity: 'error', message: (e as Error).message });
    }
  }

  if (loadError && !collectors) {
    return <ResponseErrorPanel error={loadError} />;
  }

  return (
    <InfoCard
      title="Data sources"
      subheader="Facts are collected on a schedule set in platform configuration. Collect now refreshes a source for every entity it covers."
    >
      {notice && (
        <Box mb={2}>
          <Alert severity={notice.severity}>{notice.message}</Alert>
        </Box>
      )}
      {!collectors && <Progress />}
      {collectors && collectors.length === 0 && (
        <Typography variant="body2" color="textSecondary">
          No fact collectors are scheduled.
        </Typography>
      )}
      {collectors && collectors.length > 0 && (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Collector</TableCell>
              <TableCell>Schedule</TableCell>
              <TableCell>Last collected</TableCell>
              <TableCell>Next run</TableCell>
              <TableCell align="right" />
            </TableRow>
          </TableHead>
          <TableBody>
            {collectors.map(collector => {
              const collecting =
                collector.status === 'running' || !!pending[collector.id];
              return (
                <TableRow key={collector.id}>
                  <TableCell>{collector.id}</TableCell>
                  <TableCell>
                    <Typography
                      variant="body2"
                      style={{ fontFamily: 'monospace' }}
                    >
                      {collector.cadence ?? '—'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <RelativeTime iso={collector.lastRunEndedAt} />
                  </TableCell>
                  <TableCell>
                    {collector.status === 'running' ? (
                      'Running now'
                    ) : (
                      <RelativeTime iso={collector.nextRunAt} />
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title={canManage ? '' : NOT_ALLOWED_TOOLTIP}>
                      <span>
                        <Button
                          size="small"
                          variant="outlined"
                          color="primary"
                          disabled={collecting || !canManage}
                          startIcon={
                            collecting ? (
                              <CircularProgress size={14} />
                            ) : (
                              <AutorenewIcon fontSize="small" />
                            )
                          }
                          onClick={() => handleCollect(collector)}
                        >
                          {collecting ? 'Collecting…' : 'Collect now'}
                        </Button>
                      </span>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </InfoCard>
  );
}
