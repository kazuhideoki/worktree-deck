import { Action, ActionPanel, Form, Icon, List, Toast, showToast, useNavigation } from "@raycast/api";
import { useCallback, useEffect, useState } from "react";

import { worktreeMergeTargetOptionsUsecase } from "../application/worktree-merge-target-options.usecase";
import { resolveWorktreeDeckCompositionRoot, type Worktree } from "../composition-root";
import { buildBranchOptions, formatExecErrorMessage, type BranchOption } from "./worktree-ui-utils";

const WORKTREE_DECK_COMPOSITION_ROOT = resolveWorktreeDeckCompositionRoot();

/**
 * 編集フォームの初期 target branch 候補を作る
 */
export function buildInitialTargetBranchOptions(baseRef?: string | null): BranchOption[] {
  const normalizedBaseRef = baseRef?.trim() ?? "";
  return normalizedBaseRef ? buildBranchOptions([normalizedBaseRef]) : [];
}

/**
 * worktree の target branch 編集フォームを表示する
 */
export function EditWorktreeTargetBranchForm({
  item,
  onSave,
}: {
  item: Worktree;
  onSave: (args: { item: Worktree; targetRef: string }) => Promise<boolean>;
}) {
  const { pop } = useNavigation();
  const [targetOptions, setTargetOptions] = useState<BranchOption[]>(() =>
    buildInitialTargetBranchOptions(item.baseRef),
  );
  const [selectedTargetRef, setSelectedTargetRef] = useState(item.baseRef?.trim() ?? "");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const selection = await worktreeMergeTargetOptionsUsecase.loadMergeTargetSelection({
          worktreePath: item.path,
          branch: item.branch,
          dependencies: WORKTREE_DECK_COMPOSITION_ROOT.worktreeMergeTargetOptionsDependencies,
        });
        if (cancelled) {
          return;
        }
        setTargetOptions(buildBranchOptions(selection.refs));
        setSelectedTargetRef(selection.selectedRef);
      } catch (error) {
        if (cancelled) {
          return;
        }
        const message = formatExecErrorMessage(error);
        setErrorMessage(message);
        await showToast({
          style: Toast.Style.Failure,
          title: "Failed to load target branches",
          message,
        });
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [item.branch, item.path]);

  const handleSubmit = useCallback(
    async (values: EditWorktreeTargetBranchFormValues) => {
      const targetRef = values.targetRef?.trim();
      if (!targetRef) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Target branch is required",
        });
        return;
      }
      const shouldClose = await onSave({ item, targetRef });
      if (shouldClose) {
        pop();
      }
    },
    [item, onSave, pop],
  );

  if (errorMessage) {
    return (
      <List isLoading={isLoading}>
        <List.EmptyView title="Failed to load target branches" description={errorMessage} icon={Icon.Warning} />
      </List>
    );
  }

  return (
    <Form
      isLoading={isLoading}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Save Target Branch" icon={Icon.Pencil} onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.Description title="Repository" text={item.repo} />
      <Form.Description title="Worktree Branch" text={item.branch ?? "not detected"} />
      <Form.Dropdown
        id="targetRef"
        title="Target Branch"
        value={selectedTargetRef}
        isLoading={isLoading}
        onChange={setSelectedTargetRef}
      >
        {targetOptions.map((option) => (
          <Form.Dropdown.Item key={option.value} value={option.value} title={option.title} />
        ))}
      </Form.Dropdown>
    </Form>
  );
}

type EditWorktreeTargetBranchFormValues = {
  targetRef: string;
};
