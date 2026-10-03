export interface IMessageChannel<TSend = any, TReceive = any> {
  send(message: TSend): void;
  subscribe(callback: (message: TReceive) => void): { dispose: () => void };
  dispose(): void;
}
