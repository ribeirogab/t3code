import { Switch } from "~/components/ui/switch";
import {
  SettingsPageContainer,
  SettingsRow,
  SettingsSection,
} from "~/components/settings/settingsLayout";
import { cn } from "~/lib/utils";

import { AgentLanguageSection } from "./AgentLanguageSection";
import {
  FORK_FEATURE_SECTIONS,
  FORK_FEATURES,
  FORK_MASTER_SEARCH_ID,
  useForkFeaturesStore,
} from "./forkFeatures";

export function ForkSettingsPanel() {
  const master = useForkFeaturesStore((state) => state.master);
  const enabled = useForkFeaturesStore((state) => state.enabled);
  const setMaster = useForkFeaturesStore((state) => state.setMaster);
  const setEnabled = useForkFeaturesStore((state) => state.setEnabled);
  return (
    <SettingsPageContainer>
      <SettingsSection title="Fork" hideTitle>
        <SettingsRow
          id={FORK_MASTER_SEARCH_ID}
          title="Fork features"
          description="Turn off to use the app as upstream. Your choices below stay saved."
          control={
            <Switch
              checked={master}
              onCheckedChange={(checked) => setMaster(Boolean(checked))}
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
            !master && "*:data-[slot=settings-group]:opacity-45",
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
                  checked={enabled[feature.key]}
                  disabled={!master}
                  onCheckedChange={(checked) => setEnabled(feature.key, Boolean(checked))}
                  aria-label={feature.title}
                />
              }
            />
          ))}
        </SettingsSection>
      ))}
      <AgentLanguageSection />
    </SettingsPageContainer>
  );
}
