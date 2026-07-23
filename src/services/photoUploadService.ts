import { decode } from 'base64-arraybuffer';
import {
  launchCamera,
  launchImageLibrary,
  type Asset,
  type CameraOptions,
  type ImageLibraryOptions,
} from 'react-native-image-picker';

export type PreparedPhoto = Asset & {
  base64: string;
  bytes: ArrayBuffer;
  contentType: 'image/jpeg' | 'image/png' | 'image/webp';
  extension: 'jpg' | 'png' | 'webp';
};

export type PhotoFailureCode =
  | 'photo_permission_denied'
  | 'photo_library_unavailable'
  | 'photo_not_available'
  | 'photo_too_large'
  | 'photo_unsupported'
  | 'photo_upload_failed'
  | 'photo_connection_failed';

export class PhotoFailure extends Error {
  constructor(
    public readonly code: PhotoFailureCode,
    public readonly cause?: unknown,
  ) {
    super(code);
    this.name = 'PhotoFailure';
  }
}

const identifyImage = (
  bytes: ArrayBuffer,
): Pick<PreparedPhoto, 'contentType' | 'extension'> => {
  const view = new Uint8Array(bytes);
  if (view[0] === 0xff && view[1] === 0xd8 && view[2] === 0xff)
    return { contentType: 'image/jpeg', extension: 'jpg' };
  if (
    view[0] === 0x89 &&
    view[1] === 0x50 &&
    view[2] === 0x4e &&
    view[3] === 0x47
  )
    return { contentType: 'image/png', extension: 'png' };
  if (
    String.fromCharCode(...view.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...view.slice(8, 12)) === 'WEBP'
  )
    return { contentType: 'image/webp', extension: 'webp' };
  throw new PhotoFailure('photo_unsupported');
};

const pickerFailure = (code?: string): PhotoFailure => {
  if (code === 'permission') return new PhotoFailure('photo_permission_denied');
  if (code === 'camera_unavailable')
    return new PhotoFailure('photo_library_unavailable');
  return new PhotoFailure('photo_not_available');
};

const preparedAssets = (
  selection: Awaited<ReturnType<typeof launchImageLibrary>>,
  maxBytes: number,
): PreparedPhoto[] => {
  if (selection.didCancel) return [];
  if (selection.errorCode) throw pickerFailure(selection.errorCode);

  return (selection.assets ?? []).map(asset => {
    if (!asset.base64) throw new PhotoFailure('photo_not_available');
    const bytes = decode(asset.base64);
    if (bytes.byteLength > maxBytes) throw new PhotoFailure('photo_too_large');
    return {
      ...asset,
      base64: asset.base64,
      bytes,
      ...identifyImage(bytes),
    };
  });
};

export async function choosePreparedPhotos(input: {
  maxBytes: number;
  maxDimension: number;
  selectionLimit: number;
}): Promise<PreparedPhoto[]> {
  const options: ImageLibraryOptions = {
    mediaType: 'photo',
    maxWidth: input.maxDimension,
    maxHeight: input.maxDimension,
    quality: 0.8,
    selectionLimit: Math.max(1, input.selectionLimit),
    includeBase64: true,
    assetRepresentationMode: 'compatible',
  };
  return preparedAssets(await launchImageLibrary(options), input.maxBytes);
}

export async function takePreparedPhoto(input: {
  maxBytes: number;
  maxDimension: number;
}): Promise<PreparedPhoto | undefined> {
  const options: CameraOptions = {
    mediaType: 'photo',
    maxWidth: input.maxDimension,
    maxHeight: input.maxDimension,
    quality: 0.8,
    includeBase64: true,
    saveToPhotos: false,
  };
  return preparedAssets(await launchCamera(options), input.maxBytes)[0];
}

export function normalizePhotoFailure(error: unknown): PhotoFailure {
  if (error instanceof PhotoFailure) return error;
  const message =
    typeof error === 'object' && error && 'message' in error
      ? String(error.message)
      : '';
  if (/network|failed to fetch/i.test(message))
    return new PhotoFailure('photo_connection_failed', error);
  return new PhotoFailure('photo_upload_failed', error);
}

export function photoFailureMessage(
  error: unknown,
  maxMegabytes: number,
): string {
  switch (normalizePhotoFailure(error).code) {
    case 'photo_permission_denied':
      return 'Allow photo access in Settings, then try again.';
    case 'photo_library_unavailable':
      return 'The photo library is not available on this device.';
    case 'photo_too_large':
      return `Choose a photo smaller than ${maxMegabytes} MB.`;
    case 'photo_unsupported':
      return 'That image format is not supported. Choose a JPEG, PNG, or WebP image.';
    case 'photo_connection_failed':
      return 'The photo could not upload. Check your connection and try again.';
    case 'photo_upload_failed':
      return 'The photo could not upload. Please try again.';
    default:
      return 'That photo could not be opened. Choose a different photo.';
  }
}

export function logPhotoFailure(context: string, error: unknown): void {
  if (__DEV__) {
    const normalized = normalizePhotoFailure(error);
    console.error(`[photo:${context}] ${normalized.code}`, normalized.cause);
  }
}
