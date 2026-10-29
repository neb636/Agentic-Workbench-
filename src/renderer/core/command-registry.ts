export type CommandHandler<TArgs = unknown, TResult = unknown> = (args: TArgs) => TResult | Promise<TResult>;

export class CommandRegistry {
  private readonly handlers = new Map<string, CommandHandler>();

  register<TArgs = unknown, TResult = unknown>(
    id: string,
    handler: CommandHandler<TArgs, TResult>,
  ): () => void {
    if (this.handlers.has(id)) throw new Error(`Command already exists: ${id}`);
    this.handlers.set(id, handler as CommandHandler);
    return () => this.handlers.delete(id);
  }

  async execute<TResult = unknown>(id: string, args?: unknown): Promise<TResult> {
    const handler = this.handlers.get(id);
    if (!handler) throw new Error(`Unknown command: ${id}`);
    return handler(args) as TResult;
  }

  has(id: string): boolean {
    return this.handlers.has(id);
  }
}
