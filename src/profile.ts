export type AccessStatus = 'none' | 'pending' | 'approved' | 'rejected';

export interface UserProfile {
  uid: string;
  email: string;
  username?: string;
  name: string;
  location: string;
  role: string;
  company: string;
  pitch: string;
  lookingFor: string;
  avatarUrl: string;
  coverUrl: string;
  linkedinUrl: string;
  visibleInNetwork: boolean;
  acceptsMeetings: boolean;
  status: AccessStatus;
  createdAt?: unknown;
}

export const IMAGE_DATA_URL_LIMITS = {
  avatar: 110_000,
  cover: 380_000,
  post: 380_000,
} as const;

const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{1,18}[a-z0-9]$/;

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidUsername(value: string): boolean {
  return USERNAME_PATTERN.test(normalizeUsername(value));
}

const JPEG_DATA_URL_PATTERN = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/;

function text(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .map((item) => item.trim())
      .join(' · ');
  }
  return '';
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    const candidate = text(value);
    if (candidate) return candidate;
  }
  return '';
}

function currentOrLegacy(raw: Record<string, unknown>, currentKey: string, legacyKey: string): string {
  return typeof raw[currentKey] === 'string' ? text(raw[currentKey]) : text(raw[legacyKey]);
}

function safeImageSource(value: unknown, inlineLimit: number): string {
  const candidate = text(value);
  return isOptionalImageSource(candidate, inlineLimit) ? candidate : '';
}

export function isOptionalHttpsUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (trimmed.length > 2048) return false;
  try {
    const url = new URL(trimmed);
    return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

/** Accepts legacy HTTPS images or a compact JPEG produced from a local file. */
export function isOptionalImageSource(value: string, maxInlineLength: number): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (isOptionalHttpsUrl(trimmed)) return true;
  return trimmed.length <= maxInlineLength && JPEG_DATA_URL_PATTERN.test(trimmed);
}

export function normalizeProfile(uid: string, raw: Record<string, unknown>): UserProfile {
  const rawStatus = raw.status;
  const status: AccessStatus = rawStatus === 'pending' || rawStatus === 'approved' || rawStatus === 'rejected'
    ? rawStatus
    : 'none';

  return {
    uid: firstText(raw.uid, uid),
    email: text(raw.email),
    username: normalizeUsername(text(raw.username)),
    name: text(raw.name),
    location: text(raw.location),
    role: text(raw.role),
    company: text(raw.company),
    pitch: currentOrLegacy(raw, 'pitch', 'about'),
    lookingFor: text(raw.lookingFor),
    avatarUrl: safeImageSource(currentOrLegacy(raw, 'avatarUrl', 'avatar'), IMAGE_DATA_URL_LIMITS.avatar),
    coverUrl: safeImageSource(currentOrLegacy(raw, 'coverUrl', 'cover'), IMAGE_DATA_URL_LIMITS.cover),
    linkedinUrl: (() => {
      const link = text(raw.linkedinUrl);
      return isOptionalHttpsUrl(link) ? link : '';
    })(),
    visibleInNetwork: typeof raw.visibleInNetwork === 'boolean' ? raw.visibleInNetwork : true,
    acceptsMeetings: typeof raw.acceptsMeetings === 'boolean' ? raw.acceptsMeetings : true,
    status,
    createdAt: raw.createdAt,
  };
}
