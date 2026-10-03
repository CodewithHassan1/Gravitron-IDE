import { IWorkspaceExecutionService } from '../execution/IWorkspaceExecutionService';
import { ExecutionSession } from '../execution/ExecutionSession';
import { TaskExecutionPlan } from './TaskExecutionPlan';
import { TaskOutputBuffer } from './TaskOutputBuffer';
import { ProblemMatcherRegistry } from './diagnostics/ProblemMatcherRegistry';
import { TaskEvent } from '@ag/protocol';

export class TaskRunner {
  private session?: ExecutionSession;
  private outputBuffer?: TaskOutputBuffer;
  private isCancelled = false;

  constructor(
    public readonly executionId: string,
    public readonly plan: TaskExecutionPlan,
    private readonly executionService: IWorkspaceExecutionService,
    private readonly problemMatcherRegistry: ProblemMatcherRegistry,
    private readonly emitEvent: (event: TaskEvent) => void
  ) { }

  public async run(): Promise<number> {
    if (this.isCancelled) throw new Error('Task was cancelled before starting');

    this.emitEvent({
      category: 'lifecycle',
      kind: 'started',
      executionId: this.executionId
    });

    const activeMatchers = (this.plan.definition.problemMatchers || [])
      .map(id => this.problemMatcherRegistry.get(id))
      .filter(m => m !== undefined);

    this.outputBuffer = new TaskOutputBuffer(
      this.executionId,
      (line) => {
        // Run matchers on every line
        for (const matcher of activeMatchers) {
          const diagnostic = matcher!.match(line);
          if (diagnostic) {
            this.emitEvent({
              category: 'diagnostic',
              kind: 'problem',
              executionId: this.executionId,
              diagnostic
            });
          }
        }
      },
      (event) => this.emitEvent(event)
    );

    this.session = await this.executionService.execute({
      workspaceId: this.plan.traceContext.workspaceId,
      target: this.plan.target,
      cwdOverride: this.plan.cwd,
      environmentOverride: this.plan.environment,
      shellOverride: {
        executable: this.plan.executable,
        args: this.plan.args as string[]
      },
      terminalOptions: {
        cols: 80,
        rows: 24
      }
    });

    if (this.session.process) {
      this.session.process.onData((chunk) => {
        this.outputBuffer!.push(chunk);
      });
    }

    return new Promise((resolve, reject) => {
      if (!this.session?.process) {
        reject(new Error('Process was not created'));
        return;
      }

      this.session.process.onExit((exitCode) => {
        this.outputBuffer!.flush();

        this.emitEvent({
          category: 'lifecycle',
          kind: 'completed',
          executionId: this.executionId,
          snapshot: {
            executionId: this.executionId,
            taskId: this.plan.definition.id,
            trace: this.plan.traceContext,
            startTime: this.session!.createdAt,
            endTime: Date.now(),
            exitCode,
            targetKind: this.plan.target.kind,
            workspaceId: this.plan.traceContext.workspaceId,
            state: exitCode === 0 ? 'completed' : 'failed',
            problemsFound: [] // Ideally we accumulate them in the runner
          }
        });

        resolve(exitCode);
      });
    });
  }

  public cancel(): void {
    this.isCancelled = true;
    if (this.session?.process) {
      this.session.process.kill();
    }
  }

  public dispose(): void {
    this.outputBuffer?.dispose();
    this.session?.dispose();
  }
}
