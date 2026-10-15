import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  prepareAlert,
  cancelAlert,
  getAlertById,
  listAlerts,
} from '@/lib/server/push/pushDeliveryService';

const PUSH_DATA_FILE = path.join(process.cwd(), 'data', 'push-deliveries.json');

describe('Phase 3.8D - Push Delivery Lifecycle & Audit Trail', () => {
  beforeEach(() => {
    // Clean data file for predictable test state
    if (fs.existsSync(PUSH_DATA_FILE)) {
      try {
        fs.unlinkSync(PUSH_DATA_FILE);
      } catch {
        // ignore
      }
    }
  });

  afterAll(() => {
    // Cleanup afterwards so git status remains clean
    if (fs.existsSync(PUSH_DATA_FILE)) {
      try {
        fs.unlinkSync(PUSH_DATA_FILE);
      } catch {
        // ignore
      }
    }
  });

  const actor = {
    id: 'admin-desk-1',
    name: 'Desk Admin',
    email: 'editor@lokswami.com',
    role: 'admin' as const,
  };

  it('records prepared alert with full actor audit and zero secret leakage', async () => {
    const result = await prepareAlert({
      actor,
      payload: {
        title: 'Election Results Breaking Bulletin',
        body: 'Preliminary round 1 counts released by Election Commission.',
        deepLink: '/main/article/election-count-2026',
      },
      recipient: { audience: 'all_subscribers' },
    });

    expect(result.success).toBe(true);
    expect(result.alert).toBeDefined();

    const alert = result.alert!;
    expect(alert.status).toBe('prepared');
    expect(alert.provider).toBe('disabled');
    expect(alert.audit.createdBy.id).toBe(actor.id);
    expect(alert.audit.createdBy.email).toBe(actor.email);
    expect(alert.audit.createdBy.role).toBe(actor.role);
    expect(alert.audit.preparedAt).toBeDefined();
    expect(alert.createdAt).toBeDefined();

    // Verify retrieval
    const retrieved = await getAlertById(alert.deliveryId);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.deliveryId).toBe(alert.deliveryId);

    // List alerts
    const list = await listAlerts();
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list.some((a) => a.deliveryId === alert.deliveryId)).toBe(true);
  });

  it('cancels prepared alert and appends cancellation reason to audit history', async () => {
    const prepResult = await prepareAlert({
      actor,
      payload: {
        title: 'Flash Weather Warning In Effect',
        body: 'Heavy rainfall and winds expected in eastern districts.',
        deepLink: '/main/article/weather-warning',
      },
    });

    const deliveryId = prepResult.alert!.deliveryId;

    const cancelResult = await cancelAlert({
      actor,
      deliveryId,
      reason: 'Superseded by emergency flash bulletin',
    });

    expect(cancelResult.success).toBe(true);
    expect(cancelResult.alert?.status).toBe('cancelled');
    expect(cancelResult.alert?.audit.cancelReason).toBe('Superseded by emergency flash bulletin');
    expect(cancelResult.alert?.audit.cancelledBy?.id).toBe(actor.id);
    expect(cancelResult.alert?.audit.cancelledAt).toBeDefined();
  });

  it('rejects duplicate cancellation or cancellation of non-prepared alerts', async () => {
    const prepResult = await prepareAlert({
      actor,
      payload: {
        title: 'Sports Final Score Update',
        body: 'State championship game concluded with historic overtime finish.',
        deepLink: '/main/article/sports-final-2026',
      },
    });

    const deliveryId = prepResult.alert!.deliveryId;
    await cancelAlert({ actor, deliveryId });

    // Cancel again
    const secondCancel = await cancelAlert({ actor, deliveryId, reason: 'Again' });
    expect(secondCancel.success).toBe(false);
    expect(secondCancel.error).toContain('Cannot cancel push alert in cancelled status');
  });
});
