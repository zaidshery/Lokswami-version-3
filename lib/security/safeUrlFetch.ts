import dns from 'dns';
import net from 'net';
import { redactSensitiveString } from '@/lib/server/distribution/webhookSecurity';

export type SafeUrlValidationOptions = {
  allowHttpInDevelopment?: boolean;
  lookupFn?: (
    hostname: string,
    options: { all: boolean }
  ) => Promise<Array<{ address: string; family: number }>>;
};

export type SafeWebhookFetchOptions = RequestInit &
  SafeUrlValidationOptions & {
    timeoutMs?: number;
    maxResponseBytes?: number;
  };

export type SafeWebhookResponse = {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Headers;
  url: string;
  error?: string;
  text: () => Promise<string>;
  json: () => Promise<unknown>;
};

/**
 * Parses dotted-decimal IPv4 address into a 32-bit unsigned integer.
 * Returns null if string is not a valid 4-octet IPv4 address.
 */
export function parseIPv4(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  const nums: number[] = [];
  for (let i = 0; i < 4; i++) {
    const raw = parts[i];
    if (!/^\d{1,3}$/.test(raw)) return null;
    const n = Number(raw);
    if (n < 0 || n > 255) return null;
    // Disallow leading zeros (octal ambiguity e.g. 010.0.0.1)
    if (raw.length > 1 && raw.startsWith('0')) return null;
    nums.push(n);
  }
  return ((nums[0] << 24) >>> 0) + (nums[1] << 16) + (nums[2] << 8) + nums[3];
}

/**
 * Parses IPv6 address into eight 16-bit words.
 * Handles compressed zeros '::', IPv4-mapped, and zone IDs.
 * Returns null if string is not a valid IPv6 address.
 */
export function parseIPv6(ip: string): number[] | null {
  // Strip optional zone index (e.g. fe80::1%eth0)
  const zoneIndex = ip.indexOf('%');
  if (zoneIndex !== -1) {
    ip = ip.slice(0, zoneIndex);
  }

  // Handle embedded IPv4 dotted-quad at the end (e.g. ::ffff:192.168.1.1)
  let ipv4MappedInt: number | null = null;
  const lastColon = ip.lastIndexOf(':');
  if (lastColon !== -1) {
    const potentialIpv4 = ip.slice(lastColon + 1);
    if (potentialIpv4.includes('.')) {
      ipv4MappedInt = parseIPv4(potentialIpv4);
      if (ipv4MappedInt === null) return null;
      // Replace dotted-quad with :0:0 to expand words correctly
      ip = ip.slice(0, lastColon) + ':0:0';
    }
  }

  const doubleColon = ip.indexOf('::');
  let groups: string[];

  if (doubleColon !== -1) {
    // Only one '::' is allowed in a valid IPv6 address
    if (ip.indexOf('::', doubleColon + 2) !== -1) return null;

    const left = ip.slice(0, doubleColon).split(':').filter(Boolean);
    const right = ip.slice(doubleColon + 2).split(':').filter(Boolean);
    const missing = 8 - (left.length + right.length);
    if (missing < 1) return null;
    groups = [...left, ...Array(missing).fill('0'), ...right];
  } else {
    groups = ip.split(':');
  }

  if (groups.length !== 8) return null;

  const words: number[] = [];
  for (const group of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null;
    words.push(Number.parseInt(group, 16));
  }

  if (ipv4MappedInt !== null) {
    words[6] = (ipv4MappedInt >>> 16) & 0xffff;
    words[7] = ipv4MappedInt & 0xffff;
  }

  return words;
}

/**
 * Checks whether an IPv4 numeric integer is safe (non-private, non-loopback, non-metadata).
 */
export function isSafeIPv4Int(n: number): boolean {
  // 0.0.0.0/8 (Broadcast/source)
  if ((n >>> 24) === 0) return false;
  // 10.0.0.0/8 (RFC 1918 Private)
  if ((n >>> 24) === 10) return false;
  // 100.64.0.0/10 (Shared Address Space / CGNAT RFC 6598)
  if ((n >>> 22) === 401) return false;
  // 127.0.0.0/8 (Loopback)
  if ((n >>> 24) === 127) return false;
  // 169.254.0.0/16 (Link-Local & Cloud Metadata 169.254.169.254)
  if ((n >>> 16) === 43518) return false;
  // 172.16.0.0/12 (RFC 1918 Private: 172.16.0.0 - 172.31.255.255)
  if (n >= 0xac100000 && n <= 0xac1fffff) return false;
  // 192.0.0.0/24 (IETF Protocol Assignments)
  if ((n >>> 8) === 0xc00000) return false;
  // 192.0.2.0/24 (TEST-NET-1)
  if ((n >>> 8) === 0xc00002) return false;
  // 192.168.0.0/16 (RFC 1918 Private)
  if ((n >>> 16) === 0xc0a8) return false;
  // 198.18.0.0/15 (Network Benchmark Tests)
  if ((n >>> 17) === 0x18c1) return false;
  // 198.51.100.0/24 (TEST-NET-2)
  if ((n >>> 8) === 0xc63364) return false;
  // 203.0.113.0/24 (TEST-NET-3)
  if ((n >>> 8) === 0xcb0071) return false;
  // 224.0.0.0/4 (Multicast: 224.0.0.0 - 239.255.255.255)
  // 240.0.0.0/4 (Reserved / Broadcast: 240.0.0.0 - 255.255.255.255)
  if ((n >>> 28) >= 14) return false;

  return true;
}

/**
 * Checks whether an IP address (v4 or v6) is safe for outbound network dispatch.
 * Rejects loopback, private, link-local, unique-local, multicast, documentation, and cloud metadata.
 */
export function isSafeIpAddress(ip: string): boolean {
  const v4 = parseIPv4(ip);
  if (v4 !== null) {
    return isSafeIPv4Int(v4);
  }

  const v6 = parseIPv6(ip);
  if (v6 === null) {
    return false;
  }

  // Check IPv4-mapped (::ffff:x.x.x.x) or IPv4-compatible (::x.x.x.x)
  const isZeroPrefix =
    v6[0] === 0 && v6[1] === 0 && v6[2] === 0 && v6[3] === 0 && v6[4] === 0;
  if (isZeroPrefix && (v6[5] === 0xffff || v6[5] === 0)) {
    const embeddedV4 = ((v6[6] << 16) >>> 0) + v6[7];
    if (!isSafeIPv4Int(embeddedV4)) return false;
  }

  // Unspecified ::
  if (v6.every((w) => w === 0)) return false;

  // Loopback ::1
  if (
    v6[0] === 0 &&
    v6[1] === 0 &&
    v6[2] === 0 &&
    v6[3] === 0 &&
    v6[4] === 0 &&
    v6[5] === 0 &&
    v6[6] === 0 &&
    v6[7] === 1
  ) {
    return false;
  }

  // Unique-Local fc00::/7 (fc00:: - fdff:ffff:...)
  if ((v6[0] & 0xfe00) === 0xfc00) return false;

  // Link-Local fe80::/10 (fe80:: - febf:ffff:...)
  if ((v6[0] & 0xffc0) === 0xfe80) return false;

  // Multicast ff00::/8
  if ((v6[0] & 0xff00) === 0xff00) return false;

  // Documentation 2001:db8::/32
  if (v6[0] === 0x2001 && v6[1] === 0x0db8) return false;

  // Discard prefix 100::/64
  if (v6[0] === 0x0100 && v6[1] === 0 && v6[2] === 0 && v6[3] === 0) return false;

  // 6to4 2002::/16 with embedded private/loopback IPv4
  if (v6[0] === 0x2002) {
    const embeddedV4 = ((v6[1] << 16) >>> 0) + v6[2];
    if (!isSafeIPv4Int(embeddedV4)) return false;
  }

  // NAT64 64:ff9b::/96 with embedded IPv4
  if (
    v6[0] === 0x0064 &&
    v6[1] === 0xff9b &&
    v6[2] === 0 &&
    v6[3] === 0 &&
    v6[4] === 0 &&
    v6[5] === 0
  ) {
    const embeddedV4 = ((v6[6] << 16) >>> 0) + v6[7];
    if (!isSafeIPv4Int(embeddedV4)) return false;
  }

  return true;
}

/**
 * Validates a webhook URL against protocol, credential, and SSRF restrictions.
 * In production, strictly requires 'https:'.
 * Rejects credentials embedded in userinfo (e.g. https://user:pass@host).
 * Resolves DNS and evaluates every returned A and AAAA address.
 */
export async function validateSafeWebhookUrl(
  urlString: string,
  options: SafeUrlValidationOptions = {}
): Promise<{
  safe: boolean;
  error?: string;
  url?: URL;
  resolvedIps?: string[];
}> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(urlString);
  } catch {
    return { safe: false, error: 'Malformed or invalid webhook URL.' };
  }

  // Enforce protocol policy
  const protocol = parsedUrl.protocol.toLowerCase();
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction) {
    if (protocol !== 'https:') {
      return {
        safe: false,
        error: 'Production webhook destinations must use HTTPS.',
      };
    }
  } else {
    // In dev / test: allow http only if explicitly permitted
    const allowHttp = options.allowHttpInDevelopment ?? false;
    if (protocol !== 'https:' && (!allowHttp || protocol !== 'http:')) {
      return {
        safe: false,
        error: `Webhook destination must use HTTPS (unsupported protocol: ${protocol}).`,
      };
    }
  }

  // Reject userinfo (username or password embedded in URL)
  if (parsedUrl.username || parsedUrl.password) {
    return {
      safe: false,
      error: 'Webhook URL cannot contain embedded user credentials.',
    };
  }

  const hostname = parsedUrl.hostname.trim().toLowerCase();
  if (!hostname) {
    return { safe: false, error: 'Webhook URL must have a valid hostname.' };
  }

  // Reject local and internal domain suffixes
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.lan') ||
    hostname.endsWith('.corp') ||
    hostname.endsWith('.home')
  ) {
    return {
      safe: false,
      error: `Destination host "${hostname}" is forbidden (internal or local domain).`,
    };
  }

  // Check if host is an IP literal
  const cleanHost = hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname;

  if (net.isIP(cleanHost)) {
    if (!isSafeIpAddress(cleanHost)) {
      return {
        safe: false,
        error: `Destination IP "${cleanHost}" is forbidden (private, loopback, or reserved).`,
      };
    }
    return { safe: true, url: parsedUrl, resolvedIps: [cleanHost] };
  }

  // Perform DNS resolution to validate all A and AAAA addresses
  const lookup = options.lookupFn || (dns.promises.lookup as (
    h: string,
    opts: { all: boolean }
  ) => Promise<Array<{ address: string; family: number }> | { address: string; family: number }>);
  let addresses: Array<{ address: string; family: number }>;

  try {
    const raw = await lookup(hostname, { all: true });
    addresses = Array.isArray(raw) ? raw : [raw];
  } catch {
    return {
      safe: false,
      error: `DNS resolution failed for host "${hostname}".`,
    };
  }

  if (!addresses || !Array.isArray(addresses) || addresses.length === 0) {
    return {
      safe: false,
      error: `No DNS records found for host "${hostname}".`,
    };
  }

  const resolvedIps: string[] = [];
  for (const entry of addresses) {
    resolvedIps.push(entry.address);
    if (!isSafeIpAddress(entry.address)) {
      return {
        safe: false,
        error: `Destination host "${hostname}" resolved to forbidden address "${entry.address}".`,
        resolvedIps,
      };
    }
  }

  return { safe: true, url: parsedUrl, resolvedIps };
}

/**
 * Safely reads a response body up to maxBytes. Truncates or cancels if larger.
 */
async function readBoundedResponseBody(
  response: Response,
  maxBytes = 2048
): Promise<string> {
  try {
    if (!response.body || typeof response.body.getReader !== 'function') {
      const text = await response.text().catch(() => '');
      return text.slice(0, maxBytes);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let result = '';
    let bytesRead = 0;

    try {
      while (bytesRead < maxBytes) {
        const { done, value } = await reader.read();
        if (done || !value) break;

        const remaining = maxBytes - bytesRead;
        const chunk =
          value.byteLength > remaining ? value.subarray(0, remaining) : value;
        bytesRead += chunk.byteLength;
        result += decoder.decode(chunk, { stream: bytesRead < maxBytes });

        if (value.byteLength > remaining) {
          await reader.cancel().catch(() => {});
          break;
        }
      }
    } finally {
      reader.releaseLock();
    }

    return result;
  } catch {
    return '';
  }
}

/**
 * Dispatches an outbound webhook request with full SSRF, redirect, timeout, and response bounds.
 */
export async function safeWebhookFetch(
  urlString: string,
  options: SafeWebhookFetchOptions = {}
): Promise<SafeWebhookResponse> {
  const timeoutMs = options.timeoutMs ?? 5000;
  const maxResponseBytes = options.maxResponseBytes ?? 2048;

  // 1. Validate on dispatch
  const validation = await validateSafeWebhookUrl(urlString, options);
  if (!validation.safe) {
    const errorMsg = validation.error || 'Blocked by webhook security policy.';
    return {
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      headers: new Headers(),
      url: urlString,
      error: errorMsg,
      text: async () => errorMsg,
      json: async () => ({ error: errorMsg }),
    };
  }

  // 2. Setup timeout controller
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new Error(`Webhook request timed out after ${timeoutMs}ms`));
  }, timeoutMs);

  // If caller provided a signal, chain abort
  if (options.signal) {
    if (options.signal.aborted) {
      clearTimeout(timeoutId);
      controller.abort(options.signal.reason);
    } else {
      options.signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timeoutId);
          controller.abort(options.signal?.reason);
        },
        { once: true }
      );
    }
  }

  try {
    // 3. Prepare dispatcher for connection-time DNS validation if Undici Agent is available
    let dispatcherOption: Record<string, unknown> = {};
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Agent } = require('undici');
      if (typeof Agent === 'function') {
        const agent = new Agent({
          connect: {
            lookup: (
              lookupHostname: string,
              lookupOptions: unknown,
              callback: (err: Error | null, addresses?: Array<{ address: string; family: number }>) => void
            ) => {
              dns.lookup(lookupHostname, { all: true }, (err, addresses) => {
                if (err) return callback(err);
                for (const entry of addresses) {
                  if (!isSafeIpAddress(entry.address)) {
                    return callback(
                      new Error(
                        `SSRF protection: address "${entry.address}" is forbidden.`
                      )
                    );
                  }
                }
                callback(null, addresses);
              });
            },
          },
        });
        dispatcherOption = { dispatcher: agent };
      }
    } catch {
      // Undici not required if running in environments with standard fetch or mocked fetch
    }

    // 4. Dispatch fetch with redirect: 'manual'
    const fetchOptions: RequestInit & Record<string, unknown> = {
      ...options,
      ...dispatcherOption,
      redirect: 'manual',
      signal: controller.signal,
      cache: 'no-store',
    };

    const response = await fetch(urlString, fetchOptions);

    // 5. Handle manual redirects (prevent SSRF via open redirects)
    if (response.status >= 300 && response.status < 400) {
      const redirectLocation = response.headers.get('location') || '';
      return {
        ok: false,
        status: response.status,
        statusText: response.statusText || 'Redirect Forbidden',
        headers: response.headers,
        url: urlString,
        error: `Webhook redirects are forbidden for security reasons${
          redirectLocation ? ` (target: ${redirectLocation})` : ''
        }.`,
        text: async () => 'Webhook redirects are forbidden.',
        json: async () => ({ error: 'Webhook redirects are forbidden.' }),
      };
    }

    // 6. Read bounded response body
    const boundedText = await readBoundedResponseBody(response, maxResponseBytes);
    const sanitizedText = redactSensitiveString(boundedText, []);

    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      url: response.url || urlString,
      error: response.ok
        ? undefined
        : sanitizedText.slice(0, 240) || `Webhook returned status ${response.status}`,
      text: async () => sanitizedText,
      json: async () => {
        try {
          return JSON.parse(sanitizedText);
        } catch {
          return { error: 'Invalid JSON response' };
        }
      },
    };
  } catch (err: unknown) {
    const isTimeout =
      controller.signal.aborted &&
      (err instanceof Error &&
        (err.name === 'AbortError' || err.message.includes('timed out')));

    const errorMessage = isTimeout
      ? `Webhook request timed out after ${timeoutMs}ms.`
      : redactSensitiveString(
          err instanceof Error ? err.message : 'Webhook delivery failed.',
          []
        );

    return {
      ok: false,
      status: isTimeout ? 504 : 502,
      statusText: isTimeout ? 'Gateway Timeout' : 'Bad Gateway',
      headers: new Headers(),
      url: urlString,
      error: errorMessage,
      text: async () => errorMessage,
      json: async () => ({ error: errorMessage }),
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
