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
