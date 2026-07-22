import { supabase } from '../lib/supabase';
import type { DecisionItem } from '../types/domain';
import { ensureAnonymousSession } from './anonymousAuth';
import {
  choosePreparedPhotos,
  normalizePhotoFailure,
  type PreparedPhoto,
} from './photoUploadService';

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const palette = [
  ['#20344A', '#F0B7A4'],
  ['#173F42', '#78D6C6'],
  ['#5D284A', '#FF8FAB'],
  ['#493548', '#F4B860'],
  ['#244B3A', '#70D6A6'],
] as const;

export type CustomPhoto = PreparedPhoto;

export async function chooseCustomPhotos(
  remaining: number,
): Promise<CustomPhoto[]> {
  return choosePreparedPhotos({
    maxBytes: MAX_PHOTO_BYTES,
    maxDimension: 1600,
    selectionLimit: Math.max(1, Math.min(remaining, 10)),
  });
}

export async function buildCustomDecisionDeck(input: {
  prompt: string;
  choices: string[];
  photos: CustomPhoto[];
}): Promise<DecisionItem[]> {
  const prompt = input.prompt.trim();
  const textChoices = input.choices.map(value => value.trim()).filter(Boolean);
  const total = textChoices.length + input.photos.length;
  if (!prompt || total < 2 || total > 10)
    throw new Error('custom_decision_invalid');

  const session = await ensureAnonymousSession();
  const uploadedPaths: string[] = [];
  try {
    const photoItems: Array<{ path: string; imageUrl: string }> = [];
    for (const [index, photo] of input.photos.entries()) {
      const path = `${session.user.id}/choice-${Date.now()}-${index}.${
        photo.extension
      }`;
      const { error: uploadError } = await supabase.storage
        .from('decision-photos')
        .upload(path, photo.bytes, {
          contentType: photo.contentType,
          cacheControl: '172800',
          upsert: false,
        });
      if (uploadError) throw uploadError;
      uploadedPaths.push(path);
      const { data, error: signedError } = await supabase.storage
        .from('decision-photos')
        .createSignedUrl(path, 48 * 60 * 60);
      if (signedError) throw signedError;
      photoItems.push({ path, imageUrl: data.signedUrl });
    }

    return [
      ...textChoices.map((title, index) => {
        const [background, accent] = palette[index % palette.length];
        return {
          id: `custom:text:${index}:${title.toLowerCase()}`,
          mode: 'custom' as const,
          title,
          kicker: prompt.toUpperCase().slice(0, 80),
          meta: 'CUSTOM CHOICE',
          description: prompt,
          background,
          accent,
          tags: ['Custom'],
        };
      }),
      ...photoItems.map((photo, index) => {
        const [background, accent] =
          palette[(textChoices.length + index) % palette.length];
        return {
          id: `custom:photo:${index}:${photo.path}`,
          mode: 'custom' as const,
          title: `Photo ${index + 1}`,
          kicker: prompt.toUpperCase().slice(0, 80),
          meta: 'PHOTO CHOICE',
          description: prompt,
          background,
          accent,
          tags: ['Custom', 'Photo'],
          imageUrl: photo.imageUrl,
        };
      }),
    ];
  } catch (error) {
    if (uploadedPaths.length)
      await supabase.storage.from('decision-photos').remove(uploadedPaths);
    throw normalizePhotoFailure(error);
  }
}
