import * as os from 'os';
import * as fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { HardwareGpuInfo, HardwareProfile } from '@ag/protocol';

const execFileAsync = promisify(execFile);

async function detectNvidiaSmiVram(): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (process.platform !== 'win32') return map;
  try {
    const { stdout } = await execFileAsync(
      'nvidia-smi',
      ['--query-gpu=name,memory.total', '--format=csv,noheader,nounits'],
      { timeout: 3000 }
    );
    for (const line of stdout.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const parts = trimmed.split(',');
      if (parts.length >= 2) {
        const name = parts[0].trim().toLowerCase();
        const mb = parseFloat(parts[1].trim());
        if (Number.isFinite(mb) && mb > 0) {
          map.set(name, Math.round(mb * 1024 * 1024));
        }
      }
    }
  } catch {
    // nvidia-smi not installed or no NVIDIA GPU
  }
  return map;
}

async function detectWindowsGpus(): Promise<{ gpus: HardwareGpuInfo[]; notes: string[] }> {
  const notes: string[] = [];
  if (process.platform !== 'win32') {
    return { gpus: [], notes: ['Non-Windows GPU probe skipped.'] };
  }

  const nvidiaMap = await detectNvidiaSmiVram();
  const gpus: HardwareGpuInfo[] = [];

  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        'Get-CimInstance Win32_VideoController | Select-Object Name,AdapterCompatibility,AdapterRAM | ConvertTo-Json -Compress',
      ],
      { timeout: 4000 }
    );

    const trimmed = stdout.trim();
    if (!trimmed) return { gpus, notes: ['No GPU adapters returned by Win32_VideoController.'] };
    const parsed = JSON.parse(trimmed);
    const items = Array.isArray(parsed) ? parsed : [parsed];

    for (const item of items) {
      const model = String(item?.Name || 'Unknown GPU').trim();
      const compat = String(item?.AdapterCompatibility || '').toLowerCase();
      const lowerModel = model.toLowerCase();

      let vendor: HardwareGpuInfo['vendor'] = 'unknown';
      if (lowerModel.includes('nvidia') || compat.includes('nvidia')) vendor = 'nvidia';
      else if (lowerModel.includes('amd') || lowerModel.includes('radeon') || compat.includes('amd') || compat.includes('ati'))
        vendor = 'amd';
      else if (lowerModel.includes('intel') || compat.includes('intel')) vendor = 'intel';

      const isIntegrated =
        vendor === 'intel' ||
        lowerModel.includes('uhd graphics') ||
        lowerModel.includes('hd graphics') ||
        lowerModel.includes('iris') ||
        lowerModel.includes('radeon(tm) graphics');

      const smiBytes = nvidiaMap.get(lowerModel);
      const rawAdapterRam = typeof item?.AdapterRAM === 'number' && item.AdapterRAM > 0 ? item.AdapterRAM : null;

      let dedicatedVramBytes: number | null = null;
      let sharedMemoryBytes: number | null = null;
      let vramDetectionMethod: HardwareGpuInfo['vramDetectionMethod'] = 'unavailable';

      if (smiBytes) {
        dedicatedVramBytes = smiBytes;
        vramDetectionMethod = 'nvidia-smi';
      } else if (isIntegrated) {
        sharedMemoryBytes = rawAdapterRam;
        vramDetectionMethod = rawAdapterRam ? 'wmi-estimated' : 'unavailable';
      } else if (rawAdapterRam) {
        dedicatedVramBytes = rawAdapterRam;
        vramDetectionMethod = 'wmi-estimated';
        if (rawAdapterRam >= 4 * 1024 ** 3 - 1024 ** 2) {
          notes.push(`WMI AdapterRAM caps reporting at ~4 GiB for ${model}; exact VRAM unavailable without vendor driver query.`);
        }
      }

      gpus.push({
        vendor,
        model,
        dedicatedVramBytes,
        sharedMemoryBytes,
        isIntegrated,
        vramDetectionMethod,
      });
    }
  } catch (err: any) {
    notes.push(`GPU detection fallback: ${err?.message || 'CIM query unavailable'}`);
  }

  return { gpus, notes };
}

export async function detectHardwareProfile(storagePath: string): Promise<HardwareProfile> {
  const cpus = os.cpus();
  const cpuModel = cpus[0]?.model?.trim() || 'Unknown Processor';
  const architecture = os.arch();
  const logicalCores = cpus.length || 1;
  const installedRamBytes = os.totalmem();
  const availableRamBytes = os.freemem();

  // Reserve OS + Electron workbench memory (~3.5 GiB or 22% of total, whichever is larger)
  const osReserveBytes = Math.max(Math.round(3.5 * 1024 ** 3), Math.round(installedRamBytes * 0.22));
  const usableForInferenceBytes = Math.max(0, installedRamBytes - osReserveBytes);

  const { gpus, notes } = await detectWindowsGpus();

  let accelerationBackend: HardwareProfile['accelerationBackend'] = 'cpu';
  const hasNvidia = gpus.some((g) => g.vendor === 'nvidia' && (g.dedicatedVramBytes ?? 0) >= 4 * 1024 ** 3);
  const hasDiscreteAmdOrIntel = gpus.some(
    (g) => (g.vendor === 'amd' || g.vendor === 'intel') && !g.isIntegrated && (g.dedicatedVramBytes ?? 0) >= 4 * 1024 ** 3
  );
  if (hasNvidia) {
    accelerationBackend = 'cuda';
    notes.push('Discrete NVIDIA GPU detected; CPU runtime bundled by default (Vulkan/CUDA offload supported when matching backend is present).');
  } else if (hasDiscreteAmdOrIntel) {
    accelerationBackend = 'vulkan';
  } else {
    notes.push('Running in CPU inference mode (no dedicated high-VRAM discrete GPU detected).');
  }

  let availableBytes = 0;
  let totalBytes = 0;
  try {
    const checkDir = fs.existsSync(storagePath) ? storagePath : os.homedir();
    const stat = fs.statfsSync(checkDir);
    availableBytes = Number(stat.bfree) * Number(stat.bsize);
    totalBytes = Number(stat.blocks) * Number(stat.bsize);
  } catch {
    notes.push(`Could not determine free disk space for ${storagePath}.`);
  }

  const instructionSets: string[] = [];
  if (architecture === 'x64') {
    instructionSets.push('x86_64', 'SSE4.2', 'AVX2 (assumed on modern x64)');
  } else if (architecture === 'arm64') {
    instructionSets.push('ARM64', 'NEON');
  }

  return {
    detectedAt: Date.now(),
    platform: `${os.platform()} ${os.release()}`,
    cpu: {
      model: cpuModel,
      architecture,
      logicalCores,
      instructionSets,
    },
    memory: {
      installedRamBytes,
      availableRamBytes,
      usableForInferenceBytes,
      osReserveBytes,
    },
    gpus,
    accelerationBackend,
    storage: {
      path: storagePath,
      availableBytes,
      totalBytes,
    },
    notes,
  };
}
