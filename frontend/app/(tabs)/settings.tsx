import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
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

  const [settings, setSettings] = useState<Settings | null>(null);
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [emailSettings, setEmailSettings] = useState<EmailSettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form states
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
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
    } catch (error) {
      console.error('Error loading settings:', error);
      Alert.alert('Fehler', 'Einstellungen konnten nicht geladen werden');
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
      Alert.alert('Erfolg', 'Einstellungen wurden gespeichert');
    } catch (error) {
      console.error('Error saving settings:', error);
      Alert.alert('Fehler', 'Einstellungen konnten nicht gespeichert werden');
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
      Alert.alert('Erfolg', 'E-Mail-Einstellungen gespeichert');
    } catch (error) {
      Alert.alert('Fehler', 'Speichern fehlgeschlagen');
    } finally {
      setSaving(false);
    }
  };

  const testEmail = async () => {
    if (!user?.email) {
      Alert.alert('Fehler', 'Keine E-Mail-Adresse verfügbar');
      return;
    }
    
    try {
      await axios.post(`${BACKEND_URL}/api/email-settings/test`, null, {
        params: { test_email: user.email }
      });
      Alert.alert('Erfolg', `Test-E-Mail wurde an ${user.email} gesendet`);
    } catch (error) {
      Alert.alert('Fehler', 'Test-E-Mail konnte nicht gesendet werden');
    }
  };

  const addWebhook = async () => {
    if (!newWebhookName || !newWebhookUrl) {
      Alert.alert('Fehler', 'Bitte Name und URL eingeben');
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
      Alert.alert('Erfolg', 'Webhook wurde erstellt');
    } catch (error) {
      Alert.alert('Fehler', 'Webhook konnte nicht erstellt werden');
    }
  };

  const deleteWebhook = async (id: string) => {
    try {
      await apiService.deleteWebhook(id);
      setWebhooks(webhooks.filter(w => w.id !== id));
    } catch (error) {
      Alert.alert('Fehler', 'Webhook konnte nicht gelöscht werden');
    }
  };

  const createWorkflow = async () => {
    if (!workflowName) {
      Alert.alert('Fehler', 'Bitte Workflow-Namen eingeben');
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
      Alert.alert('Erfolg', 'Workflow erstellt');
    } catch (error) {
      Alert.alert('Fehler', 'Workflow konnte nicht erstellt werden');
    }
  };

  const deleteWorkflow = async (id: string) => {
    try {
      await axios.delete(`${BACKEND_URL}/api/workflows/${id}`);
      setWorkflows(workflows.filter(w => w.id !== id));
    } catch (error) {
      Alert.alert('Fehler', 'Workflow konnte nicht gelöscht werden');
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Abmelden',
      'Möchten Sie sich wirklich abmelden?',
      [
        { text: 'Abbrechen', style: 'cancel' },
        { text: 'Abmelden', style: 'destructive', onPress: () => {
          logout();
          router.replace('/login');
        }},
      ]
    );
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

          {/* AI Settings */}
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
              <Text style={styles.label}>KI-Modell</Text>
              <TextInput
                style={styles.input}
                value={model}
                onChangeText={setModel}
                placeholder="openai/gpt-4o"
                placeholderTextColor="#636e72"
                autoCapitalize="none"
              />
            </View>
          </View>

          {/* Company Settings */}
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

          {/* Email Settings */}
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

          {/* Workflows */}
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

          {/* Webhooks */}
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
});
