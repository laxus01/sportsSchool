import { Injectable } from '@angular/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';

import { LastBackupInfo } from './backup.models';

const BACKUP_DIRECTORY = 'backups';
const PREVENTIVE_DIRECTORY = 'preventive-backups';
const BASE64_CHUNK = 0x8000;

@Injectable({ providedIn: 'root' })
export class BackupFileService {
  async saveBackupToCache(
    fileName: string,
    data: Uint8Array,
  ): Promise<LastBackupInfo> {
    const path = `${BACKUP_DIRECTORY}/${fileName}`;
    await Filesystem.writeFile({
      path,
      data: this.toBase64(data),
      directory: Directory.Cache,
      recursive: true,
    });
    const { uri } = await Filesystem.getUri({
      path,
      directory: Directory.Cache,
    });
    return {
      fileName,
      path: uri,
      size: data.length,
      createdAt: new Date().toISOString(),
    };
  }

  async writePreventiveExport(json: string): Promise<string> {
    const path = `${PREVENTIVE_DIRECTORY}/preventive-${Date.now()}.json`;
    await Filesystem.writeFile({
      path,
      data: json,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
      recursive: true,
    });
    const { uri } = await Filesystem.getUri({
      path,
      directory: Directory.Data,
    });
    return uri;
  }

  async deletePreventiveExport(uri: string): Promise<void> {
    await Filesystem.deleteFile({ path: uri });
  }

  async readPickedFile(file: File): Promise<Uint8Array> {
    return new Uint8Array(await file.arrayBuffer());
  }

  private toBase64(bytes: Uint8Array): string {
    let binary = '';
    for (let index = 0; index < bytes.length; index += BASE64_CHUNK) {
      binary += String.fromCharCode(
        ...bytes.subarray(index, index + BASE64_CHUNK),
      );
    }
    return btoa(binary);
  }
}
