export class AgentScheduler {
  private queue: string[] = [];

  enqueue(agentId: string) {
    this.queue.push(agentId);
  }

  dequeue(): string | undefined {
    return this.queue.shift();
  }
}
