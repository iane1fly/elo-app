import { describe, expect, it } from 'vitest';
import { IMAGE_DATA_URL_LIMITS, isOptionalHttpsUrl, isOptionalImageSource, isValidUsername, normalizeProfile, normalizeUsername } from '../src/profile';

describe('profile normalization', () => {
  it('normalizes usernames and accepts only safe 3–20 character handles', () => {
    expect(normalizeUsername('  Ian.Founder  ')).toBe('ian.founder');
    expect(isValidUsername('Ian.Founder')).toBe(true);
    expect(isValidUsername('ian_2')).toBe(true);
    expect(isValidUsername('jo')).toBe(false);
    expect(isValidUsername('_ian')).toBe(false);
    expect(isValidUsername('ian_')).toBe(false);
    expect(isValidUsername('ian founder')).toBe(false);
    expect(isValidUsername('a'.repeat(21))).toBe(false);
    expect(normalizeProfile('legacy', { name: 'Legacy' }).username).toBe('');
    expect(normalizeProfile('member', { username: ' HELLO-1 ' }).username).toBe('hello-1');
  });

  it('maps legacy aliases and list-style goals into the current profile shape', () => {
    const profile = normalizeProfile('legacy-uid', {
      name: 'Founder',
      about: 'Building a company',
      lookingFor: ['Investors', 'Co-founders'],
      avatar: 'https://images.example/avatar.jpg',
      cover: 'https://images.example/cover.jpg',
      status: 'approved',
      visibleInNetwork: false,
    });

    expect(profile).toMatchObject({
      uid: 'legacy-uid',
      name: 'Founder',
      pitch: 'Building a company',
      lookingFor: 'Investors · Co-founders',
      avatarUrl: 'https://images.example/avatar.jpg',
      coverUrl: 'https://images.example/cover.jpg',
      visibleInNetwork: false,
      acceptsMeetings: true,
      status: 'approved',
    });
  });

  it('does not resurrect old image or about fields after a member deliberately clears them', () => {
    const profile = normalizeProfile('legacy-uid', {
      pitch: '',
      about: 'Old text',
      avatarUrl: '',
      avatar: 'https://images.example/old.jpg',
      coverUrl: '',
      cover: 'https://images.example/old-cover.jpg',
    });

    expect(profile.pitch).toBe('');
    expect(profile.avatarUrl).toBe('');
    expect(profile.coverUrl).toBe('');
  });

  it('accepts only empty or credential-free HTTPS links', () => {
    expect(isOptionalHttpsUrl('')).toBe(true);
    expect(isOptionalHttpsUrl('https://images.example/photo.jpg')).toBe(true);
    expect(isOptionalHttpsUrl('http://images.example/photo.jpg')).toBe(false);
    expect(isOptionalHttpsUrl('data:image/png;base64,AAA')).toBe(false);
    expect(isOptionalHttpsUrl('https://user:pass@images.example/photo.jpg')).toBe(false);
  });

  it('accepts bounded local JPEG data and rejects unsupported or oversized image data', () => {
    const localJpeg = 'data:image/jpeg;base64,aGVsbG8=';
    expect(isOptionalImageSource(localJpeg, IMAGE_DATA_URL_LIMITS.avatar)).toBe(true);
    expect(isOptionalImageSource('data:image/png;base64,aGVsbG8=', IMAGE_DATA_URL_LIMITS.avatar)).toBe(false);
    expect(isOptionalImageSource(`${localJpeg}${'A'.repeat(IMAGE_DATA_URL_LIMITS.avatar)}`, IMAGE_DATA_URL_LIMITS.avatar)).toBe(false);
    expect(normalizeProfile('local', { avatarUrl: localJpeg }).avatarUrl).toBe(localJpeg);
    expect(normalizeProfile('local', { avatarUrl: 'data:image/svg+xml;base64,PHN2Zz4=' }).avatarUrl).toBe('');
  });
});
