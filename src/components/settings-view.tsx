import { Action, ActionPanel, Icon, List } from "@raycast/api";
import { RepositoryMappingManager } from "./repository-mapping-manager";

/**
 * アプリケーション設定カテゴリの識別子
 */
export type SettingsItemId = "repositories";

/**
 * アプリケーション設定カテゴリの表示情報
 */
export type SettingsItem = {
  id: SettingsItemId;
  title: string;
  subtitle: string;
  icon: Icon;
};

type SettingsViewProps = {
  onRepositoryMappingChange?: () => void;
};

/**
 * アプリケーション利用中に変更する設定カテゴリを返す
 */
export function buildSettingsItems(): SettingsItem[] {
  return [
    {
      id: "repositories",
      title: "Repositories",
      subtitle: "Register repository roots and display names.",
      icon: Icon.Folder,
    },
  ];
}

/**
 * アプリケーション設定の総合窓口を表示する
 */
export function SettingsView({ onRepositoryMappingChange }: SettingsViewProps) {
  const items = buildSettingsItems();

  return (
    <List searchBarPlaceholder="Search settings">
      <List.Section title="General">
        {items.map((item) => (
          <List.Item
            key={item.id}
            title={item.title}
            subtitle={item.subtitle}
            icon={item.icon}
            actions={
              <ActionPanel>
                {item.id === "repositories" ? (
                  <Action.Push
                    title="Open Repositories"
                    icon={Icon.Folder}
                    target={<RepositoryMappingManager onChange={onRepositoryMappingChange} />}
                  />
                ) : null}
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    </List>
  );
}
