import { downloadOgImage, extensionFor, fetchOgMeta } from './fetch';

type EnrichEnv = {
  DB: D1Database;
  MEDIA: R2Bucket;
};

/** Scrape OG tags, store image in R2, update the row. Returns true if anything changed. */
export async function enrichAccommodationOg(
  env: EnrichEnv,
  accommodationId: number,
  pageUrl: string,
): Promise<boolean> {
  const meta = await fetchOgMeta(pageUrl);
  let imageKey: string | null = null;

  if (meta.imageUrl) {
    const image = await downloadOgImage(meta.imageUrl);
    if (image) {
      imageKey = `places/${accommodationId}/og.${extensionFor(image.contentType)}`;
      await env.MEDIA.put(imageKey, image.bytes, {
        httpMetadata: { contentType: image.contentType },
        customMetadata: { sourceUrl: meta.imageUrl.slice(0, 500) },
      });
    }
  }

  if (!meta.title && !meta.description && !imageKey) return false;

  const previous = await env.DB.prepare(
    'SELECT og_image_key AS ogImageKey FROM accommodations WHERE id = ?',
  )
    .bind(accommodationId)
    .first<{ ogImageKey: string | null }>();

  if (imageKey) {
    await env.DB.prepare(
      `UPDATE accommodations
          SET og_title = ?, og_description = ?, og_image_key = ?
        WHERE id = ?`,
    )
      .bind(meta.title, meta.description, imageKey, accommodationId)
      .run();
    if (previous?.ogImageKey && previous.ogImageKey !== imageKey) {
      await env.MEDIA.delete(previous.ogImageKey).catch(() => {});
    }
  } else {
    await env.DB.prepare(
      `UPDATE accommodations SET og_title = ?, og_description = ? WHERE id = ?`,
    )
      .bind(meta.title, meta.description, accommodationId)
      .run();
  }

  return true;
}

export async function deleteAccommodationMedia(
  env: { MEDIA: R2Bucket },
  imageKey: string | null,
): Promise<void> {
  if (!imageKey) return;
  await env.MEDIA.delete(imageKey).catch(() => {});
}
