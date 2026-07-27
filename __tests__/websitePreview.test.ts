import { isPublicWebUrl } from '../supabase/functions/build-deck/providers/websitePreview';

describe('provider URL boundary', () => {
  it('accepts public web URLs and rejects private network targets', () => {
    expect(isPublicWebUrl('https://127.0.0.1/admin')).toBe(false);
    expect(isPublicWebUrl('https://100.64.0.1/metadata')).toBe(false);
    expect(isPublicWebUrl('https://service.internal/metadata')).toBe(false);
    expect(isPublicWebUrl('https://fcrestaurant.example/menu')).toBe(true);
    expect(isPublicWebUrl('https://restaurant.example')).toBe(true);
  });

  it('enforces HTTPS when a provider requires it', () => {
    expect(isPublicWebUrl('http://restaurant.example')).toBe(true);
    expect(
      isPublicWebUrl('http://restaurant.example', { httpsOnly: true }),
    ).toBe(false);
  });
});
