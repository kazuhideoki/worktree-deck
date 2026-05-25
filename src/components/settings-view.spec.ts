import { Action, ActionPanel, Icon, List } from "@raycast/api";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";

import { RepositoryMappingManager } from "./repository-mapping-manager";
import { buildSettingsItems, SettingsView } from "./settings-view";

type ElementWithProps<Props> = ReactElement<Props>;

describe("buildSettingsItems", () => {
  it("General Settings に Repositories を含める", () => {
    expect(buildSettingsItems()).toEqual([
      {
        id: "repositories",
        title: "Repositories",
        subtitle: "Register repository roots and display names.",
        icon: Icon.Folder,
      },
    ]);
  });
});

describe("SettingsView", () => {
  it("Repositories から repository mapping 管理画面へ遷移する", () => {
    const handleRepositoryMappingChange = () => undefined;
    const view = SettingsView({ onRepositoryMappingChange: handleRepositoryMappingChange }) as ElementWithProps<{
      children: ReactElement;
      searchBarPlaceholder: string;
    }>;
    const section = view.props.children as ElementWithProps<{ children: ReactElement[]; title: string }>;
    const item = section.props.children[0] as ElementWithProps<{
      actions: ReactElement;
      title: string;
      subtitle: string;
    }>;
    const actions = item.props.actions as ElementWithProps<{ children: ReactElement }>;
    const pushAction = actions.props.children as ElementWithProps<{
      target: ReactElement<{ onChange?: () => void }>;
      title: string;
    }>;

    expect(view.type).toBe(List);
    expect(view.props.searchBarPlaceholder).toBe("Search settings");
    expect(section.type).toBe(List.Section);
    expect(section.props.title).toBe("General");
    expect(item.type).toBe(List.Item);
    expect(item.props.title).toBe("Repositories");
    expect(item.props.subtitle).toBe("Register repository roots and display names.");
    expect(actions.type).toBe(ActionPanel);
    expect(pushAction.type).toBe(Action.Push);
    expect(pushAction.props.title).toBe("Open Repositories");
    expect(pushAction.props.target.type).toBe(RepositoryMappingManager);
    expect(pushAction.props.target.props.onChange).toBe(handleRepositoryMappingChange);
  });
});
