import {
  extractWebsiteImageFromHtml,
  isPublicWebUrl,
} from '../supabase/functions/build-deck/providers/websitePreview';

describe('restaurant website preview metadata', () => {
  it('prefers the secure Open Graph image regardless of attribute order', () => {
    const html = `
      <meta content="/ordinary.jpg" property="og:image">
      <meta content="https://cdn.example.com/food.jpg?size=large&amp;crop=1"
            property="og:image:secure_url">
    `;
    expect(
      extractWebsiteImageFromHtml(html, 'https://restaurant.example/menu'),
    ).toBe('https://cdn.example.com/food.jpg?size=large&crop=1');
  });

  it('uses restaurant structured data before falling back to an icon', () => {
    const html = `
      <script type="application/ld+json">
        {"@type":"Restaurant","image":{"url":"/signature-dish.jpg"}}
      </script>
      <link rel="icon" href="/favicon.png">
    `;
    expect(
      extractWebsiteImageFromHtml(html, 'https://restaurant.example/about'),
    ).toBe('https://restaurant.example/signature-dish.jpg');
  });

  it('uses a public HTTPS site icon as the final website fallback', () => {
    const html = '<link href="/brand.png" rel="apple-touch-icon">';
    expect(
      extractWebsiteImageFromHtml(html, 'https://restaurant.example/'),
    ).toBe('https://restaurant.example/brand.png');
  });

  it('upgrades public HTTP metadata images to HTTPS', () => {
    const html =
      '<meta property="og:image" content="http://cdn.example.com/dinner.jpg">';
    expect(
      extractWebsiteImageFromHtml(html, 'https://restaurant.example/'),
    ).toBe('https://cdn.example.com/dinner.jpg');
  });

  it('uses a restaurant hero image when metadata is missing', () => {
    const html = `
      <img class="logo" src="/logo.png" width="120" height="80">
      <img class="homepage-hero food gallery" data-src="/signature-pasta.webp"
           width="1200" height="800" alt="Signature pasta dish">
    `;
    expect(
      extractWebsiteImageFromHtml(html, 'https://restaurant.example/'),
    ).toBe('https://restaurant.example/signature-pasta.webp');
  });

  it('rejects unsafe pages and image URLs', () => {
    expect(isPublicWebUrl('https://127.0.0.1/admin')).toBe(false);
    expect(isPublicWebUrl('https://100.64.0.1/metadata')).toBe(false);
    expect(isPublicWebUrl('https://service.internal/metadata')).toBe(false);
    expect(isPublicWebUrl('https://fcrestaurant.example/menu')).toBe(true);
    expect(isPublicWebUrl('https://restaurant.example')).toBe(true);
    expect(
      extractWebsiteImageFromHtml(
        '<meta property="og:image" content="http://10.0.0.1/image.jpg">',
        'https://restaurant.example/',
      ),
    ).toBeUndefined();
  });
});
