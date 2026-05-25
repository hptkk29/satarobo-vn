/**
 * Render template với basic {{var_name}} substitution (Phase 5.13.0).
 * Full engine with formatters + HTML escaping in 5.13.1.
 */
export function renderTemplate(
  template: string,
  vars: Record<string, string | number | null | undefined>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, name) => {
    const val = vars[name];
    if (val == null) return `{{${name}}}`;
    return String(val);
  });
}

/**
 * Extract variable names referenced in a template (validation/preview).
 */
export function extractVariables(template: string): string[] {
  const matches = template.matchAll(/\{\{(\w+)\}\}/g);
  const seen = new Set<string>();
  for (const m of matches) seen.add(m[1]);
  return Array.from(seen);
}
