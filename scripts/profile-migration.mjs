function text(value) {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) {
    return value.filter((item) => typeof item === 'string' && item.trim())
      .map((item) => item.trim())
      .join(' · ');
  }
  return '';
}

function firstText(...values) {
  for (const value of values) {
    const candidate = text(value);
    if (candidate) return candidate;
  }
  return '';
}

function safeHttpsUrl(value) {
  const candidate = text(value);
  if (!candidate || candidate.length > 2048) return '';
  try {
    const url = new URL(candidate);
    return url.protocol === 'https:' && url.hostname && !url.username && !url.password
      ? url.toString()
      : '';
  } catch {
    return '';
  }
}

function existingText(existingPublic, key, ...fallbacks) {
  return typeof existingPublic[key] === 'string'
    ? existingPublic[key].trim()
    : firstText(...fallbacks);
}

function existingUrl(existingPublic, key, ...fallbacks) {
  if (typeof existingPublic[key] === 'string') return safeHttpsUrl(existingPublic[key]);
  for (const fallback of fallbacks) {
    const candidate = safeHttpsUrl(fallback);
    if (candidate) return candidate;
  }
  return '';
}

// Allowlisted fields only: private email and legacy admin/billing flags are never mirrored.
export function profileFromLegacy(uid, member, existingPublic = {}) {
  return {
    uid,
    name: existingText(existingPublic, 'name', member.name),
    role: existingText(existingPublic, 'role', member.role),
    company: existingText(existingPublic, 'company', member.company),
    location: existingText(existingPublic, 'location', member.location),
    pitch: existingText(existingPublic, 'pitch', member.pitch, member.about),
    lookingFor: existingText(existingPublic, 'lookingFor', member.lookingFor),
    avatarUrl: existingUrl(existingPublic, 'avatarUrl', member.avatarUrl, member.avatar),
    coverUrl: existingUrl(existingPublic, 'coverUrl', member.coverUrl, member.cover),
    linkedinUrl: existingUrl(existingPublic, 'linkedinUrl', member.linkedinUrl),
    visibleInNetwork: typeof existingPublic.visibleInNetwork === 'boolean'
      ? existingPublic.visibleInNetwork
      : typeof member.visibleInNetwork === 'boolean' ? member.visibleInNetwork : true,
    acceptsMeetings: typeof existingPublic.acceptsMeetings === 'boolean'
      ? existingPublic.acceptsMeetings
      : typeof member.acceptsMeetings === 'boolean' ? member.acceptsMeetings : true,
    status: 'approved',
  };
}
