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
