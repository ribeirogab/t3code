import { normalizeSearchText } from "~/lib/utils";

export interface ForkSettingsSearchEntry {
  readonly title: string;
  readonly description: string;
  readonly searchTerms: ReadonlyArray<string>;
}

export function matchesForkSettingsSearch(query: string, entry: ForkSettingsSearchEntry): boolean {
  const tokens = normalizeSearchText(query).split(" ").filter(Boolean);
  if (tokens.length === 0) return true;
  const fields = [entry.title, entry.description, ...entry.searchTerms].map(normalizeSearchText);
  return tokens.every((token) => fields.some((field) => field.includes(token)));
}
