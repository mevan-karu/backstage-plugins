import { Content, ContentHeader, Header, Page } from '@backstage/core-components';
import { CheckManagementPanel } from './CheckManagementPanel';

export function CheckEditorPage() {
  return (
    <Page themeId="tool">
      <Header
        title="Check editor"
        subtitle="Create and manage tech-insights checks without a backend restart"
      />
      <Content>
        <ContentHeader title="Dynamic checks" />
        <CheckManagementPanel />
      </Content>
    </Page>
  );
}
