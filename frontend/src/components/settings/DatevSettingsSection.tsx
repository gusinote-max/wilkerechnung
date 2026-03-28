import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput,
  ActivityIndicator, Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiService } from '../../services/api';

interface Props {
  isDesktop: boolean;
  showToast: (type: 'success' | 'error', message: string) => void;
}

export default function DatevSettingsSection({ isDesktop, showToast }: Props) {
  const [config, setConfig] = useState<any>({
    enabled: false, simulation_mode: true, client_id: '', berater_nr: '', mandant_nr: '',
    auto_upload_on_approval: false, auto_upload_on_archive: true,
  });
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const data = await apiService.getDatevConfig();
      setConfig(data);
    } catch (e) {
      console.log('Could not load DATEV config');
    }
  };

  const saveConfig = async () => {
    setSaving(true);
    try {
      await apiService.updateDatevConfig(config);
      showToast('success', 'DATEV-Konfiguration gespeichert');
    } catch (error: any) {
      showToast('error', 'DATEV-Konfiguration konnte nicht gespeichert werden');
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    try {
      const result = await apiService.testDatevConnection();
      showToast(result.success ? 'success' : 'error', result.message);
    } catch (error: any) {
      showToast('error', 'Verbindungstest fehlgeschlagen');
    } finally {
      setTesting(false);
    }
  };

  return (
    <View style={[styles.section, isDesktop && styles.desktopSection]}>
      <View style={styles.sectionHeader}>
        <Ionicons name="cloud-upload" size={20} color="#00b894" />
        <Text style={styles.sectionTitle}>DATEV Unternehmen Online</Text>
        {config.simulation_mode && config.enabled && (
          <View style={styles.simBadge}>
            <Text style={styles.simBadgeText}>SIMULATION</Text>
          </View>
        )}
      </View>

      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>DATEV-Integration aktivieren</Text>
        <Switch value={config.enabled} onValueChange={(v) => setConfig({...config, enabled: v})}
          trackColor={{ false: '#2d2d44', true: '#00b89430' }} thumbColor={config.enabled ? '#00b894' : '#636e72'} />
      </View>

      {config.enabled && (
        <View>
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchLabel}>Simulationsmodus</Text>
              <Text style={styles.switchHint}>Testet den Flow ohne echte DATEV-Verbindung</Text>
            </View>
            <Switch value={config.simulation_mode} onValueChange={(v) => setConfig({...config, simulation_mode: v})}
              trackColor={{ false: '#2d2d44', true: '#fdcb6e30' }} thumbColor={config.simulation_mode ? '#fdcb6e' : '#636e72'} />
          </View>

          <View style={[styles.inputRow, isDesktop && styles.desktopInputRow]}>
            <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
              <Text style={styles.label}>Beraternummer</Text>
              <TextInput style={styles.input} value={config.berater_nr} onChangeText={(v) => setConfig({...config, berater_nr: v})} placeholder="12345" placeholderTextColor="#636e72" />
            </View>
            <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
              <Text style={styles.label}>Mandantennummer</Text>
              <TextInput style={styles.input} value={config.mandant_nr} onChangeText={(v) => setConfig({...config, mandant_nr: v})} placeholder="67890" placeholderTextColor="#636e72" />
            </View>
          </View>

          {!config.simulation_mode && (
            <View style={[styles.inputRow, isDesktop && styles.desktopInputRow]}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                <Text style={styles.label}>Client-ID (DATEVconnect)</Text>
                <TextInput style={styles.input} value={config.client_id} onChangeText={(v) => setConfig({...config, client_id: v})} placeholder="Client-ID" placeholderTextColor="#636e72" autoCapitalize="none" />
              </View>
              <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
                <Text style={styles.label}>Client-Secret</Text>
                <TextInput style={styles.input} value={config.client_secret || ''} onChangeText={(v) => setConfig({...config, client_secret: v})} placeholder="Client-Secret" placeholderTextColor="#636e72" secureTextEntry autoCapitalize="none" />
              </View>
            </View>
          )}

          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchLabel}>Auto-Upload nach Genehmigung</Text>
              <Text style={styles.switchHint}>Rechnungen automatisch nach Genehmigung an DATEV senden</Text>
            </View>
            <Switch value={config.auto_upload_on_approval} onValueChange={(v) => setConfig({...config, auto_upload_on_approval: v})}
              trackColor={{ false: '#2d2d44', true: '#00b89430' }} thumbColor={config.auto_upload_on_approval ? '#00b894' : '#636e72'} />
          </View>

          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchLabel}>Auto-Upload nach Archivierung</Text>
              <Text style={styles.switchHint}>Rechnungen automatisch nach GoBD-Archivierung an DATEV senden</Text>
            </View>
            <Switch value={config.auto_upload_on_archive} onValueChange={(v) => setConfig({...config, auto_upload_on_archive: v})}
              trackColor={{ false: '#2d2d44', true: '#00b89430' }} thumbColor={config.auto_upload_on_archive ? '#00b894' : '#636e72'} />
          </View>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
            <TouchableOpacity style={styles.saveBtn} onPress={saveConfig} disabled={saving}>
              {saving ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="save" size={18} color="#fff" />}
              <Text style={styles.saveBtnText}>Speichern</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.testBtn} onPress={testConnection} disabled={testing}>
              {testing ? <ActivityIndicator size="small" color="#00b894" /> : <Ionicons name="flash" size={18} color="#00b894" />}
              <Text style={styles.testBtnText}>Verbindung testen</Text>
            </TouchableOpacity>
          </View>
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
  simBadge: { backgroundColor: '#fdcb6e30', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  simBadgeText: { color: '#fdcb6e', fontSize: 11, fontWeight: 'bold' },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
  switchLabel: { fontSize: 15, color: '#fff', fontWeight: '500' },
  switchHint: { color: '#a0a0a0', fontSize: 11, marginTop: 2 },
  inputGroup: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', color: '#a0a0a0', marginBottom: 8 },
  input: { backgroundColor: '#0f0f1a', borderRadius: 10, padding: 14, fontSize: 15, color: '#fff', borderWidth: 1, borderColor: '#2d2d44' },
  inputRow: { flexDirection: 'row' },
  desktopInputRow: { flexDirection: 'row' },
  saveBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#00b894', borderRadius: 8, padding: 12, gap: 8 },
  saveBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  testBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f0f1a', borderWidth: 1, borderColor: '#00b894', borderRadius: 8, padding: 12, gap: 8 },
  testBtnText: { color: '#00b894', fontSize: 14, fontWeight: '600' },
});
