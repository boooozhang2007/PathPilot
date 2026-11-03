import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkForUpdates, compareVersions, LATEST_RELEASE_API } from './appUpdate';

const apk = {
  name: 'PathPilot-v1.3.5.apk',
  state: 'uploaded',
  browser_download_url: 'https://github.com/boooozhang2007/PathPilot/releases/download/v1.3.5/PathPilot-v1.3.5.apk',
};

function releaseResponse(tag: string, assets: unknown[] = []) {
  return new Response(JSON.stringify({ tag_name: tag, assets }), { status: 200 });
}

afterEach(() => vi.useRealTimers());

describe('release version comparison', () => {
  it('compares numeric parts instead of sorting version strings', () => {
    expect(compareVersions('v1.3.10', '1.3.9')).toBe(1);
    expect(compareVersions('1.10.0', 'v1.9.9')).toBe(1);
    expect(compareVersions('1.3.5+build.10', 'v1.3.5')).toBe(0);
    expect(compareVersions('1.3.4', '1.3.5')).toBe(-1);
    expect(compareVersions('1.3.99999999999999999999', '1.3.9')).toBe(1);
  });

  it('orders prereleases correctly and rejects unknown version formats', () => {
    expect(compareVersions('1.4.0', '1.4.0-rc.1')).toBe(1);
    expect(compareVersions('1.4.0-rc.10', '1.4.0-rc.2')).toBe(1);
    expect(compareVersions('1.4.0-alpha.1', '1.4.0-alpha.beta')).toBe(-1);
    expect(compareVersions('v1.4', '1.3.5')).toBeNull();
    expect(compareVersions('1.4.0-rc.01', '1.3.5')).toBeNull();
  });
});

describe('checking GitHub releases', () => {
  it('queries the latest release and offers its APK for a newer version', async () => {
    const fetchRelease = vi.fn().mockResolvedValue(releaseResponse('v1.3.5', [
      { name: 'PathPilot-v1.3.5.apk.sha256', browser_download_url: `${apk.browser_download_url}.sha256` },
      apk,
    ]));
    await expect(checkForUpdates('1.3.4', fetchRelease)).resolves.toEqual({
      kind: 'available', version: '1.3.5', downloadUrl: apk.browser_download_url,
    });
    expect(fetchRelease).toHaveBeenCalledWith(LATEST_RELEASE_API, expect.objectContaining({
      headers: expect.objectContaining({ Accept: 'application/vnd.github+json' }),
      signal: expect.any(AbortSignal),
    }));
  });

  it('reports latest only after a successful comparison', async () => {
    const fetchRelease = vi.fn().mockImplementation(async () => releaseResponse('v1.3.5', [apk]));
    await expect(checkForUpdates('1.3.5', fetchRelease)).resolves.toEqual({ kind: 'latest' });
    await expect(checkForUpdates('1.3.6', fetchRelease)).resolves.toEqual({ kind: 'latest' });
  });

  it('offers the release page when the APK is missing or its URL is untrusted', async () => {
    const fetchRelease = vi.fn()
      .mockResolvedValueOnce(releaseResponse('v1.3.5'))
      .mockResolvedValueOnce(releaseResponse('v1.3.5', [{ ...apk, browser_download_url: 'https://example.com/app.apk' }]));
    for (let i = 0; i < 2; i += 1) {
      await expect(checkForUpdates('1.3.4', fetchRelease)).resolves.toEqual({
        kind: 'available', version: '1.3.5', downloadUrl: null,
      });
    }
  });

  it('does not select an arbitrary APK when there are multiple alternatives', async () => {
    const fetchRelease = vi.fn().mockResolvedValue(releaseResponse('v1.3.5', [
      { ...apk, name: 'arm.apk', browser_download_url: apk.browser_download_url.replace('PathPilot-v1.3.5.apk', 'arm.apk') },
      { ...apk, name: 'x86.apk', browser_download_url: apk.browser_download_url.replace('PathPilot-v1.3.5.apk', 'x86.apk') },
    ]));
    await expect(checkForUpdates('1.3.4', fetchRelease)).resolves.toMatchObject({ kind: 'available', downloadUrl: null });
  });

  it('surfaces rate limits, network errors and malformed versions instead of saying latest', async () => {
    await expect(checkForUpdates('1.3.4', vi.fn().mockResolvedValue(new Response('', { status: 403 })))).rejects.toThrow();
    await expect(checkForUpdates('1.3.4', vi.fn().mockRejectedValue(new Error('offline')))).rejects.toThrow();
    await expect(checkForUpdates('1.3.4', vi.fn().mockResolvedValue(releaseResponse('unexpected')))).rejects.toThrow();
    const fetchRelease = vi.fn();
    await expect(checkForUpdates(undefined, fetchRelease)).rejects.toThrow();
    expect(fetchRelease).not.toHaveBeenCalled();
  });

  it('stops waiting when the release request times out', async () => {
    vi.useFakeTimers();
    const fetchRelease: typeof fetch = (_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    });
    const result = expect(checkForUpdates('1.3.4', fetchRelease)).rejects.toThrow('aborted');
    await vi.advanceTimersByTimeAsync(10000);
    await result;
  });
});
