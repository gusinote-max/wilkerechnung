import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput, Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

interface Props {
  isDesktop: boolean;
  initialData?: { smtp_host: string; smtp_port: number; smtp_user: string; from_email: string; from_name: string; enabled: boolean; has_password: boolean } | null;
  userEmail?: string;
  showToast: (type: 'success' | 'error', message: string) => void;
}

export default function EmailSettingsSection({ isDesktop, initialData, userEmail, showToast }: Props) {
  const [smtpHost, setSmtpHost] = useState(initialData?.smtp_host || '');
  const [smtpPort, setSmtpPort] = useState(String(initialData?.smtp_port || 587));
  const [smtpUser, setSmtpUser] = useState(initialData?.smtp_user || '');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [fromEmail, setFromEmail] = useState(initialData?.from_email || '');
  const [fromName, setFromName] = useState(initialData?.from_name || '');
  const [emailEnabled, setEmailEnabled] = useState(initialData?.enabled || false);
  const [saving, setSaving] = useState(false);

  const saveEmailSettings = async () => {
    setSaving(true);
    try {
      await axios.put(`${BACKEND_URL}/api/email-settings`, null, {
        params: {
          smtp_host: smtpHost, smtp_port: parseInt(smtpPort),
          smtp_user: smtpUser, smtp_password: smtpPassword || undefined,
          from_email: fromEmail, from_name: fromName, enabled: emailEnabled,
        }
      });
      showToast('success', 'E-Mail-Einstellungen gespeichert');
    } catch (error) {
      showToast('error', 'Speichern fehlgeschlagen');
    } finally {
      setSaving(false);
    }
  };

  const testEmail = async () => {
    if (!userEmail) { showToast('error', 'Keine E-Mail-Adresse verf\u00fcgbar'); return; }
    try {
      await axios.post(`${BACKEND_URL}/api/email-settings/test`, null, { params: { test_email: userEmail } });
      showToast('success', `Test-E-Mail wurde an ${userEmail} gesendet`);
    } catch (error) {
      showToast('error', 'Test-E-Mail konnte nicht gesendet werden');
    }
  };

  return (
    <View style={[styles.section, isDesktop && styles.desktopSection]}>
      <View style={styles.sectionHeader}>
        <Ionicons name="mail" size={20} color="#fd79a8" />
        <Text style={styles.sectionTitle}>E-Mail-Einstellungen</Text>
      </View>

      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>E-Mail-Versand aktivieren</Text>
        <Switch value={emailEnabled} onValueChange={setEmailEnabled}
          trackColor={{ false: '#2d2d44', true: '#6c5ce730' }} thumbColor={emailEnabled ? '#6c5ce7' : '#636e72'} />
      </View>

      <View style={[styles.inputRow, isDesktop && styles.desktopInputRow]}>
        <View style={[styles.inputGroup, { flex: 2, marginRight: 8 }]}>
          <Text style={styles.label}>SMTP Host</Text>
          <TextInput style={styles.input} value={smtpHost} onChangeText={setSmtpHost}
            placeholder="smtp.example.com" placeholderTextColor="#636e72" autoCapitalize="none" />
        </View>
        <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
          <Text style={styles.label}>Port</Text>
          <TextInput style={styles.input} value={smtpPort} onChangeText={setSmtpPort}
            placeholder="587" placeholderTextColor="#636e72" keyboardType="numeric" />
        </View>
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>SMTP Benutzer</Text>
        <TextInput style={styles.input} value={smtpUser} onChangeText={setSmtpUser}
          placeholder="user@example.com" placeholderTextColor="#636e72" autoCapitalize="none" />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>SMTP Passwort</Text>
        <TextInput style={styles.input} value={smtpPassword} onChangeText={setSmtpPassword}
          placeholder={initialData?.has_password ? '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022' : 'Passwort eingeben'}
          placeholderTextColor="#636e72" secureTextEntry />
      </View>

      <View style={[styles.inputRow, isDesktop && styles.desktopInputRow]}>
        <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
          <Text style={styles.label}>Absender E-Mail</Text>
          <TextInput style={styles.input} value={fromEmail} onChangeText={setFromEmail}
            placeholder="noreply@firma.de" placeholderTextColor="#636e72" autoCapitalize="none" />
        </View>
        <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
          <Text style={styles.label}>Absender Name</Text>
          <TextInput style={styles.input} value={fromName} onChangeText={setFromName}
            placeholder="Autohaus Wilke" placeholderTextColor="#636e72" />
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
  );
}

const styles = StyleSheet.create({
  section: { backgroundColor: '#1a1a2e', marginHorizontal: 16, marginTop: 16, borderRadius: 16, padding: 20 },
  desktopSection: { marginHorizontal: 0 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 10 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
  switchLabel: { fontSize: 15, color: '#fff', fontWeight: '500' },
  inputGroup: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', color: '#a0a0a0', marginBottom: 8 },
  input: { backgroundColor: '#0f0f1a', borderRadius: 10, padding: 14, fontSize: 15, color: '#fff', borderWidth: 1, borderColor: '#2d2d44' },
  inputRow: { flexDirection: 'row' },
  desktopInputRow: { flexDirection: 'row' },
  buttonRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  secondaryButton: { flex: 1, backgroundColor: '#2d2d44', borderRadius: 10, padding: 14, alignItems: 'center' },
  secondaryButtonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
