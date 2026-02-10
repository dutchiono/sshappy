import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Platform,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Server } from '../types';
import { CredentialService } from '../services/CredentialService';
import { SSHService } from '../services/SSHService';
import { MonitoringService } from '../services/MonitoringService';
import { StatusBadge } from '../components/StatusBadge';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { EmptyState } from '../components/EmptyState';
import { Toast } from '../components/Toast';
import { RootStackParamList } from '../navigation';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

/**
 * ServerCard - Individual server item in the list
 */
interface ServerCardProps {
  server: Server;
  onPress: () => void;
  onLongPress: () => void;
}

function ServerCard({ server, onPress, onLongPress }: ServerCardProps) {
  const [status, setStatus] = useState<'online' | 'offline' | 'checking'>('checking');
  const [uptime, setUptime] = useState<number>(0);

  useEffect(() => {
    loadServerStatus();
  }, [server.id]);

  const loadServerStatus = async () => {
    try {
      const stats = await MonitoringService.getServerStats(server.id);
      setStatus(stats.status);
      setUptime(stats.uptime24h);
    } catch (error) {
      setStatus('offline');
    }
  };

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.7}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleRow}>
          <Ionicons 
            name="server-outline" 
            size={24} 
            color="#007AFF" 
            style={styles.cardIcon}
          />
          <View style={styles.cardTitleContainer}>
            <Text style={styles.cardTitle}>{server.name}</Text>
            <Text style={styles.cardSubtitle}>
              {server.username}@{server.host}:{server.port}
            </Text>
          </View>
        </View>
        <StatusBadge status={status} />
      </View>

      <View style={styles.cardStats}>
        <View style={styles.stat}>
          <Ionicons name="time-outline" size={16} color="#666" />
          <Text style={styles.statText}>Uptime: {uptime.toFixed(1)}%</Text>
        </View>
        {server.tags && server.tags.length > 0 && (
          <View style={styles.tags}>
            {server.tags.slice(0, 3).map((tag, index) => (
              <View key={index} style={styles.tag}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

/**
 * ServerListScreen - Main screen showing all servers
 */
export default function ServerListScreen() {
  const navigation = useNavigation<NavigationProp>();
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error' | 'info'>('info');

  // Load servers on screen focus
  useFocusEffect(
    useCallback(() => {
      loadServers();
    }, [])
  );

  const loadServers = async () => {
    try {
      setLoading(true);
      const allServers = await CredentialService.getAllServers();
      setServers(allServers);
    } catch (error) {
      showToast('Failed to load servers', 'error');
      console.error('Load servers error:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadServers();
    setRefreshing(false);
  };

  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    setToastMessage(message);
    setToastType(type);
    setToastVisible(true);
  };

  const handleServerPress = (server: Server) => {
    navigation.navigate('ServerDetails', { serverId: server.id });
  };

  const handleServerLongPress = (server: Server) => {
    Alert.alert(
      server.name,
      'Choose an action',
      [
        {
          text: 'Edit',
          onPress: () => navigation.navigate('AddServer', { server }),
        },
        {
          text: 'Test Connection',
          onPress: () => testConnection(server),
        },
        {
          text: 'Delete',
          onPress: () => confirmDelete(server),
          style: 'destructive',
        },
        { text: 'Cancel', style: 'cancel' },
      ],
      { cancelable: true }
    );
  };

  const testConnection = async (server: Server) => {
    try {
      showToast('Testing connection...', 'info');
      const credentials = await CredentialService.getServerCredentials(server.id);
      const connected = await SSHService.connect(server.id, {
        host: server.host,
        port: server.port,
        username: server.username,
        password: credentials.password,
        privateKey: credentials.privateKey,
      });

      if (connected) {
        await SSHService.disconnect(server.id);
        showToast('Connection successful!', 'success');
      } else {
        showToast('Connection failed', 'error');
      }
    } catch (error) {
      showToast(`Connection failed: ${error.message}`, 'error');
    }
  };

  const confirmDelete = (server: Server) => {
    Alert.alert(
      'Delete Server',
      `Are you sure you want to delete "${server.name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteServer(server),
        },
      ]
    );
  };

  const deleteServer = async (server: Server) => {
    try {
      await CredentialService.deleteServer(server.id);
      await MonitoringService.removeServer(server.id);
      showToast('Server deleted', 'success');
      loadServers();
    } catch (error) {
      showToast('Failed to delete server', 'error');
      console.error('Delete error:', error);
    }
  };

  const handleAddServer = () => {
    navigation.navigate('AddServer', {});
  };

  if (loading) {
    return <LoadingSpinner message="Loading servers..." />;
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={servers}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ServerCard
            server={item}
            onPress={() => handleServerPress(item)}
            onLongPress={() => handleServerLongPress(item)}
          />
        )}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={servers.length === 0 ? styles.emptyContainer : styles.listContent}
        ListEmptyComponent={
          <EmptyState
            icon="server-outline"
            title="No servers yet"
            description="Add your first server to get started"
            actionLabel="Add Server"
            onAction={handleAddServer}
          />
        }
      />

      {servers.length > 0 && (
        <TouchableOpacity style={styles.fab} onPress={handleAddServer}>
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      )}

      <Toast
        visible={toastVisible}
        message={toastMessage}
        type={toastType}
        onHide={() => setToastVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  listContent: {
    padding: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  cardIcon: {
    marginRight: 12,
  },
  cardTitleContainer: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 14,
    color: '#666',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  cardStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 6,
  },
  tags: {
    flexDirection: 'row',
    gap: 6,
  },
  tag: {
    backgroundColor: '#E8F4FF',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  tagText: {
    fontSize: 12,
    color: '#007AFF',
    fontWeight: '500',
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
      },
      android: {
        elevation: 6,
      },
    }),
  },
});
