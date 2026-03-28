import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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

interface Props {
  isDesktop: boolean;
  showToast: (type: 'success' | 'error', message: string) => void;
}

export default function WorkflowSettingsSection({ isDesktop, showToast }: Props) {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');

  useEffect(() => {
    loadWorkflows();
  }, []);

  const loadWorkflows = async () => {
    try {
      const response = await axios.get(`${BACKEND_URL}/api/workflows`);
      setWorkflows(response.data || []);
    } catch (e) {
      console.log('Could not load workflows');
    }
  };

  const createWorkflow = async () => {
    if (!name) { showToast('error', 'Bitte Workflow-Namen eingeben'); return; }
    try {
      const workflow = {
        name,
        description: `Mehrstufiger Workflow ab ${minAmount || '0'}\u20ac`,
        stages: [
          { stage_name: 'Manager-Freigabe', required_role: 'manager' },
          { stage_name: 'Buchhaltung-Freigabe', required_role: 'accountant' },
        ],
        min_amount: parseFloat(minAmount) || 0,
        max_amount: maxAmount ? parseFloat(maxAmount) : null,
      };
      const response = await axios.post(`${BACKEND_URL}/api/workflows`, workflow);
      setWorkflows([...workflows, response.data]);
      setShowForm(false);
      setName(''); setMinAmount(''); setMaxAmount('');
      showToast('success', 'Workflow erstellt');
    } catch (error) {
      showToast('error', 'Workflow konnte nicht erstellt werden');
    }
  };

  const deleteWorkflow = async (id: string) => {
    try {
      await axios.delete(`${BACKEND_URL}/api/workflows/${id}`);
      setWorkflows(workflows.filter(w => w.id !== id));
    } catch (error) {
      showToast('error', 'Workflow konnte nicht gel\u00f6scht werden');
    }
  };

  return (
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
                {workflow.stages.length} Stufen \u2022 Ab {workflow.min_amount}\u20ac
                {workflow.max_amount ? ` bis ${workflow.max_amount}\u20ac` : ''}
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

      {!showForm ? (
        <TouchableOpacity style={styles.addButton} onPress={() => setShowForm(true)}>
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={styles.addButtonText}>Workflow hinzuf\u00fcgen</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.workflowForm}>
          <TextInput style={styles.input} value={name} onChangeText={setName}
            placeholder="Workflow-Name" placeholderTextColor="#636e72" />
          <View style={[styles.inputRow, { marginTop: 8 }]}>
            <TextInput style={[styles.input, { flex: 1, marginRight: 8 }]}
              value={minAmount} onChangeText={setMinAmount}
              placeholder="Min. Betrag (\u20ac)" placeholderTextColor="#636e72" keyboardType="numeric" />
            <TextInput style={[styles.input, { flex: 1, marginLeft: 8 }]}
              value={maxAmount} onChangeText={setMaxAmount}
              placeholder="Max. Betrag (\u20ac)" placeholderTextColor="#636e72" keyboardType="numeric" />
          </View>
          <Text style={styles.workflowHint}>Standard: Manager \u2192 Buchhaltung (2 Stufen)</Text>
          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.cancelButton} onPress={() => setShowForm(false)}>
              <Text style={styles.cancelButtonText}>Abbrechen</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.addButton} onPress={createWorkflow}>
              <Text style={styles.addButtonText}>Erstellen</Text>
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
  workflowItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#2d2d44' },
  workflowInfo: { flex: 1 },
  workflowName: { fontSize: 15, fontWeight: '600', color: '#fff' },
  workflowDesc: { fontSize: 13, color: '#a0a0a0', marginTop: 2 },
  workflowActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#636e72' },
  statusDotActive: { backgroundColor: '#55efc4' },
  emptyText: { color: '#636e72', fontSize: 14, textAlign: 'center', paddingVertical: 20 },
  addButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#6c5ce7', borderRadius: 10, padding: 14, marginTop: 12, gap: 8 },
  addButtonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  workflowForm: { marginTop: 12 },
  input: { backgroundColor: '#0f0f1a', borderRadius: 10, padding: 14, fontSize: 15, color: '#fff', borderWidth: 1, borderColor: '#2d2d44' },
  inputRow: { flexDirection: 'row' },
  workflowHint: { fontSize: 12, color: '#636e72', marginTop: 8 },
  buttonRow: { flexDirection: 'row', gap: 12, marginTop: 12 },
  cancelButton: { flex: 1, backgroundColor: '#2d2d44', borderRadius: 10, padding: 14, alignItems: 'center' },
  cancelButtonText: { color: '#a0a0a0', fontSize: 14, fontWeight: '600' },
});
