// A basic command pattern implementation for undo/redo

export interface ICommand {
  execute(): Promise<void>;
  undo(): Promise<void>;
}

export class ConfigurationCommand implements ICommand {
  constructor(
    private readonly key: string,
    private readonly previousValue: any,
    private readonly newValue: any,
    private readonly commit: (key: string, value: any) => Promise<void>
  ) {}

  async execute(): Promise<void> {
    await this.commit(this.key, this.newValue);
  }

  async undo(): Promise<void> {
    await this.commit(this.key, this.previousValue);
  }
}
