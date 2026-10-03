import { TerminalProtocol } from '@ag/protocol';

export class TerminalMetricsTracker {
  private startTime = Date.now();
  
  private bytesSent = 0;
  private bytesReceived = 0;
  private flushCount = 0;
  private bufferDrops = 0;
  private peakQueue = 0;
  private avgLatency = 0;

  private reconnectCount = 0;
  private attachFailures = 0;
  private cancelCount = 0;
  private spawnFailures = 0;

  public recordBytesSent(bytes: number) {
    this.bytesSent += bytes;
  }

  public recordBytesReceived(bytes: number) {
    this.bytesReceived += bytes;
  }

  public recordFlush(queueSize: number) {
    this.flushCount++;
    if (queueSize > this.peakQueue) {
      this.peakQueue = queueSize;
    }
  }

  public recordDrop() {
    this.bufferDrops++;
  }

  public recordReconnect() {
    this.reconnectCount++;
  }
  
  public recordAttachFailure() {
    this.attachFailures++;
  }

  public getOperationalMetrics(): TerminalProtocol.TerminalOperationalMetrics {
    return {
      capturedAt: Date.now(),
      uptime: Date.now() - this.startTime,
      bytesSent: this.bytesSent,
      bytesReceived: this.bytesReceived,
      flushCount: this.flushCount,
      bufferDrops: this.bufferDrops,
      avgLatency: this.avgLatency,
      peakQueue: this.peakQueue
    };
  }

  public getDiagnosticMetrics(): TerminalProtocol.TerminalDiagnosticMetrics {
    return {
      capturedAt: Date.now(),
      uptime: Date.now() - this.startTime,
      reconnectCount: this.reconnectCount,
      attachFailures: this.attachFailures,
      cancelCount: this.cancelCount,
      spawnFailures: this.spawnFailures
    };
  }
}
