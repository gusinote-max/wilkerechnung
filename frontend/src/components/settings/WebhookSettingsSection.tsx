import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiService, WebhookConfig } from '../../services/api';

interface Props {
  isDesktop: boolean;
  showToast: (type: 'success' | 'error', message: string) => void;
}

export default function WebhookSettingsSection({ isDesktop, showToast }: Props) {
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([]);
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');

  useEffect(() => {
    loadWebhooks();
  }, []);

  const loadWebhooks = async () => {
    try {
      const data = await apiService.getWebhooks();
      setWebhooks(data);
    } catch (e) {
      console.log('Could not load webhooks');
    }
  };

  const addWebhook = async () => {
    if (!newName || !newUrl) { showToast('error', 'Bitte Name und URL eingeben'); return; }
    try {
      const webhook: WebhookConfig = {
        id: Date.now().toString(),
        name: newName, url: newUrl,
        events: ['invoice.created', 'invoice.approved', 'invoice.rejected'],
        active: true, created_at: new Date().toISOString(),
      };
      await apiService.createWebhook(webhook);
      setWebhooks([...webhooks, webhook]);
      setNewName(''); setNewUrl('');
      showToast('success', 'Webhook wurde erstellt');
    } catch (error) {
      showToast('error', 'Webhook konnte nicht erstellt werden');
    }
  };

  const deleteWebhook = async (id: string) => {
    try {
      await apiService.deleteWebhook(id);
      setWebhooks(webhooks.filter(w => w.id !== id));
    } catch (error) {
      showToast('error', 'Webhook konnte nicht gel\u00f6scht werden');
    }
  };

  return (
    <View style={[styles.section, isDesktop && styles.desktopSection]}>
      <View style={styles.sectionHeader}>
        <Ionicons name="git-network" size={20} color="#fd79a8" />
        <Text style={styles.sectionTitle}>n8n Webhooks</Text>
      </View>

      <View style={styles.inputGroup}>
        <TextInput style={styles.input} value={newName} onChangeText={setNewName}
          placeholder="Webhook Name" placeholderTextColor="#636e72" />
        <TextInput style={[styles.input, { marginTop: 8 }]} value={newUrl} onChangeText={setNewUrl}
          placeholder="https://n8n.example.com/webhook/..." placeholderTextColor="#636e72"
          autoCapitalize="none" keyboardType="url" />
        <TouchableOpacity style={styles.addButton} onPress={addWebhook}>
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={styles.addButtonText}>Webhook hinzuf\u00fcgen</Text>
        </TouchableOpacity>
      </View>

      {webhooks.length > 0 && (
        <View style={styles.webhookList}>
          {webhooks.map(webhook => (
            <View key={webhook.id} style={styles.webhookItem}>
              <View style={styles.webhookInfo}>
                <Text style={styles.webhookName}>{webhook.name}</Text>
                <Text style={styles.webhookUrl} numberOfLines={1}>{webhook.url}</Text>
              </View>
              <TouchableOpacity onPress={() => deleteWebhook(webhook.id)}>
                <Ionicons name="trash" size={18} color="#ff7675" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { backgroundColor: '#1a1a2e', marginHorizontal: 16, marginTop: 16, borderRadius: 16, padding: 20 },
  desktopSection: { marginHorizontal: 0 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 10 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  inputGroup: { marginBottom: 16 },
  input: { backgroundColor: '#0f0f1a', borderRadius: 10, padding: 14, fontSize: 15, color: '#fff', borderWidth: 1, borderColor: '#2d2d44' },
  addButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#6c5ce7', borderRadius: 10, padding: 14, marginTop: 12, gap: 8 },
  addButtonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  webhookList: { marginTop: 8 },
  webhookItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#2d2d44' },
  webhookInfo: { flex: 1, marginRight: 12 },
  webhookName: { fontSize: 15, fontWeight: '600', color: '#fff' },
  webhookUrl: { fontSize: 13, color: '#636e72', marginTop: 2 },
});
