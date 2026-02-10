import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Server, ServerStatus } from '../types';

/**
 * MonitoringService - Local server health monitoring
 * 
 * Provides background health checks, status tracking, and notifications
 * without requiring external APIs. Uses local storage and background tasks.
 * 
 * Features:
 * - Periodic connectivity checks via SSH ping
 * - Status history tracking (uptime, last seen)
 * - Local notifications for status changes
 * - Background task scheduling
 * - Configurable check intervals
 */

const MONITORING_TASK = 'SERVER_HEALTH_CHECK';
const STORAGE_KEY_PREFIX = '@monitoring_';

export interface HealthCheckConfig {
  serverId: string;
  interval: number; // minutes
  enabled: boolean;
  notifyOnFailure: boolean;
  notifyOnRecovery: boolean;
}

export interface ServerHealthStatus {
  serverId: string;
  status: 'online' | 'offline' | 'error' | 'unknown';
  lastChecked: string; // ISO timestamp
  lastOnline: string | null; // ISO timestamp
  consecutiveFailures: number;
  uptimePercentage: number; // last 24h
  responseTime: number | null; // ms
  errorMessage: string | null;
}

export interface HealthCheckHistory {
  timestamp: string;
  status: 'success' | 'failure';
  responseTime: number | null;
  error: string | null;
}

class MonitoringServiceClass {
  private initialized = false;
  private healthCheckConfigs: Map<string, HealthCheckConfig> = new Map();

  /**
   * Initialize the monitoring service
   * Sets up notifications and background tasks
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Request notification permissions
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') {
      console.warn('Notification permissions not granted');
    }

    // Configure notification handler
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });

    // Load saved monitoring configs
    await this.loadConfigs();

    this.initialized = true;
  }

  /**
   * Schedule health checks for a server
   */
  async scheduleHealthCheck(config: HealthCheckConfig): Promise<void> {
    this.healthCheckConfigs.set(config.serverId, config);
    await this.saveConfigs();

    if (config.enabled) {
      // Register background task if not already registered
      await this.registerBackgroundTask();
    }
  }

  /**
   * Remove health check schedule for a server
   */
  async unscheduleHealthCheck(serverId: string): Promise<void> {
    this.healthCheckConfigs.delete(serverId);
    await this.saveConfigs();
  }

  /**
   * Check the health of a specific server
   * Returns status and updates history
   */
  async checkServerHealth(serverId: string, server: Server): Promise<ServerHealthStatus> {
    const startTime = Date.now();
    let status: 'online' | 'offline' | 'error' | 'unknown' = 'unknown';
    let responseTime: number | null = null;
    let errorMessage: string | null = null;

    try {
      // Import SSHService dynamically to avoid circular dependencies
      const { SSHService } = await import('./SSHService');
      
      // Attempt to connect with short timeout
      const connected = await SSHService.testConnection(server, 5000);
      
      if (connected) {
        status = 'online';
        responseTime = Date.now() - startTime;
      } else {
        status = 'offline';
        errorMessage = 'Connection failed';
      }
    } catch (error) {
      status = 'error';
      errorMessage = error instanceof Error ? error.message : 'Unknown error';
    }

    // Get previous status
    const previousStatus = await this.getServerStatus(serverId);
    const consecutiveFailures = 
      status === 'online' ? 0 : (previousStatus?.consecutiveFailures || 0) + 1;

    // Update history
    await this.addHistoryEntry(serverId, {
      timestamp: new Date().toISOString(),
      status: status === 'online' ? 'success' : 'failure',
      responseTime,
      error: errorMessage,
    });

    // Calculate uptime percentage (last 24h)
    const uptimePercentage = await this.calculateUptime(serverId);

    const healthStatus: ServerHealthStatus = {
      serverId,
      status,
      lastChecked: new Date().toISOString(),
      lastOnline: status === 'online' ? new Date().toISOString() : previousStatus?.lastOnline || null,
      consecutiveFailures,
      uptimePercentage,
      responseTime,
      errorMessage,
    };

    // Save status
    await this.saveServerStatus(serverId, healthStatus);

    // Send notifications if configured
    const config = this.healthCheckConfigs.get(serverId);
    if (config) {
      await this.handleNotifications(server, healthStatus, previousStatus, config);
    }

    return healthStatus;
  }

  /**
   * Get current health status for a server
   */
  async getServerStatus(serverId: string): Promise<ServerHealthStatus | null> {
    try {
      const key = `${STORAGE_KEY_PREFIX}status_${serverId}`;
      const data = await AsyncStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Failed to get server status:', error);
      return null;
    }
  }

  /**
   * Get health check history for a server
   */
  async getHealthHistory(serverId: string, limit = 100): Promise<HealthCheckHistory[]> {
    try {
      const key = `${STORAGE_KEY_PREFIX}history_${serverId}`;
      const data = await AsyncStorage.getItem(key);
      const history: HealthCheckHistory[] = data ? JSON.parse(data) : [];
      return history.slice(-limit);
    } catch (error) {
      console.error('Failed to get health history:', error);
      return [];
    }
  }

  /**
   * Send a local notification
   */
  async sendNotification(title: string, body: string, data?: any): Promise<void> {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data,
      },
      trigger: null, // Show immediately
    });
  }

  /**
   * Get all monitoring configurations
   */
  getConfigs(): HealthCheckConfig[] {
    return Array.from(this.healthCheckConfigs.values());
  }

  /**
   * Enable/disable monitoring for a server
   */
  async toggleMonitoring(serverId: string, enabled: boolean): Promise<void> {
    const config = this.healthCheckConfigs.get(serverId);
    if (config) {
      config.enabled = enabled;
      await this.saveConfigs();
    }
  }

  // Private helper methods

  private async saveConfigs(): Promise<void> {
    try {
      const configs = Array.from(this.healthCheckConfigs.values());
      await AsyncStorage.setItem(
        `${STORAGE_KEY_PREFIX}configs`,
        JSON.stringify(configs)
      );
    } catch (error) {
      console.error('Failed to save monitoring configs:', error);
    }
  }

  private async loadConfigs(): Promise<void> {
    try {
      const data = await AsyncStorage.getItem(`${STORAGE_KEY_PREFIX}configs`);
      if (data) {
        const configs: HealthCheckConfig[] = JSON.parse(data);
        configs.forEach(config => {
          this.healthCheckConfigs.set(config.serverId, config);
        });
      }
    } catch (error) {
      console.error('Failed to load monitoring configs:', error);
    }
  }

  private async saveServerStatus(serverId: string, status: ServerHealthStatus): Promise<void> {
    try {
      const key = `${STORAGE_KEY_PREFIX}status_${serverId}`;
      await AsyncStorage.setItem(key, JSON.stringify(status));
    } catch (error) {
      console.error('Failed to save server status:', error);
    }
  }

  private async addHistoryEntry(serverId: string, entry: HealthCheckHistory): Promise<void> {
    try {
      const key = `${STORAGE_KEY_PREFIX}history_${serverId}`;
      const data = await AsyncStorage.getItem(key);
      const history: HealthCheckHistory[] = data ? JSON.parse(data) : [];
      
      history.push(entry);
      
      // Keep only last 1000 entries
      const trimmed = history.slice(-1000);
      
      await AsyncStorage.setItem(key, JSON.stringify(trimmed));
    } catch (error) {
      console.error('Failed to add history entry:', error);
    }
  }

  private async calculateUptime(serverId: string): Promise<number> {
    try {
      const history = await this.getHealthHistory(serverId);
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
      
      const recentHistory = history.filter(
        entry => new Date(entry.timestamp).getTime() > oneDayAgo
      );
      
      if (recentHistory.length === 0) return 100;
      
      const successCount = recentHistory.filter(
        entry => entry.status === 'success'
      ).length;
      
      return Math.round((successCount / recentHistory.length) * 100);
    } catch (error) {
      console.error('Failed to calculate uptime:', error);
      return 0;
    }
  }

  private async handleNotifications(
    server: Server,
    currentStatus: ServerHealthStatus,
    previousStatus: ServerHealthStatus | null,
    config: HealthCheckConfig
  ): Promise<void> {
    const statusChanged = previousStatus && previousStatus.status !== currentStatus.status;
    
    if (!statusChanged) return;

    // Server went offline
    if (currentStatus.status !== 'online' && config.notifyOnFailure) {
      await this.sendNotification(
        `Server ${server.name} is ${currentStatus.status}`,
        currentStatus.errorMessage || 'Connection check failed',
        { serverId: server.id, type: 'failure' }
      );
    }

    // Server came back online
    if (currentStatus.status === 'online' && config.notifyOnRecovery) {
      await this.sendNotification(
        `Server ${server.name} is back online`,
        `Response time: ${currentStatus.responseTime}ms`,
        { serverId: server.id, type: 'recovery' }
      );
    }
  }

  private async registerBackgroundTask(): Promise<void> {
    try {
      const isRegistered = await TaskManager.isTaskRegisteredAsync(MONITORING_TASK);
      
      if (!isRegistered) {
        await BackgroundFetch.registerTaskAsync(MONITORING_TASK, {
          minimumInterval: 15 * 60, // 15 minutes (minimum allowed)
          stopOnTerminate: false,
          startOnBoot: true,
        });
      }
    } catch (error) {
      console.error('Failed to register background task:', error);
    }
  }
}

// Define the background task
TaskManager.defineTask(MONITORING_TASK, async () => {
  try {
    const service = MonitoringService;
    const configs = service.getConfigs();
    
    // Import StorageService to get servers
    const { StorageService } = await import('./StorageService');
    const servers = await StorageService.getServers();
    
    // Run health checks for enabled servers
    for (const config of configs) {
      if (config.enabled) {
        const server = servers.find(s => s.id === config.serverId);
        if (server) {
          await service.checkServerHealth(config.serverId, server);
        }
      }
    }
    
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (error) {
    console.error('Background health check failed:', error);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export const MonitoringService = new MonitoringServiceClass();
