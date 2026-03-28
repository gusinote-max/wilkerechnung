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

export default function BankingSettingsSection({ isDesktop, showToast }: Props) {
  const [config, setConfig] = useState<any>({
    enabled: false, simulation_mode: true, provider: 'simulation',
    company_iban: '', company_bic: '', company_name: '',
    auto_payment_on_approval: false, require_4_eyes: true, max_auto_amount: 10000,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const data = await apiService.getBankingConfig();
      setConfig(data);
    } catch (e) {
      console.log('Could not load Banking config');
    }
  };

  const saveConfig = async () => {
    setSaving(true);
    try {
      await apiService.updateBankingConfig(config);
      showToast('success', 'Banking-Konfiguration gespeichert');
    } catch (error: any) {
      showToast('error', 'Banking-Konfiguration konnte nicht gespeichert werden');
    } finally {
      setSaving(false);
    }
  };

  const providers = [
    { key: 'simulation', label: 'Simulation' },
    { key: 'finapi', label: 'FinAPI' },
    { key: 'tink', label: 'Tink' },
    { key: 'ebics', label: 'EBICS' },
  ];

  return (
    <View style={[styles.section, isDesktop && styles.desktopSection]}>
      <View style={styles.sectionHeader}>
        <Ionicons name="card" size={20} color="#0984e3" />
        <Text style={styles.sectionTitle}>Bankverbindung & Zahlungen</Text>
        {config.simulation_mode && config.enabled && (
          <View style={styles.simBadge}>
            <Text style={styles.simBadgeText}>SIMULATION</Text>
          </View>
        )}
      </View>

      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Zahlungsintegration aktivieren</Text>
        <Switch value={config.enabled} onValueChange={(v) => setConfig({...config, enabled: v})}
          trackColor={{ false: '#2d2d44', true: '#0984e330' }} thumbColor={config.enabled ? '#0984e3' : '#636e72'} />
      </View>

      {config.enabled && (
        <View>
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchLabel}>Simulationsmodus</Text>
              <Text style={styles.switchHint}>SEPA-Zahlungen werden simuliert, nicht ausgeführt</Text>
            </View>
            <Switch value={config.simulation_mode} onValueChange={(v) => setConfig({...config, simulation_mode: v})}
              trackColor={{ false: '#2d2d44', true: '#fdcb6e30' }} thumbColor={config.simulation_mode ? '#fdcb6e' : '#636e72'} />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Banking-Anbieter</Text>
            <View style={styles.radioGroup}>
              {providers.map((p) => (
                <TouchableOpacity key={p.key}
                  style={[styles.radioButton, config.provider === p.key && styles.radioButtonActive]}
                  onPress={() => setConfig({...config, provider: p.key})}>
                  <Text style={[styles.radioText, config.provider === p.key && styles.radioTextActive]}>{p.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={[styles.inputRow, isDesktop && styles.desktopInputRow]}>
            <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
              <Text style={styles.label}>Firmen-IBAN</Text>
              <TextInput style={styles.input} value={config.company_iban} onChangeText={(v) => setConfig({...config, company_iban: v})} placeholder="DE89..." placeholderTextColor="#636e72" autoCapitalize="characters" />
            </View>
            <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
              <Text style={styles.label}>Firmen-BIC</Text>
              <TextInput style={styles.input} value={config.company_bic} onChangeText={(v) => setConfig({...config, company_bic: v})} placeholder="COBADEFFXXX" placeholderTextColor="#636e72" autoCapitalize="characters" />
            </View>
          </View>

          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchLabel}>Auto-Zahlung nach Genehmigung</Text>
              <Text style={styles.switchHint}>Überweisungen automatisch nach Genehmigung auslösen</Text>
            </View>
            <Switch value={config.auto_payment_on_approval} onValueChange={(v) => setConfig({...config, auto_payment_on_approval: v})}
              trackColor={{ false: '#2d2d44', true: '#0984e330' }} thumbColor={config.auto_payment_on_approval ? '#0984e3' : '#636e72'} />
          </View>

          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchLabel}>4-Augen-Prinzip</Text>
              <Text style={styles.switchHint}>Zahlungen müssen von zweiter Person bestätigt werden</Text>
            </View>
            <Switch value={config.require_4_eyes} onValueChange={(v) => setConfig({...config, require_4_eyes: v})}
              trackColor={{ false: '#2d2d44', true: '#0984e330' }} thumbColor={config.require_4_eyes ? '#0984e3' : '#636e72'} />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Max. Auto-Zahlungsbetrag (EUR)</Text>
            <TextInput style={styles.input} value={String(config.max_auto_amount || '')} onChangeText={(v) => setConfig({...config, max_auto_amount: parseFloat(v) || 0})} placeholder="10000" placeholderTextColor="#636e72" keyboardType="numeric" />
          </View>

          <TouchableOpacity style={styles.saveBtn} onPress={saveConfig} disabled={saving}>
            {saving ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="save" size={18} color="#fff" />}
            <Text style={styles.saveBtnText}>Banking speichern</Text>
          </TouchableOpacity>
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
  radioGroup: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  radioButton: { flex: 1, minWidth: 80, backgroundColor: '#0f0f1a', borderRadius: 10, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#2d2d44' },
  radioButtonActive: { backgroundColor: '#0984e330', borderColor: '#0984e3' },
  radioText: { fontSize: 13, color: '#a0a0a0', fontWeight: '600' },
  radioTextActive: { color: '#0984e3' },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0984e3', borderRadius: 8, padding: 12, gap: 8, marginTop: 12 },
  saveBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
