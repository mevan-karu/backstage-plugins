import Table from '@material-ui/core/Table';
import TableBody from '@material-ui/core/TableBody';
import TableCell from '@material-ui/core/TableCell';
import TableHead from '@material-ui/core/TableHead';
import TableRow from '@material-ui/core/TableRow';
import { Link } from '@backstage/core-components';
import { useRouteRef } from '@backstage/core-plugin-api';
import {
  EntityDisplayName,
  entityRouteRef,
} from '@backstage/plugin-catalog-react';
import {
  parseEntityRef,
  stringifyEntityRef,
  type CompoundEntityRef,
  type Entity,
} from '@backstage/catalog-model';
import type { Rank } from '@backstage-community/plugin-tech-insights-maturity-common';
import { DEFAULT_ENTITY_TAB_PATH } from '../routes';
import type { CheckProgress } from '../scoring';
import { TierChip } from './TierChip';

export interface EntityScoreRow extends CheckProgress {
  entity: Entity | CompoundEntityRef | string;
  rank: Rank;
}

function toCompoundRef(entity: EntityScoreRow['entity']): CompoundEntityRef {
  if (typeof entity === 'string') return parseEntityRef(entity);
  if ('metadata' in entity) {
    return {
      kind: entity.kind,
      namespace: entity.metadata.namespace || 'default',
      name: entity.metadata.name,
    };
  }
  return entity;
}

/** Entities with their tier and checks passing, lowest tier first. */
export function EntityScoreTable({
  rows,
  showKind,
}: {
  rows: EntityScoreRow[];
  showKind: boolean;
}) {
  const entityRoute = useRouteRef(entityRouteRef);
  const sorted = rows
    .map(row => ({ ...row, ref: toCompoundRef(row.entity) }))
    .sort((a, b) => a.rank - b.rank);

  return (
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell>Name</TableCell>
          {showKind && <TableCell>Kind</TableCell>}
          <TableCell>Tier</TableCell>
          <TableCell>Checks passing</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {sorted.map(
          ({ entity, ref, rank, passedChecks, totalChecks, percentage }) => (
            <TableRow key={stringifyEntityRef(ref)} hover>
              <TableCell>
                <Link
                  to={`${entityRoute({
                    kind: ref.kind.toLocaleLowerCase('en-US'),
                    namespace: ref.namespace,
                    name: ref.name,
                  })}${DEFAULT_ENTITY_TAB_PATH}`}
                >
                  <EntityDisplayName entityRef={entity} />
                </Link>
              </TableCell>
              {showKind && <TableCell>{ref.kind}</TableCell>}
              <TableCell>
                <TierChip rank={rank} />
              </TableCell>
              <TableCell>
                {passedChecks}/{totalChecks} ({percentage}%)
              </TableCell>
            </TableRow>
          ),
        )}
      </TableBody>
    </Table>
  );
}
