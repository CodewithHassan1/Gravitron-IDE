export class RecentItemsImpl {
  private items: string[] = [];

  add(id: string) {
    this.items = [id, ...this.items.filter((i) => i !== id)].slice(0, 100);
  }

  getItems(): string[] {
    return this.items;
  }
}

export const RecentItems = new RecentItemsImpl();
