import { supabase } from '../lib/supabase';
import type { DecisionItem } from '../types/domain';
import { ensureAnonymousSession } from './anonymousAuth';
import {
  choosePreparedPhotos,
  normalizePhotoFailure,
  takePreparedPhoto,
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

export type CustomPhoto = PreparedPhoto & { label: string };

export async function chooseCustomPhotos(
  remaining: number,
): Promise<CustomPhoto[]> {
  const photos = await choosePreparedPhotos({
    maxBytes: MAX_PHOTO_BYTES,
    maxDimension: 1600,
    selectionLimit: Math.max(1, Math.min(remaining, 10)),
  });
  return photos.map(photo => ({ ...photo, label: '' }));
}

export async function takeCustomPhoto(): Promise<CustomPhoto | undefined> {
  const photo = await takePreparedPhoto({
    maxBytes: MAX_PHOTO_BYTES,
    maxDimension: 1600,
  });
  return photo ? { ...photo, label: '' } : undefined;
}

export async function buildCustomDecisionDeck(input: {
  prompt: string;
  photos: CustomPhoto[];
}): Promise<DecisionItem[]> {
  const prompt = input.prompt.trim();
  const photos = input.photos.map(photo => ({
    ...photo,
    label: photo.label.trim(),
  }));
  if (
    !prompt ||
    photos.length < 2 ||
    photos.length > 10 ||
    photos.some(photo => !photo.label)
  )
    throw new Error('custom_decision_invalid');

  const session = await ensureAnonymousSession();
  const uploadedPaths: string[] = [];
  try {
    const photoItems: Array<{
      path: string;
      imageUrl: string;
      label: string;
    }> = [];
    for (const [index, photo] of photos.entries()) {
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
      photoItems.push({ path, imageUrl: data.signedUrl, label: photo.label });
    }

    return photoItems.map((photo, index) => {
      const [background, accent] = palette[index % palette.length];
      return {
        id: `custom:photo:${index}:${photo.path}`,
        mode: 'custom' as const,
        title: photo.label,
        kicker: prompt.toUpperCase().slice(0, 80),
        meta: 'PHOTO CHOICE',
        description: prompt,
        background,
        accent,
        tags: ['Custom', 'Photo'],
        imageUrl: photo.imageUrl,
      };
    });
  } catch (error) {
    if (uploadedPaths.length)
      await supabase.storage.from('decision-photos').remove(uploadedPaths);
    throw normalizePhotoFailure(error);
  }
}
