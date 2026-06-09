import {
  Action,
  ActionPanel,
  Alert,
  Form,
  Icon,
  List,
  Toast,
  confirmAlert,
  popToRoot,
  showToast,
  useNavigation,
} from "@raycast/api";
import { basename } from "node:path";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { resolveWorktreeDeckCompositionRoot } from "../composition-root";
import {
  repositoryMappingService,
  type RepositoryBranchNamingSuggestion,
  type RepositoryMapping,
} from "../domain/repository-mapping.service";

const WORKTREE_DECK_COMPOSITION_ROOT = resolveWorktreeDeckCompositionRoot();
const { loadRepositoryMappings, saveRepositoryMappings } = WORKTREE_DECK_COMPOSITION_ROOT.repositoryMappingStore;

type RepositoryMappingFormValues = {
  repoRoot: string;
  mapValue: string;
  branchNamePattern?: string;
  branchNamePrompt?: string;
};

type RepositoryMappingFormDraftValues = Required<RepositoryMappingFormValues>;

type RepositoryMappingFormProps = {
  initialMapping?: RepositoryMapping;
  branchNamingSuggestions: RepositoryBranchNamingSuggestion[];
  onSave: (values: RepositoryMappingFormValues, originalRepoRoot?: string) => Promise<boolean>;
  returnToRootAfterSave?: boolean;
};

type RepositoryMappingManagerProps = {
  autoOpenAddForm?: boolean;
  onChange?: () => void;
};

/**
 * repository mapping 管理画面を表示する
 */
export function RepositoryMappingManager({ autoOpenAddForm = false, onChange }: RepositoryMappingManagerProps) {
  const { push } = useNavigation();
  const [mappings, setMappings] = useState<RepositoryMapping[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const hasAutoOpenedAddFormRef = useRef(false);

  /**
   * mapping の一覧を再読み込みする
   */
  const refreshMappings = useCallback(async () => {
    setIsLoading(true);
    try {
      const loaded = await loadRepositoryMappings();
      setMappings(loaded);
      setErrorMessage(null);
    } catch (error) {
      const message = formatMappingError(error);
      setErrorMessage(message);
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to load repository mappings",
        message,
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshMappings();
  }, [refreshMappings]);

  /**
   * mapping を保存して一覧を更新する
   */
  const handleSaveMapping = useCallback(
    async (values: RepositoryMappingFormValues, originalRepoRoot?: string): Promise<boolean> => {
      const repoRoot = values.repoRoot.trim();
      const mapValue = values.mapValue.trim();
      const branchNamePattern = values.branchNamePattern?.trim() ?? "";
      const branchNamePrompt = values.branchNamePrompt?.trim() ?? "";
      if (!repoRoot) {
        await showToast({ style: Toast.Style.Failure, title: "Repository path is required" });
        return false;
      }
      const base = originalRepoRoot ?? repoRoot;
      let next = mappings.filter((entry) => entry.repoRoot !== base);
      const existing = next.find((entry) => entry.repoRoot === repoRoot);
      if (existing && existing.repoRoot !== base) {
        const confirmed = await confirmAlert({
          title: "Overwrite existing mapping?",
          message: repoRoot,
          primaryAction: { title: "Overwrite", style: Alert.ActionStyle.Destructive },
          dismissAction: { title: "Cancel" },
        });
        if (!confirmed) {
          return false;
        }
        next = next.filter((entry) => entry.repoRoot !== repoRoot);
      }
      next = [...next, { repoRoot, mapValue, branchNamePattern, branchNamePrompt }];
      try {
        const saved = await saveRepositoryMappings(next);
        setMappings(saved);
        onChange?.();
        await showToast({ style: Toast.Style.Success, title: "Repository mapping saved" });
        return true;
      } catch (error) {
        const message = formatMappingError(error);
        await showToast({
          style: Toast.Style.Failure,
          title: "Failed to save repository mapping",
          message,
        });
        return false;
      }
    },
    [mappings, onChange],
  );

  /**
   * mapping を削除して一覧を更新する
   */
  const handleDeleteMapping = useCallback(
    async (entry: RepositoryMapping) => {
      const confirmed = await confirmAlert({
        title: "Remove repository mapping?",
        message: `${entry.mapValue} (${entry.repoRoot})`,
        primaryAction: { title: "Remove", style: Alert.ActionStyle.Destructive },
        dismissAction: { title: "Cancel" },
      });
      if (!confirmed) {
        return;
      }
      try {
        const saved = await saveRepositoryMappings(mappings.filter((item) => item.repoRoot !== entry.repoRoot));
        setMappings(saved);
        onChange?.();
        await showToast({ style: Toast.Style.Success, title: "Repository mapping removed" });
      } catch (error) {
        const message = formatMappingError(error);
        await showToast({
          style: Toast.Style.Failure,
          title: "Failed to remove repository mapping",
          message,
        });
      }
    },
    [mappings, onChange],
  );

  const sortedMappings = useMemo(() => mappings, [mappings]);

  useEffect(() => {
    if (
      !shouldAutoOpenRepositoryMappingForm({
        autoOpenAddForm,
        hasAutoOpened: hasAutoOpenedAddFormRef.current,
        isLoading,
        errorMessage,
        mappingCount: sortedMappings.length,
      })
    ) {
      return;
    }
    hasAutoOpenedAddFormRef.current = true;
    push(
      <RepositoryMappingForm
        branchNamingSuggestions={resolveRepositoryBranchNamingSuggestions({
          mappings,
          currentRepoRoot: "",
        })}
        onSave={handleSaveMapping}
        returnToRootAfterSave={resolveRepositoryMappingFormReturnToRoot(autoOpenAddForm)}
      />,
    );
  }, [autoOpenAddForm, errorMessage, handleSaveMapping, isLoading, push, sortedMappings.length]);

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Search repository mappings">
      {sortedMappings.length > 0 ? (
        <List.Section title="Actions">
          <List.Item
            title="Add Repository Mapping"
            icon={Icon.PlusCircle}
            actions={
              <ActionPanel>
                <Action.Push
                  title="Add Repository Mapping"
                  icon={Icon.PlusCircle}
                  target={
                    <RepositoryMappingForm
                      branchNamingSuggestions={resolveRepositoryBranchNamingSuggestions({
                        mappings,
                        currentRepoRoot: "",
                      })}
                      onSave={handleSaveMapping}
                      returnToRootAfterSave={resolveRepositoryMappingFormReturnToRoot(autoOpenAddForm)}
                    />
                  }
                />
              </ActionPanel>
            }
          />
        </List.Section>
      ) : null}
      {errorMessage ? (
        <List.EmptyView title="Failed to load repository mappings" description={errorMessage} icon={Icon.Warning} />
      ) : sortedMappings.length === 0 ? (
        <List.EmptyView
          title="Add your first repository"
          description="Register a repository path to start tracking worktrees."
          icon={Icon.PlusCircle}
          actions={
            <ActionPanel>
              <Action.Push
                title="Add Repository Mapping"
                icon={Icon.PlusCircle}
                target={
                  <RepositoryMappingForm
                    branchNamingSuggestions={resolveRepositoryBranchNamingSuggestions({
                      mappings,
                      currentRepoRoot: "",
                    })}
                    onSave={handleSaveMapping}
                    returnToRootAfterSave={resolveRepositoryMappingFormReturnToRoot(autoOpenAddForm)}
                  />
                }
              />
            </ActionPanel>
          }
        />
      ) : (
        <List.Section title="Mappings">
          {sortedMappings.map((entry) => (
            <List.Item
              key={entry.repoRoot}
              title={entry.mapValue}
              subtitle={entry.repoRoot}
              icon={Icon.Folder}
              accessories={[
                ...(entry.branchNamePattern ? [{ text: "Branch Rule" }] : []),
                { text: basename(entry.repoRoot) },
              ]}
              actions={
                <ActionPanel>
                  <Action.Push
                    title="Edit Repository Mapping"
                    icon={Icon.Pencil}
                    target={
                      <RepositoryMappingForm
                        initialMapping={entry}
                        branchNamingSuggestions={resolveRepositoryBranchNamingSuggestions({
                          mappings,
                          currentRepoRoot: entry.repoRoot,
                        })}
                        onSave={handleSaveMapping}
                      />
                    }
                  />
                  <Action
                    title="Remove Repository Mapping"
                    icon={Icon.Trash}
                    style={Action.Style.Destructive}
                    shortcut={{ modifiers: ["cmd"], key: "d" }}
                    onAction={() => void handleDeleteMapping(entry)}
                  />
                  <Action.CopyToClipboard title="Copy Repository Path" icon={Icon.Clipboard} content={entry.repoRoot} />
                  <Action.CopyToClipboard title="Copy Map Value" icon={Icon.Clipboard} content={entry.mapValue} />
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      )}
    </List>
  );
}

/**
 * repository mapping 追加フォームを自動表示するか判定する
 */
export function shouldAutoOpenRepositoryMappingForm(args: {
  autoOpenAddForm: boolean;
  hasAutoOpened: boolean;
  isLoading: boolean;
  errorMessage: string | null;
  mappingCount: number;
}): boolean {
  if (!args.autoOpenAddForm || args.hasAutoOpened || args.isLoading || args.errorMessage !== null) {
    return false;
  }
  return args.mappingCount === 0;
}

/**
 * 初回オンボーディング中の追加フォーム保存後に root へ戻すか返す
 */
export function resolveRepositoryMappingFormReturnToRoot(autoOpenAddForm: boolean): boolean {
  return autoOpenAddForm;
}

/**
 * Repository Mapping Form に表示する branch 命名規則候補を返す
 */
export function resolveRepositoryBranchNamingSuggestions(args: {
  mappings: RepositoryMapping[];
  currentRepoRoot: string;
}): RepositoryBranchNamingSuggestion[] {
  return repositoryMappingService.listBranchNamingSuggestions(args.mappings, args.currentRepoRoot);
}

/**
 * mapping フォームの初期入力値を返す
 */
export function resolveRepositoryMappingFormDraft(
  initialMapping?: RepositoryMapping,
): RepositoryMappingFormDraftValues {
  return {
    repoRoot: initialMapping?.repoRoot ?? "",
    mapValue: initialMapping?.mapValue ?? "",
    branchNamePattern: initialMapping?.branchNamePattern ?? "",
    branchNamePrompt: initialMapping?.branchNamePrompt ?? "",
  };
}

/**
 * branch 命名規則候補を入力中のフォーム値へ反映する
 */
export function applyRepositoryBranchNamingSuggestionToDraft(
  current: RepositoryMappingFormDraftValues,
  suggestion: RepositoryBranchNamingSuggestion,
): RepositoryMappingFormDraftValues {
  return {
    ...current,
    branchNamePattern: suggestion.branchNamePattern ?? "",
    branchNamePrompt: suggestion.branchNamePrompt ?? "",
  };
}

/**
 * mapping 入力フォームを表示する
 */
function RepositoryMappingForm({
  initialMapping,
  branchNamingSuggestions,
  onSave,
  returnToRootAfterSave = false,
}: RepositoryMappingFormProps) {
  const { pop } = useNavigation();
  const [draft, setDraft] = useState(() => resolveRepositoryMappingFormDraft(initialMapping));

  /**
   * 他 repository の branch 命名規則をフォームへ反映する
   */
  const handleApplyBranchNamingSuggestion = useCallback(async (suggestion: RepositoryBranchNamingSuggestion) => {
    setDraft((current) => applyRepositoryBranchNamingSuggestionToDraft(current, suggestion));
    await showToast({
      style: Toast.Style.Success,
      title: "Branch naming rule applied",
      message: suggestion.sourceMapValue,
    });
  }, []);

  /**
   * 入力値を検証して保存する
   */
  const handleSubmit = useCallback(
    async (values: RepositoryMappingFormValues) => {
      const saved = await onSave(values, initialMapping?.repoRoot);
      if (saved) {
        if (returnToRootAfterSave) {
          await popToRoot({ clearSearchBar: true });
          return;
        }
        pop();
      }
    },
    [initialMapping?.repoRoot, onSave, pop, returnToRootAfterSave],
  );

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Save Repository Mapping" icon={Icon.SaveDocument} onSubmit={handleSubmit} />
          {branchNamingSuggestions.map((suggestion) => (
            <Action
              key={suggestion.sourceRepoRoot}
              title={`Apply Branch Rule from ${suggestion.sourceMapValue}`}
              icon={Icon.Download}
              shortcut={null}
              onAction={() => {
                void handleApplyBranchNamingSuggestion(suggestion);
              }}
            />
          ))}
        </ActionPanel>
      }
    >
      <Form.TextField
        id="repoRoot"
        title="Repository Path"
        placeholder="/path/to/repository"
        value={draft.repoRoot}
        onChange={(value) => setDraft((current) => ({ ...current, repoRoot: value }))}
      />
      <Form.TextField
        id="mapValue"
        title="Map Value"
        placeholder={initialMapping?.repoRoot ? basename(initialMapping.repoRoot) : "repository-name"}
        value={draft.mapValue}
        onChange={(value) => setDraft((current) => ({ ...current, mapValue: value }))}
      />
      <Form.TextField
        id="branchNamePattern"
        title="Branch Name Pattern"
        placeholder="^feat/[a-z0-9-]+$"
        value={draft.branchNamePattern}
        onChange={(value) => setDraft((current) => ({ ...current, branchNamePattern: value }))}
      />
      <Form.TextArea
        id="branchNamePrompt"
        title="Branch Naming Prompt"
        placeholder="Use feat/, fix/, or chore/ based on the task."
        value={draft.branchNamePrompt}
        onChange={(value) => setDraft((current) => ({ ...current, branchNamePrompt: value }))}
      />
      <Form.Description
        title="Note"
        text="If Map Value is empty, the repository name is used. Branch Name Pattern is optional."
      />
    </Form>
  );
}

/**
 * mapping 関連のエラーを文字列に整形する
 */
function formatMappingError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "Unknown error";
}
