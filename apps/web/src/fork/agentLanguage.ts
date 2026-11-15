export const AGENT_LANGUAGE_SEARCH_ID = "fork-agent-language";

export const AGENT_LANGUAGE_SETTING = {
  title: "Answer language",
  description: "Agents answer in this language, also after PR updates, wakes, and compactions.",
  searchTerms: ["fork agent language reply answer portuguese english locale injected messages"],
};

export const AGENT_LANGUAGE_SETTINGS_SEARCH_ITEMS = [
  {
    id: AGENT_LANGUAGE_SEARCH_ID,
    title: AGENT_LANGUAGE_SETTING.title,
    to: "/settings/fork" as const,
    searchTerms: AGENT_LANGUAGE_SETTING.searchTerms,
  },
];
