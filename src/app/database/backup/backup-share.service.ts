import { Injectable } from '@angular/core';
import { Share } from '@capacitor/share';

@Injectable({ providedIn: 'root' })
export class BackupShareService {
  async shareFile(uri: string, fileName: string): Promise<void> {
    await Share.share({
      title: fileName,
      url: uri,
      dialogTitle: 'Compartir respaldo',
    });
  }
}
