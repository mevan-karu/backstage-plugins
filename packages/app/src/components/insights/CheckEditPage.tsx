import { DetailPageLayout } from '@openchoreo/backstage-plugin-react';
import {
  CheckForm,
  type DynamicCheck,
  type FactSchema,
} from '@openchoreo/backstage-plugin-tech-insights-react-check-editor';

interface CheckEditPageProps {
  check: DynamicCheck | null;
  factSchemas: FactSchema[];
  existingCategories: string[];
  onBack: () => void;
  onSaved: (check: DynamicCheck) => void;
  onPublished: () => void;
}

/**
 * Full-page create/edit check view, swapped in by InsightsPage's local view
 * state in place of CheckPolicyTable — matches this app's house pattern for
 * create/edit flows (DetailPageLayout + state-swap, e.g. BindingWizardPage),
 * not a modal.
 *
 * Diverges from that house pattern in one deliberate way: every other
 * DetailPageLayout consumer puts its primary Save/Create button in the
 * header `actions` slot and has no separate Cancel (the header back-arrow/
 * Esc is the only cancel affordance). Per explicit request, this page keeps
 * Save/Publish/Cancel bottom-right inside CheckForm's own body instead —
 * CheckForm keeps its internal save/publish handlers self-contained rather
 * than handing them out through props just to match header placement.
 * `onCancel` here is the same function passed to `onBack` below, so the
 * bottom Cancel button and the header back-arrow/Esc both leave the editor
 * the same way.
 */
export function CheckEditPage(props: CheckEditPageProps) {
  const { check, factSchemas, existingCategories, onBack, onSaved, onPublished } =
    props;

  return (
    <DetailPageLayout
      title={check ? `Edit check: ${check.name}` : 'New check'}
      subtitle="Define the check, dry-run it against a sample entity, then save or publish."
      onBack={onBack}
    >
      <CheckForm
        key={check?.id ?? 'new'}
        check={check}
        factSchemas={factSchemas}
        existingCategories={existingCategories}
        onSaved={onSaved}
        onPublished={onPublished}
        showTitle={false}
        onCancel={onBack}
      />
    </DetailPageLayout>
  );
}
