import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Platform, Dimensions,
  TextInput, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { useFocusEffect, router } from 'expo-router';
import { useAuthStore } from '../../src/store/authStore';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDesktopPadding } from '../../src/hooks/useDesktopPadding';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
const IS_DESKTOP = Platform.OS === 'web' && Dimensions.get('window').width > 900;

type AiStatus = 'pending' | 'checking' | 'invoice' | 'not_invoice' | 'uncertain';

interface Attachment { filename: string; content_type: string; size_bytes: number; }
interface EmailItem {
  id: string; uid: string; subject: string; sender: string; date: string;
  attachments: Attachment[]; ai_status: AiStatus; ai_confidence: number;
  ai_details: { document_type?: string; vendor_name?: string; gross_amount?: number; reason?: string; } | null;
  imported: boolean; archived: boolean; invoice_id?: string; imported_at?: string;
}
interface SenderRule {
  id: string; pattern: string; match_type: string; label: string; action: string;
}
interface ReportItem extends EmailItem {
  invoice_data: { vendor_name: string; invoice_number: string; gross_amount: number; status: string; id: string; } | null;
}
interface Report {
  period: string; since: string; count: number; total_amount: number; items: ReportItem[];
}

const AI_BADGE: Record<AiStatus, { color: string; bg: string; icon: string; label: string }> = {
  pending:     { color: '#636e72', bg: '#636e7220', icon: 'time-outline',      label: 'Ausstehend' },
  checking:    { color: '#fdcb6e', bg: '#fdcb6e20', icon: 'hourglass-outline', label: 'KI prüft...' },
  invoice:     { color: '#00b894', bg: '#00b89420', icon: 'checkmark-circle',  label: 'Rechnung' },
  not_invoice: { color: '#d63031', bg: '#d6303120', icon: 'close-circle',      label: 'Kein Beleg' },
  uncertain:   { color: '#fdcb6e', bg: '#fdcb6e20', icon: 'help-circle',       label: 'Unsicher' },
};

function fmtDate(s: string) {
  try { return new Date(s).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }); }
  catch { return s; }
}
function fmtBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}
function fmtEuro(n: number) {
  return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}

export default function EmailInboxScreen() {
  const { token } = useAuthStore();
  const headers = { Authorization: `Bearer ${token}` };
  const paddingLeft = useDesktopPadding();

  const [emails, setEmails] = useState<EmailItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [polling, setPolling] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // Sender rules
  const [rules, setRules] = useState<SenderRule[]>([]);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [newPattern, setNewPattern] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newMatchType, setNewMatchType] = useState<'domain' | 'email' | 'contains'>('domain');
  const [savingRule, setSavingRule] = useState(false);

  // Expanded cards
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Report
  const [showReport, setShowReport] = useState(false);
  const [reportPeriod, setReportPeriod] = useState<'day' | 'week'>('day');
  const [report, setReport] = useState<Report | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  const loadEmails = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const params: any = { show_archived: showArchived };
      if (statusFilter !== 'all') params.status_filter = statusFilter;
      const { data } = await axios.get<EmailItem[]>(`${BACKEND_URL}/api/email-inbox`, { headers, params });
      setEmails(data);
    } catch { showToast('error', 'Posteingang konnte nicht geladen werden'); }
    finally { setLoading(false); setRefreshing(false); }
  }, [showArchived, statusFilter, token]);

  const loadRules = useCallback(async () => {
    try {
      const { data } = await axios.get<SenderRule[]>(`${BACKEND_URL}/api/email-inbox/sender-rules`, { headers });
      setRules(data);
    } catch {}
  }, [token]);

  useFocusEffect(useCallback(() => {
    loadEmails();
    loadRules();
  }, [loadEmails, loadRules]));

  const onRefresh = () => { setRefreshing(true); loadEmails(true); };

  const handlePoll = async () => {
    setPolling(true);
    try {
      const { data } = await axios.post(`${BACKEND_URL}/api/email-inbox/poll`, null, { headers });
      showToast('success', data.message);
      await loadEmails(true);
    } catch { showToast('error', 'Abruf fehlgeschlagen'); }
    finally { setPolling(false); }
  };

  const loadReport = async (period: 'day' | 'week') => {
    setReportLoading(true);
    try {
      const { data } = await axios.get<Report>(`${BACKEND_URL}/api/email-inbox/report`, { headers, params: { period } });
      setReport(data);
    } catch { showToast('error', 'Bericht konnte nicht geladen werden'); }
    finally { setReportLoading(false); }
  };

  const openReport = () => {
    setShowReport(true);
    loadReport(reportPeriod);
  };

  const toggleSelect = (id: string) => {
    // Only allow selecting non-imported emails
    const item = emails.find(e => e.id === id);
    if (item?.imported) return;
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const totalImportable = emails.filter(e => !e.imported && (e.ai_status === 'invoice' || e.ai_status === 'uncertain'));

  const toggleSelectAll = () => {
    if (selected.size === totalImportable.length) setSelected(new Set());
    else setSelected(new Set(totalImportable.map(e => e.id)));
  };

  const handleBatchImport = async () => {
    if (selected.size === 0) return;
    setBatchLoading(true);
    try {
      const { data } = await axios.post(
        `${BACKEND_URL}/api/email-inbox/batch-import`,
        Array.from(selected),
        { headers }
      );
      showToast('success', `${data.success_count} von ${data.total} erfolgreich importiert`);
      setSelected(new Set());
      setSelectMode(false);
      await loadEmails(true);
    } catch { showToast('error', 'Stapelimport fehlgeschlagen'); }
    finally { setBatchLoading(false); }
  };

  const handleImport = async (itemId: string) => {
    // Double-check not already imported
    const item = emails.find(e => e.id === itemId);
    if (item?.imported) { showToast('error', 'Bereits importiert'); return; }
    setActionLoading(`import_${itemId}`);
    try {
      await axios.post(`${BACKEND_URL}/api/email-inbox/${itemId}/import`, null, { headers });
      showToast('success', 'Rechnung importiert und archiviert ✅');
      await loadEmails(true);
    } catch (e: any) { showToast('error', e.response?.data?.detail || 'Import fehlgeschlagen'); }
    finally { setActionLoading(null); }
  };

  const handleAiCheck = async (itemId: string) => {
    setActionLoading(`ai_${itemId}`);
    try {
      await axios.post(`${BACKEND_URL}/api/email-inbox/${itemId}/ai-check`, null, { headers });
      showToast('success', 'KI-Prüfung gestartet');
      setTimeout(() => loadEmails(true), 4000);
      setTimeout(() => loadEmails(true), 9000);
    } catch { showToast('error', 'KI-Prüfung fehlgeschlagen'); }
    finally { setActionLoading(null); }
  };

  const handleDelete = async (itemId: string) => {
    const item = emails.find(e => e.id === itemId);
    if (item?.imported) { showToast('error', 'Importierte E-Mails können nicht gelöscht werden'); return; }
    setActionLoading(`del_${itemId}`);
    try {
      await axios.delete(`${BACKEND_URL}/api/email-inbox/${itemId}`, { headers });
      setEmails(prev => prev.filter(e => e.id !== itemId));
    } catch { showToast('error', 'Löschen fehlgeschlagen'); }
    finally { setActionLoading(null); }
  };

  const handleAddRule = async () => {
    if (!newPattern.trim()) return;
    setSavingRule(true);
    try {
      await axios.post(`${BACKEND_URL}/api/email-inbox/sender-rules`, null, {
        headers,
        params: { pattern: newPattern.trim(), match_type: newMatchType, label: newLabel.trim(), action: 'trusted' }
      });
      setNewPattern(''); setNewLabel('');
      await loadRules();
      showToast('success', 'Absenderregel hinzugefügt');
    } catch { showToast('error', 'Fehler beim Speichern'); }
    finally { setSavingRule(false); }
  };

  const handleDeleteRule = async (ruleId: string) => {
    try {
      await axios.delete(`${BACKEND_URL}/api/email-inbox/sender-rules/${ruleId}`, { headers });
      setRules(prev => prev.filter(r => r.id !== ruleId));
    } catch { showToast('error', 'Fehler beim Löschen'); }
  };

  const STATUS_FILTERS = [
    { key: 'all', label: 'Alle' },
    { key: 'invoice', label: '✅ Rechnung' },
    { key: 'uncertain', label: '⚠️ Unsicher' },
    { key: 'pending', label: '⏳ Ausstehend' },
    { key: 'not_invoice', label: '❌ Kein Beleg' },
  ];

  const renderCard = (item: EmailItem) => {
    const badge = AI_BADGE[item.ai_status] || AI_BADGE.pending;
    const isSelected  = selected.has(item.id);
    const isExpanded  = expandedIds.has(item.id);
    const isImporting = actionLoading === `import_${item.id}`;
    const isChecking  = actionLoading === `ai_${item.id}`;
    const isDeleting  = actionLoading === `del_${item.id}`;
    const canSelect   = !item.imported && selectMode;

    return (
      <TouchableOpacity
        key={item.id}
        style={[styles.card, isSelected && styles.cardSelected, item.imported && styles.cardImported]}
        onPress={() => {
          if (canSelect) { toggleSelect(item.id); return; }
          toggleExpand(item.id);
        }}
        activeOpacity={0.85}
      >
        {/* ===== ZUSAMMENGEKLAPPT: immer sichtbar ===== */}
        <View style={styles.cardRow}>
          {/* Checkbox im Auswahlmodus */}
          {selectMode && (
            <View style={styles.checkboxWrap}>
              {item.imported
                ? <Ionicons name="lock-closed" size={18} color="#636e72" />
                : <Ionicons name={isSelected ? 'checkbox' : 'square-outline'} size={22} color={isSelected ? '#6c5ce7' : '#636e72'} />
              }
            </View>
          )}

          <View style={{ flex: 1 }}>
            {/* Zeile 1: AI Badge + Datum + Expand-Pfeil */}
            <View style={styles.cardHeader}>
              <View style={[styles.aiBadge, { backgroundColor: badge.bg }]}>
                <Ionicons name={badge.icon as any} size={12} color={badge.color} />
                <Text style={[styles.aiBadgeText, { color: badge.color }]}>{badge.label}</Text>
                {item.ai_confidence > 0 && (
                  <Text style={[styles.aiConf, { color: badge.color }]}>{Math.round(item.ai_confidence * 100)}%</Text>
                )}
              </View>
              {item.imported && (
                <View style={styles.importedBadge}>
                  <Ionicons name="checkmark-done-circle" size={13} color="#6c5ce7" />
                  <Text style={styles.importedBadgeText}>Importiert</Text>
                </View>
              )}
              <Text style={styles.dateText}>{fmtDate(item.date)}</Text>
              <Ionicons
                name={isExpanded ? 'chevron-up' : 'chevron-down'}
                size={15}
                color="#636e72"
                style={{ marginLeft: 4 }}
              />
            </View>

            {/* Zeile 2: Betreff (kompakt) */}
            <Text style={styles.subject} numberOfLines={isExpanded ? undefined : 1}>
              {item.subject}
            </Text>
            {/* Zeile 3: Absender (immer 1 Zeile) */}
            <Text style={styles.sender} numberOfLines={1}>📤 {item.sender}</Text>
          </View>
        </View>

        {/* ===== AUSGEKLAPPT: nur wenn isExpanded ===== */}
        {isExpanded && (
          <View style={styles.expandedBody}>
            {/* Banner: bereits importiert */}
            {item.imported && (
              <View style={styles.alreadyImportedBanner}>
                <Ionicons name="information-circle" size={14} color="#6c5ce7" />
                <Text style={styles.alreadyImportedText}>
                  Importiert am {item.imported_at ? fmtDate(item.imported_at) : '–'}. Kein erneuter Import möglich.
                </Text>
              </View>
            )}

            {/* KI-Details */}
            {item.ai_details && item.ai_status !== 'not_invoice' && (
              <View style={styles.aiDetails}>
                {item.ai_details.vendor_name && <Text style={styles.aiDetailText}>🏢 {item.ai_details.vendor_name}</Text>}
                {item.ai_details.gross_amount ? (
                  <Text style={styles.aiDetailText}>💶 {fmtEuro(item.ai_details.gross_amount)}</Text>
                ) : null}
                {item.ai_details.reason && (
                  <Text style={styles.aiReasonText} numberOfLines={2}>{item.ai_details.reason}</Text>
                )}
              </View>
            )}

            {/* Anhänge */}
            <View style={styles.attachRow}>
              {item.attachments.map((att, i) => (
                <View key={i} style={styles.attachChip}>
                  <Ionicons name={att.content_type?.includes('pdf') ? 'document-text' : 'image'} size={11} color="#a0a0a0" />
                  <Text style={styles.attachName} numberOfLines={1}>{att.filename}</Text>
                  <Text style={styles.attachSize}>{fmtBytes(att.size_bytes)}</Text>
                </View>
              ))}
            </View>

            {/* Aktions-Buttons – nur für nicht importierte */}
            {!item.imported && !selectMode && (
              <View style={styles.actions}>
                {item.ai_status === 'pending' && (
                  <TouchableOpacity style={styles.btnSec} onPress={() => handleAiCheck(item.id)} disabled={!!actionLoading}>
                    {isChecking ? <ActivityIndicator size="small" color="#6c5ce7" /> : <Ionicons name="sparkles" size={13} color="#6c5ce7" />}
                    <Text style={styles.btnSecText}>KI prüfen</Text>
                  </TouchableOpacity>
                )}
                {(item.ai_status === 'invoice' || item.ai_status === 'uncertain') && (
                  <TouchableOpacity
                    style={[styles.btnPrimary, isImporting && { opacity: 0.6 }]}
                    onPress={() => handleImport(item.id)}
                    disabled={!!actionLoading}
                  >
                    {isImporting ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="cloud-download" size={13} color="#fff" />}
                    <Text style={styles.btnPrimaryText}>{isImporting ? 'Importiert...' : 'Importieren'}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.btnDel} onPress={() => handleDelete(item.id)} disabled={!!actionLoading}>
                  {isDeleting ? <ActivityIndicator size="small" color="#d63031" /> : <Ionicons name="trash-outline" size={14} color="#d63031" />}
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { paddingLeft: paddingLeft }]} edges={['bottom']}>
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
          <Text style={styles.headerTitle}>📧 E-Mail Eingang</Text>
          <Text style={styles.headerSub}>{emails.length} E-Mail(s) · {rules.length} Regel(n)</Text>
        </View>
        <View style={styles.headerBtns}>
          <TouchableOpacity style={styles.iconBtn} onPress={openReport}>
            <Ionicons name="bar-chart-outline" size={18} color="#a0a0a0" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={() => setShowRulesModal(true)}>
            <Ionicons name="shield-checkmark-outline" size={18} color="#a0a0a0" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.iconBtn, selectMode && { backgroundColor: '#6c5ce720', borderColor: '#6c5ce7' }]}
            onPress={() => { setSelectMode(!selectMode); setSelected(new Set()); }}
          >
            <Ionicons name="checkbox-outline" size={18} color={selectMode ? '#6c5ce7' : '#a0a0a0'} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.pollBtn, polling && { opacity: 0.6 }]} onPress={handlePoll} disabled={polling}>
            {polling ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="refresh" size={16} color="#fff" />}
            <Text style={styles.pollBtnText}>{polling ? 'Abruf...' : 'Abrufen'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Batch toolbar */}
      {selectMode && (
        <View style={styles.batchBar}>
          <TouchableOpacity onPress={toggleSelectAll}>
            <Text style={styles.batchSelectAll}>
              {selected.size === totalImportable.length && totalImportable.length > 0
                ? 'Alle abwählen'
                : `Alle wählen (${totalImportable.length})`}
            </Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          {selected.size > 0 ? (
            <TouchableOpacity
              style={[styles.batchImportBtn, batchLoading && { opacity: 0.6 }]}
              onPress={handleBatchImport}
              disabled={batchLoading}
            >
              {batchLoading
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name="cloud-download" size={14} color="#fff" />}
              <Text style={styles.batchImportText}>
                {batchLoading ? 'Importiert...' : `${selected.size} importieren`}
              </Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.batchHint}>Rechnungen antippen zum Auswählen</Text>
          )}
        </View>
      )}

      {/* Archive toggle + Status filters */}
      <View style={styles.filterBar}>
        <TouchableOpacity
          style={[styles.archiveToggle, showArchived && styles.archiveToggleActive]}
          onPress={() => { setShowArchived(!showArchived); setSelected(new Set()); }}
        >
          <Ionicons name={showArchived ? 'archive' : 'mail'} size={14} color={showArchived ? '#6c5ce7' : '#636e72'} />
          <Text style={[styles.archiveToggleText, showArchived && { color: '#6c5ce7' }]}>
            {showArchived ? 'Archiv' : 'Eingang'}
          </Text>
        </TouchableOpacity>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
          <View style={styles.filterChips}>
            {STATUS_FILTERS.map(f => (
              <TouchableOpacity
                key={f.key}
                style={[styles.chip, statusFilter === f.key && styles.chipActive]}
                onPress={() => setStatusFilter(f.key)}
              >
                <Text style={[styles.chipText, statusFilter === f.key && styles.chipTextActive]}>{f.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      {/* Email list */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#6c5ce7" />
          <Text style={styles.loadingText}>Lade Posteingang...</Text>
        </View>
      ) : emails.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="mail-open-outline" size={56} color="#2d2d44" />
          <Text style={styles.emptyTitle}>{showArchived ? 'Archiv leer' : 'Posteingang leer'}</Text>
          <Text style={styles.emptyText}>
            {showArchived
              ? 'Noch keine importierten E-Mails im Archiv.'
              : 'Alle E-Mails wurden verarbeitet oder IMAP ist noch nicht konfiguriert.'}
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={[styles.listContent, IS_DESKTOP && styles.desktopContent]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6c5ce7" />}
        >
          {emails.map(renderCard)}
        </ScrollView>
      )}

      {/* ===== SENDER RULES MODAL ===== */}
      <Modal visible={showRulesModal} transparent animationType="slide" onRequestClose={() => setShowRulesModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>🛡️ Absender-Regeln</Text>
              <TouchableOpacity onPress={() => setShowRulesModal(false)}>
                <Ionicons name="close" size={22} color="#fff" />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalHint}>E-Mails von diesen Absendern werden sofort als Eingangsrechnung erkannt.</Text>
            <View style={styles.ruleForm}>
              <View style={styles.ruleMatchRow}>
                {(['domain', 'email', 'contains'] as const).map(mt => (
                  <TouchableOpacity
                    key={mt}
                    style={[styles.matchChip, newMatchType === mt && styles.matchChipActive]}
                    onPress={() => setNewMatchType(mt)}
                  >
                    <Text style={[styles.matchChipText, newMatchType === mt && { color: '#6c5ce7' }]}>
                      {mt === 'domain' ? '🌐 Domain' : mt === 'email' ? '📧 E-Mail' : '🔍 Enthält'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput style={styles.ruleInput} value={newPattern} onChangeText={setNewPattern}
                placeholder={newMatchType === 'domain' ? 'z.B. bosch.de' : newMatchType === 'email' ? 'z.B. re@lieferant.de' : 'z.B. rechnung'}
                placeholderTextColor="#636e72" autoCapitalize="none" />
              <TextInput style={styles.ruleInput} value={newLabel} onChangeText={setNewLabel}
                placeholder="Bezeichnung (optional, z.B. Bosch GmbH)" placeholderTextColor="#636e72" />
              <TouchableOpacity style={[styles.addRuleBtn, savingRule && { opacity: 0.6 }]} onPress={handleAddRule} disabled={savingRule}>
                <Ionicons name="add" size={16} color="#fff" />
                <Text style={styles.addRuleBtnText}>Regel hinzufügen</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 280 }}>
              {rules.length === 0
                ? <Text style={styles.noRulesText}>Noch keine Regeln definiert.</Text>
                : rules.map(rule => (
                  <View key={rule.id} style={styles.ruleItem}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rulePattern}>{rule.pattern}</Text>
                      <Text style={styles.ruleMeta}>
                        {rule.match_type === 'domain' ? '🌐 Domain' : rule.match_type === 'email' ? '📧 E-Mail' : '🔍 Enthält'}
                        {rule.label ? ` · ${rule.label}` : ''}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => handleDeleteRule(rule.id)} style={styles.ruleDelBtn}>
                      <Ionicons name="trash-outline" size={16} color="#d63031" />
                    </TouchableOpacity>
                  </View>
                ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ===== REPORT MODAL ===== */}
      <Modal visible={showReport} transparent animationType="slide" onRequestClose={() => setShowReport(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { maxHeight: '90%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>📊 Import-Bericht</Text>
              <TouchableOpacity onPress={() => setShowReport(false)}>
                <Ionicons name="close" size={22} color="#fff" />
              </TouchableOpacity>
            </View>

            {/* Period toggle */}
            <View style={styles.periodToggle}>
              <TouchableOpacity
                style={[styles.periodBtn, reportPeriod === 'day' && styles.periodBtnActive]}
                onPress={() => { setReportPeriod('day'); loadReport('day'); }}
              >
                <Text style={[styles.periodBtnText, reportPeriod === 'day' && styles.periodBtnTextActive]}>Heute</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.periodBtn, reportPeriod === 'week' && styles.periodBtnActive]}
                onPress={() => { setReportPeriod('week'); loadReport('week'); }}
              >
                <Text style={[styles.periodBtnText, reportPeriod === 'week' && styles.periodBtnTextActive]}>Diese Woche</Text>
              </TouchableOpacity>
            </View>

            {reportLoading ? (
              <View style={styles.centered}>
                <ActivityIndicator size="large" color="#6c5ce7" />
              </View>
            ) : report ? (
              <ScrollView>
                {/* Summary */}
                <View style={styles.reportSummary}>
                  <View style={styles.reportStat}>
                    <Text style={styles.reportStatValue}>{report.count}</Text>
                    <Text style={styles.reportStatLabel}>Importiert</Text>
                  </View>
                  <View style={styles.reportStatDivider} />
                  <View style={styles.reportStat}>
                    <Text style={styles.reportStatValue}>{fmtEuro(report.total_amount)}</Text>
                    <Text style={styles.reportStatLabel}>Erkanntes Volumen</Text>
                  </View>
                </View>

                {report.items.length === 0 ? (
                  <View style={styles.reportEmpty}>
                    <Ionicons name="checkmark-circle-outline" size={40} color="#2d2d44" />
                    <Text style={styles.reportEmptyText}>
                      {reportPeriod === 'day' ? 'Heute noch keine Importe.' : 'Diese Woche noch keine Importe.'}
                    </Text>
                  </View>
                ) : (
                  report.items.map((item, i) => (
                    <View key={item.id} style={styles.reportItem}>
                      <View style={styles.reportItemLeft}>
                        <Text style={styles.reportItemNum}>{i + 1}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.reportItemSubject} numberOfLines={1}>{item.subject}</Text>
                        <Text style={styles.reportItemSender} numberOfLines={1}>{item.sender}</Text>
                        {item.invoice_data && (
                          <View style={styles.reportItemInvoice}>
                            {item.invoice_data.vendor_name ? (
                              <Text style={styles.reportItemDetail}>🏢 {item.invoice_data.vendor_name}</Text>
                            ) : null}
                            {item.invoice_data.gross_amount > 0 ? (
                              <Text style={styles.reportItemAmount}>{fmtEuro(item.invoice_data.gross_amount)}</Text>
                            ) : null}
                          </View>
                        )}
                        <Text style={styles.reportItemDate}>
                          Importiert: {item.imported_at ? fmtDate(item.imported_at) : '–'}
                        </Text>
                      </View>
                    </View>
                  ))
                )}
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f0eb' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#e5ddd5' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#2c2c3e' },
  headerSub: { fontSize: 12, color: '#9e9eaa', marginTop: 2 },
  headerBtns: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: { padding: 8, borderRadius: 8, backgroundColor: '#e5ddd5', borderWidth: 1, borderColor: '#e5ddd5' },
  pollBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#6c5ce7', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  pollBtnText: { color: '#ffffff', fontWeight: '600', fontSize: 13 },
  batchBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#6c5ce740', gap: 10 },
  batchSelectAll: { fontSize: 13, color: '#6c5ce7', fontWeight: '600' },
  batchImportBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#00b894', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  batchImportText: { color: '#ffffff', fontWeight: '700', fontSize: 13 },
  batchHint: { fontSize: 12, color: '#9e9eaa' },
  filterBar: { flexDirection: 'row', alignItems: 'center', paddingLeft: 12, paddingVertical: 8, backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#e5ddd5', gap: 8 },
  archiveToggle: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: '#e5ddd5', backgroundColor: '#f4f0eb' },
  archiveToggleActive: { borderColor: '#6c5ce7', backgroundColor: '#6c5ce720' },
  archiveToggleText: { fontSize: 12, color: '#9e9eaa', fontWeight: '600' },
  filterChips: { flexDirection: 'row', gap: 6, paddingRight: 12 },
  chip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14, borderWidth: 1, borderColor: '#e5ddd5', backgroundColor: '#f4f0eb' },
  chipActive: { borderColor: '#6c5ce7', backgroundColor: '#6c5ce720' },
  chipText: { fontSize: 12, color: '#9e9eaa' },
  chipTextActive: { color: '#6c5ce7', fontWeight: '600' },
  list: { flex: 1 },
  listContent: { padding: 12, gap: 10 },
  desktopContent: { maxWidth: 860, alignSelf: 'center', width: '100%' },
  // Card
  card: { backgroundColor: '#ffffff', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#e5ddd5' },
  cardSelected: { borderColor: '#6c5ce7', backgroundColor: '#6c5ce710' },
  cardImported: { borderColor: '#6c5ce730', backgroundColor: '#ffffff' },
  cardRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  checkboxWrap: { paddingTop: 2, width: 26, alignItems: 'center' },
  expandedBody: { marginTop: 12, borderTopWidth: 1, borderTopColor: '#e5ddd5', paddingTop: 12, gap: 8 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' },
  aiBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  aiBadgeText: { fontSize: 11, fontWeight: '600' },
  aiConf: { fontSize: 10, opacity: 0.8 },
  importedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#6c5ce720', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  importedBadgeText: { fontSize: 11, color: '#6c5ce7', fontWeight: '700' },
  dateText: { marginLeft: 'auto', fontSize: 11, color: '#9e9eaa' },
  alreadyImportedBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#6c5ce710', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 8, borderWidth: 1, borderColor: '#6c5ce730' },
  alreadyImportedText: { fontSize: 12, color: '#a29bfe', flex: 1 },
  subject: { fontSize: 14, fontWeight: '600', color: '#2c2c3e', marginBottom: 3 },
  sender: { fontSize: 12, color: '#6e6e85', marginBottom: 8 },
  aiDetails: { backgroundColor: '#f4f0eb', borderRadius: 8, padding: 9, marginBottom: 8, gap: 3 },
  aiDetailText: { fontSize: 12, color: '#6e6e85' },
  aiReasonText: { fontSize: 11, color: '#6e6e85', fontStyle: 'italic' },
  attachRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 10 },
  attachChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#f4f0eb', borderRadius: 7, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: '#e5ddd5', maxWidth: 200 },
  attachName: { fontSize: 11, color: '#6e6e85', flex: 1 },
  attachSize: { fontSize: 10, color: '#9e9eaa' },
  actions: { flexDirection: 'row', gap: 7 },
  btnPrimary: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: '#00b894', borderRadius: 8, paddingVertical: 9 },
  btnPrimaryText: { color: '#ffffff', fontWeight: '700', fontSize: 12 },
  btnSec: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: '#6c5ce720', borderRadius: 8, paddingVertical: 9, borderWidth: 1, borderColor: '#6c5ce7' },
  btnSecText: { color: '#6c5ce7', fontWeight: '600', fontSize: 12 },
  btnDel: { width: 38, alignItems: 'center', justifyContent: 'center', backgroundColor: '#d6303115', borderRadius: 8 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 12 },
  loadingText: { color: '#9e9eaa', fontSize: 14, marginTop: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#2c2c3e' },
  emptyText: { fontSize: 14, color: '#9e9eaa', textAlign: 'center', lineHeight: 20 },
  toast: { position: 'absolute', top: 60, left: 16, right: 16, zIndex: 999, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 13, borderRadius: 12 },
  toastSuccess: { backgroundColor: '#00b894' },
  toastError: { backgroundColor: '#d63031' },
  toastText: { color: '#ffffff', fontWeight: '600', fontSize: 14, flex: 1 },
  // Modal shared
  modalOverlay: { flex: 1, backgroundColor: '#000000aa', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: '#ffffff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#2c2c3e' },
  modalHint: { fontSize: 13, color: '#9e9eaa', marginBottom: 16, lineHeight: 18 },
  // Sender rules
  ruleForm: { gap: 8, marginBottom: 16 },
  ruleMatchRow: { flexDirection: 'row', gap: 8 },
  matchChip: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#e5ddd5', backgroundColor: '#f4f0eb' },
  matchChipActive: { borderColor: '#6c5ce7', backgroundColor: '#6c5ce715' },
  matchChipText: { fontSize: 12, color: '#9e9eaa', fontWeight: '500' },
  ruleInput: { backgroundColor: '#f4f0eb', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, color: '#2c2c3e', fontSize: 14, borderWidth: 1, borderColor: '#e5ddd5' },
  addRuleBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#6c5ce7', borderRadius: 10, paddingVertical: 12 },
  addRuleBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 14 },
  noRulesText: { color: '#9e9eaa', fontSize: 13, textAlign: 'center', paddingVertical: 12 },
  ruleItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f4f0eb', borderRadius: 10, padding: 12, marginBottom: 8 },
  rulePattern: { fontSize: 14, color: '#2c2c3e', fontWeight: '600', marginBottom: 3 },
  ruleMeta: { fontSize: 12, color: '#9e9eaa' },
  ruleDelBtn: { padding: 8 },
  // Report
  periodToggle: { flexDirection: 'row', backgroundColor: '#f4f0eb', borderRadius: 10, padding: 4, marginBottom: 16 },
  periodBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  periodBtnActive: { backgroundColor: '#6c5ce7' },
  periodBtnText: { fontSize: 14, color: '#9e9eaa', fontWeight: '600' },
  periodBtnTextActive: { color: '#ffffff' },
  reportSummary: { flexDirection: 'row', backgroundColor: '#f4f0eb', borderRadius: 12, padding: 16, marginBottom: 16, alignItems: 'center' },
  reportStat: { flex: 1, alignItems: 'center' },
  reportStatValue: { fontSize: 22, fontWeight: '700', color: '#2c2c3e', marginBottom: 4 },
  reportStatLabel: { fontSize: 12, color: '#9e9eaa' },
  reportStatDivider: { width: 1, height: 40, backgroundColor: '#e5ddd5', marginHorizontal: 16 },
  reportEmpty: { alignItems: 'center', paddingVertical: 32, gap: 12 },
  reportEmptyText: { fontSize: 14, color: '#9e9eaa' },
  reportItem: { flexDirection: 'row', gap: 12, backgroundColor: '#f4f0eb', borderRadius: 10, padding: 12, marginBottom: 8, alignItems: 'flex-start' },
  reportItemLeft: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#6c5ce720', alignItems: 'center', justifyContent: 'center' },
  reportItemNum: { fontSize: 12, color: '#6c5ce7', fontWeight: '700' },
  reportItemSubject: { fontSize: 13, fontWeight: '600', color: '#2c2c3e', marginBottom: 2 },
  reportItemSender: { fontSize: 11, color: '#9e9eaa', marginBottom: 6 },
  reportItemInvoice: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  reportItemDetail: { fontSize: 12, color: '#6e6e85' },
  reportItemAmount: { fontSize: 13, fontWeight: '700', color: '#00b894' },
  reportItemDate: { fontSize: 11, color: '#9e9eaa' },
});
