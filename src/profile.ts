export type AccessStatus = 'none' | 'pending' | 'approved' | 'rejected';

export interface UserProfile {
  uid: string;
  email: string;
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

function safeHttpsUrl(value: unknown): string {
  const candidate = text(value);
  return isOptionalHttpsUrl(candidate) ? candidate : '';
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

export function normalizeProfile(uid: string, raw: Record<string, unknown>): UserProfile {
  const rawStatus = raw.status;
  const status: AccessStatus = rawStatus === 'pending' || rawStatus === 'approved' || rawStatus === 'rejected'
    ? rawStatus
    : 'none';

  return {
    uid: firstText(raw.uid, uid),
    email: text(raw.email),
    name: text(raw.name),
    location: text(raw.location),
    role: text(raw.role),
    company: text(raw.company),
    pitch: currentOrLegacy(raw, 'pitch', 'about'),
    lookingFor: text(raw.lookingFor),
    avatarUrl: safeHttpsUrl(currentOrLegacy(raw, 'avatarUrl', 'avatar')),
    coverUrl: safeHttpsUrl(currentOrLegacy(raw, 'coverUrl', 'cover')),
    linkedinUrl: safeHttpsUrl(raw.linkedinUrl),
    visibleInNetwork: typeof raw.visibleInNetwork === 'boolean' ? raw.visibleInNetwork : true,
    acceptsMeetings: typeof raw.acceptsMeetings === 'boolean' ? raw.acceptsMeetings : true,
    status,
    createdAt: raw.createdAt,
  };
}
