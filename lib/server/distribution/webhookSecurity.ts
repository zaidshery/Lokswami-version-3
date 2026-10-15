import crypto from 'crypto';

export type WebhookSignatureVerificationParams = {
  signatureHeader?: string | null;
  timestampHeader?: string | null;
  rawBody: string;
  deliveryId: string;
  secret: string;
  maxDriftSeconds?: number;
};

export type WebhookSignatureVerificationResult = {
  valid: boolean;
  reason?: string;
  timestamp?: number;
};

/**
 * Computes an HMAC-SHA256 signature over `${timestamp}.${deliveryId}.${rawBody}`.
 * Returns `sha256=${hexDigest}`.
 */
export function computeHmacSignature(
  secret: string,
  timestamp: number | string,
  deliveryId: string,
  rawBody: string
): string {
  const payloadToSign = `${timestamp}.${deliveryId}.${rawBody}`;
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payloadToSign);
  return `sha256=${hmac.digest('hex')}`;
}

/**
 * Verifies the incoming webhook signature with timestamp drift check and constant-time comparison.
 */
export function verifyWebhookSignature({
  signatureHeader,
  timestampHeader,
  rawBody,
  deliveryId,
  secret,
  maxDriftSeconds = 300,
}: WebhookSignatureVerificationParams): WebhookSignatureVerificationResult {
  if (!secret) {
    return { valid: false, reason: 'SHARED_SECRET_NOT_CONFIGURED' };
  }

  if (!signatureHeader || typeof signatureHeader !== 'string') {
    return { valid: false, reason: 'MISSING_SIGNATURE_HEADER' };
  }

  if (!timestampHeader || typeof timestampHeader !== 'string') {
    return { valid: false, reason: 'MISSING_TIMESTAMP_HEADER' };
  }

  const timestampNum = Number.parseInt(timestampHeader.trim(), 10);
  if (Number.isNaN(timestampNum) || timestampNum <= 0) {
    return { valid: false, reason: 'INVALID_TIMESTAMP_HEADER' };
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const drift = Math.abs(nowSeconds - timestampNum);
  if (drift > maxDriftSeconds) {
    return {
      valid: false,
      reason: `TIMESTAMP_DRIFT_EXCEEDED (drift: ${drift}s, max: ${maxDriftSeconds}s)`,
      timestamp: timestampNum,
    };
  }

  // Extract digest
  let receivedDigest = signatureHeader.trim();
  if (receivedDigest.startsWith('sha256=')) {
    receivedDigest = receivedDigest.slice(7);
  }

  const expectedSignature = computeHmacSignature(secret, timestampNum, deliveryId, rawBody);
  const expectedDigest = expectedSignature.slice(7);

  const receivedBuffer = Buffer.from(receivedDigest, 'hex');
  const expectedBuffer = Buffer.from(expectedDigest, 'hex');

  if (receivedBuffer.length !== expectedBuffer.length) {
    return { valid: false, reason: 'SIGNATURE_MISMATCH', timestamp: timestampNum };
  }

  const match = crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
  if (!match) {
    return { valid: false, reason: 'SIGNATURE_MISMATCH', timestamp: timestampNum };
  }

  return { valid: true, timestamp: timestampNum };
}

/**
 * Redacts any known sensitive tokens, shared secrets, or URLs from a string.
 */
export function redactSensitiveString(message: string, secrets: (string | undefined | null)[]): string {
  let safe = message;
  for (const secret of secrets) {
    if (secret && typeof secret === 'string' && secret.trim().length > 3) {
      safe = safe.split(secret).join('[REDACTED]');
    }
  }

  // Redact potential URL embedded passwords/tokens: https://user:pass@host/
  safe = safe.replace(/https?:\/\/[^/:]+:([^@]+)@/g, (match, pass) => match.replace(pass, '***'));
  return safe;
}
