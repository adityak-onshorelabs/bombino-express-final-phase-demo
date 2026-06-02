import { getCapacitorShare, getCapacitorFilesystem } from './platform';

const DIRECTORY_CACHE = 'CACHE';

export async function shareViaCapacitor(
  base64: string,
  fileName: string,
  title: string
): Promise<boolean> {
  const Share = getCapacitorShare();
  const Filesystem = getCapacitorFilesystem();
  if (!Share || !Filesystem) return false;

  try {
    const writeResult = await Filesystem.writeFile({
      path: fileName,
      data: base64,
      directory: DIRECTORY_CACHE,
      recursive: true,
    });

    let uri: string | undefined = writeResult?.uri;
    if (!uri) {
      const got = await Filesystem.getUri({ path: fileName, directory: DIRECTORY_CACHE });
      uri = got?.uri;
    }
    if (!uri) return false;

    await Share.share({ title, files: [uri], dialogTitle: title });
    return true;
  } catch {
    return false;
  }
}
