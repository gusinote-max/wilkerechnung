import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiService, Settings, User } from '../../src/services/api';
import { useAuthStore } from '../../src/store/authStore';
import axios from 'axios';

// Refactored Components
import Toast, { ToastData } from '../../src/components/shared/Toast';
import ConfirmModal from '../../src/components/shared/ConfirmModal';
import UserInfoCard from '../../src/components/settings/UserInfoCard';
import UserManagementSection from '../../src/components/settings/UserManagementSection';
import GeneralSettingsSection from '../../src/components/settings/GeneralSettingsSection';
import DatevSettingsSection from '../../src/components/settings/DatevSettingsSection';
import BankingSettingsSection from '../../src/components/settings/BankingSettingsSection';
import EmailSettingsSection from '../../src/components/settings/EmailSettingsSection';
import WorkflowSettingsSection from '../../src/components/settings/WorkflowSettingsSection';
import WebhookSettingsSection from '../../src/components/settings/WebhookSettingsSection';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

interface EmailSettingsData {
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  from_email: string;
  from_name: string;
  enabled: boolean;
  has_password: boolean;
}

export default function SettingsScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  const { user, logout, isAuthenticated } = useAuthStore();

  // Role-based permissions
  const userRole = user?.role || 'viewer';
  const isAdmin = userRole === 'admin';

  const [settings, setSettings] = useState<Settings | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [emailSettings, setEmailSettings] = useState<EmailSettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<ToastData | null>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const [settingsData, usersData] = await Promise.all([
        apiService.getSettings(),
        apiService.getUsers().catch(() => []),
      ]);

      // Load email settings
      try {
        const emailData = await axios.get(`${BACKEND_URL}/api/email-settings`);
        setEmailSettings(emailData.data);
      } catch (e) {
        console.log('Email settings not available');
      }

      setSettings(settingsData);
      setUsers(usersData);
    } catch (error) {
      console.error('Error loading settings:', error);
      showToast('error', 'Einstellungen konnten nicht geladen werden');
    } finally {
      setLoading(false);
    }
  };

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
  };

  // Toast auto-dismiss
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const handleLogout = () => {
    setShowLogoutConfirm(true);
  };

  const confirmLogout = () => {
    setShowLogoutConfirm(false);
    logout();
    router.replace('/login');
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6c5ce7" />
          <Text style={styles.loadingText}>Lade Einstellungen...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={isDesktop && styles.desktopContent}
        >
          {/* User Info */}
          {isAuthenticated && user && (
            <UserInfoCard user={user} isDesktop={isDesktop} onLogout={handleLogout} />
          )}

          {!isAuthenticated && (
            <View style={[styles.section, isDesktop && styles.desktopSection]}>
              <TouchableOpacity style={styles.loginPrompt} onPress={() => router.push('/login')}>
                <Ionicons name="person-circle" size={48} color="#6c5ce7" />
                <Text style={styles.loginPromptText}>Anmelden</Text>
                <Text style={styles.loginPromptSubtext}>Für erweiterte Funktionen</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Admin-only Sections */}
          {isAdmin && (
            <UserManagementSection
              users={users}
              currentUserId={user?.id}
              isDesktop={isDesktop}
              showToast={showToast}
              onUsersChange={setUsers}
            />
          )}

          {isAdmin && (
            <GeneralSettingsSection
              initialSettings={settings}
              isDesktop={isDesktop}
              showToast={showToast}
            />
          )}

          {isAdmin && (
            <DatevSettingsSection isDesktop={isDesktop} showToast={showToast} />
          )}

          {isAdmin && (
            <BankingSettingsSection isDesktop={isDesktop} showToast={showToast} />
          )}

          {isAdmin && (
            <EmailSettingsSection
              isDesktop={isDesktop}
              initialData={emailSettings}
              userEmail={user?.email}
              showToast={showToast}
            />
          )}

          {isAdmin && (
            <WorkflowSettingsSection isDesktop={isDesktop} showToast={showToast} />
          )}

          {isAdmin && (
            <WebhookSettingsSection isDesktop={isDesktop} showToast={showToast} />
          )}

          {/* Non-Admin Notice */}
          {!isAdmin && isAuthenticated && (
            <View style={[styles.section, isDesktop && styles.desktopSection, { alignItems: 'center', paddingVertical: 30 }]}>
              <Ionicons name="lock-closed" size={40} color="#636e72" />
              <Text style={{ color: '#a0a0a0', fontSize: 15, marginTop: 12, textAlign: 'center' }}>
                Erweiterte Einstellungen sind nur für Administratoren verfügbar.
              </Text>
              <Text style={{ color: '#636e72', fontSize: 13, marginTop: 6, textAlign: 'center' }}>
                Ihre Rolle: {userRole === 'manager' ? 'Manager' : userRole === 'accountant' ? 'Buchhalter' : 'Nur Lesen'}
              </Text>
            </View>
          )}

          {/* App Info */}
          <View style={styles.appInfo}>
            <Text style={styles.appInfoTitle}>Candis-Kopie</Text>
            <Text style={styles.appInfoVersion}>Version 2.0.0</Text>
            <Text style={styles.appInfoText}>
              KI-Rechnungsmanagement mit OCR, mehrstufigen Workflows, GoBD-Archiv und DATEV-Export
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Toast */}
      {toast && (
        <Toast toast={toast} onDismiss={() => setToast(null)} />
      )}

      {/* Logout Confirmation */}
      <ConfirmModal
        visible={showLogoutConfirm}
        icon="log-out-outline"
        iconColor="#ff7675"
        title="Abmelden"
        message="Möchten Sie sich wirklich abmelden?"
        confirmText="Abmelden"
        confirmColor="#ff7675"
        onCancel={() => setShowLogoutConfirm(false)}
        onConfirm={confirmLogout}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f1a',
  },
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  desktopContent: {
    maxWidth: 800,
    alignSelf: 'center',
    width: '100%',
    paddingHorizontal: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#a0a0a0',
    marginTop: 12,
    fontSize: 16,
  },
  section: {
    backgroundColor: '#1a1a2e',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    padding: 20,
  },
  desktopSection: {
    marginHorizontal: 0,
  },
  loginPrompt: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  loginPromptText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 12,
  },
  loginPromptSubtext: {
    fontSize: 14,
    color: '#a0a0a0',
    marginTop: 4,
  },
  appInfo: {
    alignItems: 'center',
    paddingVertical: 30,
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  appInfoTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  appInfoVersion: {
    fontSize: 14,
    color: '#6c5ce7',
    marginTop: 4,
  },
  appInfoText: {
    fontSize: 13,
    color: '#636e72',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
});
