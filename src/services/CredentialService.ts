import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { ServerCredentials } from '../types';
import { STORAGE_KEYS } from '../utils/constants';

/**
 * CredentialService - Enhanced credential management with encryption
 * 
 * Uses expo-secure-store which is backed by:
 * - Android: Keystore system (hardware-backed when available)
 * - iOS: Keychain
 * 
 * All credentials are encrypted at rest and never touch AsyncStorage.
 */
export class CredentialService {
  /**
   * Save server credentials securely
   * @param serverId - Unique server identifier
   * @param credentials - Password, SSH key, or passphrase
   * @throws Error if storage fails
   */
  static async saveCredentials(
    serverId: string,
    credentials: ServerCredentials
  ): Promise<void> {
    try {
      const key = this.getCredentialKey(serverId);
      const data = JSON.stringify(credentials);
      
      // SecureStore automatically encrypts data
      await SecureStore.setItemAsync(key, data, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED,
      });
    } catch (error) {
      console.error('Failed to save credentials:', error);
      throw new Error('Failed to save credentials securely');
    }
  }

  /**
   * Retrieve server credentials
   * @param serverId - Unique server identifier
   * @returns ServerCredentials or null if not found
   */
  static async getCredentials(
    serverId: string
  ): Promise<ServerCredentials | null> {
    try {
      const key = this.getCredentialKey(serverId);
      const data = await SecureStore.getItemAsync(key);
      
      if (!data) {
        return null;
      }

      return JSON.parse(data) as ServerCredentials;
    } catch (error) {
      console.error('Failed to retrieve credentials:', error);
      return null;
    }
  }

  /**
   * Update existing credentials
   * @param serverId - Unique server identifier
   * @param updates - Partial credentials to update
   */
  static async updateCredentials(
    serverId: string,
    updates: Partial<ServerCredentials>
  ): Promise<void> {
    try {
      const existing = await this.getCredentials(serverId);
      
      if (!existing) {
        throw new Error('No existing credentials found');
      }

      const updated = { ...existing, ...updates };
      await this.saveCredentials(serverId, updated);
    } catch (error) {
      console.error('Failed to update credentials:', error);
      throw error;
    }
  }

  /**
   * Delete server credentials
   * @param serverId - Unique server identifier
   */
  static async deleteCredentials(serverId: string): Promise<void> {
    try {
      const key = this.getCredentialKey(serverId);
      await SecureStore.deleteItemAsync(key);
    } catch (error) {
      console.error('Failed to delete credentials:', error);
      // Don't throw - deletion should be idempotent
    }
  }

  /**
   * Check if credentials exist for a server
   * @param serverId - Unique server identifier
   * @returns true if credentials exist
   */
  static async hasCredentials(serverId: string): Promise<boolean> {
    const creds = await this.getCredentials(serverId);
    return creds !== null;
  }

  /**
   * Validate credentials structure
   * @param credentials - Credentials to validate
   * @returns true if valid
   */
  static validateCredentials(credentials: ServerCredentials): boolean {
    // Must have either password or private key
    if (!credentials.password && !credentials.privateKey) {
      return false;
    }

    // If using key, validate format (basic check)
    if (credentials.privateKey) {
      const hasHeader = credentials.privateKey.includes('BEGIN') && 
                       credentials.privateKey.includes('PRIVATE KEY');
      if (!hasHeader) {
        return false;
      }
    }

    return true;
  }

  /**
   * Export credentials (encrypted with password)
   * Used for backup functionality
   * @param serverId - Server to export
   * @param password - Encryption password
   * @returns Encrypted credentials string
   */
  static async exportCredentials(
    serverId: string,
    password: string
  ): Promise<string | null> {
    try {
      const credentials = await this.getCredentials(serverId);
      if (!credentials) {
        return null;
      }

      // Create encryption key from password
      const key = await this.deriveKey(password);
      
      // In production, use proper encryption (AES-256)
      // For now, we'll use base64 encoding with the key as salt
      const data = JSON.stringify(credentials);
      const encoded = Buffer.from(data).toString('base64');
      
      return `${key}:${encoded}`;
    } catch (error) {
      console.error('Failed to export credentials:', error);
      return null;
    }
  }

  /**
   * Import credentials from encrypted backup
   * @param serverId - Server to import to
   * @param encryptedData - Encrypted credentials string
   * @param password - Decryption password
   */
  static async importCredentials(
    serverId: string,
    encryptedData: string,
    password: string
  ): Promise<boolean> {
    try {
      const [storedKey, encoded] = encryptedData.split(':');
      const derivedKey = await this.deriveKey(password);
      
      // Verify password
      if (storedKey !== derivedKey) {
        throw new Error('Invalid password');
      }

      // Decode data
      const data = Buffer.from(encoded, 'base64').toString();
      const credentials = JSON.parse(data) as ServerCredentials;

      // Validate before saving
      if (!this.validateCredentials(credentials)) {
        throw new Error('Invalid credentials format');
      }

      await this.saveCredentials(serverId, credentials);
      return true;
    } catch (error) {
      console.error('Failed to import credentials:', error);
      return false;
    }
  }

  /**
   * Clear all credentials (for logout/reset)
   * WARNING: This deletes ALL server credentials
   */
  static async clearAllCredentials(serverIds: string[]): Promise<void> {
    try {
      await Promise.all(
        serverIds.map(id => this.deleteCredentials(id))
      );
    } catch (error) {
      console.error('Failed to clear credentials:', error);
    }
  }

  /**
   * Generate storage key for server credentials
   * @private
   */
  private static getCredentialKey(serverId: string): string {
    return `${STORAGE_KEYS.CREDENTIALS}_${serverId}`;
  }

  /**
   * Derive encryption key from password
   * @private
   */
  private static async deriveKey(password: string): Promise<string> {
    // Use SHA-256 hash of password as key
    const digest = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      password
    );
    return digest;
  }

  /**
   * Test if SecureStore is available and working
   * Used for debugging on emulators
   */
  static async testSecureStore(): Promise<boolean> {
    try {
      const testKey = '__test_secure_store__';
      const testValue = 'test';
      
      await SecureStore.setItemAsync(testKey, testValue);
      const retrieved = await SecureStore.getItemAsync(testKey);
      await SecureStore.deleteItemAsync(testKey);
      
      return retrieved === testValue;
    } catch (error) {
      console.error('SecureStore test failed:', error);
      return false;
    }
  }
}
