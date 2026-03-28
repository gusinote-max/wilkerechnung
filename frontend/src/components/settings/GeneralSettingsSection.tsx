import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput,
  ActivityIndicator, Modal, FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiService, Settings } from '../../services/api';

interface Props {
  initialSettings: Settings | null;
  isDesktop: boolean;
  showToast: (type: 'success' | 'error', message: string) => void;
}

export default function GeneralSettingsSection({ initialSettings, isDesktop, showToast }: Props) {
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [aiModels, setAiModels] = useState<Array<{id: string, name: string, pricing_prompt: string, pricing_completion: string}>>([]);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [companyIban, setCompanyIban] = useState('');
  const [companyBic, setCompanyBic] = useState('');
  const [kontenrahmen, setKontenrahmen] = useState('SKR03');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initialSettings) {
      setApiKey(initialSettings.ai_settings.api_key || '');
      setModel(initialSettings.ai_settings.model || 'openai/gpt-4o');
      setCompanyName(initialSettings.company_name || '');
      setCompanyIban(initialSettings.company_iban || '');
      setCompanyBic(initialSettings.company_bic || '');
      setKontenrahmen(initialSettings.default_kontenrahmen || 'SKR03');
    }
  }, [initialSettings]);

  useEffect(() => {
    loadAiModels();
  }, []);

  const loadAiModels = async () => {
    try {
      const modelsData = await apiService.getAIModels();
      setAiModels(modelsData);
    } catch (e) {
      console.log('Could not load AI models');
    }
  };

  const saveSettings = async () => {
    if (!initialSettings) return;
    setSaving(true);
    try {
      const updatedSettings: Settings = {
        ...initialSettings,
        ai_settings: { provider: 'openrouter', api_key: apiKey, model: model },
        company_name: companyName,
        company_iban: companyIban,
        company_bic: companyBic,
        default_kontenrahmen: kontenrahmen,
      };
      await apiService.updateSettings(updatedSettings);
      showToast('success', 'Einstellungen wurden gespeichert');
    } catch (error) {
      showToast('error', 'Einstellungen konnten nicht gespeichert werden');
    } finally {
      setSaving(false);
    }
  };

  const filteredModels = aiModels.filter(m => {
    if (!modelSearch) return true;
    const q = modelSearch.toLowerCase();
    return m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q);
  });

  return (
    <View>
      {/* KI-Einstellungen */}
      <View style={[styles.section, isDesktop && styles.desktopSection]}>
        <View style={styles.sectionHeader}>
          <Ionicons name="flash" size={20} color="#6c5ce7" />
          <Text style={styles.sectionTitle}>KI-Einstellungen</Text>
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>OpenRouter API Key</Text>
          <TextInput style={styles.input} value={apiKey} onChangeText={setApiKey}
            placeholder="sk-or-..." placeholderTextColor="#636e72" secureTextEntry autoCapitalize="none" />
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>KI-Modell (Vision)</Text>
          <TouchableOpacity style={styles.modelPickerButton} onPress={() => { setModelSearch(''); setShowModelPicker(true); }}>
            <Ionicons name="sparkles" size={18} color="#6c5ce7" />
            <Text style={styles.modelPickerText} numberOfLines={1}>
              {aiModels.find(m => m.id === model)?.name || model || 'Modell wählen...'}
            </Text>
            <Ionicons name="chevron-down" size={18} color="#636e72" />
          </TouchableOpacity>
          <Text style={styles.modelHint}>{aiModels.length} Modelle verfügbar via OpenRouter</Text>
        </View>
      </View>

      {/* Firmendaten */}
      <View style={[styles.section, isDesktop && styles.desktopSection]}>
        <View style={styles.sectionHeader}>
          <Ionicons name="business" size={20} color="#00cec9" />
          <Text style={styles.sectionTitle}>Firmendaten</Text>
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Firmenname</Text>
          <TextInput style={styles.input} value={companyName} onChangeText={setCompanyName}
            placeholder="Meine Firma GmbH" placeholderTextColor="#636e72" />
        </View>
        <View style={[styles.inputRow, isDesktop && styles.desktopInputRow]}>
          <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
            <Text style={styles.label}>IBAN</Text>
            <TextInput style={styles.input} value={companyIban} onChangeText={setCompanyIban}
              placeholder="DE89..." placeholderTextColor="#636e72" autoCapitalize="characters" />
          </View>
          <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
            <Text style={styles.label}>BIC</Text>
            <TextInput style={styles.input} value={companyBic} onChangeText={setCompanyBic}
              placeholder="COBADEFFXXX" placeholderTextColor="#636e72" autoCapitalize="characters" />
          </View>
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Standard-Kontenrahmen</Text>
          <View style={styles.radioGroup}>
            <TouchableOpacity style={[styles.radioButton, kontenrahmen === 'SKR03' && styles.radioButtonActive]}
              onPress={() => setKontenrahmen('SKR03')}>
              <Text style={[styles.radioText, kontenrahmen === 'SKR03' && styles.radioTextActive]}>SKR03</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.radioButton, kontenrahmen === 'SKR04' && styles.radioButtonActive]}
              onPress={() => setKontenrahmen('SKR04')}>
              <Text style={[styles.radioText, kontenrahmen === 'SKR04' && styles.radioTextActive]}>SKR04</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Save Button */}
      <TouchableOpacity style={[styles.saveButton, isDesktop && styles.desktopSection]} onPress={saveSettings} disabled={saving}>
        {saving ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="save" size={20} color="#fff" />
            <Text style={styles.saveButtonText}>Einstellungen speichern</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Model Picker Modal */}
      <Modal visible={showModelPicker} animationType="slide" transparent onRequestClose={() => setShowModelPicker(false)}>
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
              data={filteredModels}
              keyExtractor={(item) => item.id}
              style={{ maxHeight: 400 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.modelItem, model === item.id && styles.modelItemActive]}
                  onPress={() => { setModel(item.id); setShowModelPicker(false); }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modelName}>{item.name}</Text>
                    <Text style={styles.modelId}>{item.id}</Text>
                  </View>
                  {model === item.id && <Ionicons name="checkmark-circle" size={22} color="#6c5ce7" />}
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text style={styles.emptyText}>Keine Modelle gefunden</Text>}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { backgroundColor: '#1a1a2e', marginHorizontal: 16, marginTop: 16, borderRadius: 16, padding: 20 },
  desktopSection: { marginHorizontal: 0 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 10 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  inputGroup: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', color: '#a0a0a0', marginBottom: 8 },
  input: { backgroundColor: '#0f0f1a', borderRadius: 10, padding: 14, fontSize: 15, color: '#fff', borderWidth: 1, borderColor: '#2d2d44' },
  inputRow: { flexDirection: 'row' },
  desktopInputRow: { flexDirection: 'row' },
  modelPickerButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0f0f1a', borderRadius: 10, padding: 14, borderWidth: 1, borderColor: '#2d2d44', gap: 10 },
  modelPickerText: { flex: 1, fontSize: 15, color: '#fff' },
  modelHint: { fontSize: 12, color: '#636e72', marginTop: 6 },
  radioGroup: { flexDirection: 'row', gap: 12 },
  radioButton: { flex: 1, backgroundColor: '#0f0f1a', borderRadius: 10, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#2d2d44' },
  radioButtonActive: { backgroundColor: '#6c5ce730', borderColor: '#6c5ce7' },
  radioText: { fontSize: 15, color: '#a0a0a0', fontWeight: '600' },
  radioTextActive: { color: '#6c5ce7' },
  saveButton: { backgroundColor: '#6c5ce7', marginHorizontal: 16, marginTop: 16, borderRadius: 12, padding: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#1a1a2e', borderRadius: 16, padding: 20, maxWidth: 500, alignSelf: 'center', width: '100%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  modelSearchInput: { backgroundColor: '#0f0f1a', borderRadius: 10, padding: 14, fontSize: 15, color: '#fff', borderWidth: 1, borderColor: '#2d2d44', marginBottom: 12 },
  modelItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: '#2d2d44' },
  modelItemActive: { backgroundColor: '#6c5ce715' },
  modelName: { fontSize: 14, fontWeight: '600', color: '#fff' },
  modelId: { fontSize: 12, color: '#636e72', marginTop: 2 },
  emptyText: { color: '#636e72', fontSize: 14, textAlign: 'center', paddingVertical: 20 },
});
