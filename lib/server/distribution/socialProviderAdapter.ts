import type {
  SocialAutomationProvider,
  SocialPlatform,
} from '@/lib/content/newsroomPublishing';
import type { WorkflowActorRef } from '@/lib/workflow/types';
import {
  computeHmacSignature,
  redactSensitiveString,
} from './webhookSecurity';
import type {
  SocialDeliveryErrorCategory,
} from './socialDeliveryTypes';

export const SOCIAL_DISPATCH_CONTRACT_VERSION = '2026-09.v1' as const;
export const MAX_RESPONSE_BYTES = 64 * 1024; // 64 KB

export type SocialDispatchPayload = {
  contractVersion: typeof SOCIAL_DISPATCH_CONTRACT_VERSION;
  deliveryId: string;
  idempotencyKey: string;
  source: 'lokswami';
  kind: 'social_post_dispatch';
  generatedAt: string;
  origin: string;
  actor: WorkflowActorRef;
  content: {
    storyId: string;
    articleId?: string;
    revision?: string | number;
  };
  socialPost: {
    id: string;
    platform: SocialPlatform;
    caption: string;
    hashtags: string;
    thumbnailUrl: string;
    videoUrl: string;
    scheduledAt?: string | null;
  };
};

export type SocialProviderResult = {
  status: 'succeeded' | 'failed' | 'timeout_unknown';
  executionId?: string;
  executionUrl?: string;
  externalUrl?: string;
  externalPostId?: string;
  error?: {
    category: SocialDeliveryErrorCategory;
    message: string;
  };
  rawSummary?: Record<string, unknown>;
};

export interface ISocialProviderAdapter {
  readonly mode: SocialAutomationProvider | 'mock';
  dispatch(payload: SocialDispatchPayload): Promise<SocialProviderResult>;
}

export class ManualSocialProvider implements ISocialProviderAdapter {
  readonly mode = 'manual' as const;

  async dispatch(_payload?: SocialDispatchPayload): Promise<SocialProviderResult> {
    void _payload;
    return {
      status: 'succeeded',
      executionId: 'manual',
      executionUrl: '',
      externalUrl: '',
    };
  }
}

export type MockProviderHandler = (
  payload: SocialDispatchPayload
) => Promise<SocialProviderResult> | SocialProviderResult;

export class MockSocialProvider implements ISocialProviderAdapter {
  readonly mode = 'mock' as const;
  private handler: MockProviderHandler | null = null;
  public dispatchedPayloads: SocialDispatchPayload[] = [];

  setHandler(handler: MockProviderHandler | null) {
    this.handler = handler;
  }

  async dispatch(payload: SocialDispatchPayload): Promise<SocialProviderResult> {
    this.dispatchedPayloads.push(payload);
    if (this.handler) {
      return this.handler(payload);
    }
    return {
      status: 'succeeded',
      executionId: `mock-exec-${Date.now()}`,
      executionUrl: `https://mock.example.com/exec/${payload.deliveryId}`,
      externalUrl: `https://${payload.socialPost.platform}.example.com/p/${payload.deliveryId}`,
      externalPostId: `ext-${payload.deliveryId}`,
    };
  }
}

export type WebhookProviderOptions = {
  provider: 'n8n' | 'generic_webhook';
  webhookUrl: string;
  sharedSecret?: string;
  timeoutMs?: number;
};

export class WebhookSocialProvider implements ISocialProviderAdapter {
  readonly mode: 'n8n' | 'generic_webhook';
  private readonly webhookUrl: string;
  private readonly sharedSecret: string;
  private readonly timeoutMs: number;

  constructor(options: WebhookProviderOptions) {
    this.mode = options.provider;
    this.webhookUrl = options.webhookUrl.trim();
    this.sharedSecret = (options.sharedSecret || '').trim();
    this.timeoutMs = Math.max(1000, Math.min(options.timeoutMs ?? 15000, 60000));
    this.validateUrl(this.webhookUrl);
  }

  private validateUrl(rawUrl: string) {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      throw new Error('INVALID_WEBHOOK_URL: Webhook URL is not a valid URL.');
    }

    if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
      throw new Error('INSECURE_WEBHOOK_URL: Production webhooks must use HTTPS.');
    }

    if (parsed.username || parsed.password) {
      throw new Error('INVALID_WEBHOOK_URL: Credentials in webhook URL are forbidden.');
    }

    if (parsed.hash) {
      throw new Error('INVALID_WEBHOOK_URL: URL fragments in webhook URL are forbidden.');
    }
  }

  async dispatch(payload: SocialDispatchPayload): Promise<SocialProviderResult> {
    const timestampSeconds = Math.floor(Date.now() / 1000);
    const rawBody = JSON.stringify(payload);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Lokswami-Event': 'social_post_dispatch',
      'X-Lokswami-Provider': this.mode,
      'X-Lokswami-Delivery-Id': payload.deliveryId,
      'X-Lokswami-Timestamp': String(timestampSeconds),
      'Idempotency-Key': payload.idempotencyKey,
    };

    if (this.sharedSecret) {
      headers['X-Lokswami-Signature'] = computeHmacSignature(
        this.sharedSecret,
        timestampSeconds,
        payload.deliveryId,
        rawBody
      );
    }

    try {
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers,
        body: rawBody,
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      // Read response with bounded size
      const responseText = await readBoundedText(response, MAX_RESPONSE_BYTES);

      let parsed: Record<string, unknown> | null = null;
      if (responseText.trim()) {
        try {
          parsed = JSON.parse(responseText);
        } catch {
          // If not json, keep parsed null
        }
      }

      if (!response.ok) {
        let category: SocialDeliveryErrorCategory = 'provider_rejected';
        if (response.status === 401 || response.status === 403) {
          category = 'authorization';
        } else if (response.status === 429) {
          category = 'throttled';
        }

        const rawMessage = responseText || `Provider returned HTTP ${response.status}`;
        const safeMessage = redactSensitiveString(rawMessage.slice(0, 1000), [
          this.sharedSecret,
          this.webhookUrl,
        ]);

        return {
          status: 'failed',
          error: {
            category,
            message: safeMessage,
          },
          rawSummary: parsed || { statusText: response.statusText, status: response.status },
        };
      }

      const executionId = parsed
        ? String(parsed.executionId || parsed.id || parsed.runId || '').trim()
        : '';
      const executionUrl = parsed
        ? String(parsed.executionUrl || parsed.runUrl || parsed.workflowUrl || '').trim()
        : '';
      const externalUrl = parsed ? String(parsed.externalUrl || '').trim() : '';
      const externalPostId = parsed
        ? String(parsed.externalPostId || parsed.postId || '').trim()
        : '';

      return {
        status: 'succeeded',
        executionId,
        executionUrl,
        externalUrl,
        externalPostId,
        rawSummary: parsed || undefined,
      };
    } catch (err: unknown) {
      const isTimeout =
        (err instanceof Error &&
          (err.name === 'TimeoutError' ||
            err.name === 'AbortError' ||
            err.message.includes('timeout'))) ||
        false;

      if (isTimeout) {
        return {
          status: 'timeout_unknown',
          error: {
            category: 'timeout_unknown',
            message: `Request timed out after ${this.timeoutMs}ms. Provider outcome unknown.`,
          },
        };
      }

      const rawMessage = err instanceof Error ? err.message : 'Webhook network dispatch failed';
      const safeMessage = redactSensitiveString(rawMessage, [
        this.sharedSecret,
        this.webhookUrl,
      ]);

      return {
        status: 'failed',
        error: {
          category: 'internal',
          message: safeMessage,
        },
      };
    }
  }
}

async function readBoundedText(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) {
    return (await response.text()).slice(0, maxBytes);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        if (totalBytes + value.length > maxBytes) {
          const sliceNeeded = maxBytes - totalBytes;
          if (sliceNeeded > 0) {
            chunks.push(value.slice(0, sliceNeeded));
          }
          await reader.cancel();
          break;
        }
        chunks.push(value);
        totalBytes += value.length;
      }
    }
  } catch {
    // If stream fails mid-read, decode whatever we read
  }

  const combined = new Uint8Array(chunks.reduce((acc, c) => acc + c.length, 0));
  let offset = 0;
  for (const c of chunks) {
    combined.set(c, offset);
    offset += c.length;
  }
  return new TextDecoder().decode(combined);
}
