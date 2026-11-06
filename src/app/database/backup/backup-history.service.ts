import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

import { BACKUP_HISTORY_LIMIT } from './backup-config';
import { BackupHistoryEntry, LastBackupInfo } from './backup.models';

const HISTORY_KEY = 'backup_history_v1';
const LAST_BACKUP_KEY = 'backup_last_v1';

@Injectable({ providedIn: 'root' })
export class BackupHistoryService {
  async record(
    entry: Omit<BackupHistoryEntry, 'id' | 'date'>,
  ): Promise<void> {
    const entries = await this.list();
    entries.unshift({
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      ...entry,
    });
    await Preferences.set({
      key: HISTORY_KEY,
      value: JSON.stringify(entries.slice(0, BACKUP_HISTORY_LIMIT)),
    });
  }

  async list(): Promise<BackupHistoryEntry[]> {
    const { value } = await Preferences.get({ key: HISTORY_KEY });
    if (!value) {
      return [];
    }
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed)
        ? (parsed as BackupHistoryEntry[]).slice(0, BACKUP_HISTORY_LIMIT)
        : [];
    } catch {
      return [];
    }
  }

  async getLastBackup(): Promise<LastBackupInfo | null> {
    const { value } = await Preferences.get({ key: LAST_BACKUP_KEY });
    if (!value) {
      return null;
    }
    try {
      return JSON.parse(value) as LastBackupInfo;
    } catch {
      return null;
    }
  }

  async setLastBackup(info: LastBackupInfo): Promise<void> {
    await Preferences.set({
      key: LAST_BACKUP_KEY,
      value: JSON.stringify(info),
    });
  }
}
