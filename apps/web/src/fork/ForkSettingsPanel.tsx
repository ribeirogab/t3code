import { forkFeatureChoice, type ForkFeatureSettings } from "@t3tools/contracts";
import { SearchIcon } from "lucide-react";
import { useState } from "react";

import { InputGroup, InputGroupAddon, InputGroupInput } from "~/components/ui/input-group";
import { Switch } from "~/components/ui/switch";
import {
  SettingsPageContainer,
  SettingsRow,
  SettingsSection,
} from "~/components/settings/settingsLayout";
import { usePrimarySettings, useUpdatePrimarySettings } from "~/hooks/useSettings";
import { cn } from "~/lib/utils";

import { AGENT_LANGUAGE_SETTING } from "./agentLanguage";
import { AgentLanguageRow } from "./AgentLanguageSection";
import {
  FORK_FEATURE_SECTIONS,
  FORK_FEATURES,
  FORK_MASTER_SEARCH_ID,
  type ForkFeature,
} from "./forkFeatures";
import { matchesForkSettingsSearch } from "./forkSettingsSearch.logic";

const THREAD_LIST_FEATURES: ReadonlySet<ForkFeature> = new Set(["nestedThreads"]);

const reloadThreadLists = () => window.location.reload();

export function ForkSettingsPanel() {
  const forkFeatures = usePrimarySettings((settings) => settings.forkFeatures);
  const updateSettings = useUpdatePrimarySettings();
  const [query, setQuery] = useState("");
  const visibleFeatures = FORK_FEATURES.filter((feature) =>
    matchesForkSettingsSearch(query, feature),
  );
  const agentLanguageVisible = matchesForkSettingsSearch(query, AGENT_LANGUAGE_SETTING);
  const visibleSections = FORK_FEATURE_SECTIONS.filter(
    (section) =>
      visibleFeatures.some((feature) => feature.section === section) ||
      (section === "Agents" && agentLanguageVisible),
  );
  const save = (patch: Partial<ForkFeatureSettings>, changesThreadLists: boolean) =>
    updateSettings(
      { forkFeatures: patch },
      changesThreadLists ? { onSaved: reloadThreadLists } : undefined,
    );
  return (
    <SettingsPageContainer>
      <InputGroup>
        <InputGroupAddon>
          <SearchIcon aria-hidden />
        </InputGroupAddon>
        <InputGroupInput
          aria-label="Search fork features"
          placeholder="Search fork features"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
      </InputGroup>
      <SettingsSection title="Fork" hideTitle>
        <SettingsRow
          id={FORK_MASTER_SEARCH_ID}
          title="Fork features"
          description="Turn off to use the app as upstream. Your choices below stay saved."
          serverScoped
          settingKeys={["forkFeatures"]}
          control={
            <Switch
              checked={forkFeatures.master}
              onCheckedChange={(checked) => save({ master: Boolean(checked) }, true)}
              aria-label="Fork features"
            />
          }
        />
      </SettingsSection>
      {visibleSections.length === 0 ? (
        <p className="px-3 py-6 text-center text-sm text-muted-foreground sm:px-4">
          No settings found
        </p>
      ) : null}
      {visibleSections.map((section) => (
        <SettingsSection
          key={section}
          title={section}
          className={cn(
            "*:data-[slot=settings-group]:transition-opacity motion-reduce:*:data-[slot=settings-group]:transition-none",
            !forkFeatures.master && "*:data-[slot=settings-group]:opacity-45",
          )}
        >
          {visibleFeatures
            .filter((feature) => feature.section === section)
            .map((feature) => (
              <SettingsRow
                key={feature.key}
                id={feature.searchId}
                title={feature.title}
                description={feature.description}
                control={
                  <Switch
                    checked={forkFeatureChoice(forkFeatures.features, feature.key)}
                    disabled={!forkFeatures.master}
                    onCheckedChange={(checked) =>
                      save(
                        { features: { [feature.key]: Boolean(checked) } },
                        THREAD_LIST_FEATURES.has(feature.key),
                      )
                    }
                    aria-label={feature.title}
                  />
                }
              />
            ))}
          {section === "Agents" && agentLanguageVisible ? <AgentLanguageRow /> : null}
        </SettingsSection>
      ))}
    </SettingsPageContainer>
  );
}
