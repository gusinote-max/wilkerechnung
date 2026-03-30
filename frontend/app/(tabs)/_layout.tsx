import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { View, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { useAuthStore } from '../../src/store/authStore';

export default function TabLayout() {
  const { token } = useAuthStore();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#6c5ce7',
        tabBarInactiveTintColor: '#636e72',
        tabBarStyle: {
          backgroundColor: '#1a1a2e',
          borderTopColor: '#2d2d44',
          height: 60,
          paddingBottom: 8,
          paddingTop: 8,
        },
        headerStyle: {
          backgroundColor: '#1a1a2e',
        },
        headerTintColor: '#fff',
        headerTitleStyle: {
          fontWeight: 'bold',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="invoices"
        options={{
          title: 'Rechnungen',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="document-text" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="archive"
        options={{
          title: 'Archiv',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="archive" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="export"
        options={{
          title: 'Export',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="download" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="email-inbox"
        options={{
          title: 'E-Mail',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="mail" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Einstellungen',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f0f1a',
  },
});
