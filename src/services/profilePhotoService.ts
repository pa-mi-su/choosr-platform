import { supabase } from '../lib/supabase';
import { ensureAnonymousSession } from './anonymousAuth';
import {
  choosePreparedPhotos,
  normalizePhotoFailure,
} from './photoUploadService';

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export async function chooseAndUploadProfilePhoto(
  previousPath: string | null,
): Promise<string | null> {
  const [asset] = await choosePreparedPhotos({
    maxBytes: MAX_PHOTO_BYTES,
    maxDimension: 1024,
    selectionLimit: 1,
  });
  if (!asset) return null;

  const session = await ensureAnonymousSession();
  const path = `${session.user.id}/avatar-${Date.now()}.${asset.extension}`;

  try {
    const { error: uploadError } = await supabase.storage
      .from('profile-photos')
      .upload(path, asset.bytes, {
        cacheControl: '31536000',
        contentType: asset.contentType,
        upsert: false,
      });
    if (uploadError) throw uploadError;

    const { error: profileError } = await supabase.rpc('set_profile_avatar', {
      p_avatar_path: path,
    });
    if (profileError) {
      await supabase.storage.from('profile-photos').remove([path]);
      throw profileError;
    }

    if (previousPath && previousPath !== path) {
      await supabase.storage.from('profile-photos').remove([previousPath]);
    }
    return path;
  } catch (error) {
    throw normalizePhotoFailure(error);
  }
}

export function profilePhotoUrl(path: string | null): string | null {
  if (!path) return null;
  return supabase.storage.from('profile-photos').getPublicUrl(path).data
    .publicUrl;
}
