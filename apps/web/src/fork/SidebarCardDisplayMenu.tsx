import { SlidersHorizontalIcon } from "lucide-react";
import type { ReactElement } from "react";

import {
  Menu,
  MenuCheckboxItem,
  MenuGroup,
  MenuGroupLabel,
  MenuPopup,
  MenuTrigger,
} from "~/components/ui/menu";
import { SIDEBAR_CARD_FIELDS, useSidebarCardDisplayStore } from "./sidebarCardDisplay";

export const SIDEBAR_CARD_DISPLAY_LABEL = "Display options";

export function SidebarCardDisplayMenu(props: { trigger: ReactElement }) {
  const display = useSidebarCardDisplayStore((state) => state.display);
  const setFieldVisible = useSidebarCardDisplayStore((state) => state.setFieldVisible);
  return (
    <Menu>
      <MenuTrigger render={props.trigger}>
        <SlidersHorizontalIcon />
      </MenuTrigger>
      <MenuPopup align="end">
        <MenuGroup>
          <MenuGroupLabel>Show</MenuGroupLabel>
          {SIDEBAR_CARD_FIELDS.map((field) => (
            <MenuCheckboxItem
              key={field.key}
              checked={display[field.key]}
              closeOnClick={false}
              onCheckedChange={(visible) => setFieldVisible(field.key, visible)}
            >
              {field.label}
            </MenuCheckboxItem>
          ))}
        </MenuGroup>
      </MenuPopup>
    </Menu>
  );
}
