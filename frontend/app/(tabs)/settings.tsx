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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiService, Settings, WebhookConfig } from '../../src/services/api';

export default function SettingsScreen() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form states
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [newWebhookName, setNewWebhookName] = useState('');
  const [newWebhookUrl, setNewWebhookUrl] = useState('');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const [settingsData, webhooksData] = await Promise.all([
        apiService.getSettings(),
        apiService.getWebhooks(),
      ]);
      setSettings(settingsData);
      setWebhooks(webhooksData);
      setApiKey(settingsData.ai_settings.api_key || '');
      setModel(settingsData.ai_settings.model || 'openai/gpt-4o');
      setCompanyName(settingsData.company_name || '');
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
      console.error('Error creating webhook:', error);
      Alert.alert('Fehler', 'Webhook konnte nicht erstellt werden');
    }
  };

  const deleteWebhook = async (id: string) => {
    Alert.alert(
      'Webhook löschen',
      'Möchten Sie diesen Webhook wirklich löschen?',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Löschen',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiService.deleteWebhook(id);
              setWebhooks(webhooks.filter((w) => w.id !== id));
            } catch (error) {
              console.error('Error deleting webhook:', error);
              Alert.alert('Fehler', 'Webhook konnte nicht gelöscht werden');
            }
          },
        },
      ]
    );
  };

  const testWebhook = async (id: string) => {
    try {
      await apiService.testWebhook(id);
      Alert.alert('Erfolg', 'Test-Webhook wurde gesendet');
    } catch (error) {
      Alert.alert('Fehler', 'Webhook-Test fehlgeschlagen');
    }
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
        <ScrollView style={styles.scrollView}>
          {/* AI Settings */}
          <View style={styles.section}>
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
              <Text style={styles.hint}>
                z.B. openai/gpt-4o, anthropic/claude-3-opus, google/gemini-pro-vision
              </Text>
            </View>
          </View>

          {/* Company Settings */}
          <View style={styles.section}>
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

          {/* Webhooks */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="git-network" size={20} color="#fd79a8" />
              <Text style={styles.sectionTitle}>n8n Webhooks</Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Neuer Webhook</Text>
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
                <Text style={styles.listTitle}>Konfigurierte Webhooks:</Text>
                {webhooks.map((webhook) => (
                  <View key={webhook.id} style={styles.webhookItem}>
                    <View style={styles.webhookInfo}>
                      <Text style={styles.webhookName}>{webhook.name}</Text>
                      <Text style={styles.webhookUrl} numberOfLines={1}>
                        {webhook.url}
                      </Text>
                    </View>
                    <View style={styles.webhookActions}>
                      <TouchableOpacity
                        style={styles.webhookAction}
                        onPress={() => testWebhook(webhook.id)}
                      >
                        <Ionicons name="play" size={18} color="#55efc4" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.webhookAction}
                        onPress={() => deleteWebhook(webhook.id)}
                      >
                        <Ionicons name="trash" size={18} color="#ff7675" />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* App Info */}
          <View style={styles.appInfo}>
            <Text style={styles.appInfoTitle}>Candis-Kopie</Text>
            <Text style={styles.appInfoVersion}>Version 1.0.0</Text>
            <Text style={styles.appInfoText}>
              KI-Rechnungsmanagement mit OCR, GoBD-Archiv und DATEV-Export
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
  hint: {
    fontSize: 12,
    color: '#636e72',
    marginTop: 6,
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
  webhookList: {
    marginTop: 16,
  },
  listTitle: {
    fontSize: 14,
    color: '#a0a0a0',
    marginBottom: 12,
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
  webhookActions: {
    flexDirection: 'row',
  },
  webhookAction: {
    padding: 8,
    marginLeft: 4,
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
