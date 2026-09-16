import { describe, it, expect } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { queryReviewThreads } = require('../scripts/phase3/pr-readiness.js');

describe('B3 Development Accelerator v1 — PR Readiness Review Thread Hardening', () => {
  it('passes when total threads is zero', () => {
    const mockRunGh = () =>
      JSON.stringify({
        data: {
          repository: {
            pullRequest: {
              reviewThreads: {
                totalCount: 0,
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: [],
              },
            },
          },
        },
      });

    const result = queryReviewThreads(15, mockRunGh);
    expect(result.success).toBe(true);
    expect(result.total).toBe(0);
    expect(result.unresolved).toBe(0);
    expect(result.allResolved).toBe(true);
  });

  it('passes when all threads are resolved', () => {
    const mockRunGh = () =>
      JSON.stringify({
        data: {
          repository: {
            pullRequest: {
              reviewThreads: {
                totalCount: 3,
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: [{ isResolved: true }, { isResolved: true }, { isResolved: true }],
              },
            },
          },
        },
      });

    const result = queryReviewThreads(15, mockRunGh);
    expect(result.success).toBe(true);
    expect(result.total).toBe(3);
    expect(result.unresolved).toBe(0);
    expect(result.allResolved).toBe(true);
  });

  it('fails when at least one thread is unresolved', () => {
    const mockRunGh = () =>
      JSON.stringify({
        data: {
          repository: {
            pullRequest: {
              reviewThreads: {
                totalCount: 3,
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: [{ isResolved: true }, { isResolved: false }, { isResolved: true }],
              },
            },
          },
        },
      });

    const result = queryReviewThreads(15, mockRunGh);
    expect(result.success).toBe(true);
    expect(result.total).toBe(3);
    expect(result.unresolved).toBe(1);
    expect(result.allResolved).toBe(false);
  });

  it('fails closed when GraphQL / API command fails (returns null or empty)', () => {
    const mockRunGh = () => null;

    const result = queryReviewThreads(15, mockRunGh);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/failed or returned no output/i);
  });

  it('fails closed when GraphQL returns an error object in response', () => {
    const mockRunGh = () =>
      JSON.stringify({
        errors: [{ message: 'Could not resolve to a PullRequest' }],
      });

    const result = queryReviewThreads(15, mockRunGh);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/GraphQL error: Could not resolve to a PullRequest/i);
  });

  it('fails closed when GraphQL response is malformed JSON', () => {
    const mockRunGh = () => '<html><body>502 Bad Gateway</body></html>';

    const result = queryReviewThreads(15, mockRunGh);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Malformed JSON response/i);
  });

  it('fails closed when response structure is missing reviewThreads', () => {
    const mockRunGh = () => JSON.stringify({ data: { repository: { pullRequest: {} } } });

    const result = queryReviewThreads(15, mockRunGh);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/reviewThreads field missing/i);
  });

  it('fails closed when paginated result is partial (totalCount > fetched nodes without next page)', () => {
    const mockRunGh = () =>
      JSON.stringify({
        data: {
          repository: {
            pullRequest: {
              reviewThreads: {
                totalCount: 150,
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: Array.from({ length: 100 }, () => ({ isResolved: true })),
              },
            },
          },
        },
      });

    const result = queryReviewThreads(15, mockRunGh);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Partial thread retrieval: fetched 100 of 150/i);
  });

  it('handles >100 threads scenario correctly via multi-page pagination', () => {
    const calls: string[][] = [];
    const mockRunGh = (args: string[]) => {
      calls.push(args);
      const isSecondPage = args.some((a) => a.includes('cursor=page2-cursor'));

      if (!isSecondPage) {
        // Page 1: 100 threads, hasNextPage = true
        return JSON.stringify({
          data: {
            repository: {
              pullRequest: {
                reviewThreads: {
                  totalCount: 125,
                  pageInfo: { hasNextPage: true, endCursor: 'page2-cursor' },
                  nodes: Array.from({ length: 100 }, () => ({ isResolved: true })),
                },
              },
            },
          },
        });
      }

      // Page 2: remaining 25 threads, hasNextPage = false
      return JSON.stringify({
        data: {
          repository: {
            pullRequest: {
              reviewThreads: {
                totalCount: 125,
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: Array.from({ length: 25 }, () => ({ isResolved: true })),
              },
            },
          },
        },
      });
    };

    const result = queryReviewThreads(15, mockRunGh);
    expect(result.success).toBe(true);
    expect(result.total).toBe(125);
    expect(result.unresolved).toBe(0);
    expect(result.allResolved).toBe(true);
    expect(calls.length).toBe(2);
  });

  it('detects unresolved thread across multi-page paginated results', () => {
    const mockRunGh = (args: string[]) => {
      const isSecondPage = args.some((a) => a.includes('cursor=page2-cursor'));

      if (!isSecondPage) {
        return JSON.stringify({
          data: {
            repository: {
              pullRequest: {
                reviewThreads: {
                  totalCount: 105,
                  pageInfo: { hasNextPage: true, endCursor: 'page2-cursor' },
                  nodes: Array.from({ length: 100 }, () => ({ isResolved: true })),
                },
              },
            },
          },
        });
      }

      // 4 resolved, 1 unresolved on page 2
      return JSON.stringify({
        data: {
          repository: {
            pullRequest: {
              reviewThreads: {
                totalCount: 105,
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: [
                  { isResolved: true },
                  { isResolved: false },
                  { isResolved: true },
                  { isResolved: true },
                  { isResolved: true },
                ],
              },
            },
          },
        },
      });
    };

    const result = queryReviewThreads(15, mockRunGh);
    expect(result.success).toBe(true);
    expect(result.total).toBe(105);
    expect(result.unresolved).toBe(1);
    expect(result.allResolved).toBe(false);
  });
});
