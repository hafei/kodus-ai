import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RealApi } from '../api.real.js';
import { ApiError } from '../../../types/index.js';

describe('RealApi review.getPullRequestSuggestions', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock as any);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('sends X-Team-Key header when using team key', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { summary: 'ok', issues: [], filesAnalyzed: 0, duration: 0 },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    const api = new RealApi();
    await api.review.getPullRequestSuggestions('kodus_team_key', { prUrl: 'https://github.com/acme/repo/pull/1' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers['X-Team-Key']).toBe('kodus_team_key');
    expect(options.headers.Authorization).toBeUndefined();
  });

  it('sends Authorization header when using bearer token', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { summary: 'ok', issues: [], filesAnalyzed: 0, duration: 0 },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    const api = new RealApi();
    await api.review.getPullRequestSuggestions('eyJ.test.token', { prUrl: 'https://github.com/acme/repo/pull/1' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers.Authorization).toBe('Bearer eyJ.test.token');
    expect(options.headers['X-Team-Key']).toBeUndefined();
  });

  it('normalizes API auth errors to default CLI English message', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          message: 'Team key required by backend',
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    const api = new RealApi();

    await expect(
      api.review.getPullRequestSuggestions('eyJ.test.token', { prUrl: 'https://github.com/acme/repo/pull/1' }),
    ).rejects.toEqual(
      expect.objectContaining({
        name: 'ApiError',
        statusCode: 401,
        message: 'Authentication failed while fetching pull request suggestions. Run: kodus auth login or configure a valid team key.',
      } satisfies Partial<ApiError>),
    );
  });
});

describe('RealApi review.analyze auth mode', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock as any);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('sends Authorization header for user login token', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { summary: 'ok', issues: [], filesAnalyzed: 0, duration: 0 },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    const api = new RealApi();
    await api.review.analyze('diff --git a/file b/file', 'eyJ.test.token');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('/cli/review');
    expect(options.headers.Authorization).toBe('Bearer eyJ.test.token');
    expect(options.headers['X-Team-Key']).toBeUndefined();
  });
});
