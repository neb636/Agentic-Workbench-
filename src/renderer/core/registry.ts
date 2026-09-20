export interface RegistryItem {
  id: string;
}

export class Registry<T extends RegistryItem> {
  private readonly items = new Map<string, T>();

  register(item: T): () => void {
    if (this.items.has(item.id)) throw new Error(`Registration already exists: ${item.id}`);
    this.items.set(item.id, item);
    return () => this.items.delete(item.id);
  }

  get(id: string): T | undefined {
    return this.items.get(id);
  }

  list(): T[] {
    return [...this.items.values()];
  }
}
