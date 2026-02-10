// Core data models for the application

export interface ServerProfile {
  id: string;
  name: string;
  hostname: string;
  port: number;
  username: string;
  authType: 'password' | 'key';
  color: string;
  quickActions: QuickAction[];
  createdAt: number;
  lastConnected?: number;
}

export interface QuickAction {
  id: string;
  label: string;
  command: string;
  confirmBefore: boolean;
  icon?: string;
}

export interface ServerCredentials {
  password?: string;
  privateKey?: string;
  passphrase?: string;
}

export interface SSHConnection {
  serverId: string;
  connected: boolean;
  output: string[];
}

export interface CommandHistoryItem {
  command: string;
  timestamp: number;
  serverId: string;
}
