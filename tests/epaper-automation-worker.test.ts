// @vitest-environment node
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import mongoose from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { runEpaperAutomationWorker, assertSafeWorkerEnvironment, didWork } =
  require('../scripts/epaper/run-automation-worker.js');
const { superviseAutomationWorker } =
  require('../scripts/epaper/automation-worker-supervisor.js');
const enabled = { NODE_ENV: 'production', EPAPER_AUTOMATION_WORKER_ENABLED: '1' };

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('standalone automation worker lifecycle', () => {
  it('refuses arbitrary development databases and implicit production startup', () => {
    expect(() => assertSafeWorkerEnvironment({ NODE_ENV: 'development' })).toThrow();
    expect(() => assertSafeWorkerEnvironment({ NODE_ENV: 'production' })).toThrow();
    expect(() => assertSafeWorkerEnvironment(enabled)).not.toThrow();
  });

  it('uses a service outside HTTP and disconnects after aborting an idle cycle', async () => {
    const controller = new AbortController();
    const disconnect = vi.spyOn(mongoose, 'disconnect').mockResolvedValue();
    const service = { processDue: vi.fn(async () => {
      controller.abort();
      return { processing: { claimed: 0 }, ocr: { processed: 0 } };
    }) };
    await runEpaperAutomationWorker(controller.signal, enabled, service);
    expect(service.processDue).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('recovers from a failed cycle without a hot loop and stops during idle backoff', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    vi.spyOn(mongoose, 'disconnect').mockResolvedValue();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const service = { processDue: vi.fn()
      .mockRejectedValueOnce(new Error('lease connection interrupted'))
      .mockImplementationOnce(async () => { controller.abort(); return {}; }) };
    const running = runEpaperAutomationWorker(controller.signal, enabled, service);
    await vi.advanceTimersByTimeAsync(14_999);
    expect(service.processDue).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await running;
    expect(service.processDue).toHaveBeenCalledTimes(2);
  });

  it('recognizes both processing and reconciliation activity', () => {
    expect(didWork({ processing: { claimed: 1 } })).toBe(true);
    expect(didWork({ automation: { results: [{ changed: true }] } })).toBe(true);
    expect(didWork({ ocr: { processed: 1 } })).toBe(true);
    expect(didWork({})).toBe(false);
  });

  it('owns one child, restarts after crash, and cancels restart on shutdown', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const children: Array<EventEmitter & { exitCode: null | number; killed: boolean; kill: ReturnType<typeof vi.fn> }> = [];
    const spawnChild = vi.fn(() => {
      const child = Object.assign(new EventEmitter(), {
        exitCode: null, killed: false, kill: vi.fn(),
      });
      children.push(child);
      return child;
    });
    const supervisor = superviseAutomationWorker({ projectRoot: process.cwd(), env: enabled, spawnChild });
    expect(spawnChild).toHaveBeenCalledTimes(1);
    children[0].exitCode = 1;
    children[0].emit('exit', 1);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(spawnChild).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(spawnChild).toHaveBeenCalledTimes(2);
    supervisor.kill('SIGTERM');
    expect(children[1].kill).toHaveBeenCalledWith('SIGTERM');
    children[1].emit('exit', 0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(spawnChild).toHaveBeenCalledTimes(2);
  });
});
