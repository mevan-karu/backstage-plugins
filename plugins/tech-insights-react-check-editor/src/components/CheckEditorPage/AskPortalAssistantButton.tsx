import Button from '@material-ui/core/Button';
import ChatOutlinedIcon from '@material-ui/icons/ChatOutlined';
import { useAssistantEnabled } from '@openchoreo/backstage-plugin-react';
import {
  useAssistantDrawer,
  type ChatScope,
  type FactRetriever,
} from '@openchoreo/backstage-plugin-openchoreo-portal-assistant';
import { factFieldsOf, type FactSchema } from '../../api/types';

interface AskPortalAssistantButtonProps {
  /**
   * Fact retrievers registered on the tech-insights backend (the same
   * ``/fact-schemas`` response the form uses to populate the retriever
   * picker below). Forwarded to the agent as
   * ``ChatScope.availableFactRetrievers`` so it only references facts
   * that actually exist instead of inventing names.
   */
  factSchemas: FactSchema[];
  /**
   * Fact retriever ids already selected in the form's Autocomplete.
   * Forwarded as ``ChatScope.selectedFactIds`` — the agent treats these
   * as a preference, not a hard restriction.
   */
  factIds: string[];
}

/**
 * Opens the Portal Assistant drawer scoped to check authoring. The agent
 * drafts json-rules-engine check syntax from a plain-language request;
 * the user reviews it in the drawer and copies it into the Rule field
 * themselves (see ChatCaseType's `check_authoring` doc comment in
 * PerchAgentApi.ts — no automatic insert yet, that's a later phase).
 *
 * Renders nothing when the assistant feature flag is off, same as every
 * other Portal Assistant launcher in this codebase.
 */
export const AskPortalAssistantButton = ({
  factSchemas,
  factIds,
}: AskPortalAssistantButtonProps) => {
  const enabled = useAssistantEnabled();
  const { openDrawer } = useAssistantDrawer();

  if (!enabled) return null;

  const handleClick = () => {
    const availableFactRetrievers: FactRetriever[] = factSchemas.map(
      schema => ({
        id: schema.id,
        facts: factFieldsOf(schema).map(f => ({
          name: f.name,
          type: f.field.type,
          description: f.field.description,
        })),
      }),
    );

    const overrides: Partial<ChatScope> = {
      caseType: 'check_authoring',
      ...(availableFactRetrievers.length > 0
        ? { availableFactRetrievers }
        : {}),
      ...(factIds.length > 0 ? { selectedFactIds: factIds } : {}),
    };

    openDrawer({
      scopeOverrides: overrides,
      // Single stable key: re-opening this button resumes the same
      // conversation rather than starting a fresh one each time,
      // matching the "generic FAB" convention documented in
      // OpenAssistantOptions.conversationKey.
      conversationKey: 'check_authoring',
    });
  };

  return (
    <Button
      variant="outlined"
      size="small"
      startIcon={<ChatOutlinedIcon />}
      onClick={handleClick}
    >
      Ask Portal Assistant
    </Button>
  );
};
