const isPrivateIpv4 = (hostname: string) => {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) return false;
  const [first, second] = hostname.split('.').map(Number);
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224
  );
};

const decodeHtml = (value: string) =>
  value
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .trim();

const attributesFor = (tag: string) => {
  const attributes: Record<string, string> = {};
  const expression = /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  for (const match of tag.matchAll(expression)) {
    attributes[match[1].toLowerCase()] = decodeHtml(
      match[2] ?? match[3] ?? match[4] ?? '',
    );
  }
  return attributes;
};

export function isPublicWebUrl(
  value: unknown,
  options: { httpsOnly?: boolean } = {},
): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    const isIpv6 = hostname.includes(':');
    const permittedProtocol = options.httpsOnly
      ? url.protocol === 'https:'
      : url.protocol === 'https:' || url.protocol === 'http:';
    return (
      permittedProtocol &&
      hostname.includes('.') &&
      hostname !== 'localhost' &&
      hostname !== '0.0.0.0' &&
      hostname !== '::1' &&
      !hostname.endsWith('.local') &&
      !hostname.endsWith('.internal') &&
      !isPrivateIpv4(hostname) &&
      (!isIpv6 ||
        (!hostname.startsWith('fc') &&
          !hostname.startsWith('fd') &&
          !hostname.startsWith('fe80:')))
    );
  } catch {
    return false;
  }
}

const resolvedPublicImage = (value: string | undefined, pageUrl: string) => {
  if (!value || value.startsWith('data:')) return undefined;
  try {
    const resolved = new URL(decodeHtml(value), pageUrl).toString();
    const url = resolved.startsWith('http://')
      ? `https://${resolved.slice('http://'.length)}`
      : resolved;
    return isPublicWebUrl(url, { httpsOnly: true }) ? url : undefined;
  } catch {
    return undefined;
  }
};

const jsonLdImages = (html: string) => {
  const values: string[] = [];
  const scripts =
    html.match(
      /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi,
    ) ?? [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    if (typeof record.image === 'string') values.push(record.image);
    else if (Array.isArray(record.image)) {
      for (const image of record.image) {
        if (typeof image === 'string') values.push(image);
        else if (
          image &&
          typeof image === 'object' &&
          typeof (image as { url?: unknown }).url === 'string'
        ) {
          values.push((image as { url: string }).url);
        }
      }
    } else if (
      record.image &&
      typeof record.image === 'object' &&
      typeof (record.image as { url?: unknown }).url === 'string'
    ) {
      values.push((record.image as { url: string }).url);
    }
    Object.values(record).forEach(visit);
  };
  for (const script of scripts) {
    const body = script
      .replace(/^<script\b[^>]*>/i, '')
      .replace(/<\/script>$/i, '')
      .trim();
    try {
      visit(JSON.parse(body));
    } catch {
      // Invalid structured data must not break restaurant discovery.
    }
  }
  return values;
};

export function extractWebsiteImageFromHtml(html: string, pageUrl: string) {
  const metadata = new Map<string, string>();
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attributes = attributesFor(tag);
    const key = (
      attributes.property ??
      attributes.name ??
      attributes.itemprop ??
      ''
    ).toLowerCase();
    if (key && attributes.content && !metadata.has(key)) {
      metadata.set(key, attributes.content);
    }
  }

  const candidates = [
    metadata.get('og:image:secure_url'),
    metadata.get('og:image'),
    metadata.get('twitter:image'),
    metadata.get('twitter:image:src'),
    metadata.get('image'),
  ];

  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const attributes = attributesFor(tag);
    const relationships = (attributes.rel ?? '').toLowerCase().split(/\s+/);
    if (relationships.includes('image_src')) candidates.push(attributes.href);
  }
  candidates.push(...jsonLdImages(html));

  for (const candidate of candidates) {
    const image = resolvedPublicImage(candidate, pageUrl);
    if (image) return image;
  }

  const pageImages = (html.match(/<img\b[^>]*>/gi) ?? [])
    .map(tag => {
      const attributes = attributesFor(tag);
      const srcset = attributes.srcset
        ?.split(',')
        .map(value => value.trim().split(/\s+/)[0])
        .filter(Boolean)
        .at(-1);
      const source =
        attributes['data-src'] ??
        attributes['data-lazy-src'] ??
        attributes['data-original'] ??
        srcset ??
        attributes.src;
      const context = [attributes.alt, attributes.class, attributes.id, source]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const width = Number(attributes.width ?? 0);
      const height = Number(attributes.height ?? 0);
      let score = 0;
      if (
        /food|dish|menu|meal|cuisine|restaurant|dining|hero|banner|gallery/.test(
          context,
        )
      )
        score += 5;
      if (/logo|icon|avatar|sprite|pixel|tracking|badge/.test(context))
        score -= 10;
      if (width >= 500 || height >= 350) score += 3;
      if ((width > 0 && width < 240) || (height > 0 && height < 180))
        score -= 5;
      return { source, score };
    })
    .filter(candidate => candidate.source && candidate.score >= 0)
    .sort((a, b) => b.score - a.score);
  for (const candidate of pageImages) {
    const image = resolvedPublicImage(candidate.source, pageUrl);
    if (image) return image;
  }

  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const attributes = attributesFor(tag);
    const relationships = (attributes.rel ?? '').toLowerCase().split(/\s+/);
    if (
      relationships.includes('icon') ||
      relationships.includes('apple-touch-icon')
    ) {
      const icon = resolvedPublicImage(attributes.href, pageUrl);
      if (icon) return icon;
    }
  }
  return undefined;
}
