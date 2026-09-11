import {
  normalizeSocialAutomationProvider,
  type SocialAutomationProvider,
  type SocialPlatform,
} from '@/lib/content/newsroomPublishing';
import type { WorkflowActorRef } from '@/lib/workflow/types';

const FALLBACK_SITE_URL = 'http://localhost:3000';

type SocialAutomationRecord = {
  _id?: string;
  sourceStoryId: string;
  sourceArticleId?: string;
  platform: SocialPlatform;
  status: string;
  caption: string;
  hashtags: string;
  thumbnailUrl: string;
  videoUrl: string;
  scheduledAt?: string | null;
};

export type SocialAutomationConfig = {
  provider: SocialAutomationProvider;
  enabled: boolean;
  label: string;
  webhookUrl: string;
  sharedSecret: string;
  timeoutMs: number;
};

export type SocialAutomationDispatchResult = {
  provider: SocialAutomationProvider;
  executionId: string;
  executionUrl: string;
  externalUrl: string;
};

export type SocialAutomationPublicConfig = Pick<
  SocialAutomationConfig,
  'provider' | 'enabled' | 'label'
>;

function clean(value: unknown, maxLength = 500) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function redactProviderSecrets(message: string, config: SocialAutomationConfig) {
  return [config.sharedSecret, config.webhookUrl]
    .filter(Boolean)
    .reduce(
      (safeMessage, secret) => safeMessage.split(secret).join('[REDACTED]'),
      message
    );
}

function getOrigin() {
  return clean(
    process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXTAUTH_URL || FALLBACK_SITE_URL,
    300
  ).replace(/\/+$/, '');
}

export function getSocialAutomationConfig(): SocialAutomationConfig {
  const provider = normalizeSocialAutomationProvider(process.env.SOCIAL_AUTOMATION_PROVIDER);
  const webhookUrl =
    provider === 'n8n'
      ? clean(process.env.N8N_SOCIAL_WEBHOOK_URL || process.env.SOCIAL_AUTOMATION_WEBHOOK_URL, 1000)
      : clean(process.env.SOCIAL_AUTOMATION_WEBHOOK_URL, 1000);
  const timeoutValue = Number.parseInt(clean(process.env.SOCIAL_AUTOMATION_TIMEOUT_MS, 20), 10);

  if (provider === 'manual') {
    return {
      provider,
      enabled: false,
      label: 'Manual review only',
      webhookUrl: '',
      sharedSecret: '',
      timeoutMs: 15000,
    };
  }

  return {
    provider,
    enabled: Boolean(webhookUrl),
    label: provider === 'n8n' ? 'n8n webhook automation' : 'Generic webhook automation',
    webhookUrl,
    sharedSecret: clean(process.env.SOCIAL_AUTOMATION_SHARED_SECRET, 500),
    timeoutMs:
      Number.isNaN(timeoutValue) || timeoutValue < 1000 ? 15000 : Math.min(timeoutValue, 60000),
  };
}

export function getSocialAutomationPublicConfig(): SocialAutomationPublicConfig {
  const config = getSocialAutomationConfig();
  return {
    provider: config.provider,
    enabled: config.enabled,
    label: config.label,
  };
}

export function buildSocialAutomationPayload(params: {
  post: SocialAutomationRecord;
  actor: WorkflowActorRef;
}) {
  const origin = getOrigin();
  return {
    source: 'lokswami',
    kind: 'social_post_dispatch',
    generatedAt: new Date().toISOString(),
    origin,
    actor: params.actor,
    socialPost: {
      id: params.post._id || '',
      sourceStoryId: params.post.sourceStoryId,
      sourceArticleId: params.post.sourceArticleId || '',
      platform: params.post.platform,
      status: params.post.status,
      caption: params.post.caption,
      hashtags: params.post.hashtags,
      thumbnailUrl: params.post.thumbnailUrl,
      videoUrl: params.post.videoUrl,
      scheduledAt: params.post.scheduledAt || null,
    },
  };
}

function extractDispatchResult(
  provider: SocialAutomationProvider,
  payload: unknown
): SocialAutomationDispatchResult {
  const source = typeof payload === 'object' && payload ? (payload as Record<string, unknown>) : {};
  return {
    provider,
    executionId:
      clean(source.executionId) ||
      clean(source.id) ||
      clean(source.runId),
    executionUrl:
      clean(source.executionUrl) ||
      clean(source.runUrl) ||
      clean(source.workflowUrl),
    externalUrl: clean(source.externalUrl),
  };
}

export async function dispatchSocialPostToAutomation(params: {
  post: SocialAutomationRecord;
  actor: WorkflowActorRef;
}) {
  const config = getSocialAutomationConfig();
  if (!config.enabled || !config.webhookUrl) {
    throw new Error(
      config.provider === 'manual'
        ? 'Automation provider is set to manual mode.'
        : 'Automation webhook is not configured.'
    );
  }

  const response = await fetch(config.webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Lokswami-Event': 'social_post_dispatch',
      'X-Lokswami-Provider': config.provider,
      ...(config.sharedSecret
        ? {
            'X-Lokswami-Signature': config.sharedSecret,
          }
        : {}),
    },
    body: JSON.stringify(buildSocialAutomationPayload(params)),
    signal: AbortSignal.timeout(config.timeoutMs),
  });

  const responseText = await response.text();
  if (!response.ok) {
    const message = responseText || `Automation dispatch failed with status ${response.status}`;
    throw new Error(redactProviderSecrets(clean(message, 2000), config));
  }

  let parsed: unknown = null;
  try {
    parsed = responseText ? JSON.parse(responseText) : null;
  } catch {
    parsed = null;
  }

  return extractDispatchResult(config.provider, parsed);
}
