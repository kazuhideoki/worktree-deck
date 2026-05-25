/**
 * テスト用の素通しコンポーネントを作る
 */
function createPassthroughComponent(_name: string) {
  void _name;
  return function PassthroughComponent(_props: unknown) {
    void _props;
    return null;
  };
}

/**
 * テスト用の Action モック
 */
export const Action = {
  Push: createPassthroughComponent("Action.Push"),
} as const;

/**
 * テスト用の ActionPanel モック
 */
export const ActionPanel = createPassthroughComponent("ActionPanel");

/**
 * テスト用の Icon モック
 */
export const Icon = {
  Folder: "folder",
} as const;

/**
 * テスト用の List モック
 */
export const List = Object.assign(createPassthroughComponent("List"), {
  Section: createPassthroughComponent("List.Section"),
  Item: createPassthroughComponent("List.Item"),
});

/**
 * テスト用の LocalStorage モック
 */
export const LocalStorage = {
  /**
   * 値を取得する
   */
  async getItem<T>(_key: string): Promise<T | null> {
    void _key;
    return null;
  },
  /**
   * 値を保存する
   */
  async setItem(_key: string, _value: string): Promise<void> {
    void _key;
    void _value;
    return;
  },
};
