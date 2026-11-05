import { DefaultShellResolver } from './services/execution/resolvers/ShellResolver';
import { DefaultProfileResolver } from './services/execution/resolvers/ProfileResolver';
import { DefaultEnvironmentResolver } from './services/execution/resolvers/EnvironmentResolver';
import { DefaultWorkingDirectoryResolver } from './services/execution/resolvers/WorkingDirectoryResolver';
import { RegistryCapabilityResolver } from './services/execution/resolvers/CapabilityResolver';
import { ExecutionPolicyPipeline } from './services/execution/policies/IExecutionPolicyPipeline';
import { ExecutionBackendRegistry } from './services/terminal/pty/types';
import { LocalBackend } from './services/terminal/pty/LocalBackend';
import { DockerBackend } from './services/terminal/pty/DockerBackend';
import { ExecutionContextResolver } from './services/execution/ExecutionContextResolver';
import { TerminalService } from './services/TerminalService';
import { WorkspaceExecutionService } from './services/execution/WorkspaceExecutionService';
import { Channels, TerminalProtocol } from '@ag/protocol';
import { join } from 'path';

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log('=== RUNTIME ACCEPTANCE TEST ===');

  // 1. Shell Discovery
  console.log('\\n[1] SHELL DISCOVERY');
  const resolver = new DefaultShellResolver();
  const profiles = await resolver.discoverProfiles();
  profiles.forEach((p) => console.log(`Discovered: ${p.id} -> ${p.executable}`));

  // 2. Mock Services
  let events: any[] = [];
  const mockWindowService: any = {
    broadcast: (channel: string, payload: any) => {
      if (
        channel === Channels.Terminal.OnEvent &&
        payload.category === 'data' &&
        payload.kind === 'output'
      ) {
        events.push(payload);
      }
    },
  };

  const backendRegistry = new ExecutionBackendRegistry();
  backendRegistry.register(new LocalBackend());
  backendRegistry.register(new DockerBackend());

  const contextResolver = new ExecutionContextResolver(
    new DefaultProfileResolver(),
    new DefaultEnvironmentResolver(),
    new DefaultWorkingDirectoryResolver(),
    new DefaultShellResolver(),
    new RegistryCapabilityResolver(backendRegistry)
  );

  const policyPipeline = new ExecutionPolicyPipeline();
  const execService = new WorkspaceExecutionService(
    contextResolver,
    policyPipeline,
    backendRegistry
  );
  const terminalService = new TerminalService(
    () => mockWindowService,
    () => execService
  );

  const getOutput = async (sessionId: string, waitMs = 1000): Promise<string> => {
    let output = '';
    const start = Date.now();
    while (Date.now() - start < waitMs) {
      const msgs = events.filter((e) => e.sessionId === sessionId);
      events = events.filter((e) => e.sessionId !== sessionId);
      for (const m of msgs) {
        output += new TextDecoder().decode(m.data);
      }
      await delay(50);
    }
    return output;
  };

  const testDir = process.cwd();
  console.log(`\\nTest CWD: ${testDir}`);

  // Test each discovered shell
  for (const profile of profiles) {
    console.log(`\\n--- Testing Shell: ${profile.id} ---`);

    // Create Terminal
    const terminalId = `frontend-${profile.id}`;
    const sessionId = await terminalService.createTerminal({
      id: terminalId,
      profileId: profile.id,
      cwd: testDir,
      executable: profile.executable,
      args: profile.args,
    });

    console.log(`Backend Session ID: ${sessionId}`);

    // Wait for prompt
    await getOutput(sessionId, 500);

    // Write command
    let cmd = '';
    if (profile.id.includes('powershell') || profile.id.includes('pwsh')) {
      cmd = 'Get-Location; $PID\\r\\n';
    } else if (profile.id.includes('cmd')) {
      cmd = 'cd\\r\\n';
    } else if (profile.id.includes('bash')) {
      cmd = 'pwd\\n';
    }

    if (cmd) {
      await terminalService.writeTerminal(sessionId, cmd);
      const out = await getOutput(sessionId, 1000);
      console.log(`Output:\\n${out}`);
    }
  }

  // F5 Test
  console.log('\\n--- F5 / RECONNECT TEST ---');
  const psProfile = profiles.find((p) => p.id.includes('powershell'));
  if (psProfile) {
    const f5SessionId = await terminalService.createTerminal({
      id: 'f5-test-uuid',
      profileId: psProfile.id,
      cwd: testDir,
      executable: psProfile.executable,
      args: psProfile.args,
    });

    await getOutput(f5SessionId, 500);
    await terminalService.writeTerminal(f5SessionId, '$x = "SURVIVED"; $PID\\r\\n');
    console.log('Pre-F5 Output:\\n', await getOutput(f5SessionId, 1000));

    console.log('Simulating Frontend Detach (F5)');
    await terminalService.detachSession(f5SessionId);

    // List Sessions
    const sessions = terminalService.listSessions();
    console.log(
      `Active sessions post-F5: ${sessions.length} (contains ${f5SessionId}: ${sessions.includes(f5SessionId)})`
    );

    // Attach
    const history = await terminalService.attachSession(f5SessionId);
    console.log('History restored bytes:', history.length);

    await terminalService.writeTerminal(f5SessionId, '$x; $PID\\r\\n');
    console.log('Post-F5 Output:\\n', await getOutput(f5SessionId, 1000));

    // Destroy
    console.log('Simulating Kill/Destroy');
    await terminalService.closeTerminal(f5SessionId);
    const finalSessions = terminalService.listSessions();
    console.log(`Active sessions post-destroy: ${finalSessions.length}`);
  }

  console.log('\\n=== TEST COMPLETE ===');
  process.exit(0);
}

run().catch(console.error);
