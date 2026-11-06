export interface BackupEncryptionMetadata {
  algorithm: 'AES-256-GCM';
  enabled: boolean;
  kdf: 'PBKDF2-HMAC-SHA256';
  salt: string;
  iterations: number;
  nonce: string;
}

export interface BackupIntegrityMetadata {
  algorithm: 'SHA-256';
  checksum: string;
}

export interface BackupManifest {
  application: string;
  backupFormatVersion: number;
  applicationVersion: string;
  databaseVersion: number;
  createdAt: string;
  database: string;
  format: 'json';
  compression: 'zip';
  encryption: BackupEncryptionMetadata;
  integrity: BackupIntegrityMetadata;
}

export interface BackupResult {
  success: boolean;
  fileName?: string;
  filePath?: string;
  size?: number;
  createdAt?: string;
  error?: string;
}

export interface RestoreResult {
  success: boolean;
  restoredAt?: string;
  databaseVersion?: number;
  rollbackPerformed?: boolean;
  rollbackSucceeded?: boolean;
  preventiveFilePath?: string;
  error?: string;
}

export interface BackupHistoryEntry {
  id: string;
  type: 'backup' | 'restore';
  fileName: string;
  date: string;
  size?: number;
  status: 'success' | 'error';
  message?: string;
}

export interface LastBackupInfo {
  fileName: string;
  path: string;
  size: number;
  createdAt: string;
}

export interface ExportedDatabase {
  json: string;
  databaseVersion: number;
}

export interface SqliteSchemaObject {
  type: string;
  name: string;
  tbl_name?: string;
  sql: string;
}

export interface SqliteDump {
  format: string;
  formatVersion: number;
  database: string;
  schemaVersion: number;
  createdAt: string;
  objects: SqliteSchemaObject[];
  data: Record<string, Array<Record<string, unknown>>>;
}

export interface ValidatedBackupPackage {
  manifest: BackupManifest;
  payload: Uint8Array;
}

export interface DecryptedBackup {
  manifest: BackupManifest;
  dump: SqliteDump;
}
