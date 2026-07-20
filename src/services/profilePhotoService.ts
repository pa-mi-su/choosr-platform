import { launchImageLibrary } from 'react-native-image-picker';
import { decode } from 'base64-arraybuffer';

import { supabase } from '../lib/supabase';
import { ensureAnonymousSession } from './anonymousAuth';

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export async function chooseAndUploadProfilePhoto(
  previousPath: string | null,
): Promise<string | null> {
  const selection = await launchImageLibrary({
    mediaType: 'photo',
    maxWidth: 1024,
    maxHeight: 1024,
    quality: 0.8,
    selectionLimit: 1,
    includeBase64: true,
  });

  if (selection.didCancel) return null;
  if (selection.errorCode) {
    throw new Error(selection.errorCode);
  }

  const asset = selection.assets?.[0];
  if (!asset?.base64) throw new Error('photo_not_available');
  if (asset.fileSize && asset.fileSize > MAX_PHOTO_BYTES) {
    throw new Error('photo_too_large');
  }

  const session = await ensureAnonymousSession();
  const mimeType = asset.type?.startsWith('image/') ? asset.type : 'image/jpeg';
  const extension = mimeType === 'image/png' ? 'png' : 'jpg';
  const path = `${session.user.id}/avatar-${Date.now()}.${extension}`;
  const bytes = decode(asset.base64);
  if (bytes.byteLength > MAX_PHOTO_BYTES) throw new Error('photo_too_large');

  const { error: uploadError } = await supabase.storage
    .from('profile-photos')
    .upload(path, bytes, {
      cacheControl: '31536000',
      contentType: mimeType,
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
}

export function profilePhotoUrl(path: string | null): string | null {
  if (!path) return null;
  return supabase.storage.from('profile-photos').getPublicUrl(path).data
    .publicUrl;
}
