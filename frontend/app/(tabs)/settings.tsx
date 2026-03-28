import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal,
  FlatList,
  useWindowDimensions,
  Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiService, Settings, WebhookConfig, User } from '../../src/services/api';
import { useAuthStore } from '../../src/store/authStore';
import axios from 'axios';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

interface Workflow {
  id: string;
  name: string;
  description: string;
  stages: any[];
  min_amount: number;
  max_amount: number | null;
  active: boolean;
}

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
  const isManagerOrAbove = ['admin', 'manager'].includes(userRole);
  const isAccountantOrAbove = ['admin', 'manager', 'accountant'].includes(userRole);

  const [settings, setSettings] = useState<Settings | null>(null);
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [emailSettings, setEmailSettings] = useState<EmailSettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [toast, setToast] = useState<{type: 'success' | 'error'; message: string} | null>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showDeleteUserConfirm, setShowDeleteUserConfirm] = useState<string | null>(null);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState('viewer');
  const [creatingUser, setCreatingUser] = useState(false);

  // Form states
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [aiModels, setAiModels] = useState<Array<{id: string, name: string, pricing_prompt: string, pricing_completion: string}>>([]);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [companyIban, setCompanyIban] = useState('');
  const [companyBic, setCompanyBic] = useState('');
  const [kontenrahmen, setKontenrahmen] = useState('SKR03');
  
  // Email settings form
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [fromName, setFromName] = useState('');
  const [emailEnabled, setEmailEnabled] = useState(false);
  
  // Webhook form
  const [newWebhookName, setNewWebhookName] = useState('');
  const [newWebhookUrl, setNewWebhookUrl] = useState('');
  
  // Workflow form
  const [showWorkflowForm, setShowWorkflowForm] = useState(false);
  const [workflowName, setWorkflowName] = useState('');
  const [workflowMinAmount, setWorkflowMinAmount] = useState('');
  const [workflowMaxAmount, setWorkflowMaxAmount] = useState('');

  // DATEV Integration states
  const [datevConfig, setDatevConfig] = useState<any>({
    enabled: false, simulation_mode: true, client_id: '', berater_nr: '', mandant_nr: '',
    auto_upload_on_approval: false, auto_upload_on_archive: true,
  });
  const [datevTesting, setDatevTesting] = useState(false);
  const [datevSaving, setDatevSaving] = useState(false);

  // Banking Integration states
  const [bankingConfig, setBankingConfig] = useState<any>({
    enabled: false, simulation_mode: true, provider: 'simulation',
    company_iban: '', company_bic: '', company_name: '',
    auto_payment_on_approval: false, require_4_eyes: true, max_auto_amount: 10000,
  });
  const [bankingSaving, setBankingSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const [settingsData, webhooksData, workflowsData, usersData] = await Promise.all([
        apiService.getSettings(),
        apiService.getWebhooks(),
        axios.get(`${BACKEND_URL}/api/workflows`).then(r => r.data),
        apiService.getUsers().catch(() => []),
      ]);
      
      // Load email settings
      try {
        const emailData = await axios.get(`${BACKEND_URL}/api/email-settings`);
        setEmailSettings(emailData.data);
        setSmtpHost(emailData.data.smtp_host || '');
        setSmtpPort(String(emailData.data.smtp_port || 587));
        setSmtpUser(emailData.data.smtp_user || '');
        setFromEmail(emailData.data.from_email || '');
        setFromName(emailData.data.from_name || '');
        setEmailEnabled(emailData.data.enabled || false);
      } catch (e) {
        console.log('Email settings not available');
      }
      
      setSettings(settingsData);
      setWebhooks(webhooksData);
      setWorkflows(workflowsData || []);
      setUsers(usersData);
      setApiKey(settingsData.ai_settings.api_key || '');
      setModel(settingsData.ai_settings.model || 'openai/gpt-4o');
      setCompanyName(settingsData.company_name || '');
      setCompanyIban(settingsData.company_iban || '');
      setCompanyBic(settingsData.company_bic || '');
      setKontenrahmen(settingsData.default_kontenrahmen || 'SKR03');
      
      // Load available AI models from OpenRouter
      try {
        const modelsData = await apiService.getAIModels();
        setAiModels(modelsData);
      } catch (e) {
        console.log('Could not load AI models');
      }

      // Load DATEV config
      try {
        const datevData = await apiService.getDatevConfig();
        setDatevConfig(datevData);
      } catch (e) {
        console.log('Could not load DATEV config');
      }

      // Load Banking config
      try {
        const bankingData = await apiService.getBankingConfig();
        setBankingConfig(bankingData);
      } catch (e) {
        console.log('Could not load Banking config');
      }
    } catch (error) {
      console.error('Error loading settings:', error);
      setToast({ type: 'error', message: 'Einstellungen konnten nicht geladen werden' });
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    if (!settings) return;

    setSaving(true);
    try {
      const updatedSettings: Settings = {
        ...settings,
        ai_settings: {
          provider: 'openrouter',
          api_key: apiKey,
          model: model,
        },
        company_name: companyName,
        company_iban: companyIban,
        company_bic: companyBic,
        default_kontenrahmen: kontenrahmen,
      };

      await apiService.updateSettings(updatedSettings);
      setSettings(updatedSettings);
      setToast({ type: 'success', message: 'Einstellungen wurden gespeichert' });
    } catch (error) {
      console.error('Error saving settings:', error);
      setToast({ type: 'error', message: 'Einstellungen konnten nicht gespeichert werden' });
    } finally {
      setSaving(false);
    }
  };

  const saveEmailSettings = async () => {
    setSaving(true);
    try {
      await axios.put(`${BACKEND_URL}/api/email-settings`, null, {
        params: {
          smtp_host: smtpHost,
          smtp_port: parseInt(smtpPort),
          smtp_user: smtpUser,
          smtp_password: smtpPassword || undefined,
          from_email: fromEmail,
          from_name: fromName,
          enabled: emailEnabled,
        }
      });
      setToast({ type: 'success', message: 'E-Mail-Einstellungen gespeichert' });
    } catch (error) {
      setToast({ type: 'error', message: 'Speichern fehlgeschlagen' });
    } finally {
      setSaving(false);
    }
  };

  const testEmail = async () => {
    if (!user?.email) {
      setToast({ type: 'error', message: 'Keine E-Mail-Adresse verfügbar' });
      return;
    }
    
    try {
      await axios.post(`${BACKEND_URL}/api/email-settings/test`, null, {
        params: { test_email: user.email }
      });
      setToast({ type: 'success', message: `Test-E-Mail wurde an ${user.email} gesendet` });
    } catch (error) {
      setToast({ type: 'error', message: 'Test-E-Mail konnte nicht gesendet werden' });
    }
  };

  const addWebhook = async () => {
    if (!newWebhookName || !newWebhookUrl) {
      setToast({ type: 'error', message: 'Bitte Name und URL eingeben' });
      return;
    }

    try {
      const webhook: WebhookConfig = {
        id: Date.now().toString(),
        name: newWebhookName,
        url: newWebhookUrl,
        events: ['invoice.created', 'invoice.approved', 'invoice.rejected'],
        active: true,
        created_at: new Date().toISOString(),
      };

      await apiService.createWebhook(webhook);
      setWebhooks([...webhooks, webhook]);
      setNewWebhookName('');
      setNewWebhookUrl('');
      setToast({ type: 'success', message: 'Webhook wurde erstellt' });
    } catch (error) {
      setToast({ type: 'error', message: 'Webhook konnte nicht erstellt werden' });
    }
  };

  const deleteWebhook = async (id: string) => {
    try {
      await apiService.deleteWebhook(id);
      setWebhooks(webhooks.filter(w => w.id !== id));
    } catch (error) {
      setToast({ type: 'error', message: 'Webhook konnte nicht gelöscht werden' });
    }
  };

  const createWorkflow = async () => {
    if (!workflowName) {
      setToast({ type: 'error', message: 'Bitte Workflow-Namen eingeben' });
      return;
    }

    try {
      const workflow = {
        name: workflowName,
        description: `Mehrstufiger Workflow ab ${workflowMinAmount || '0'}€`,
        stages: [
          { stage_name: 'Manager-Freigabe', required_role: 'manager' },
          { stage_name: 'Buchhaltung-Freigabe', required_role: 'accountant' },
        ],
        min_amount: parseFloat(workflowMinAmount) || 0,
        max_amount: workflowMaxAmount ? parseFloat(workflowMaxAmount) : null,
      };

      const response = await axios.post(`${BACKEND_URL}/api/workflows`, workflow);
      setWorkflows([...workflows, response.data]);
      setShowWorkflowForm(false);
      setWorkflowName('');
      setWorkflowMinAmount('');
      setWorkflowMaxAmount('');
      setToast({ type: 'success', message: 'Workflow erstellt' });
    } catch (error) {
      setToast({ type: 'error', message: 'Workflow konnte nicht erstellt werden' });
    }
  };

  const deleteWorkflow = async (id: string) => {
    try {
      await axios.delete(`${BACKEND_URL}/api/workflows/${id}`);
      setWorkflows(workflows.filter(w => w.id !== id));
    } catch (error) {
      setToast({ type: 'error', message: 'Workflow konnte nicht gelöscht werden' });
    }
  };

  // User management helpers
  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin': return '#e74c3c';
      case 'manager': return '#f39c12';
      case 'accountant': return '#3498db';
      case 'viewer': return '#95a5a6';
      default: return '#636e72';
    }
  };

  const getRoleName = (role: string) => {
    switch (role) {
      case 'admin': return 'Admin';
      case 'manager': return 'Manager';
      case 'accountant': return 'Buchhalter';
      case 'viewer': return 'Nur Lesen';
      default: return role;
    }
  };

  const handleUpdateUserRole = async (userId: string, newRole: string) => {
    try {
      await apiService.updateUser(userId, { role: newRole } as any);
      setUsers(users.map(u => u.id === userId ? { ...u, role: newRole as any } : u));
      setEditingUser(null);
      setToast({ type: 'success', message: 'Benutzerrolle wurde aktualisiert' });
    } catch (error: any) {
      setToast({ type: 'error', message: 'Rolle konnte nicht geändert werden' });
    }
  };

  const handleToggleUserActive = async (userId: string, active: boolean) => {
    try {
      await apiService.updateUser(userId, { active } as any);
      setUsers(users.map(u => u.id === userId ? { ...u, active } : u));
      setToast({ type: 'success', message: active ? 'Benutzer aktiviert' : 'Benutzer deaktiviert' });
    } catch (error: any) {
      setToast({ type: 'error', message: 'Status konnte nicht geändert werden' });
    }
  };

  const handleDeleteUser = async (userId: string) => {
    setShowDeleteUserConfirm(userId);
  };

  const confirmDeleteUser = async () => {
    if (!showDeleteUserConfirm) return;
    try {
      await apiService.deleteUser(showDeleteUserConfirm);
      setUsers(users.filter(u => u.id !== showDeleteUserConfirm));
      setEditingUser(null);
      setShowDeleteUserConfirm(null);
      setToast({ type: 'success', message: 'Benutzer wurde gelöscht' });
    } catch (error: any) {
      setShowDeleteUserConfirm(null);
      setToast({ type: 'error', message: 'Benutzer konnte nicht gelöscht werden' });
    }
  };

  const handleCreateUser = async () => {
    if (!newUserName.trim() || !newUserEmail.trim() || !newUserPassword.trim()) {
      setToast({ type: 'error', message: 'Bitte alle Felder ausfüllen' });
      return;
    }
    setCreatingUser(true);
    try {
      const newUser = await apiService.register({
        name: newUserName.trim(),
        email: newUserEmail.trim(),
        password: newUserPassword.trim(),
        role: newUserRole,
      });
      setUsers([...users, newUser]);
      setShowCreateUser(false);
      setNewUserName('');
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserRole('viewer');
      setToast({ type: 'success', message: `Benutzer "${newUser.name}" wurde erstellt` });
    } catch (error: any) {
      const msg = error?.response?.data?.detail || 'Benutzer konnte nicht erstellt werden';
      setToast({ type: 'error', message: msg });
    } finally {
      setCreatingUser(false);
    }
  };

  // DATEV handlers
  const saveDatevConfig = async () => {
    setDatevSaving(true);
    try {
      await apiService.updateDatevConfig(datevConfig);
      setToast({ type: 'success', message: 'DATEV-Konfiguration gespeichert' });
    } catch (error: any) {
      setToast({ type: 'error', message: 'DATEV-Konfiguration konnte nicht gespeichert werden' });
    } finally {
      setDatevSaving(false);
    }
  };

  const testDatevConnection = async () => {
    setDatevTesting(true);
    try {
      const result = await apiService.testDatevConnection();
      setToast({ type: result.success ? 'success' : 'error', message: result.message });
    } catch (error: any) {
      setToast({ type: 'error', message: 'Verbindungstest fehlgeschlagen' });
    } finally {
      setDatevTesting(false);
    }
  };

  // Banking handlers
  const saveBankingConfig = async () => {
    setBankingSaving(true);
    try {
      await apiService.updateBankingConfig(bankingConfig);
      setToast({ type: 'success', message: 'Banking-Konfiguration gespeichert' });
    } catch (error: any) {
      setToast({ type: 'error', message: 'Banking-Konfiguration konnte nicht gespeichert werden' });
    } finally {
      setBankingSaving(false);
    }
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
            <View style={[styles.section, isDesktop && styles.desktopSection]}>
              <View style={styles.userCard}>
                <View style={styles.userAvatar}>
                  <Ionicons name="person" size={32} color="#6c5ce7" />
                </View>
                <View style={styles.userInfo}>
                  <Text style={styles.userName}>{user.name}</Text>
                  <Text style={styles.userEmail}>{user.email}</Text>
                  <View style={styles.roleBadge}>
                    <Text style={styles.roleText}>{user.role}</Text>
                  </View>
                </View>
                <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
                  <Ionicons name="log-out-outline" size={24} color="#ff7675" />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {!isAuthenticated && (
            <View style={[styles.section, isDesktop && styles.desktopSection]}>
              <TouchableOpacity
                style={styles.loginPrompt}
                onPress={() => router.push('/login')}
              >
                <Ionicons name="person-circle" size={48} color="#6c5ce7" />
                <Text style={styles.loginPromptText}>Anmelden</Text>
                <Text style={styles.loginPromptSubtext}>Für erweiterte Funktionen</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ===== USER MANAGEMENT ===== */}
          {isAdmin && (
            <View style={[styles.section, isDesktop && styles.desktopSection]}>
              <View style={styles.sectionHeader}>
                <Ionicons name="people" size={20} color="#6c5ce7" />
                <Text style={styles.sectionTitle}>Benutzerverwaltung</Text>
                <View style={styles.userCount}>
                  <Text style={styles.userCountText}>{users.length}</Text>
                </View>
              </View>
              
              {users.length === 0 ? (
                <Text style={styles.emptyText}>Keine Benutzer vorhanden</Text>
              ) : (
                users.map((u) => (
                  <View key={u.id} style={styles.userListItem}>
                    <View style={styles.userListAvatar}>
                      <Ionicons 
                        name={u.role === 'admin' ? 'shield-checkmark' : u.role === 'manager' ? 'briefcase' : u.role === 'accountant' ? 'calculator' : 'eye'} 
                        size={22} 
                        color={u.active ? '#6c5ce7' : '#636e72'} 
                      />
                    </View>
                    <View style={styles.userListInfo}>
                      <Text style={[styles.userListName, !u.active && styles.userInactive]}>{u.name}</Text>
                      <Text style={styles.userListEmail}>{u.email}</Text>
                    </View>
                    <View style={[styles.userRoleBadge, { backgroundColor: getRoleColor(u.role) + '20' }]}>
                      <Text style={[styles.userRoleBadgeText, { color: getRoleColor(u.role) }]}>
                        {getRoleName(u.role)}
                      </Text>
                    </View>
                    {u.id !== user?.id && (
                      <TouchableOpacity 
                        style={styles.userEditBtn}
                        onPress={() => setEditingUser(u)}
                      >
                        <Ionicons name="create-outline" size={20} color="#6c5ce7" />
                      </TouchableOpacity>
                    )}
                  </View>
                ))
              )}

              <TouchableOpacity
                style={styles.addUserBtn}
                onPress={() => setShowCreateUser(true)}
              >
                <Ionicons name="person-add" size={20} color="#fff" />
                <Text style={styles.addUserBtnText}>Neuen Benutzer anlegen</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Admin-only Settings */}
          {isAdmin && (
          <View style={[styles.section, isDesktop && styles.desktopSection]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="flash" size={20} color="#6c5ce7" />
              <Text style={styles.sectionTitle}>KI-Einstellungen</Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>OpenRouter API Key</Text>
              <TextInput
                style={styles.input}
                value={apiKey}
                onChangeText={setApiKey}
                placeholder="sk-or-..."
                placeholderTextColor="#636e72"
                secureTextEntry
                autoCapitalize="none"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>KI-Modell (Vision)</Text>
              <TouchableOpacity
                style={styles.modelPickerButton}
                onPress={() => {
                  setModelSearch('');
                  setShowModelPicker(true);
                }}
              >
                <Ionicons name="sparkles" size={18} color="#6c5ce7" />
                <Text style={styles.modelPickerText} numberOfLines={1}>
                  {aiModels.find(m => m.id === model)?.name || model || 'Modell wählen...'}
                </Text>
                <Ionicons name="chevron-down" size={18} color="#636e72" />
              </TouchableOpacity>
              <Text style={styles.modelHint}>
                {aiModels.length} Modelle verfügbar via OpenRouter
              </Text>
            </View>
          </View>
          )}

          {/* Company Settings */}
          {isAdmin && (
          <View style={[styles.section, isDesktop && styles.desktopSection]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="business" size={20} color="#00cec9" />
              <Text style={styles.sectionTitle}>Firmendaten</Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Firmenname</Text>
              <TextInput
                style={styles.input}
                value={companyName}
                onChangeText={setCompanyName}
                placeholder="Meine Firma GmbH"
                placeholderTextColor="#636e72"
              />
            </View>

            <View style={[styles.inputRow, isDesktop && styles.desktopInputRow]}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                <Text style={styles.label}>IBAN</Text>
                <TextInput
                  style={styles.input}
                  value={companyIban}
                  onChangeText={setCompanyIban}
                  placeholder="DE89..."
                  placeholderTextColor="#636e72"
                  autoCapitalize="characters"
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
                <Text style={styles.label}>BIC</Text>
                <TextInput
                  style={styles.input}
                  value={companyBic}
                  onChangeText={setCompanyBic}
                  placeholder="COBADEFFXXX"
                  placeholderTextColor="#636e72"
                  autoCapitalize="characters"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Standard-Kontenrahmen</Text>
              <View style={styles.radioGroup}>
                <TouchableOpacity
                  style={[styles.radioButton, kontenrahmen === 'SKR03' && styles.radioButtonActive]}
                  onPress={() => setKontenrahmen('SKR03')}
                >
                  <Text style={[styles.radioText, kontenrahmen === 'SKR03' && styles.radioTextActive]}>
                    SKR03
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.radioButton, kontenrahmen === 'SKR04' && styles.radioButtonActive]}
                  onPress={() => setKontenrahmen('SKR04')}
                >
                  <Text style={[styles.radioText, kontenrahmen === 'SKR04' && styles.radioTextActive]}>
                    SKR04
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
          )}

          {isAdmin && (
          <TouchableOpacity
            style={styles.saveButton}
            onPress={saveSettings}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="save" size={20} color="#fff" />
                <Text style={styles.saveButtonText}>Einstellungen speichern</Text>
              </>
            )}
          </TouchableOpacity>
          )}

          {/* DATEV Unternehmen Online */}
          {isAdmin && (
          <View style={[styles.section, isDesktop && styles.desktopSection]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="cloud-upload" size={20} color="#00b894" />
              <Text style={styles.sectionTitle}>DATEV Unternehmen Online</Text>
              {datevConfig.simulation_mode && datevConfig.enabled && (
                <View style={{ backgroundColor: '#fdcb6e30', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, marginLeft: 8 }}>
                  <Text style={{ color: '#fdcb6e', fontSize: 11, fontWeight: 'bold' }}>SIMULATION</Text>
                </View>
              )}
            </View>

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>DATEV-Integration aktivieren</Text>
              <Switch
                value={datevConfig.enabled}
                onValueChange={(v) => setDatevConfig({...datevConfig, enabled: v})}
                trackColor={{ false: '#2d2d44', true: '#00b89430' }}
                thumbColor={datevConfig.enabled ? '#00b894' : '#636e72'}
              />
            </View>

            {datevConfig.enabled && (
              <>
                <View style={styles.switchRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.switchLabel}>Simulationsmodus</Text>
                    <Text style={{ color: '#a0a0a0', fontSize: 11, marginTop: 2 }}>Testet den Flow ohne echte DATEV-Verbindung</Text>
                  </View>
                  <Switch
                    value={datevConfig.simulation_mode}
                    onValueChange={(v) => setDatevConfig({...datevConfig, simulation_mode: v})}
                    trackColor={{ false: '#2d2d44', true: '#fdcb6e30' }}
                    thumbColor={datevConfig.simulation_mode ? '#fdcb6e' : '#636e72'}
                  />
                </View>

                <View style={[styles.inputRow, isDesktop && styles.desktopInputRow]}>
                  <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                    <Text style={styles.label}>Beraternummer</Text>
                    <TextInput style={styles.input} value={datevConfig.berater_nr} onChangeText={(v) => setDatevConfig({...datevConfig, berater_nr: v})} placeholder="12345" placeholderTextColor="#636e72" />
                  </View>
                  <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
                    <Text style={styles.label}>Mandantennummer</Text>
                    <TextInput style={styles.input} value={datevConfig.mandant_nr} onChangeText={(v) => setDatevConfig({...datevConfig, mandant_nr: v})} placeholder="67890" placeholderTextColor="#636e72" />
                  </View>
                </View>

                {!datevConfig.simulation_mode && (
                  <View style={[styles.inputRow, isDesktop && styles.desktopInputRow]}>
                    <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                      <Text style={styles.label}>Client-ID (DATEVconnect)</Text>
                      <TextInput style={styles.input} value={datevConfig.client_id} onChangeText={(v) => setDatevConfig({...datevConfig, client_id: v})} placeholder="Client-ID" placeholderTextColor="#636e72" autoCapitalize="none" />
                    </View>
                    <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
                      <Text style={styles.label}>Client-Secret</Text>
                      <TextInput style={styles.input} value={datevConfig.client_secret || ''} onChangeText={(v) => setDatevConfig({...datevConfig, client_secret: v})} placeholder="Client-Secret" placeholderTextColor="#636e72" secureTextEntry autoCapitalize="none" />
                    </View>
                  </View>
                )}

                <View style={styles.switchRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.switchLabel}>Auto-Upload nach Genehmigung</Text>
                    <Text style={{ color: '#a0a0a0', fontSize: 11, marginTop: 2 }}>Rechnungen automatisch nach Genehmigung an DATEV senden</Text>
                  </View>
                  <Switch
                    value={datevConfig.auto_upload_on_approval}
                    onValueChange={(v) => setDatevConfig({...datevConfig, auto_upload_on_approval: v})}
                    trackColor={{ false: '#2d2d44', true: '#00b89430' }}
                    thumbColor={datevConfig.auto_upload_on_approval ? '#00b894' : '#636e72'}
                  />
                </View>

                <View style={styles.switchRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.switchLabel}>Auto-Upload nach Archivierung</Text>
                    <Text style={{ color: '#a0a0a0', fontSize: 11, marginTop: 2 }}>Rechnungen automatisch nach GoBD-Archivierung an DATEV senden</Text>
                  </View>
                  <Switch
                    value={datevConfig.auto_upload_on_archive}
                    onValueChange={(v) => setDatevConfig({...datevConfig, auto_upload_on_archive: v})}
                    trackColor={{ false: '#2d2d44', true: '#00b89430' }}
                    thumbColor={datevConfig.auto_upload_on_archive ? '#00b894' : '#636e72'}
                  />
                </View>

                <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                  <TouchableOpacity
                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#00b894', borderRadius: 8, padding: 12, gap: 8 }}
                    onPress={saveDatevConfig}
                    disabled={datevSaving}
                  >
                    {datevSaving ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="save" size={18} color="#fff" />}
                    <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>Speichern</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f0f1a', borderWidth: 1, borderColor: '#00b894', borderRadius: 8, padding: 12, gap: 8 }}
                    onPress={testDatevConnection}
                    disabled={datevTesting}
                  >
                    {datevTesting ? <ActivityIndicator size="small" color="#00b894" /> : <Ionicons name="flash" size={18} color="#00b894" />}
                    <Text style={{ color: '#00b894', fontSize: 14, fontWeight: '600' }}>Verbindung testen</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
          )}

          {/* Banking / Zahlungen */}
          {isAdmin && (
          <View style={[styles.section, isDesktop && styles.desktopSection]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="card" size={20} color="#0984e3" />
              <Text style={styles.sectionTitle}>Bankverbindung & Zahlungen</Text>
              {bankingConfig.simulation_mode && bankingConfig.enabled && (
                <View style={{ backgroundColor: '#fdcb6e30', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, marginLeft: 8 }}>
                  <Text style={{ color: '#fdcb6e', fontSize: 11, fontWeight: 'bold' }}>SIMULATION</Text>
                </View>
              )}
            </View>

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Zahlungsintegration aktivieren</Text>
              <Switch
                value={bankingConfig.enabled}
                onValueChange={(v) => setBankingConfig({...bankingConfig, enabled: v})}
                trackColor={{ false: '#2d2d44', true: '#0984e330' }}
                thumbColor={bankingConfig.enabled ? '#0984e3' : '#636e72'}
              />
            </View>

            {bankingConfig.enabled && (
              <>
                <View style={styles.switchRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.switchLabel}>Simulationsmodus</Text>
                    <Text style={{ color: '#a0a0a0', fontSize: 11, marginTop: 2 }}>SEPA-Zahlungen werden simuliert, nicht ausgeführt</Text>
                  </View>
                  <Switch
                    value={bankingConfig.simulation_mode}
                    onValueChange={(v) => setBankingConfig({...bankingConfig, simulation_mode: v})}
                    trackColor={{ false: '#2d2d44', true: '#fdcb6e30' }}
                    thumbColor={bankingConfig.simulation_mode ? '#fdcb6e' : '#636e72'}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Banking-Anbieter</Text>
                  <View style={styles.radioGroup}>
                    {[
                      { key: 'simulation', label: 'Simulation' },
                      { key: 'finapi', label: 'FinAPI' },
                      { key: 'tink', label: 'Tink' },
                      { key: 'ebics', label: 'EBICS' },
                    ].map((p) => (
                      <TouchableOpacity
                        key={p.key}
                        style={[styles.radioButton, bankingConfig.provider === p.key && styles.radioButtonActive]}
                        onPress={() => setBankingConfig({...bankingConfig, provider: p.key})}
                      >
                        <Text style={[styles.radioText, bankingConfig.provider === p.key && styles.radioTextActive]}>{p.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View style={[styles.inputRow, isDesktop && styles.desktopInputRow]}>
                  <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                    <Text style={styles.label}>Firmen-IBAN</Text>
                    <TextInput style={styles.input} value={bankingConfig.company_iban} onChangeText={(v) => setBankingConfig({...bankingConfig, company_iban: v})} placeholder="DE89..." placeholderTextColor="#636e72" autoCapitalize="characters" />
                  </View>
                  <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
                    <Text style={styles.label}>Firmen-BIC</Text>
                    <TextInput style={styles.input} value={bankingConfig.company_bic} onChangeText={(v) => setBankingConfig({...bankingConfig, company_bic: v})} placeholder="COBADEFFXXX" placeholderTextColor="#636e72" autoCapitalize="characters" />
                  </View>
                </View>

                <View style={styles.switchRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.switchLabel}>Auto-Zahlung nach Genehmigung</Text>
                    <Text style={{ color: '#a0a0a0', fontSize: 11, marginTop: 2 }}>Überweisungen automatisch nach Genehmigung auslösen</Text>
                  </View>
                  <Switch
                    value={bankingConfig.auto_payment_on_approval}
                    onValueChange={(v) => setBankingConfig({...bankingConfig, auto_payment_on_approval: v})}
                    trackColor={{ false: '#2d2d44', true: '#0984e330' }}
                    thumbColor={bankingConfig.auto_payment_on_approval ? '#0984e3' : '#636e72'}
                  />
                </View>

                <View style={styles.switchRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.switchLabel}>4-Augen-Prinzip</Text>
                    <Text style={{ color: '#a0a0a0', fontSize: 11, marginTop: 2 }}>Zahlungen müssen von zweiter Person bestätigt werden</Text>
                  </View>
                  <Switch
                    value={bankingConfig.require_4_eyes}
                    onValueChange={(v) => setBankingConfig({...bankingConfig, require_4_eyes: v})}
                    trackColor={{ false: '#2d2d44', true: '#0984e330' }}
                    thumbColor={bankingConfig.require_4_eyes ? '#0984e3' : '#636e72'}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Max. Auto-Zahlungsbetrag (EUR)</Text>
                  <TextInput style={styles.input} value={String(bankingConfig.max_auto_amount || '')} onChangeText={(v) => setBankingConfig({...bankingConfig, max_auto_amount: parseFloat(v) || 0})} placeholder="10000" placeholderTextColor="#636e72" keyboardType="numeric" />
                </View>

                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0984e3', borderRadius: 8, padding: 12, gap: 8, marginTop: 12 }}
                  onPress={saveBankingConfig}
                  disabled={bankingSaving}
                >
                  {bankingSaving ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="save" size={18} color="#fff" />}
                  <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>Banking speichern</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
          )}

          {/* Email Settings */}
          {isAdmin && (
          <View style={[styles.section, isDesktop && styles.desktopSection]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="mail" size={20} color="#fd79a8" />
              <Text style={styles.sectionTitle}>E-Mail-Einstellungen</Text>
            </View>

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>E-Mail-Versand aktivieren</Text>
              <Switch
                value={emailEnabled}
                onValueChange={setEmailEnabled}
                trackColor={{ false: '#2d2d44', true: '#6c5ce730' }}
                thumbColor={emailEnabled ? '#6c5ce7' : '#636e72'}
              />
            </View>

            <View style={[styles.inputRow, isDesktop && styles.desktopInputRow]}>
              <View style={[styles.inputGroup, { flex: 2, marginRight: 8 }]}>
                <Text style={styles.label}>SMTP Host</Text>
                <TextInput
                  style={styles.input}
                  value={smtpHost}
                  onChangeText={setSmtpHost}
                  placeholder="smtp.example.com"
                  placeholderTextColor="#636e72"
                  autoCapitalize="none"
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
                <Text style={styles.label}>Port</Text>
                <TextInput
                  style={styles.input}
                  value={smtpPort}
                  onChangeText={setSmtpPort}
                  placeholder="587"
                  placeholderTextColor="#636e72"
                  keyboardType="numeric"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>SMTP Benutzer</Text>
              <TextInput
                style={styles.input}
                value={smtpUser}
                onChangeText={setSmtpUser}
                placeholder="user@example.com"
                placeholderTextColor="#636e72"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>SMTP Passwort</Text>
              <TextInput
                style={styles.input}
                value={smtpPassword}
                onChangeText={setSmtpPassword}
                placeholder={emailSettings?.has_password ? '••••••••' : 'Passwort eingeben'}
                placeholderTextColor="#636e72"
                secureTextEntry
              />
            </View>

            <View style={[styles.inputRow, isDesktop && styles.desktopInputRow]}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                <Text style={styles.label}>Absender E-Mail</Text>
                <TextInput
                  style={styles.input}
                  value={fromEmail}
                  onChangeText={setFromEmail}
                  placeholder="noreply@firma.de"
                  placeholderTextColor="#636e72"
                  autoCapitalize="none"
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
                <Text style={styles.label}>Absender Name</Text>
                <TextInput
                  style={styles.input}
                  value={fromName}
                  onChangeText={setFromName}
                  placeholder="Candis-Kopie"
                  placeholderTextColor="#636e72"
                />
              </View>
            </View>

            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.secondaryButton} onPress={saveEmailSettings}>
                <Text style={styles.secondaryButtonText}>Speichern</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} onPress={testEmail}>
                <Text style={styles.secondaryButtonText}>Test senden</Text>
              </TouchableOpacity>
            </View>
          </View>
          )}

          {/* Workflows */}
          {isAdmin && (
          <View style={[styles.section, isDesktop && styles.desktopSection]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="git-branch" size={20} color="#74b9ff" />
              <Text style={styles.sectionTitle}>Freigabe-Workflows</Text>
            </View>

            {workflows.length > 0 ? (
              workflows.map(workflow => (
                <View key={workflow.id} style={styles.workflowItem}>
                  <View style={styles.workflowInfo}>
                    <Text style={styles.workflowName}>{workflow.name}</Text>
                    <Text style={styles.workflowDesc}>
                      {workflow.stages.length} Stufen • Ab {workflow.min_amount}€
                      {workflow.max_amount ? ` bis ${workflow.max_amount}€` : ''}
                    </Text>
                  </View>
                  <View style={styles.workflowActions}>
                    <View style={[styles.statusDot, workflow.active && styles.statusDotActive]} />
                    <TouchableOpacity onPress={() => deleteWorkflow(workflow.id)}>
                      <Ionicons name="trash" size={18} color="#ff7675" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>Keine Workflows konfiguriert</Text>
            )}

            {!showWorkflowForm ? (
              <TouchableOpacity
                style={styles.addButton}
                onPress={() => setShowWorkflowForm(true)}
              >
                <Ionicons name="add" size={20} color="#fff" />
                <Text style={styles.addButtonText}>Workflow hinzufügen</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.workflowForm}>
                <TextInput
                  style={styles.input}
                  value={workflowName}
                  onChangeText={setWorkflowName}
                  placeholder="Workflow-Name"
                  placeholderTextColor="#636e72"
                />
                <View style={[styles.inputRow, { marginTop: 8 }]}>
                  <TextInput
                    style={[styles.input, { flex: 1, marginRight: 8 }]}
                    value={workflowMinAmount}
                    onChangeText={setWorkflowMinAmount}
                    placeholder="Min. Betrag (€)"
                    placeholderTextColor="#636e72"
                    keyboardType="numeric"
                  />
                  <TextInput
                    style={[styles.input, { flex: 1, marginLeft: 8 }]}
                    value={workflowMaxAmount}
                    onChangeText={setWorkflowMaxAmount}
                    placeholder="Max. Betrag (€)"
                    placeholderTextColor="#636e72"
                    keyboardType="numeric"
                  />
                </View>
                <Text style={styles.workflowHint}>
                  Standard: Manager → Buchhaltung (2 Stufen)
                </Text>
                <View style={styles.buttonRow}>
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={() => setShowWorkflowForm(false)}
                  >
                    <Text style={styles.cancelButtonText}>Abbrechen</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.addButton} onPress={createWorkflow}>
                    <Text style={styles.addButtonText}>Erstellen</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
          )}

          {/* Webhooks */}
          {isAdmin && (
          <View style={[styles.section, isDesktop && styles.desktopSection]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="git-network" size={20} color="#fd79a8" />
              <Text style={styles.sectionTitle}>n8n Webhooks</Text>
            </View>

            <View style={styles.inputGroup}>
              <TextInput
                style={styles.input}
                value={newWebhookName}
                onChangeText={setNewWebhookName}
                placeholder="Webhook Name"
                placeholderTextColor="#636e72"
              />
              <TextInput
                style={[styles.input, { marginTop: 8 }]}
                value={newWebhookUrl}
                onChangeText={setNewWebhookUrl}
                placeholder="https://n8n.example.com/webhook/..."
                placeholderTextColor="#636e72"
                autoCapitalize="none"
                keyboardType="url"
              />
              <TouchableOpacity style={styles.addButton} onPress={addWebhook}>
                <Ionicons name="add" size={20} color="#fff" />
                <Text style={styles.addButtonText}>Webhook hinzufügen</Text>
              </TouchableOpacity>
            </View>

            {webhooks.length > 0 && (
              <View style={styles.webhookList}>
                {webhooks.map(webhook => (
                  <View key={webhook.id} style={styles.webhookItem}>
                    <View style={styles.webhookInfo}>
                      <Text style={styles.webhookName}>{webhook.name}</Text>
                      <Text style={styles.webhookUrl} numberOfLines={1}>
                        {webhook.url}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => deleteWebhook(webhook.id)}>
                      <Ionicons name="trash" size={18} color="#ff7675" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </View>
          )}
          {/* End Admin-only sections */}

          {/* Nicht-Admin Hinweis */}
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
      

      {/* User Edit Modal */}
      {editingUser && (
        <Modal
          visible={true}
          transparent
          animationType="fade"
          onRequestClose={() => setEditingUser(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Benutzer bearbeiten</Text>
                <TouchableOpacity onPress={() => setEditingUser(null)}>
                  <Ionicons name="close" size={24} color="#fff" />
                </TouchableOpacity>
              </View>
              
              <ScrollView style={{ padding: 16, maxHeight: 500 }}>
                <View style={styles.userEditHeader}>
                  <Ionicons name="person-circle" size={48} color="#6c5ce7" />
                  <Text style={styles.userEditName}>{editingUser.name}</Text>
                  <Text style={styles.userEditEmail}>{editingUser.email}</Text>
                </View>

                <Text style={styles.userEditSectionTitle}>Rolle zuweisen</Text>
                {(['admin', 'manager', 'accountant', 'viewer'] as const).map((role) => (
                  <TouchableOpacity
                    key={role}
                    style={[
                      styles.roleOption,
                      editingUser.role === role && styles.roleOptionSelected,
                    ]}
                    onPress={() => handleUpdateUserRole(editingUser.id, role)}
                  >
                    <Ionicons
                      name={role === 'admin' ? 'shield-checkmark' : role === 'manager' ? 'briefcase' : role === 'accountant' ? 'calculator' : 'eye'}
                      size={22}
                      color={editingUser.role === role ? '#fff' : getRoleColor(role)}
                    />
                    <View style={styles.roleOptionInfo}>
                      <Text style={[styles.roleOptionName, editingUser.role === role && styles.roleOptionNameSelected]}>
                        {getRoleName(role)}
                      </Text>
                      <Text style={[styles.roleOptionDesc, editingUser.role === role && styles.roleOptionDescSelected]}>
                        {role === 'admin' ? 'Voller Zugriff auf alle Funktionen' :
                         role === 'manager' ? 'Rechnungen genehmigen & verwalten' :
                         role === 'accountant' ? 'Kontierung & Exporte' :
                         'Nur Lesen & Ansicht'}
                      </Text>
                    </View>
                    {editingUser.role === role && (
                      <Ionicons name="checkmark-circle" size={22} color="#fff" />
                    )}
                  </TouchableOpacity>
                ))}

                <View style={styles.userEditActions}>
                  <TouchableOpacity
                    style={[styles.userToggleBtn, editingUser.active ? styles.userDeactivateBtn : styles.userActivateBtn]}
                    onPress={() => handleToggleUserActive(editingUser.id, !editingUser.active)}
                  >
                    <Ionicons name={editingUser.active ? 'close-circle' : 'checkmark-circle'} size={18} color="#fff" />
                    <Text style={styles.userToggleBtnText}>
                      {editingUser.active ? 'Deaktivieren' : 'Aktivieren'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.userDeleteBtn}
                    onPress={() => handleDeleteUser(editingUser.id)}
                  >
                    <Ionicons name="trash" size={18} color="#ff7675" />
                    <Text style={styles.userDeleteBtnText}>Benutzer löschen</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}

      {/* Toast */}
      {toast && (
        <View style={[styles.toastBanner, toast.type === 'success' ? styles.toastBannerSuccess : styles.toastBannerError]}>
          <Ionicons name={toast.type === 'success' ? 'checkmark-circle' : 'alert-circle'} size={20} color="#fff" />
          <Text style={styles.toastBannerText}>{toast.message}</Text>
          <TouchableOpacity onPress={() => setToast(null)}>
            <Ionicons name="close" size={16} color="#fff" />
          </TouchableOpacity>
        </View>
      )}

      {/* Logout Confirmation Modal */}
      <Modal
        visible={showLogoutConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLogoutConfirm(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxWidth: 380 }]}>
            <View style={{ padding: 24, alignItems: 'center' }}>
              <Ionicons name="log-out-outline" size={48} color="#ff7675" />
              <Text style={[styles.modalTitle, { marginTop: 16, textAlign: 'center' }]}>Abmelden</Text>
              <Text style={{ color: '#a0a0a0', fontSize: 14, marginTop: 8, textAlign: 'center' }}>
                Möchten Sie sich wirklich abmelden?
              </Text>
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 24, width: '100%' }}>
                <TouchableOpacity
                  style={[styles.cancelButton, { flex: 1 }]}
                  onPress={() => setShowLogoutConfirm(false)}
                >
                  <Text style={styles.cancelButtonText}>Abbrechen</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 1, alignItems: 'center', backgroundColor: '#ff7675', borderRadius: 8, padding: 12 }}
                  onPress={confirmLogout}
                >
                  <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>Abmelden</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete User Confirmation Modal */}
      <Modal
        visible={showDeleteUserConfirm !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDeleteUserConfirm(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxWidth: 380 }]}>
            <View style={{ padding: 24, alignItems: 'center' }}>
              <Ionicons name="trash-outline" size={48} color="#ff7675" />
              <Text style={[styles.modalTitle, { marginTop: 16, textAlign: 'center' }]}>Benutzer löschen</Text>
              <Text style={{ color: '#a0a0a0', fontSize: 14, marginTop: 8, textAlign: 'center' }}>
                Dieser Vorgang kann nicht rückgängig gemacht werden. Möchten Sie fortfahren?
              </Text>
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 24, width: '100%' }}>
                <TouchableOpacity
                  style={[styles.cancelButton, { flex: 1 }]}
                  onPress={() => setShowDeleteUserConfirm(null)}
                >
                  <Text style={styles.cancelButtonText}>Abbrechen</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 1, alignItems: 'center', backgroundColor: '#ff7675', borderRadius: 8, padding: 12 }}
                  onPress={confirmDeleteUser}
                >
                  <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>Löschen</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Create User Modal */}
      <Modal
        visible={showCreateUser}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCreateUser(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxWidth: 480 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Neuen Benutzer anlegen</Text>
              <TouchableOpacity onPress={() => setShowCreateUser(false)}>
                <Ionicons name="close" size={24} color="#a0a0a0" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 500 }}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Name *</Text>
                <TextInput
                  style={styles.input}
                  value={newUserName}
                  onChangeText={setNewUserName}
                  placeholder="Vor- und Nachname"
                  placeholderTextColor="#636e72"
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>E-Mail *</Text>
                <TextInput
                  style={styles.input}
                  value={newUserEmail}
                  onChangeText={setNewUserEmail}
                  placeholder="benutzer@firma.de"
                  placeholderTextColor="#636e72"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Passwort *</Text>
                <TextInput
                  style={styles.input}
                  value={newUserPassword}
                  onChangeText={setNewUserPassword}
                  placeholder="Mindestens 6 Zeichen"
                  placeholderTextColor="#636e72"
                  secureTextEntry
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={[styles.label, { marginBottom: 10 }]}>Rolle *</Text>
                {[
                  { key: 'admin', name: 'Admin', desc: 'Vollzugriff auf alle Funktionen', icon: 'shield-checkmark' as const },
                  { key: 'manager', name: 'Manager', desc: 'Rechnungen genehmigen und verwalten', icon: 'briefcase' as const },
                  { key: 'accountant', name: 'Buchhalter', desc: 'Rechnungen bearbeiten und exportieren', icon: 'calculator' as const },
                  { key: 'viewer', name: 'Nur Lesen', desc: 'Rechnungen nur einsehen', icon: 'eye' as const },
                ].map((role) => (
                  <TouchableOpacity
                    key={role.key}
                    style={[styles.roleOption, newUserRole === role.key && styles.roleOptionSelected]}
                    onPress={() => setNewUserRole(role.key)}
                  >
                    <Ionicons name={role.icon} size={20} color={newUserRole === role.key ? '#fff' : '#6c5ce7'} />
                    <View style={styles.roleOptionInfo}>
                      <Text style={[styles.roleOptionName, newUserRole === role.key && styles.roleOptionNameSelected]}>
                        {role.name}
                      </Text>
                      <Text style={[styles.roleOptionDesc, newUserRole === role.key && styles.roleOptionDescSelected]}>
                        {role.desc}
                      </Text>
                    </View>
                    {newUserRole === role.key && (
                      <Ionicons name="checkmark-circle" size={20} color="#fff" />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
              <TouchableOpacity
                style={[styles.cancelButton, { flex: 1 }]}
                onPress={() => setShowCreateUser(false)}
              >
                <Text style={styles.cancelButtonText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, alignItems: 'center', backgroundColor: '#6c5ce7', borderRadius: 8, padding: 14, flexDirection: 'row', justifyContent: 'center', gap: 8 }}
                onPress={handleCreateUser}
                disabled={creatingUser}
              >
                {creatingUser ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="person-add" size={18} color="#fff" />
                    <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>Erstellen</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Model Picker Modal */}
      <Modal
        visible={showModelPicker}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowModelPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>KI-Modell wählen</Text>
              <TouchableOpacity onPress={() => setShowModelPicker(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            
            <TextInput
              style={styles.modelSearchInput}
              value={modelSearch}
              onChangeText={setModelSearch}
              placeholder="Modell suchen... (z.B. gpt, claude, gemini)"
              placeholderTextColor="#636e72"
              autoCapitalize="none"
              autoFocus={true}
            />
            
            <FlatList
              data={aiModels.filter(m => {
                if (!modelSearch) return true;
                const q = modelSearch.toLowerCase();
                return m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q);
              })}
              keyExtractor={(item) => item.id}
              style={styles.modelList}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.modelItem,
                    item.id === model && styles.modelItemSelected,
                  ]}
                  onPress={() => {
                    setModel(item.id);
                    setShowModelPicker(false);
                  }}
                >
                  <View style={styles.modelItemLeft}>
                    <Text style={[
                      styles.modelItemName,
                      item.id === model && styles.modelItemNameSelected,
                    ]}>{item.name}</Text>
                    <Text style={styles.modelItemId}>{item.id}</Text>
                  </View>
                  {item.id === model && (
                    <Ionicons name="checkmark-circle" size={22} color="#6c5ce7" />
                  )}
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={styles.modelEmpty}>
                  <Text style={styles.modelEmptyText}>Keine Modelle gefunden</Text>
                </View>
              }
            />
          </View>
        </View>
      </Modal>
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
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#2d2d44',
  },
  desktopSection: {
    paddingVertical: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginLeft: 8,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
  },
  userAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#6c5ce720',
    justifyContent: 'center',
    alignItems: 'center',
  },
  userInfo: {
    flex: 1,
    marginLeft: 16,
  },
  userName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  userEmail: {
    fontSize: 14,
    color: '#a0a0a0',
  },
  roleBadge: {
    backgroundColor: '#6c5ce730',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  roleText: {
    fontSize: 12,
    color: '#6c5ce7',
    textTransform: 'capitalize',
  },
  logoutButton: {
    padding: 8,
  },
  loginPrompt: {
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 24,
  },
  loginPromptText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#6c5ce7',
    marginTop: 12,
  },
  loginPromptSubtext: {
    fontSize: 14,
    color: '#a0a0a0',
    marginTop: 4,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    color: '#a0a0a0',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#2d2d44',
  },
  inputRow: {
    flexDirection: 'row',
  },
  desktopInputRow: {
    flexDirection: 'row',
  },
  radioGroup: {
    flexDirection: 'row',
    gap: 12,
  },
  radioButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#1a1a2e',
    borderWidth: 1,
    borderColor: '#2d2d44',
  },
  radioButtonActive: {
    backgroundColor: '#6c5ce730',
    borderColor: '#6c5ce7',
  },
  radioText: {
    color: '#a0a0a0',
    fontSize: 14,
  },
  radioTextActive: {
    color: '#6c5ce7',
    fontWeight: 'bold',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  switchLabel: {
    fontSize: 14,
    color: '#fff',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6c5ce7',
    marginHorizontal: 20,
    marginVertical: 10,
    borderRadius: 8,
    padding: 14,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  secondaryButton: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#2d2d44',
    borderRadius: 8,
    padding: 12,
  },
  secondaryButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00cec9',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
  },
  cancelButton: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#2d2d44',
    borderRadius: 8,
    padding: 12,
  },
  cancelButtonText: {
    color: '#a0a0a0',
    fontSize: 14,
  },
  workflowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  workflowInfo: {
    flex: 1,
  },
  workflowName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fff',
  },
  workflowDesc: {
    fontSize: 12,
    color: '#a0a0a0',
    marginTop: 2,
  },
  workflowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#636e72',
  },
  statusDotActive: {
    backgroundColor: '#55efc4',
  },
  workflowForm: {
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    padding: 16,
    marginTop: 12,
  },
  workflowHint: {
    fontSize: 12,
    color: '#636e72',
    marginTop: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#636e72',
    textAlign: 'center',
    paddingVertical: 20,
  },
  webhookList: {
    marginTop: 16,
  },
  webhookItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  webhookInfo: {
    flex: 1,
  },
  webhookName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fff',
  },
  webhookUrl: {
    fontSize: 12,
    color: '#636e72',
    marginTop: 4,
  },
  appInfo: {
    alignItems: 'center',
    padding: 30,
  },
  appInfoTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#6c5ce7',
  },
  appInfoVersion: {
    fontSize: 14,
    color: '#636e72',
    marginTop: 4,
  },
  appInfoText: {
    fontSize: 12,
    color: '#636e72',
    marginTop: 8,
    textAlign: 'center',
  },
  modelPickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2a2a3e',
    padding: 14,
    gap: 10,
  },
  modelPickerText: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
  },
  modelHint: {
    fontSize: 11,
    color: '#636e72',
    marginTop: 6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    width: '100%',
    maxWidth: 500,
    maxHeight: '80%',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a3e',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  modelSearchInput: {
    backgroundColor: '#0f0f1a',
    borderRadius: 8,
    padding: 12,
    margin: 12,
    color: '#fff',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#2a2a3e',
  },
  modelList: {
    maxHeight: 400,
  },
  modelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#0f0f1a',
  },
  modelItemSelected: {
    backgroundColor: '#6c5ce715',
  },
  modelItemLeft: {
    flex: 1,
    marginRight: 10,
  },
  modelItemName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  modelItemNameSelected: {
    color: '#6c5ce7',
  },
  modelItemId: {
    fontSize: 11,
    color: '#636e72',
    marginTop: 2,
  },
  modelEmpty: {
    padding: 30,
    alignItems: 'center',
  },
  modelEmptyText: {
    color: '#636e72',
    fontSize: 14,
  },
  // User Management styles
  userCount: {
    backgroundColor: '#6c5ce730',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 2,
    marginLeft: 8,
  },
  userCountText: {
    color: '#6c5ce7',
    fontSize: 13,
    fontWeight: 'bold',
  },
  userListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  userListAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#6c5ce715',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  userListInfo: {
    flex: 1,
  },
  userListName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  userInactive: {
    color: '#636e72',
    textDecorationLine: 'line-through',
  },
  userListEmail: {
    fontSize: 12,
    color: '#a0a0a0',
    marginTop: 2,
  },
  userRoleBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 8,
  },
  userRoleBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  userEditBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#6c5ce715',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addUserBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6c5ce7',
    borderRadius: 10,
    padding: 14,
    marginTop: 12,
    gap: 8,
  },
  addUserBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  // User Edit Modal styles
  userEditHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  userEditName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 8,
  },
  userEditEmail: {
    fontSize: 14,
    color: '#a0a0a0',
    marginTop: 4,
  },
  userEditSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#a0a0a0',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  roleOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f0f1a',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#2d2d44',
  },
  roleOptionSelected: {
    backgroundColor: '#6c5ce7',
    borderColor: '#6c5ce7',
  },
  roleOptionInfo: {
    flex: 1,
    marginLeft: 12,
  },
  roleOptionName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  roleOptionNameSelected: {
    color: '#fff',
  },
  roleOptionDesc: {
    fontSize: 12,
    color: '#a0a0a0',
    marginTop: 2,
  },
  roleOptionDescSelected: {
    color: 'rgba(255,255,255,0.8)',
  },
  userEditActions: {
    marginTop: 24,
    gap: 10,
  },
  userToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  userDeactivateBtn: {
    backgroundColor: '#e17055',
  },
  userActivateBtn: {
    backgroundColor: '#00b894',
  },
  userToggleBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  userDeleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ff767540',
    gap: 8,
  },
  userDeleteBtnText: {
    color: '#ff7675',
    fontSize: 14,
    fontWeight: '600',
  },
  // Toast styles
  toastBanner: {
    position: 'absolute',
    top: 50,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 10,
    gap: 10,
    zIndex: 9999,
  },
  toastBannerSuccess: {
    backgroundColor: '#00b894',
  },
  toastBannerError: {
    backgroundColor: '#e17055',
  },
  toastBannerText: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
});
