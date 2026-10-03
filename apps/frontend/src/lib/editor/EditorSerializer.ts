export class EditorSerializer {
  static serialize(data: any): string {
    try {
      return JSON.stringify(data);
    } catch (e) {
      console.error('Failed to serialize editor data', e);
      return '';
    }
  }

  static deserialize<T>(dataStr: string): T | null {
    if (!dataStr) return null;
    try {
      return JSON.parse(dataStr) as T;
    } catch (e) {
      console.error('Failed to deserialize editor data', e);
      return null;
    }
  }
}
