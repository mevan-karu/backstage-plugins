/**
 * Default check categories, offered as a fixed list in the check-editor UI
 * rather than freeform text — mirrors how the referenced OpenChoreo Security &
 * Compliance design keeps "stage" a closed set (Platform Config/Code/Build/
 * Deploy/Run) rather than an arbitrary string.
 *
 * Any category already present on an existing check (including ones not in
 * this list) is still shown as an option — this list is a starting point for
 * new checks, not a hard allowlist enforced against old data.
 */
export const DEFAULT_CHECK_CATEGORIES = [
  'Security',
  'Ownership',
  'Documentation',
  'Metadata',
  'Reliability',
] as const;
