import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput,
  ScrollView, ActivityIndicator, Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiService, CostCenter } from '../../services/api';

interface Props {
  isDesktop: boolean;
  showToast: (type: 'success' | 'error', message: string) => void;
}

export default function KostenstellenSection({ isDesktop, showToast }: Props) {
  const [centers, setCenters] = useState<CostCenter[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  // Form state
  const [formNumber, setFormNumber] = useState('');
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [showForm, setShowForm] = useState(false);

  const load = async () => {
    try {
      // Fetch all including inactive
      const data = await apiService.getCostCenters();
      setCenters(data);
    } catch { showToast('error', 'Kostenstellen konnten nicht geladen werden'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const resetForm = () => {
    setFormNumber('');
    setFormName('');
    setFormDescription('');
    setEditId(null);
    setShowForm(false);
  };

  const startEdit = (c: CostCenter) => {
    setFormNumber(c.number);
    setFormName(c.name);
    setFormDescription(c.description || '');
    setEditId(c.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formNumber.trim() || !formName.trim()) {
      showToast('error', 'Nummer und Name sind Pflichtfelder');
      return;
    }
    setSaving(true);
    try {
      if (editId) {
        await apiService.updateCostCenter(editId, {
          number: formNumber.trim(),
          name: formName.trim(),
          description: formDescription.trim(),
        });
        showToast('success', 'Kostenstelle aktualisiert');
      } else {
        await apiService.createCostCenter({
          number: formNumber.trim(),
          name: formName.trim(),
          description: formDescription.trim(),
          active: true,
        });
        showToast('success', 'Kostenstelle angelegt');
      }
      resetForm();
      await load();
    } catch { showToast('error', 'Speichern fehlgeschlagen'); }
    finally { setSaving(false); }
  };

  const handleToggleActive = async (c: CostCenter) => {
    try {
      await apiService.updateCostCenter(c.id, { active: !c.active });
      await load();
    } catch { showToast('error', 'Aktualisierung fehlgeschlagen'); }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiService.deleteCostCenter(id);
      showToast('success', 'Kostenstelle gelöscht');
      await load();
    } catch { showToast('error', 'Löschen fehlgeschlagen'); }
  };

  const active = centers.filter(c => c.active);
  const inactive = centers.filter(c => !c.active);

  return (
    <View style={[styles.section, isDesktop && styles.desktopSection]}>
      {/* Header */}
      <View style={styles.sectionHeader}>
        <Ionicons name="git-branch" size={20} color="#6c5ce7" />
        <Text style={styles.sectionTitle}>Kostenstellen</Text>
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => { resetForm(); setShowForm(true); }}
        >
          <Ionicons name="add" size={16} color="#fff" />
          <Text style={styles.addBtnText}>Neu</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.hint}>
        Kostenstellen werden bei der Kontierung einer Rechnung zugewiesen und ermöglichen die interne Kostenverteilung.
      </Text>

      {/* Form */}
      {showForm && (
        <View style={styles.form}>
          <Text style={styles.formTitle}>{editId ? 'Kostenstelle bearbeiten' : 'Neue Kostenstelle'}</Text>
          <View style={[styles.formRow, isDesktop && styles.desktopFormRow]}>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.label}>Nummer *</Text>
              <TextInput
                style={styles.input}
                value={formNumber}
                onChangeText={setFormNumber}
                placeholder="z.B. 1000"
                placeholderTextColor="#636e72"
                keyboardType="numeric"
              />
            </View>
            <View style={[styles.inputGroup, { flex: 3 }]}>
              <Text style={styles.label}>Bezeichnung *</Text>
              <TextInput
                style={styles.input}
                value={formName}
                onChangeText={setFormName}
                placeholder="z.B. Werkstatt"
                placeholderTextColor="#636e72"
              />
            </View>
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Beschreibung</Text>
            <TextInput
              style={styles.input}
              value={formDescription}
              onChangeText={setFormDescription}
              placeholder="Optional"
              placeholderTextColor="#636e72"
            />
          </View>
          <View style={styles.formButtons}>
            <TouchableOpacity style={styles.primaryBtn} onPress={handleSave} disabled={saving}>
              <Text style={styles.primaryBtnText}>{saving ? 'Speichert...' : editId ? 'Aktualisieren' : 'Anlegen'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={resetForm}>
              <Text style={styles.cancelBtnText}>Abbrechen</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* List */}
      {loading ? (
        <ActivityIndicator color="#6c5ce7" style={{ marginVertical: 16 }} />
      ) : centers.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="git-branch-outline" size={40} color="#2d2d44" />
          <Text style={styles.emptyText}>Noch keine Kostenstellen angelegt.</Text>
          <Text style={styles.emptyHint}>Legen Sie Kostenstellen an, um Rechnungen intern zuzuordnen.</Text>
        </View>
      ) : (
        <View>
          {active.length > 0 && (
            <>
              <Text style={styles.groupLabel}>AKTIV ({active.length})</Text>
              {active.map(c => (
                <CostCenterRow
                  key={c.id}
                  center={c}
                  onEdit={() => startEdit(c)}
                  onToggle={() => handleToggleActive(c)}
                  onDelete={() => handleDelete(c.id)}
                />
              ))}
            </>
          )}
          {inactive.length > 0 && (
            <>
              <Text style={[styles.groupLabel, { marginTop: 12 }]}>INAKTIV ({inactive.length})</Text>
              {inactive.map(c => (
                <CostCenterRow
                  key={c.id}
                  center={c}
                  onEdit={() => startEdit(c)}
                  onToggle={() => handleToggleActive(c)}
                  onDelete={() => handleDelete(c.id)}
                />
              ))}
            </>
          )}
        </View>
      )}
    </View>
  );
}

function CostCenterRow({ center, onEdit, onToggle, onDelete }: {
  center: CostCenter;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <View style={[styles.row, !center.active && styles.rowInactive]}>
      <View style={styles.rowNumber}>
        <Text style={styles.rowNumberText}>{center.number}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowName}>{center.name}</Text>
        {center.description ? (
          <Text style={styles.rowDesc} numberOfLines={1}>{center.description}</Text>
        ) : null}
      </View>
      <Switch
        value={center.active}
        onValueChange={onToggle}
        trackColor={{ false: '#2d2d44', true: '#6c5ce730' }}
        thumbColor={center.active ? '#6c5ce7' : '#636e72'}
        style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
      />
      <TouchableOpacity style={styles.rowEditBtn} onPress={onEdit}>
        <Ionicons name="pencil-outline" size={16} color="#a0a0a0" />
      </TouchableOpacity>
      <TouchableOpacity style={styles.rowDeleteBtn} onPress={onDelete}>
        <Ionicons name="trash-outline" size={15} color="#d63031" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { backgroundColor: '#1a1a2e', marginHorizontal: 16, marginTop: 16, borderRadius: 16, padding: 20 },
  desktopSection: { marginHorizontal: 0 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 10 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  hint: { fontSize: 13, color: '#636e72', marginBottom: 16, lineHeight: 18 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#6c5ce7', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
  addBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  form: { backgroundColor: '#0f0f1a', borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#2d2d44' },
  formTitle: { fontSize: 15, fontWeight: '700', color: '#fff', marginBottom: 12 },
  formRow: { flexDirection: 'column', gap: 0 },
  desktopFormRow: { flexDirection: 'row', gap: 12 },
  inputGroup: { marginBottom: 12 },
  label: { fontSize: 12, fontWeight: '600', color: '#a0a0a0', marginBottom: 6 },
  input: { backgroundColor: '#1a1a2e', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#fff', borderWidth: 1, borderColor: '#2d2d44' },
  formButtons: { flexDirection: 'row', gap: 10, marginTop: 4 },
  primaryBtn: { flex: 1, backgroundColor: '#6c5ce7', borderRadius: 8, padding: 12, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  cancelBtn: { flex: 1, backgroundColor: '#2d2d44', borderRadius: 8, padding: 12, alignItems: 'center' },
  cancelBtnText: { color: '#a0a0a0', fontWeight: '600', fontSize: 14 },
  emptyState: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  emptyText: { fontSize: 15, color: '#fff', fontWeight: '600' },
  emptyHint: { fontSize: 13, color: '#636e72', textAlign: 'center' },
  groupLabel: { fontSize: 11, fontWeight: '700', color: '#636e72', letterSpacing: 1, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0f0f1a', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 8, gap: 10, borderWidth: 1, borderColor: '#2d2d44' },
  rowInactive: { opacity: 0.5 },
  rowNumber: { backgroundColor: '#6c5ce720', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, minWidth: 48, alignItems: 'center' },
  rowNumberText: { fontSize: 13, fontWeight: '700', color: '#6c5ce7' },
  rowName: { fontSize: 14, fontWeight: '600', color: '#fff' },
  rowDesc: { fontSize: 12, color: '#636e72', marginTop: 2 },
  rowEditBtn: { padding: 6 },
  rowDeleteBtn: { padding: 6 },
});
