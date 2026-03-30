import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Platform, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { useFocusEffect } from 'expo-router';
import { useAuthStore } from '../../src/store/authStore';
import { SafeAreaView } from 'react-native-safe-area-context';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
const SCREEN_WIDTH = Dimensions.get('window').width;

type AiStatus = 'pending' | 'checking' | 'invoice' | 'not_invoice' | 'uncertain';

interface Attachment {
  filename: string;
  content_type: string;
  size_bytes: number;
}

interface EmailItem {
  id: string;
  uid: string;
  subject: string;
  sender: string;
  date: string;
  attachments: Attachment[];
  ai_status: AiStatus;
  ai_confidence: number;
  ai_details: {
    document_type?: string;
    vendor_name?: string;
    gross_amount?: number;
    reason?: string;
  } | null;
  imported: boolean;
  invoice_id?: string;
}

const AI_BADGE: Record<AiStatus, { color: string; bg: string; icon: string; label: string }> = {
  pending:     { color: '#636e72', bg: '#636e7220', icon: 'time-outline',          label: 'Ausstehend' },
  checking:    { color: '#fdcb6e', bg: '#fdcb6e20', icon: 'hourglass-outline',     label: 'KI prüft...' },
  invoice:     { color: '#00b894', bg: '#00b89420', icon: 'checkmark-circle',      label: 'Eingangsrechnung' },
  not_invoice: { color: '#d63031', bg: '#d6303120', icon: 'close-circle',          label: 'Kein Rechnungsbeleg' },
  uncertain:   { color: '#fdcb6e', bg: '#fdcb6e20', icon: 'help-circle',           label: 'Unsicher' },
};

function formatDate(dateStr: string) {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return dateStr; }
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function EmailInboxScreen() {
  const { token } = useAuthStore();
  const headers = { Authorization: `Bearer ${token}` };
  const isDesktop = Platform.OS === 'web' && SCREEN_WIDTH > 900;

  const [emails, setEmails] = useState<EmailItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [polling, setPolling] = useState(false);
  const [filter, setFilter] = useState<string>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  const loadEmails = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const params = filter !== 'all' ? { status_filter: filter } : {};
      const { data } = await axios.get<EmailItem[]>(`${BACKEND_URL}/api/email-inbox`, { headers, params });
      setEmails(data);
    } catch (e) {
      showToast('error', 'Posteingang konnte nicht geladen werden');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter, token]);

  useFocusEffect(useCallback(() => { loadEmails(); }, [loadEmails]));

  const onRefresh = () => { setRefreshing(true); loadEmails(true); };

  const handlePoll = async () => {
    setPolling(true);
    try {
      const { data } = await axios.post(`${BACKEND_URL}/api/email-inbox/poll`, null, { headers });
      showToast('success', data.message);
      await loadEmails(true);
    } catch {
      showToast('error', 'Abruf fehlgeschlagen');
    } finally {
      setPolling(false);
    }
  };

  const handleAiCheck = async (itemId: string) => {
    setActionLoading(`ai_${itemId}`);
    try {
      await axios.post(`${BACKEND_URL}/api/email-inbox/${itemId}/ai-check`, null, { headers });
      showToast('success', 'KI-Prüfung gestartet');
      // Poll for result
      setTimeout(() => loadEmails(true), 4000);
      setTimeout(() => loadEmails(true), 9000);
    } catch {
      showToast('error', 'KI-Prüfung fehlgeschlagen');
    } finally {
      setActionLoading(null);
    }
  };

  const handleImport = async (itemId: string) => {
    setActionLoading(`import_${itemId}`);
    try {
      const { data } = await axios.post(`${BACKEND_URL}/api/email-inbox/${itemId}/import`, null, { headers });
      showToast('success', `Rechnung erfolgreich importiert`);
      await loadEmails(true);
    } catch (e: any) {
      showToast('error', e.response?.data?.detail || 'Import fehlgeschlagen');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (itemId: string) => {
    setActionLoading(`del_${itemId}`);
    try {
      await axios.delete(`${BACKEND_URL}/api/email-inbox/${itemId}`, { headers });
      setEmails((prev) => prev.filter((e) => e.id !== itemId));
    } catch {
      showToast('error', 'Löschen fehlgeschlagen');
    } finally {
      setActionLoading(null);
    }
  };

  const FILTERS = [
    { key: 'all', label: 'Alle' },
    { key: 'invoice', label: '✅ Rechnung' },
    { key: 'uncertain', label: '⚠️ Unsicher' },
    { key: 'pending', label: '⏳ Ausstehend' },
    { key: 'not_invoice', label: '❌ Kein Beleg' },
  ];

  const renderEmailCard = (item: EmailItem) => {
    const badge = AI_BADGE[item.ai_status] || AI_BADGE.pending;
    const isImporting = actionLoading === `import_${item.id}`;
    const isChecking = actionLoading === `ai_${item.id}`;
    const isDeleting = actionLoading === `del_${item.id}`;

    return (
      <View key={item.id} style={[styles.card, item.imported && styles.cardImported]}>
        {/* Header row */}
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <View style={[styles.aiBadge, { backgroundColor: badge.bg }]}>
              <Ionicons name={badge.icon as any} size={13} color={badge.color} />
              <Text style={[styles.aiBadgeText, { color: badge.color }]}>{badge.label}</Text>
              {item.ai_confidence > 0 && (
                <Text style={[styles.aiConf, { color: badge.color }]}>
                  {Math.round(item.ai_confidence * 100)}%
                </Text>
              )}
            </View>
            {item.imported && (
              <View style={styles.importedBadge}>
                <Ionicons name="checkmark-done" size={12} color="#6c5ce7" />
                <Text style={styles.importedText}>Importiert</Text>
              </View>
            )}
          </View>
          <Text style={styles.dateText}>{formatDate(item.date)}</Text>
        </View>

        {/* Subject & Sender */}
        <Text style={styles.subject} numberOfLines={2}>{item.subject}</Text>
        <Text style={styles.sender} numberOfLines={1}>Von: {item.sender}</Text>

        {/* AI Details */}
        {item.ai_details && item.ai_status !== 'not_invoice' && (
          <View style={styles.aiDetails}>
            {item.ai_details.document_type && (
              <Text style={styles.aiDetailText}>📄 {item.ai_details.document_type}</Text>
            )}
            {item.ai_details.vendor_name && (
              <Text style={styles.aiDetailText}>🏢 {item.ai_details.vendor_name}</Text>
            )}
            {item.ai_details.gross_amount ? (
              <Text style={styles.aiDetailText}>
                💶 {item.ai_details.gross_amount.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
              </Text>
            ) : null}
            {item.ai_details.reason && (
              <Text style={styles.aiReasonText} numberOfLines={2}>{item.ai_details.reason}</Text>
            )}
          </View>
        )}

        {/* Attachments */}
        <View style={styles.attachments}>
          {item.attachments.map((att, i) => (
            <View key={i} style={styles.attachChip}>
              <Ionicons
                name={att.content_type.includes('pdf') ? 'document-text' : 'image'}
                size={12}
                color="#a0a0a0"
              />
              <Text style={styles.attachName} numberOfLines={1}>{att.filename}</Text>
              <Text style={styles.attachSize}>{formatBytes(att.size_bytes)}</Text>
            </View>
          ))}
        </View>

        {/* Actions */}
        {!item.imported && (
          <View style={styles.actions}>
            {item.ai_status === 'pending' && (
              <TouchableOpacity
                style={styles.actionBtnSecondary}
                onPress={() => handleAiCheck(item.id)}
                disabled={!!actionLoading}
              >
                {isChecking
                  ? <ActivityIndicator size="small" color="#6c5ce7" />
                  : <Ionicons name="sparkles" size={14} color="#6c5ce7" />}
                <Text style={styles.actionBtnSecondaryText}>KI prüfen</Text>
              </TouchableOpacity>
            )}
            {(item.ai_status === 'invoice' || item.ai_status === 'uncertain') && (
              <TouchableOpacity
                style={[styles.actionBtnPrimary, isImporting && styles.actionBtnDisabled]}
                onPress={() => handleImport(item.id)}
                disabled={!!actionLoading}
              >
                {isImporting
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Ionicons name="cloud-download" size={14} color="#fff" />}
                <Text style={styles.actionBtnPrimaryText}>
                  {isImporting ? 'Importiert...' : 'Als Rechnung importieren'}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.actionBtnDelete}
              onPress={() => handleDelete(item.id)}
              disabled={!!actionLoading}
            >
              {isDeleting
                ? <ActivityIndicator size="small" color="#d63031" />
                : <Ionicons name="trash-outline" size={14} color="#d63031" />}
            </TouchableOpacity>
          </View>
        )}
        {item.imported && (
          <View style={styles.importedInfo}>
            <Ionicons name="checkmark-circle" size={14} color="#6c5ce7" />
            <Text style={styles.importedInfoText}>Rechnung wurde erfolgreich importiert</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Toast */}
      {toast && (
        <View style={[styles.toast, toast.type === 'success' ? styles.toastSuccess : styles.toastError]}>
          <Ionicons name={toast.type === 'success' ? 'checkmark-circle' : 'alert-circle'} size={16} color="#fff" />
          <Text style={styles.toastText}>{toast.msg}</Text>
        </View>
      )}

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>📧 E-Mail Posteingang</Text>
          <Text style={styles.headerSub}>{emails.length} E-Mail(s) mit Anhängen</Text>
        </View>
        <TouchableOpacity style={[styles.pollBtn, polling && styles.pollBtnDisabled]} onPress={handlePoll} disabled={polling}>
          {polling ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="refresh" size={18} color="#fff" />}
          <Text style={styles.pollBtnText}>{polling ? 'Abruf...' : 'Jetzt abrufen'}</Text>
        </TouchableOpacity>
      </View>

      {/* Filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterContainer}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[styles.filterText, filter === f.key && styles.filterTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Content */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#6c5ce7" />
          <Text style={styles.loadingText}>Lade Posteingang...</Text>
        </View>
      ) : emails.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="mail-open-outline" size={56} color="#2d2d44" />
          <Text style={styles.emptyTitle}>Kein Posteingang</Text>
          <Text style={styles.emptyText}>
            {filter !== 'all'
              ? 'Keine E-Mails für diesen Filter gefunden.'
              : 'IMAP konfigurieren und auf "Jetzt abrufen" klicken.'}
          </Text>
          {filter === 'all' && (
            <TouchableOpacity style={styles.settingsHint} onPress={handlePoll}>
              <Ionicons name="settings-outline" size={14} color="#6c5ce7" />
              <Text style={styles.settingsHintText}>IMAP-Einstellungen → Einstellungen → E-Mail</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={[styles.listContent, isDesktop && styles.desktopListContent]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6c5ce7" />}
        >
          {emails.map(renderEmailCard)}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f1a' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#1a1a2e', borderBottomWidth: 1, borderBottomColor: '#2d2d44' },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  headerSub: { fontSize: 13, color: '#636e72', marginTop: 2 },
  pollBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#6c5ce7', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10 },
  pollBtnDisabled: { opacity: 0.6 },
  pollBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  filterScroll: { maxHeight: 50, backgroundColor: '#1a1a2e' },
  filterContainer: { paddingHorizontal: 16, paddingVertical: 10, gap: 8, flexDirection: 'row' },
  filterChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: '#2d2d44', backgroundColor: '#0f0f1a' },
  filterChipActive: { borderColor: '#6c5ce7', backgroundColor: '#6c5ce720' },
  filterText: { fontSize: 13, color: '#636e72' },
  filterTextActive: { color: '#6c5ce7', fontWeight: '600' },
  list: { flex: 1 },
  listContent: { padding: 16, gap: 12 },
  desktopListContent: { maxWidth: 900, alignSelf: 'center', width: '100%' },
  card: { backgroundColor: '#1a1a2e', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#2d2d44' },
  cardImported: { borderColor: '#6c5ce740', opacity: 0.85 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  cardHeaderLeft: { flexDirection: 'row', gap: 8, flex: 1, flexWrap: 'wrap' },
  aiBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  aiBadgeText: { fontSize: 12, fontWeight: '600' },
  aiConf: { fontSize: 11, opacity: 0.8 },
  importedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#6c5ce720', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  importedText: { fontSize: 11, color: '#6c5ce7', fontWeight: '600' },
  dateText: { fontSize: 11, color: '#636e72', marginLeft: 8 },
  subject: { fontSize: 15, fontWeight: '600', color: '#fff', marginBottom: 4 },
  sender: { fontSize: 12, color: '#a0a0a0', marginBottom: 10 },
  aiDetails: { backgroundColor: '#0f0f1a', borderRadius: 8, padding: 10, marginBottom: 10, gap: 4 },
  aiDetailText: { fontSize: 13, color: '#dfe6e9' },
  aiReasonText: { fontSize: 12, color: '#a0a0a0', marginTop: 4, fontStyle: 'italic' },
  attachments: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  attachChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#0f0f1a', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: '#2d2d44', maxWidth: 220 },
  attachName: { fontSize: 12, color: '#a0a0a0', flex: 1 },
  attachSize: { fontSize: 11, color: '#636e72' },
  actions: { flexDirection: 'row', gap: 8 },
  actionBtnPrimary: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#00b894', borderRadius: 10, paddingVertical: 10 },
  actionBtnDisabled: { opacity: 0.6 },
  actionBtnPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  actionBtnSecondary: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#6c5ce720', borderRadius: 10, paddingVertical: 10, borderWidth: 1, borderColor: '#6c5ce7' },
  actionBtnSecondaryText: { color: '#6c5ce7', fontWeight: '600', fontSize: 13 },
  actionBtnDelete: { width: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: '#d6303115', borderRadius: 10 },
  importedInfo: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#2d2d44' },
  importedInfoText: { fontSize: 13, color: '#6c5ce7' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 12 },
  loadingText: { color: '#636e72', fontSize: 14, marginTop: 8 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  emptyText: { fontSize: 14, color: '#636e72', textAlign: 'center', lineHeight: 20 },
  settingsHint: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, padding: 12, backgroundColor: '#6c5ce720', borderRadius: 10 },
  settingsHintText: { fontSize: 13, color: '#6c5ce7' },
  toast: { position: 'absolute', top: 60, left: 16, right: 16, zIndex: 999, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, borderRadius: 12 },
  toastSuccess: { backgroundColor: '#00b894' },
  toastError: { backgroundColor: '#d63031' },
  toastText: { color: '#fff', fontWeight: '600', fontSize: 14, flex: 1 },
});
