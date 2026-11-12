import { Switch } from "~/components/ui/switch";
import {
  SettingsPageContainer,
  SettingsRow,
  SettingsSection,
} from "~/components/settings/settingsLayout";

import { AgentLanguageSection } from "./AgentLanguageSection";
import { FORK_FEATURES, useForkFeaturesStore } from "./forkFeatures";

export function ForkSettingsPanel() {
  const enabled = useForkFeaturesStore((state) => state.enabled);
  const setEnabled = useForkFeaturesStore((state) => state.setEnabled);
  return (
    <SettingsPageContainer>
      <SettingsSection id="fork-features" title="Fork features" hideTitle>
        {FORK_FEATURES.map((feature) => (
          <SettingsRow
            key={feature.key}
            id={feature.searchId}
            title={feature.title}
            description={feature.description}
            control={
              <Switch
                checked={enabled[feature.key]}
                onCheckedChange={(checked) => setEnabled(feature.key, Boolean(checked))}
                aria-label={feature.title}
              />
            }
          />
        ))}
      </SettingsSection>
      <AgentLanguageSection />
    </SettingsPageContainer>
  );
}
