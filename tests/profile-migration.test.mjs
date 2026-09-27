import { describe, expect, it } from 'vitest';
import { profileFromLegacy } from '../scripts/profile-migration.mjs';

describe('approved-member profile migration', () => {
  it('maps legacy profile fields and excludes private email and legacy account flags', () => {
    const profile = profileFromLegacy('member-1', {
      name: 'Founder',
      about: 'A private legacy pitch',
      lookingFor: ['Investors', 'Mentors'],
      avatar: 'https://images.example/avatar.jpg',
      cover: 'http://images.example/insecure.jpg',
      email: 'private@example.test',
      isFounder: true,
      subscription: 'Pro',
    });

    expect(profile).toEqual({
      uid: 'member-1',
      name: 'Founder',
      role: '',
      company: '',
      location: '',
      pitch: 'A private legacy pitch',
      lookingFor: 'Investors · Mentors',
      avatarUrl: 'https://images.example/avatar.jpg',
      coverUrl: '',
      linkedinUrl: '',
      visibleInNetwork: true,
      acceptsMeetings: true,
      status: 'approved',
    });
    expect(profile).not.toHaveProperty('email');
    expect(profile).not.toHaveProperty('isFounder');
    expect(profile).not.toHaveProperty('subscription');
  });

  it('preserves an existing public profile value, including an intentional blank', () => {
    const profile = profileFromLegacy('member-2', {
      name: 'Old name',
      about: 'Old pitch',
      avatar: 'https://images.example/old.jpg',
    }, {
      name: 'Updated name',
      pitch: '',
      avatarUrl: '',
      visibleInNetwork: false,
    });

    expect(profile.name).toBe('Updated name');
    expect(profile.pitch).toBe('');
    expect(profile.avatarUrl).toBe('');
    expect(profile.visibleInNetwork).toBe(false);
  });
});
