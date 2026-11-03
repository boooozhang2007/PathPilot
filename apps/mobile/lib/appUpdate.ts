const REPOSITORY = 'boooozhang2007/PathPilot';
export const RELEASES_URL = `https://github.com/${REPOSITORY}/releases/latest`;
export const LATEST_RELEASE_API = `https://api.github.com/repos/${REPOSITORY}/releases/latest`;

type Version = { core: string[]; prerelease: string[] };
type UpdateStatus =
  | { kind: 'latest' }
  | { kind: 'available'; version: string; downloadUrl: string | null };

function parseVersion(value: string): Version | null {
  const match = value.trim().match(/^[vV]?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/);
  if (!match) return null;
  const prerelease = match[4] ? match[4].split('.') : [];
  if (prerelease.some((part) => /^0\d+$/.test(part))) return null;
  return { core: match.slice(1, 4), prerelease };
}

function compareNumeric(a: string, b: string): number {
  if (a.length !== b.length) return a.length > b.length ? 1 : -1;
  return a === b ? 0 : a > b ? 1 : -1;
}

/** Compare release versions, including prereleases; return null for an invalid version. */
export function compareVersions(a: string, b: string): number | null {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return null;

  for (let i = 0; i < left.core.length; i += 1) {
    const result = compareNumeric(left.core[i], right.core[i]);
    if (result !== 0) return result;
  }
  if (!left.prerelease.length || !right.prerelease.length) {
    return Number(!left.prerelease.length) - Number(!right.prerelease.length);
  }
  for (let i = 0; i < Math.max(left.prerelease.length, right.prerelease.length); i += 1) {
    const aPart = left.prerelease[i];
    const bPart = right.prerelease[i];
    if (aPart === undefined || bPart === undefined) return aPart === undefined ? -1 : 1;
    if (aPart === bPart) continue;
    const aNumeric = /^\d+$/.test(aPart);
    const bNumeric = /^\d+$/.test(bPart);
    if (aNumeric && bNumeric) return compareNumeric(aPart, bPart);
    if (aNumeric !== bNumeric) return aNumeric ? -1 : 1;
    return aPart > bPart ? 1 : -1;
  }
  return 0;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function apkDownloadUrl(assets: unknown, tag: string): string | null {
  if (!Array.isArray(assets)) return null;
  const allowedUrl = /^https:\/\/github\.com\/boooozhang2007\/PathPilot\/releases\/download\/[^/?#]+\/[^/?#]+\.apk$/i;
  const candidates = assets.map(asRecord).filter((asset): asset is Record<string, unknown> => (
    asset !== null && typeof asset.name === 'string' && /\.apk$/i.test(asset.name)
    && typeof asset.browser_download_url === 'string' && allowedUrl.test(asset.browser_download_url)
    && (asset.state === undefined || asset.state === 'uploaded')
  ));
  const expectedName = `PathPilot-${tag}.apk`.toLowerCase();
  const selected = candidates.find((asset) => (asset.name as string).toLowerCase() === expectedName)
    ?? (candidates.length === 1 ? candidates[0] : undefined);
  return selected ? selected.browser_download_url as string : null;
}

/** Query the public GitHub release, and only offer an APK from the project's release page. */
export async function checkForUpdates(
  currentVersion: string | null | undefined,
  fetchRelease: typeof fetch = fetch,
): Promise<UpdateStatus> {
  if (!currentVersion || !parseVersion(currentVersion)) throw new Error('Invalid current version');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetchRelease(LATEST_RELEASE_API, {
      headers: { Accept: 'application/vnd.github+json', 'Cache-Control': 'no-cache' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error('Release request failed');
    const release = asRecord(await response.json());
    if (!release || typeof release.tag_name !== 'string') throw new Error('Invalid release');
    const tag = release.tag_name.trim();
    const comparison = compareVersions(tag, currentVersion);
    if (comparison === null) throw new Error('Invalid release version');
    if (comparison <= 0) return { kind: 'latest' };
    return { kind: 'available', version: tag.replace(/^[vV]/, ''), downloadUrl: apkDownloadUrl(release.assets, tag) };
  } finally {
    clearTimeout(timer);
  }
}
