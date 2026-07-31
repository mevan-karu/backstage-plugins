import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import ListItemSecondaryAction from '@material-ui/core/ListItemSecondaryAction';
import IconButton from '@material-ui/core/IconButton';
import Chip from '@material-ui/core/Chip';
import Button from '@material-ui/core/Button';
import DeleteIcon from '@material-ui/icons/Delete';
import AddIcon from '@material-ui/icons/Add';
import Typography from '@material-ui/core/Typography';
import { InfoCard, Progress } from '@backstage/core-components';
import type { DynamicCheck } from '../../api/types';

interface CheckListProps {
  checks: DynamicCheck[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}

export function CheckList(props: CheckListProps) {
  const { checks, loading, selectedId, onSelect, onNew, onDelete } = props;

  return (
    <InfoCard
      title="Checks"
      action={
        <Button
          color="primary"
          size="small"
          startIcon={<AddIcon />}
          onClick={onNew}
        >
          New check
        </Button>
      }
    >
      {loading && <Progress />}
      {!loading && checks.length === 0 && (
        <Typography variant="body2" color="textSecondary">
          No checks yet. Create one to get started.
        </Typography>
      )}
      <List dense>
        {checks.map(check => (
          <ListItem
            key={check.id}
            button
            selected={check.id === selectedId}
            onClick={() => onSelect(check.id)}
          >
            <ListItemText
              primary={check.name}
              secondary={check.description || check.id}
            />
            <Chip
              label={check.status ?? 'draft'}
              size="small"
              color={check.status === 'published' ? 'primary' : 'default'}
              style={{ marginRight: 40 }}
            />
            <ListItemSecondaryAction>
              <IconButton
                edge="end"
                aria-label="delete"
                onClick={() => onDelete(check.id)}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </ListItemSecondaryAction>
          </ListItem>
        ))}
      </List>
    </InfoCard>
  );
}
