import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import React, { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import useAuthStore from '../src/store/authStore';

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { token } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        const stored = window.localStorage.getItem('auth-storage');
        const hasToken = stored
          ? !!(JSON.parse(stored)?.state?.token)
          : false;
        setReady(true);
        if (!hasToken) {
          // Defer navigation by one tick to ensure navigator is fully mounted
          setTimeout(() => router.replace('/login'), 50);
        }
        return;
      } catch {
        setReady(true);
        setTimeout(() => router.replace('/login'), 50);
        return;
      }
    }
    // Native: wait for AsyncStorage hydration
    const timer = setTimeout(() => {
      setReady(true);
      if (!token) {
        setTimeout(() => router.replace('/login'), 50);
      }
    }, 800);
    return () => clearTimeout(timer);
  }, []);

  // After initial check, monitor token changes
  useEffect(() => {
    if (!ready) return;
    const inAuthGroup = segments[0] !== '(tabs)';
    if (!token && !inAuthGroup) {
      router.replace('/login');
    }
  }, [token, ready]);

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <AuthGuard>
        <Stack
          screenOptions={{
            headerStyle: {
              backgroundColor: '#1a1a2e',
            },
            headerTintColor: '#fff',
            headerTitleStyle: {
              fontWeight: 'bold',
            },
            contentStyle: {
              backgroundColor: '#0f0f1a',
            },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="invoice/[id]" options={{ title: 'Rechnungsdetails' }} />
          <Stack.Screen name="upload" options={{ title: 'Rechnung hochladen', presentation: 'modal' }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="register" options={{ headerShown: false }} />
        </Stack>
      </AuthGuard>
    </SafeAreaProvider>
  );
}
