import { useRef } from "react";

import { SettingResetButton, SettingsRow } from "~/components/settings/settingsLayout";
import { Input } from "~/components/ui/input";
import { usePrimarySettings, useUpdatePrimarySettings } from "~/hooks/useSettings";

import { AGENT_LANGUAGE_SEARCH_ID, AGENT_LANGUAGE_SETTING } from "./agentLanguage";

export function AgentLanguageRow() {
  const agentLanguage = usePrimarySettings((settings) => settings.agentLanguage);
  const updateSettings = useUpdatePrimarySettings();
  const edited = useRef(false);
  return (
    <SettingsRow
      id={AGENT_LANGUAGE_SEARCH_ID}
      title={AGENT_LANGUAGE_SETTING.title}
      description={AGENT_LANGUAGE_SETTING.description}
      serverScoped
      settingKeys={["agentLanguage"]}
      resetAction={
        agentLanguage === "" ? null : (
          <SettingResetButton
            ariaLabel="Reset agent language to default"
            onClick={() => updateSettings({ agentLanguage: "" })}
          />
        )
      }
      control={
        <Input
          key={agentLanguage}
          aria-label="Agent language"
          placeholder="Default"
          defaultValue={agentLanguage}
          onChange={() => {
            edited.current = true;
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
          onBlur={(event) => {
            const value = event.target.value.trim();
            if (edited.current && value !== agentLanguage) updateSettings({ agentLanguage: value });
            edited.current = false;
          }}
        />
      }
    />
  );
}
