import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput, Switch, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

interface ImapData {
  imap_host: string;
  imap_port: number;
  imap_user: string;
  imap_folder: string;
  imap_ssl: boolean;
  imap_enabled: boolean;
  auto_import_mode: string;
  poll_interval_minutes: number;
  ai_confidence_threshold: number;
  has_password: boolean;
}

interface Props {
  isDesktop: boolean;
  initialData?: ImapData | null;
  token: string;
  showToast: (type: 'success' | 'error', message: string) => void;
}

const POLL_INTERVALS = [
  { label: '5 Minuten', value: 5 },
  { label: '10 Minuten', value: 10 },
  { label: '15 Minuten', value: 15 },
  { label: '30 Minuten', value: 30 },
  { label: '60 Minuten', value: 60 },
];

const IMPORT_MODES = [
  { key: 'manual', label: '👁️ Manuell', desc: 'Nur anzeigen, manuell importieren' },
  { key: 'semi', label: '🤖 Halbautomatisch', desc: 'KI prüft, Sie bestätigen' },
  { key: 'auto', label: '⚡ Automatisch', desc: 'KI > Schwellwert → direkt importiert' },
];

export default function ImapSettingsSection({ isDesktop, initialData, token, showToast }: Props) {
  const [imapHost, setImapHost] = useState(initialData?.imap_host || '');
  const [imapPort, setImapPort] = useState(String(initialData?.imap_port || 993));
  const [imapUser, setImapUser] = useState(initialData?.imap_user || '');
  const [imapPassword, setImapPassword] = useState('');
  const [imapFolder, setImapFolder] = useState(initialData?.imap_folder || 'INBOX');
  const [imapSsl, setImapSsl] = useState(initialData?.imap_ssl ?? true);
  const [imapEnabled, setImapEnabled] = useState(initialData?.imap_enabled || false);
  const [importMode, setImportMode] = useState(initialData?.auto_import_mode || 'semi');
  const [pollInterval, setPollInterval] = useState(initialData?.poll_interval_minutes || 15);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const headers = { Authorization: `Bearer ${token}` };

  const saveSettings = async () => {
    setSaving(true);
    try {
      await axios.put(`${BACKEND_URL}/api/imap-settings`, null, {
        headers,
        params: {
          imap_host: imapHost,
          imap_port: parseInt(imapPort),
          imap_user: imapUser,
          imap_password: imapPassword || undefined,
          imap_folder: imapFolder,
          imap_ssl: imapSsl,
          imap_enabled: imapEnabled,
          auto_import_mode: importMode,
          poll_interval_minutes: pollInterval,
        },
      });
      showToast('success', 'IMAP-Einstellungen gespeichert');
    } catch {
      showToast('error', 'Speichern fehlgeschlagen');
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const resp = await axios.post(`${BACKEND_URL}/api/imap-settings/test`, null, { headers });
      setTestResult(resp.data);
    } catch (e: any) {
      setTestResult({ success: false, message: e.response?.data?.detail || 'Verbindungsfehler' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <View style={[styles.section, isDesktop && styles.desktopSection]}>
      <View style={styles.sectionHeader}>
        <Ionicons name="mail-unread" size={20} color="#00b894" />
        <Text style={styles.sectionTitle}>E-Mail Rechnungsimport (IMAP)</Text>
      </View>
      <Text style={styles.hint}>
        Hinterlegen Sie einen E-Mail-Posteingang. Anhänge werden automatisch als Rechnungen erkannt und importiert.
      </Text>

      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>IMAP aktivieren</Text>
        <Switch
          value={imapEnabled}
          onValueChange={setImapEnabled}
          trackColor={{ false: '#2d2d44', true: '#00b89430' }}
          thumbColor={imapEnabled ? '#00b894' : '#636e72'}
        />
      </View>

      {/* Server */}
      <View style={[styles.inputRow, isDesktop && styles.desktopInputRow]}>
        <View style={[styles.inputGroup, { flex: 3, marginRight: 8 }]}>
          <Text style={styles.label}>IMAP Host</Text>
          <TextInput
            style={styles.input}
            value={imapHost}
            onChangeText={setImapHost}
            placeholder="imap.autohaus-wilke.de"
            placeholderTextColor="#636e72"
            autoCapitalize="none"
          />
        </View>
        <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
          <Text style={styles.label}>Port</Text>
          <TextInput
            style={styles.input}
            value={imapPort}
            onChangeText={setImapPort}
            placeholder="993"
            placeholderTextColor="#636e72"
            keyboardType="numeric"
          />
        </View>
      </View>

      <View style={[styles.inputRow, isDesktop && styles.desktopInputRow]}>
        <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
          <Text style={styles.label}>Benutzername / E-Mail</Text>
          <TextInput
            style={styles.input}
            value={imapUser}
            onChangeText={setImapUser}
            placeholder="rechnung@autohaus.de"
            placeholderTextColor="#636e72"
            autoCapitalize="none"
          />
        </View>
        <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
          <Text style={styles.label}>Passwort</Text>
          <TextInput
            style={styles.input}
            value={imapPassword}
            onChangeText={setImapPassword}
            placeholder={initialData?.has_password ? '••••••••' : 'Passwort eingeben'}
            placeholderTextColor="#636e72"
            secureTextEntry
          />
        </View>
      </View>

      <View style={[styles.inputRow, isDesktop && styles.desktopInputRow]}>
        <View style={[styles.inputGroup, { flex: 2, marginRight: 8 }]}>
          <Text style={styles.label}>Ordner / Mailbox</Text>
          <TextInput
            style={styles.input}
            value={imapFolder}
            onChangeText={setImapFolder}
            placeholder="INBOX"
            placeholderTextColor="#636e72"
            autoCapitalize="none"
          />
        </View>
        <View style={[styles.inputGroup, { flex: 1, marginLeft: 8, justifyContent: 'center' }]}>
          <Text style={styles.label}>SSL/TLS</Text>
          <View style={styles.sslRow}>
            <Switch
              value={imapSsl}
              onValueChange={(v) => { setImapSsl(v); if (v) setImapPort('993'); else setImapPort('143'); }}
              trackColor={{ false: '#2d2d44', true: '#00b89430' }}
              thumbColor={imapSsl ? '#00b894' : '#636e72'}
            />
            <Text style={styles.sslLabel}>{imapSsl ? 'An (993)' : 'Aus (143)'}</Text>
          </View>
        </View>
      </View>

      {/* Import Mode */}
      <Text style={[styles.label, { marginBottom: 10 }]}>Import-Modus</Text>
      <View style={styles.modeContainer}>
        {IMPORT_MODES.map((m) => (
          <TouchableOpacity
            key={m.key}
            style={[styles.modeButton, importMode === m.key && styles.modeButtonActive]}
            onPress={() => setImportMode(m.key)}
          >
            <Text style={[styles.modeLabel, importMode === m.key && styles.modeLabelActive]}>{m.label}</Text>
            <Text style={styles.modeDesc}>{m.desc}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Poll Interval */}
      <Text style={[styles.label, { marginTop: 16, marginBottom: 10 }]}>Automatischer Abruf</Text>
      <View style={styles.intervalContainer}>
        {POLL_INTERVALS.map((p) => (
          <TouchableOpacity
            key={p.value}
            style={[styles.intervalChip, pollInterval === p.value && styles.intervalChipActive]}
            onPress={() => setPollInterval(p.value)}
          >
            <Text style={[styles.intervalText, pollInterval === p.value && styles.intervalTextActive]}>
              {p.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Test result */}
      {testResult && (
        <View style={[styles.testResult, testResult.success ? styles.testSuccess : styles.testError]}>
          <Ionicons
            name={testResult.success ? 'checkmark-circle' : 'alert-circle'}
            size={16}
            color={testResult.success ? '#00b894' : '#d63031'}
          />
          <Text style={[styles.testResultText, { color: testResult.success ? '#00b894' : '#d63031' }]}>
            {testResult.message}
          </Text>
        </View>
      )}

      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.primaryButton} onPress={saveSettings} disabled={saving}>
          <Text style={styles.primaryButtonText}>{saving ? 'Speichert...' : 'Speichern'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={testConnection} disabled={testing}>
          <Ionicons name="wifi" size={14} color="#fff" />
          <Text style={styles.secondaryButtonText}>{testing ? 'Verbinde...' : 'Verbindung testen'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { backgroundColor: '#1a1a2e', marginHorizontal: 16, marginTop: 16, borderRadius: 16, padding: 20 },
  desktopSection: { marginHorizontal: 0 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 10 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  hint: { fontSize: 13, color: '#636e72', marginBottom: 16, lineHeight: 18 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#2d2d44', marginBottom: 16 },
  switchLabel: { fontSize: 15, color: '#fff', fontWeight: '500' },
  inputGroup: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '600', color: '#a0a0a0', marginBottom: 7 },
  input: { backgroundColor: '#0f0f1a', borderRadius: 10, padding: 13, fontSize: 14, color: '#fff', borderWidth: 1, borderColor: '#2d2d44' },
  inputRow: { flexDirection: 'column' },
  desktopInputRow: { flexDirection: 'row' },
  sslRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 10 },
  sslLabel: { fontSize: 13, color: '#a0a0a0' },
  modeContainer: { flexDirection: 'column', gap: 8 },
  modeButton: { padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#2d2d44', backgroundColor: '#0f0f1a' },
  modeButtonActive: { borderColor: '#00b894', backgroundColor: '#00b89415' },
  modeLabel: { fontSize: 14, fontWeight: '600', color: '#a0a0a0', marginBottom: 2 },
  modeLabelActive: { color: '#00b894' },
  modeDesc: { fontSize: 12, color: '#636e72' },
  intervalContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  intervalChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#2d2d44', backgroundColor: '#0f0f1a' },
  intervalChipActive: { borderColor: '#00b894', backgroundColor: '#00b89415' },
  intervalText: { fontSize: 13, color: '#a0a0a0' },
  intervalTextActive: { color: '#00b894', fontWeight: '600' },
  testResult: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10, marginTop: 12 },
  testSuccess: { backgroundColor: '#00b89415' },
  testError: { backgroundColor: '#d6303115' },
  testResultText: { fontSize: 13, flex: 1 },
  buttonRow: { flexDirection: 'row', gap: 12, marginTop: 16 },
  primaryButton: { flex: 1, backgroundColor: '#00b894', borderRadius: 10, padding: 14, alignItems: 'center' },
  primaryButtonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  secondaryButton: { flex: 1, backgroundColor: '#2d2d44', borderRadius: 10, padding: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 },
  secondaryButtonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
