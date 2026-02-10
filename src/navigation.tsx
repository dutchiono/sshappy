import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { Server } from './types';

// Screen imports (to be created)
import ServerListScreen from './screens/ServerListScreen';
import AddServerScreen from './screens/AddServerScreen_Enhanced';
import ServerDetailsScreen from './screens/ServerDetailsScreen';
import SettingsScreen from './screens/SettingsScreen';

// Navigation types
export type RootStackParamList = {
  MainTabs: undefined;
  AddServer: { server?: Server };
  ServerDetails: { serverId: string };
};

export type TabParamList = {
  Servers: undefined;
  Settings: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

/**
 * Bottom tab navigator for main app sections
 */
function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap;
          
          if (route.name === 'Servers') {
            iconName = focused ? 'server' : 'server-outline';
          } else {
            iconName = focused ? 'settings' : 'settings-outline';
          }
          
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#007AFF',
        tabBarInactiveTintColor: 'gray',
        headerShown: false,
      })}
    >
      <Tab.Screen 
        name="Servers" 
        component={ServerListScreen}
        options={{ title: 'My Servers' }}
      />
      <Tab.Screen 
        name="Settings" 
        component={SettingsScreen}
        options={{ title: 'Settings' }}
      />
    </Tab.Navigator>
  );
}

/**
 * Root navigation stack
 */
export default function Navigation() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerStyle: {
            backgroundColor: '#007AFF',
          },
          headerTintColor: '#fff',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
        }}
      >
        <Stack.Screen 
          name="MainTabs" 
          component={MainTabs}
          options={{ headerShown: false }}
        />
        <Stack.Screen 
          name="AddServer" 
          component={AddServerScreen}
          options={({ route }) => ({
            title: route.params?.server ? 'Edit Server' : 'Add Server',
          })}
        />
        <Stack.Screen 
          name="ServerDetails" 
          component={ServerDetailsScreen}
          options={{ title: 'Server Details' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
