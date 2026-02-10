/**
 * SSHService.ts
 * Core SSH connectivity service for Server Manager app
 * 
 * Features:
 * - Connection management with timeout handling
 * - Command execution with output capture
 * - SFTP operations (upload/download/list)
 * - Connection state tracking
 * - Error handling for common SSH failures
 * 
 * Library: @dylankenneally/react-native-ssh-sftp
 */

import SSHClient from '@dylankenneally/react-native-ssh-sftp';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface Server {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authMethod: 'password' | 'key';
  // Password or key stored securely via CredentialService
}

export interface SSHCredentials {
  password?: string;
  privateKey?: string;
  passphrase?: string;
}

export interface CommandResult {
  success: boolean;
  output: string;
  error?: string;
  executedAt: Date;
}

export interface ConnectionState {
  serverId: string;
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  client: any | null;
  connectedAt?: Date;
  lastError?: string;
}

export interface SFTPListItem {
  filename: string;
  isDirectory: boolean;
  fileSize: number;
  permissions?: string;
  lastModified?: Date;
}

export interface SFTPProgressEvent {
  currentSize: number;
  totalSize: number;
}

// ============================================================================
// SSH SERVICE CLASS
// ============================================================================

class SSHService {
  private connections: Map<string, ConnectionState> = new Map();
  private readonly DEFAULT_TIMEOUT = 30000; // 30 seconds
  private readonly CONNECTION_TIMEOUT = 15000; // 15 seconds for initial connect

  // ==========================================================================
  // CONNECTION MANAGEMENT
  // ==========================================================================

  /**
   * Connect to a server using stored credentials
   * @param server Server configuration
   * @param credentials SSH credentials (password or key)
   * @returns Promise that resolves when connected
   */
  async connectToServer(
    server: Server,
    credentials: SSHCredentials
  ): Promise<void> {
    const { id, host, port, username, authMethod } = server;

    // Check if already connected
    const existingConnection = this.connections.get(id);
    if (existingConnection?.status === 'connected') {
      console.log(`Already connected to server ${id}`);
      return;
    }

    // Update state to connecting
    this.updateConnectionState(id, {
      serverId: id,
      status: 'connecting',
      client: null,
    });

    try {
      let client: any;

      // Create connection with timeout
      const connectionPromise = this._createConnection(
        host,
        port,
        username,
        authMethod,
        credentials
      );

      client = await this._withTimeout(
        connectionPromise,
        this.CONNECTION_TIMEOUT,
        `Connection to ${host}:${port} timed out`
      );

      // Update state to connected
      this.updateConnectionState(id, {
        serverId: id,
        status: 'connected',
        client,
        connectedAt: new Date(),
        lastError: undefined,
      });

      console.log(`Successfully connected to server ${id} (${host}:${port})`);
    } catch (error) {
      const errorMessage = this._parseError(error);
      console.error(`Connection failed for server ${id}:`, errorMessage);

      // Update state to error
      this.updateConnectionState(id, {
        serverId: id,
        status: 'error',
        client: null,
        lastError: errorMessage,
      });

      throw new Error(errorMessage);
    }
  }

  /**
   * Internal method to create SSH connection based on auth method
   */
  private async _createConnection(
    host: string,
    port: number,
    username: string,
    authMethod: 'password' | 'key',
    credentials: SSHCredentials
  ): Promise<any> {
    if (authMethod === 'password') {
      if (!credentials.password) {
        throw new Error('Password is required for password authentication');
      }
      return await SSHClient.connectWithPassword(
        host,
        port,
        username,
        credentials.password
      );
    } else {
      // Key-based authentication
      if (!credentials.privateKey) {
        throw new Error('Private key is required for key authentication');
      }
      return await SSHClient.connectWithKey(
        host,
        port,
        username,
        credentials.privateKey,
        credentials.passphrase || ''
      );
    }
  }

  /**
   * Disconnect from a server
   * @param serverId Server ID
   */
  async disconnectFromServer(serverId: string): Promise<void> {
    const connection = this.connections.get(serverId);
    
    if (!connection || connection.status === 'disconnected') {
      console.log(`Server ${serverId} is not connected`);
      return;
    }

    try {
      if (connection.client) {
        await connection.client.disconnect();
        console.log(`Disconnected from server ${serverId}`);
      }
    } catch (error) {
      console.error(`Error disconnecting from server ${serverId}:`, error);
      // Don't throw - we want to update state regardless
    } finally {
      this.updateConnectionState(serverId, {
        serverId,
        status: 'disconnected',
        client: null,
      });
    }
  }

  /**
   * Get current connection state for a server
   */
  getConnectionState(serverId: string): ConnectionState | null {
    return this.connections.get(serverId) || null;
  }

  /**
   * Check if server is connected
   */
  isConnected(serverId: string): boolean {
    const connection = this.connections.get(serverId);
    return connection?.status === 'connected';
  }

  /**
   * Update connection state
   */
  private updateConnectionState(
    serverId: string,
    state: ConnectionState
  ): void {
    this.connections.set(serverId, state);
  }

  // ==========================================================================
  // COMMAND EXECUTION
  // ==========================================================================

  /**
   * Execute a single SSH command
   * @param serverId Server ID
   * @param command Command to execute
   * @returns Command result with output
   */
  async executeCommand(
    serverId: string,
    command: string
  ): Promise<CommandResult> {
    const connection = this.connections.get(serverId);

    if (!connection || connection.status !== 'connected' || !connection.client) {
      throw new Error(`Server ${serverId} is not connected`);
    }

    try {
      console.log(`Executing command on server ${serverId}: ${command}`);

      const output = await this._withTimeout(
        connection.client.execute(command),
        this.DEFAULT_TIMEOUT,
        `Command execution timed out: ${command}`
      );

      return {
        success: true,
        output: output || '',
        executedAt: new Date(),
      };
    } catch (error) {
      const errorMessage = this._parseError(error);
      console.error(`Command execution failed on server ${serverId}:`, errorMessage);

      return {
        success: false,
        output: '',
        error: errorMessage,
        executedAt: new Date(),
      };
    }
  }

  /**
   * Execute multiple commands sequentially
   * @param serverId Server ID
   * @param commands Array of commands
   * @returns Array of command results
   */
  async executeCommands(
    serverId: string,
    commands: string[]
  ): Promise<CommandResult[]> {
    const results: CommandResult[] = [];

    for (const command of commands) {
      const result = await this.executeCommand(serverId, command);
      results.push(result);

      // Stop on first failure if needed
      if (!result.success) {
        console.warn(`Command failed, stopping execution: ${command}`);
        break;
      }
    }

    return results;
  }

  // ==========================================================================
  // SFTP OPERATIONS
  // ==========================================================================

  /**
   * Connect SFTP session (must be called before SFTP operations)
   * @param serverId Server ID
   */
  async connectSFTP(serverId: string): Promise<void> {
    const connection = this.connections.get(serverId);

    if (!connection || connection.status !== 'connected' || !connection.client) {
      throw new Error(`Server ${serverId} is not connected`);
    }

    try {
      await connection.client.connectSFTP();
      console.log(`SFTP connected for server ${serverId}`);
    } catch (error) {
      const errorMessage = this._parseError(error);
      throw new Error(`SFTP connection failed: ${errorMessage}`);
    }
  }

  /**
   * Disconnect SFTP session
   * @param serverId Server ID
   */
  async disconnectSFTP(serverId: string): Promise<void> {
    const connection = this.connections.get(serverId);

    if (!connection || !connection.client) {
      return;
    }

    try {
      await connection.client.disconnectSFTP();
      console.log(`SFTP disconnected for server ${serverId}`);
    } catch (error) {
      console.error(`Error disconnecting SFTP:`, error);
    }
  }

  /**
   * List files in remote directory
   * @param serverId Server ID
   * @param remotePath Remote directory path
   * @returns Array of file/directory items
   */
  async sftpListDirectory(
    serverId: string,
    remotePath: string = '.'
  ): Promise<SFTPListItem[]> {
    const connection = this.connections.get(serverId);

    if (!connection || connection.status !== 'connected' || !connection.client) {
      throw new Error(`Server ${serverId} is not connected`);
    }

    try {
      const items = await connection.client.sftpLs(remotePath);
      
      // Parse and normalize the response
      return items.map((item: any) => ({
        filename: item.filename,
        isDirectory: item.isDirectory || false,
        fileSize: item.fileSize || 0,
        permissions: item.permissions,
        lastModified: item.lastModified ? new Date(item.lastModified) : undefined,
      }));
    } catch (error) {
      const errorMessage = this._parseError(error);
      throw new Error(`Failed to list directory: ${errorMessage}`);
    }
  }

  /**
   * Upload file to remote server
   * @param serverId Server ID
   * @param localPath Local file path
   * @param remotePath Remote destination path
   * @param onProgress Optional progress callback
   */
  async sftpUpload(
    serverId: string,
    localPath: string,
    remotePath: string,
    onProgress?: (event: SFTPProgressEvent) => void
  ): Promise<void> {
    const connection = this.connections.get(serverId);

    if (!connection || connection.status !== 'connected' || !connection.client) {
      throw new Error(`Server ${serverId} is not connected`);
    }

    try {
      // Setup progress listener if callback provided
      if (onProgress) {
        connection.client.on('UploadProgress', onProgress);
      }

      await connection.client.sftpUpload(localPath, remotePath);
      console.log(`Upload completed: ${localPath} -> ${remotePath}`);

      // Clean up listener
      if (onProgress) {
        connection.client.removeListener('UploadProgress', onProgress);
      }
    } catch (error) {
      // Clean up listener on error
      if (onProgress) {
        connection.client.removeListener('UploadProgress', onProgress);
      }

      const errorMessage = this._parseError(error);
      throw new Error(`Upload failed: ${errorMessage}`);
    }
  }

  /**
   * Download file from remote server
   * @param serverId Server ID
   * @param remotePath Remote file path
   * @param localDirectory Local directory to save file
   * @param onProgress Optional progress callback
   * @returns Path to downloaded file
   */
  async sftpDownload(
    serverId: string,
    remotePath: string,
    localDirectory: string,
    onProgress?: (event: SFTPProgressEvent) => void
  ): Promise<string> {
    const connection = this.connections.get(serverId);

    if (!connection || connection.status !== 'connected' || !connection.client) {
      throw new Error(`Server ${serverId} is not connected`);
    }

    try {
      // Setup progress listener if callback provided
      if (onProgress) {
        connection.client.on('DownloadProgress', onProgress);
      }

      const downloadedPath = await connection.client.sftpDownload(
        remotePath,
        localDirectory
      );
      console.log(`Download completed: ${remotePath} -> ${downloadedPath}`);

      // Clean up listener
      if (onProgress) {
        connection.client.removeListener('DownloadProgress', onProgress);
      }

      return downloadedPath;
    } catch (error) {
      // Clean up listener on error
      if (onProgress) {
        connection.client.removeListener('DownloadProgress', onProgress);
      }

      const errorMessage = this._parseError(error);
      throw new Error(`Download failed: ${errorMessage}`);
    }
  }

  /**
   * Create remote directory
   * @param serverId Server ID
   * @param remotePath Remote directory path
   */
  async sftpMkdir(serverId: string, remotePath: string): Promise<void> {
    const connection = this.connections.get(serverId);

    if (!connection || connection.status !== 'connected' || !connection.client) {
      throw new Error(`Server ${serverId} is not connected`);
    }

    try {
      await connection.client.sftpMkdir(remotePath);
      console.log(`Directory created: ${remotePath}`);
    } catch (error) {
      const errorMessage = this._parseError(error);
      throw new Error(`Failed to create directory: ${errorMessage}`);
    }
  }

  /**
   * Delete remote file
   * @param serverId Server ID
   * @param remotePath Remote file path
   */
  async sftpDeleteFile(serverId: string, remotePath: string): Promise<void> {
    const connection = this.connections.get(serverId);

    if (!connection || connection.status !== 'connected' || !connection.client) {
      throw new Error(`Server ${serverId} is not connected`);
    }

    try {
      await connection.client.sftpRm(remotePath);
      console.log(`File deleted: ${remotePath}`);
    } catch (error) {
      const errorMessage = this._parseError(error);
      throw new Error(`Failed to delete file: ${errorMessage}`);
    }
  }

  /**
   * Delete remote directory
   * @param serverId Server ID
   * @param remotePath Remote directory path
   */
  async sftpDeleteDirectory(serverId: string, remotePath: string): Promise<void> {
    const connection = this.connections.get(serverId);

    if (!connection || connection.status !== 'connected' || !connection.client) {
      throw new Error(`Server ${serverId} is not connected`);
    }

    try {
      await connection.client.sftpRmdir(remotePath);
      console.log(`Directory deleted: ${remotePath}`);
    } catch (error) {
      const errorMessage = this._parseError(error);
      throw new Error(`Failed to delete directory: ${errorMessage}`);
    }
  }

  // ==========================================================================
  // UTILITY METHODS
  // ==========================================================================

  /**
   * Test connection to a server without storing the connection
   * @param server Server configuration
   * @param credentials SSH credentials
   * @returns True if connection successful
   */
  async testConnection(
    server: Server,
    credentials: SSHCredentials
  ): Promise<{ success: boolean; error?: string }> {
    const { host, port, username, authMethod } = server;

    try {
      const client = await this._withTimeout(
        this._createConnection(host, port, username, authMethod, credentials),
        this.CONNECTION_TIMEOUT,
        'Connection test timed out'
      );

      // Disconnect immediately after successful test
      await client.disconnect();

      return { success: true };
    } catch (error) {
      const errorMessage = this._parseError(error);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Disconnect all active connections
   */
  async disconnectAll(): Promise<void> {
    const serverIds = Array.from(this.connections.keys());
    
    for (const serverId of serverIds) {
      await this.disconnectFromServer(serverId);
    }

    console.log('All connections disconnected');
  }

  /**
   * Get all active connections
   */
  getAllConnections(): ConnectionState[] {
    return Array.from(this.connections.values());
  }

  // ==========================================================================
  // PRIVATE HELPER METHODS
  // ==========================================================================

  /**
   * Execute promise with timeout
   */
  private async _withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    timeoutMessage: string
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs)
      ),
    ]);
  }

  /**
   * Parse error into user-friendly message
   */
  private _parseError(error: any): string {
    if (typeof error === 'string') {
      return error;
    }

    const message = error?.message || String(error);

    // Map common SSH errors to user-friendly messages
    if (message.includes('timeout') || message.includes('timed out')) {
      return 'Connection timed out. Please check your network and server address.';
    }
    if (message.includes('authentication') || message.includes('auth fail')) {
      return 'Authentication failed. Please check your username and password/key.';
    }
    if (message.includes('host key') || message.includes('hostkey')) {
      return 'Host key verification failed. The server identity could not be verified.';
    }
    if (message.includes('refused') || message.includes('ECONNREFUSED')) {
      return 'Connection refused. The server may be down or SSH is not enabled.';
    }
    if (message.includes('unreachable') || message.includes('EHOSTUNREACH')) {
      return 'Host unreachable. Please check the server address and your network.';
    }
    if (message.includes('network') || message.includes('ENETUNREACH')) {
      return 'Network error. Please check your internet connection.';
    }
    if (message.includes('permission denied')) {
      return 'Permission denied. Check file/directory permissions on the server.';
    }
    if (message.includes('no such file')) {
      return 'File or directory not found on the server.';
    }

    // Return original message if no match
    return message;
  }
}

// Export singleton instance
export default new SSHService();
