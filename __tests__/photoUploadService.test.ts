import { launchCamera, launchImageLibrary } from 'react-native-image-picker';

import {
  choosePreparedPhotos,
  photoFailureMessage,
  takePreparedPhoto,
} from '../src/services/photoUploadService';

const picker = launchImageLibrary as jest.MockedFunction<
  typeof launchImageLibrary
>;
const camera = launchCamera as jest.MockedFunction<typeof launchCamera>;

describe('photo upload preparation', () => {
  beforeEach(() => {
    picker.mockReset();
    camera.mockReset();
  });

  it('requests compatible bytes and identifies JPEG from its signature', async () => {
    picker.mockResolvedValue({
      assets: [
        {
          uri: 'file:///photo.heic',
          type: 'image/heic',
          base64: '/9j/4AA=',
        },
      ],
    });

    const [photo] = await choosePreparedPhotos({
      maxBytes: 100,
      maxDimension: 1024,
      selectionLimit: 1,
    });

    expect(picker).toHaveBeenCalledWith(
      expect.objectContaining({ assetRepresentationMode: 'compatible' }),
    );
    expect(photo.contentType).toBe('image/jpeg');
    expect(photo.extension).toBe('jpg');
  });

  it('rejects unsupported bytes before upload', async () => {
    picker.mockResolvedValue({
      assets: [
        {
          uri: 'file:///bad.bmp',
          base64: 'bm90IGFuIGltYWdl',
        },
      ],
    });

    await expect(
      choosePreparedPhotos({
        maxBytes: 100,
        maxDimension: 1024,
        selectionLimit: 1,
      }),
    ).rejects.toMatchObject({ code: 'photo_unsupported' });
  });

  it('returns an actionable network failure message', () => {
    expect(photoFailureMessage(new Error('Failed to fetch'), 5)).toContain(
      'Check your connection',
    );
  });

  it('prepares a camera photo with compatible bytes', async () => {
    camera.mockResolvedValue({
      assets: [{ uri: 'file:///camera.jpg', base64: '/9j/4AA=' }],
    });

    const photo = await takePreparedPhoto({
      maxBytes: 100,
      maxDimension: 1024,
    });

    expect(camera).toHaveBeenCalledWith(
      expect.objectContaining({ includeBase64: true, saveToPhotos: false }),
    );
    expect(photo?.contentType).toBe('image/jpeg');
  });
});
