import { describe, expect, it } from 'vitest';
import { isOptionalHttpsUrl, normalizeProfile } from '../src/profile';

describe('profile normalization', () => {
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
});
