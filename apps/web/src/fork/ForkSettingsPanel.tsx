import type { ForkFeatureSettings } from "@t3tools/contracts";

import { Switch } from "~/components/ui/switch";
import {
  SettingsPageContainer,
  SettingsRow,
  SettingsSection,
} from "~/components/settings/settingsLayout";
import { usePrimarySettings, useUpdatePrimarySettings } from "~/hooks/useSettings";
import { cn } from "~/lib/utils";

import { AgentLanguageRow } from "./AgentLanguageSection";
import {
  FORK_FEATURE_SECTIONS,
  FORK_FEATURES,
  FORK_MASTER_SEARCH_ID,
  type ForkFeature,
} from "./forkFeatures";

const THREAD_LIST_FEATURES: ReadonlySet<ForkFeature> = new Set(["nestedThreads"]);

const reloadThreadLists = () => window.location.reload();

export function ForkSettingsPanel() {
  const forkFeatures = usePrimarySettings((settings) => settings.forkFeatures);
  const updateSettings = useUpdatePrimarySettings();
  const save = (patch: Partial<ForkFeatureSettings>, changesThreadLists: boolean) =>
    updateSettings(
      { forkFeatures: patch },
      changesThreadLists ? { onSaved: reloadThreadLists } : undefined,
    );
  return (
    <SettingsPageContainer>
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
      {FORK_FEATURE_SECTIONS.map((section) => (
        <SettingsSection
          key={section}
          title={section}
          className={cn(
            "*:data-[slot=settings-group]:transition-opacity motion-reduce:*:data-[slot=settings-group]:transition-none",
            !forkFeatures.master && "*:data-[slot=settings-group]:opacity-45",
          )}
        >
          {FORK_FEATURES.filter((feature) => feature.section === section).map((feature) => (
            <SettingsRow
              key={feature.key}
              id={feature.searchId}
              title={feature.title}
              description={feature.description}
              control={
                <Switch
                  checked={forkFeatures.features[feature.key] !== false}
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
          {section === "Agents" ? <AgentLanguageRow /> : null}
        </SettingsSection>
      ))}
    </SettingsPageContainer>
  );
}
