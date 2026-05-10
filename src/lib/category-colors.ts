/**
 * Curated color palette for ShiftRole + ShiftTag swatches.
 * 8 colors that all play nicely with the rust/ink/serif look and have
 * good contrast for white text labels.
 */

export const CATEGORY_COLORS: { value: string; name: string }[] = [
  { value: "#0f6e56", name: "Teal" },
  { value: "#b8551c", name: "Rust" },
  { value: "#3c3489", name: "Indigo" },
  { value: "#993556", name: "Burgundy" },
  { value: "#1d9e75", name: "Green" },
  { value: "#BA7517", name: "Amber" },
  { value: "#534AB7", name: "Purple" },
  { value: "#185FA5", name: "Blue" },
];

export const DEFAULT_ROLE_COLOR = "#0f6e56";
export const DEFAULT_TAG_COLOR = "#b8551c";

export const DEFAULT_ROLES: { name: string; color: string; sortOrder: number }[] = [
  { name: "Budtender", color: "#0f6e56", sortOrder: 10 },
  { name: "Lead", color: "#b8551c", sortOrder: 20 },
  { name: "Management", color: "#993556", sortOrder: 30 },
];

export function isValidCategoryColor(c: string): boolean {
  return CATEGORY_COLORS.some((x) => x.value === c);
}
