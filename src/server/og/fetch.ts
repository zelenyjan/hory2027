/** Best-effort Open Graph unfurl. Booking/Airbnb often block us — failures are silent. */

const HTML_MAX = 1_000_000;
const IMAGE_MAX = 5_000_000;
const FETCH_TIMEOUT_MS = 8_000;

export type OgMeta = {
  title: string | null;
  description: string | null;
  imageUrl: string | null;
};

const UA =
  'Mozilla/5.0 (compatible; Hory2027Bot/1.0; +https://hory2027.baby) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

function attr(html: string, property: string): string | null {
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`,
      'i',
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`,
      'i',
    ),
  ];
  for (const re of patterns) {
    const match = html.match(re);
    if (match?.[1]) return decodeHtml(match[1].trim()) || null;
  }
  return null;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

function pageTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match?.[1] ? decodeHtml(match[1].trim()) || null : null;
}

function isPublicHttpUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return false;
  if (/^(127\.|10\.|0\.|192\.168\.|169\.254\.|::1$)/.test(host)) return false;
  return true;
}

async function fetchLimited(url: string, maxBytes: number, accept: string): Promise<Response | null> {
  if (!isPublicHttpUrl(url)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        Accept: accept,
        'User-Agent': UA,
        'Accept-Language': 'cs,en;q=0.8',
      },
    });
    if (!response.ok || !response.body) return null;

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    const body = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new Response(body, {
      status: response.status,
      headers: response.headers,
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchOgMeta(pageUrl: string): Promise<OgMeta> {
  const empty: OgMeta = { title: null, description: null, imageUrl: null };
  if (!isPublicHttpUrl(pageUrl)) return empty;

  const response = await fetchLimited(pageUrl, HTML_MAX, 'text/html,application/xhtml+xml');
  if (!response) return empty;

  const contentType = response.headers.get('content-type') ?? '';
  if (!/text\/html|application\/xhtml\+xml/i.test(contentType) && contentType.length > 0) {
    // Some hosts omit Content-Type; still try to parse.
    if (contentType && !contentType.includes('html')) return empty;
  }

  const html = await response.text();
  const title =
    attr(html, 'og:title') ?? attr(html, 'twitter:title') ?? pageTitle(html);
  const description =
    attr(html, 'og:description') ??
    attr(html, 'twitter:description') ??
    attr(html, 'description');
  const imageRaw =
    attr(html, 'og:image') ?? attr(html, 'og:image:secure_url') ?? attr(html, 'twitter:image');

  let imageUrl: string | null = null;
  if (imageRaw) {
    try {
      imageUrl = new URL(imageRaw, pageUrl).href;
      if (!isPublicHttpUrl(imageUrl)) imageUrl = null;
    } catch {
      imageUrl = null;
    }
  }

  return {
    title: title?.slice(0, 300) ?? null,
    description: description?.slice(0, 2000) ?? null,
    imageUrl,
  };
}

export async function downloadOgImage(
  imageUrl: string,
): Promise<{ bytes: ArrayBuffer; contentType: string } | null> {
  const response = await fetchLimited(imageUrl, IMAGE_MAX, 'image/*,*/*;q=0.8');
  if (!response) return null;
  const contentType = (response.headers.get('content-type') ?? 'application/octet-stream')
    .split(';')[0]!
    .trim()
    .toLowerCase();
  if (!contentType.startsWith('image/')) return null;
  return { bytes: await response.arrayBuffer(), contentType };
}

export function extensionFor(contentType: string): string {
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('webp')) return 'webp';
  if (contentType.includes('gif')) return 'gif';
  if (contentType.includes('avif')) return 'avif';
  return 'jpg';
}
