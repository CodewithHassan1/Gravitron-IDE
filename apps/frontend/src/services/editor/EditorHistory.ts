export class EditorHistory {
  private history: string[] = [];
  private pointer: number = -1;

  push(uri: string) {
    if (this.pointer < this.history.length - 1) {
      this.history = this.history.slice(0, this.pointer + 1);
    }
    if (this.history[this.history.length - 1] !== uri) {
      this.history.push(uri);
      this.pointer++;
    }
  }

  back(): string | null {
    if (this.pointer > 0) {
      this.pointer--;
      return this.history[this.pointer];
    }
    return null;
  }

  forward(): string | null {
    if (this.pointer < this.history.length - 1) {
      this.pointer++;
      return this.history[this.pointer];
    }
    return null;
  }
}
