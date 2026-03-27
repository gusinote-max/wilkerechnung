import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Picker } from '@react-native-picker/picker';
import { apiService, Invoice, AuditLog, Account, CostCenter, InvoiceData } from '../../src/services/api';

export default function InvoiceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [auditLog, setAuditLog] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showImageModal, setShowImageModal] = useState(false);
  
  // NEW: Accounting fields
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [selectedCostCenter, setSelectedCostCenter] = useState<string>('');
  const [bookingText, setBookingText] = useState<string>('');
  const [showAccountingModal, setShowAccountingModal] = useState(false);
  const [activeKontenrahmen, setActiveKontenrahmen] = useState('SKR03');
  const [toast, setToast] = useState<{type: 'success' | 'error'; message: string} | null>(null);
  const [showConfirm, setShowConfirm] = useState<{action: string; title: string; message: string} | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (id) {
      loadInvoice();
      loadAccountingData();
    }
  }, [id]);

  const loadInvoice = async () => {
    try {
      const [invoiceData, auditData] = await Promise.all([
        apiService.getInvoice(id!),
        apiService.getAuditLog(id!),
      ]);
      setInvoice(invoiceData);
      setAuditLog(auditData);
      
      // Set accounting fields from invoice
      if (invoiceData.data.account_number) {
        setSelectedAccount(invoiceData.data.account_number);
      }
      if (invoiceData.data.cost_center) {
        setSelectedCostCenter(invoiceData.data.cost_center);
      }
      if (invoiceData.data.booking_text) {
        setBookingText(invoiceData.data.booking_text);
      }
    } catch (error) {
      console.error('Error loading invoice:', error);
      Alert.alert('Fehler', 'Rechnung konnte nicht geladen werden');
    } finally {
      setLoading(false);
    }
  };

  const loadAccountingData = async () => {
    try {
      // Fetch the kontenrahmen from settings instead of hardcoding SKR03
      let kontenrahmen = 'SKR03';
      try {
        const settings = await apiService.getSettings();
        if (settings.default_kontenrahmen) {
          kontenrahmen = settings.default_kontenrahmen;
        }
      } catch (settingsError) {
        console.warn('Could not load settings, using default SKR03');
      }
      
      setActiveKontenrahmen(kontenrahmen);
      
      const [accountsData, costCentersData] = await Promise.all([
        apiService.getAccounts(kontenrahmen),
        apiService.getCostCenters(),
      ]);
      setAccounts(accountsData);
      setCostCenters(costCentersData);
    } catch (error) {
      console.error('Error loading accounting data:', error);
    }
  };

  // Toast auto-dismiss
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const executeAction = async (action: string) => {
    setShowConfirm(null);
    setActionLoading(true);
    try {
      if (action === 'approve') {
        const updated = await apiService.approveInvoice(id!, 'Manager');
        setInvoice(updated);
        setToast({type: 'success', message: 'Rechnung wurde genehmigt'});
        loadInvoice();
      } else if (action === 'archive') {
        const updated = await apiService.archiveInvoice(id!);
        setInvoice(updated);
        setToast({type: 'success', message: 'Rechnung wurde GoBD-konform archiviert'});
        loadInvoice();
      }
    } catch (error: any) {
      const msg = error.response?.data?.detail || 'Aktion fehlgeschlagen';
      setToast({type: 'error', message: msg});
    } finally {
      setActionLoading(false);
    }
  };

  const handleApprove = () => {
    setShowConfirm({
      action: 'approve',
      title: 'Rechnung genehmigen',
      message: 'Möchten Sie diese Rechnung genehmigen?',
    });
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      setToast({type: 'error', message: 'Bitte geben Sie einen Ablehnungsgrund ein'});
      return;
    }

    setActionLoading(true);
    try {
      const updated = await apiService.rejectInvoice(id!, 'Manager', rejectReason);
      setInvoice(updated);
      setShowRejectModal(false);
      setRejectReason('');
      setToast({type: 'success', message: 'Rechnung wurde abgelehnt'});
      loadInvoice();
    } catch (error: any) {
      const msg = error.response?.data?.detail || 'Ablehnung fehlgeschlagen';
      setToast({type: 'error', message: msg});
    } finally {
      setActionLoading(false);
    }
  };

  const handleArchive = () => {
    setShowConfirm({
      action: 'archive',
      title: 'Rechnung archivieren',
      message: 'Diese Rechnung wird GoBD-konform archiviert und kann danach nicht mehr bearbeitet werden.',
    });
  };

  const handleDeleteInvoice = async () => {
    setShowDeleteConfirm(false);
    setActionLoading(true);
    try {
      await apiService.deleteInvoice(id!);
      setToast({type: 'success', message: 'Rechnung wurde gelöscht'});
      setTimeout(() => router.back(), 1000);
    } catch (error: any) {
      const msg = error.response?.data?.detail || 'Rechnung konnte nicht gelöscht werden';
      setToast({type: 'error', message: msg});
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveAccounting = async () => {
    if (!invoice) return;
    
    setActionLoading(true);
    try {
      const selectedAccountObj = accounts.find(a => a.number === selectedAccount);
      const selectedCostCenterObj = costCenters.find(c => c.number === selectedCostCenter);
      
      const updatedData: InvoiceData = {
        ...invoice.data,
        account_number: selectedAccount,
        account_name: selectedAccountObj?.name || '',
        cost_center: selectedCostCenter,
        cost_center_name: selectedCostCenterObj?.name || '',
        booking_text: bookingText,
      };
      
      const updated = await apiService.updateInvoice(id!, updatedData);
      setInvoice(updated);
      setShowAccountingModal(false);
      setToast({type: 'success', message: 'Kontierung wurde gespeichert'});
    } catch (error: any) {
      const msg = error.response?.data?.detail || 'Speichern fehlgeschlagen';
      setToast({type: 'error', message: msg});
    } finally {
      setActionLoading(false);
    }
  };

  const handleExport = async (format: 'zugferd' | 'xrechnung') => {
    setActionLoading(true);
    try {
      let content: string;
      let filename: string;

      if (format === 'zugferd') {
        content = await apiService.exportZugferd(id!);
        filename = `zugferd_${invoice?.data.invoice_number || id}.xml`;
      } else {
        content = await apiService.exportXrechnung(id!);
        filename = `xrechnung_${invoice?.data.invoice_number || id}.xml`;
      }

      // Use blob download for web
      if (typeof window !== 'undefined' && window.document) {
        const blob = new Blob([content], { type: 'application/xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setToast({type: 'success', message: `Export heruntergeladen: ${filename}`});
      } else {
        setToast({type: 'success', message: `${filename} wurde generiert`});
      }
    } catch (error: any) {
      const msg = error.response?.data?.detail || 'Export fehlgeschlagen';
      setToast({type: 'error', message: msg});
    } finally {
      setActionLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('de-DE');
    } catch {
      return dateString;
    }
  };

  const formatDateTime = (dateString: string) => {
    if (!dateString) return '-';
    try {
      const date = new Date(dateString);
      return date.toLocaleString('de-DE');
    } catch {
      return dateString;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return '#ffeaa7';
      case 'approved': return '#55efc4';
      case 'rejected': return '#ff7675';
      case 'archived': return '#74b9ff';
      default: return '#a0a0a0';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending': return 'Ausstehend';
      case 'approved': return 'Genehmigt';
      case 'rejected': return 'Abgelehnt';
      case 'archived': return 'Archiviert';
      default: return status;
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6c5ce7" />
          <Text style={styles.loadingText}>Lade Rechnung...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!invoice) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={64} color="#ff7675" />
          <Text style={styles.errorText}>Rechnung nicht gefunden</Text>
        </View>
      </SafeAreaView>
    );
  }

  const data = invoice.data;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={isDesktop && styles.desktopContent}
      >
        {/* Desktop Layout */}
        <View style={isDesktop && styles.desktopLayout}>
          {/* Left Column */}
          <View style={isDesktop && styles.desktopLeftColumn}>
            {/* Status Header */}
            <View style={[styles.statusHeader, { borderLeftColor: getStatusColor(invoice.status) }]}>
              <View style={styles.statusInfo}>
                <Text style={[styles.statusText, { color: getStatusColor(invoice.status) }]}>
                  {getStatusLabel(invoice.status)}
                </Text>
                <Text style={styles.invoiceNumber}>
                  {data.invoice_number || 'Ohne Nummer'}
                </Text>
              </View>
              <Text style={styles.grossAmount}>{formatCurrency(data.gross_amount)}</Text>
            </View>

            {/* Invoice Image */}
            {invoice.image_base64 && (
              <TouchableOpacity
                style={styles.imageContainer}
                onPress={() => setShowImageModal(true)}
              >
                <Image
                  source={{ uri: invoice.image_base64.startsWith('data:') ? invoice.image_base64 : `data:image/jpeg;base64,${invoice.image_base64}` }}
                  style={styles.invoiceImage}
                  resizeMode="cover"
                />
                <View style={styles.imageOverlay}>
                  <Ionicons name="expand" size={24} color="#fff" />
                  <Text style={styles.imageOverlayText}>Vergrößern</Text>
                </View>
              </TouchableOpacity>
            )}

            {/* Vendor Info */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Lieferant</Text>
              <View style={styles.infoCard}>
                <Text style={styles.vendorName}>{data.vendor_name || '-'}</Text>
                <Text style={styles.vendorAddress}>{data.vendor_address || '-'}</Text>
                {data.vendor_vat_id && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>USt-IdNr:</Text>
                    <Text style={styles.infoValue}>{data.vendor_vat_id}</Text>
                  </View>
                )}
                {data.vendor_iban && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>IBAN:</Text>
                    <Text style={styles.infoValue}>{data.vendor_iban}</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Invoice Details */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Rechnungsdaten</Text>
              <View style={styles.detailsGrid}>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Rechnungsdatum</Text>
                  <Text style={styles.detailValue}>{formatDate(data.invoice_date)}</Text>
                </View>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Fälligkeitsdatum</Text>
                  <Text style={styles.detailValue}>{formatDate(data.due_date)}</Text>
                </View>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Währung</Text>
                  <Text style={styles.detailValue}>{data.currency}</Text>
                </View>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>MwSt-Satz</Text>
                  <Text style={styles.detailValue}>{data.vat_rate}%</Text>
                </View>
              </View>
            </View>

            {/* Amounts */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Beträge</Text>
              <View style={styles.amountsCard}>
                <View style={styles.amountRow}>
                  <Text style={styles.amountLabel}>Netto:</Text>
                  <Text style={styles.amountValue}>{formatCurrency(data.net_amount)}</Text>
                </View>
                <View style={styles.amountRow}>
                  <Text style={styles.amountLabel}>MwSt ({data.vat_rate}%):</Text>
                  <Text style={styles.amountValue}>{formatCurrency(data.vat_amount)}</Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.amountRow}>
                  <Text style={styles.amountLabelBold}>Brutto:</Text>
                  <Text style={styles.amountValueBold}>{formatCurrency(data.gross_amount)}</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Right Column */}
          <View style={isDesktop && styles.desktopRightColumn}>
            {/* Accounting Section - NEW */}
            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>Kontierung</Text>
                {invoice.status !== 'archived' && (
                  <TouchableOpacity
                    style={styles.editButton}
                    onPress={() => setShowAccountingModal(true)}
                  >
                    <Ionicons name="pencil" size={16} color="#6c5ce7" />
                    <Text style={styles.editButtonText}>Bearbeiten</Text>
                  </TouchableOpacity>
                )}
              </View>
              <View style={styles.accountingCard}>
                <View style={styles.accountingRow}>
                  <Text style={styles.accountingLabel}>Sachkonto:</Text>
                  <Text style={styles.accountingValue}>
                    {data.account_number ? `${data.account_number} - ${data.account_name}` : 'Nicht zugewiesen'}
                  </Text>
                </View>
                <View style={styles.accountingRow}>
                  <Text style={styles.accountingLabel}>Kostenstelle:</Text>
                  <Text style={styles.accountingValue}>
                    {data.cost_center ? `${data.cost_center} - ${data.cost_center_name}` : 'Nicht zugewiesen'}
                  </Text>
                </View>
                <View style={styles.accountingRow}>
                  <Text style={styles.accountingLabel}>Buchungstext:</Text>
                  <Text style={styles.accountingValue}>
                    {data.booking_text || data.vendor_name || '-'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Line Items */}
            {data.line_items && data.line_items.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Positionen</Text>
                {data.line_items.map((item, index) => (
                  <View key={index} style={styles.lineItem}>
                    <Text style={styles.lineItemDesc}>{item.description}</Text>
                    <View style={styles.lineItemDetails}>
                      <Text style={styles.lineItemQty}>
                        {item.quantity} x {formatCurrency(item.unit_price)}
                      </Text>
                      <Text style={styles.lineItemTotal}>{formatCurrency(item.total)}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Rejection Reason */}
            {invoice.status === 'rejected' && invoice.rejection_reason && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Ablehnungsgrund</Text>
                <View style={styles.rejectionCard}>
                  <Ionicons name="close-circle" size={20} color="#ff7675" />
                  <Text style={styles.rejectionText}>{invoice.rejection_reason}</Text>
                </View>
              </View>
            )}

            {/* GoBD Info */}
            {invoice.status === 'archived' && invoice.gobd_hash && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>GoBD-Archivierung</Text>
                <View style={styles.gobdCard}>
                  <View style={styles.gobdRow}>
                    <Ionicons name="shield-checkmark" size={20} color="#55efc4" />
                    <Text style={styles.gobdLabel}>Revisionssicher archiviert</Text>
                  </View>
                  <View style={styles.gobdRow}>
                    <Text style={styles.gobdHashLabel}>SHA-256 Hash:</Text>
                  </View>
                  <Text style={styles.gobdHash}>{invoice.gobd_hash}</Text>
                  {invoice.archived_at && (
                    <Text style={styles.gobdDate}>
                      Archiviert am: {formatDateTime(invoice.archived_at)}
                    </Text>
                  )}
                </View>
              </View>
            )}

            {/* Audit Log */}
            {auditLog.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Verlauf</Text>
                {auditLog.map((log) => (
                  <View key={log.id} style={styles.auditItem}>
                    <View style={styles.auditDot} />
                    <View style={styles.auditContent}>
                      <Text style={styles.auditAction}>{log.action}</Text>
                      <Text style={styles.auditMeta}>
                        {log.actor} • {formatDateTime(log.timestamp)}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>

        {/* Actions */}
        {invoice.status === 'pending' && (
          <View style={[styles.actionsSection, isDesktop && styles.desktopActions]}>
            <TouchableOpacity
              style={[styles.actionButton, styles.approveButton]}
              onPress={handleApprove}
              disabled={actionLoading}
            >
              {actionLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark" size={20} color="#fff" />
                  <Text style={styles.actionButtonText}>Genehmigen</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, styles.rejectButton]}
              onPress={() => setShowRejectModal(true)}
              disabled={actionLoading}
            >
              <Ionicons name="close" size={20} color="#fff" />
              <Text style={styles.actionButtonText}>Ablehnen</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, styles.deleteButton]}
              onPress={() => setShowDeleteConfirm(true)}
              disabled={actionLoading}
            >
              <Ionicons name="trash" size={20} color="#fff" />
              <Text style={styles.actionButtonText}>Löschen</Text>
            </TouchableOpacity>
          </View>
        )}

        {invoice.status === 'approved' && (
          <View style={[styles.actionsSection, isDesktop && styles.desktopActions]}>
            <TouchableOpacity
              style={[styles.actionButton, styles.archiveButton]}
              onPress={handleArchive}
              disabled={actionLoading}
            >
              {actionLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="archive" size={20} color="#fff" />
                  <Text style={styles.actionButtonText}>Archivieren</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, styles.deleteButton]}
              onPress={() => setShowDeleteConfirm(true)}
              disabled={actionLoading}
            >
              <Ionicons name="trash" size={20} color="#fff" />
              <Text style={styles.actionButtonText}>Löschen</Text>
            </TouchableOpacity>
          </View>
        )}

        {(invoice.status === 'rejected') && (
          <View style={[styles.actionsSection, isDesktop && styles.desktopActions]}>
            <TouchableOpacity
              style={[styles.actionButton, styles.deleteButton]}
              onPress={() => setShowDeleteConfirm(true)}
              disabled={actionLoading}
            >
              <Ionicons name="trash" size={20} color="#fff" />
              <Text style={styles.actionButtonText}>Löschen</Text>
            </TouchableOpacity>
          </View>
        )}

        {(invoice.status === 'archived') && (
          <View style={[styles.actionsSection, isDesktop && styles.desktopActions]}>
            <TouchableOpacity
              style={[styles.actionButton, styles.deleteButton]}
              onPress={() => setShowDeleteConfirm(true)}
              disabled={actionLoading}
            >
              <Ionicons name="trash" size={20} color="#fff" />
              <Text style={styles.actionButtonText}>Löschen</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Export Options */}
        <View style={[styles.exportSection, isDesktop && styles.desktopExport]}>
          <Text style={styles.exportTitle}>E-Rechnung Export</Text>
          <View style={styles.exportButtons}>
            <TouchableOpacity
              style={styles.exportButton}
              onPress={() => handleExport('zugferd')}
              disabled={actionLoading}
            >
              <Ionicons name="document-text" size={20} color="#6c5ce7" />
              <Text style={styles.exportButtonText}>ZUGFeRD 2.1</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.exportButton}
              onPress={() => handleExport('xrechnung')}
              disabled={actionLoading}
            >
              <Ionicons name="code-slash" size={20} color="#6c5ce7" />
              <Text style={styles.exportButtonText}>XRechnung</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* Accounting Modal */}
      <Modal
        visible={showAccountingModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAccountingModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={[styles.modalContent, isDesktop && styles.desktopModalContent]}>
            <Text style={styles.modalTitle}>Kontierung bearbeiten</Text>
            
            <Text style={styles.modalLabel}>Sachkonto ({activeKontenrahmen})</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={selectedAccount}
                onValueChange={setSelectedAccount}
                style={styles.picker}
                dropdownIconColor="#fff"
              >
                <Picker.Item label="-- Konto wählen --" value="" />
                {accounts.map((acc) => (
                  <Picker.Item
                    key={acc.id}
                    label={`${acc.number} - ${acc.name}`}
                    value={acc.number}
                  />
                ))}
              </Picker>
            </View>
            
            <Text style={styles.modalLabel}>Kostenstelle</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={selectedCostCenter}
                onValueChange={setSelectedCostCenter}
                style={styles.picker}
                dropdownIconColor="#fff"
              >
                <Picker.Item label="-- Keine Kostenstelle --" value="" />
                {costCenters.map((cc) => (
                  <Picker.Item
                    key={cc.id}
                    label={`${cc.number} - ${cc.name}`}
                    value={cc.number}
                  />
                ))}
              </Picker>
            </View>
            
            <Text style={styles.modalLabel}>Buchungstext</Text>
            <TextInput
              style={styles.modalInput}
              value={bookingText}
              onChangeText={setBookingText}
              placeholder="Buchungstext eingeben..."
              placeholderTextColor="#636e72"
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setShowAccountingModal(false)}
              >
                <Text style={styles.modalCancelText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirmButton}
                onPress={handleSaveAccounting}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalConfirmText}>Speichern</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Reject Modal */}
      <Modal
        visible={showRejectModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowRejectModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={[styles.modalContent, isDesktop && styles.desktopModalContent]}>
            <Text style={styles.modalTitle}>Rechnung ablehnen</Text>
            <TextInput
              style={[styles.modalInput, { minHeight: 100, textAlignVertical: 'top' }]}
              value={rejectReason}
              onChangeText={setRejectReason}
              placeholder="Ablehnungsgrund eingeben..."
              placeholderTextColor="#636e72"
              multiline
              numberOfLines={4}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setShowRejectModal(false);
                  setRejectReason('');
                }}
              >
                <Text style={styles.modalCancelText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirmButton, { backgroundColor: '#ff7675' }]}
                onPress={handleReject}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalConfirmText}>Ablehnen</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Image Modal */}
      <Modal
        visible={showImageModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowImageModal(false)}
      >
        <View style={styles.imageModalOverlay}>
          <TouchableOpacity
            style={styles.closeImageButton}
            onPress={() => setShowImageModal(false)}
          >
            <Ionicons name="close" size={32} color="#fff" />
          </TouchableOpacity>
          {invoice.image_base64 && (
            <Image
              source={{ uri: invoice.image_base64.startsWith('data:') ? invoice.image_base64 : `data:image/jpeg;base64,${invoice.image_base64}` }}
              style={styles.fullImage}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>

      {/* Confirmation Dialog */}
      {showConfirm && (
        <Modal
          visible={true}
          transparent
          animationType="fade"
          onRequestClose={() => setShowConfirm(null)}
        >
          <View style={styles.confirmOverlay}>
            <View style={styles.confirmBox}>
              <Ionicons 
                name={showConfirm.action === 'approve' ? 'checkmark-circle' : 'archive'} 
                size={40} 
                color={showConfirm.action === 'approve' ? '#55efc4' : '#6c5ce7'} 
              />
              <Text style={styles.confirmTitle}>{showConfirm.title}</Text>
              <Text style={styles.confirmMessage}>{showConfirm.message}</Text>
              <View style={styles.confirmButtons}>
                <TouchableOpacity
                  style={styles.confirmCancelBtn}
                  onPress={() => setShowConfirm(null)}
                >
                  <Text style={styles.confirmCancelText}>Abbrechen</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.confirmActionBtn, showConfirm.action === 'approve' ? styles.approveButton : styles.archiveButton]}
                  onPress={() => executeAction(showConfirm.action)}
                >
                  <Text style={styles.confirmActionText}>
                    {showConfirm.action === 'approve' ? 'Genehmigen' : 'Archivieren'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* Delete Confirmation Modal */}
      <Modal
        visible={showDeleteConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDeleteConfirm(false)}
      >
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmBox}>
            <Ionicons name="trash" size={40} color="#ff7675" />
            <Text style={styles.confirmTitle}>Rechnung löschen</Text>
            <Text style={styles.confirmMessage}>
              Diese Rechnung wird unwiderruflich gelöscht. Möchten Sie fortfahren?
            </Text>
            <View style={styles.confirmButtons}>
              <TouchableOpacity
                style={styles.confirmCancelBtn}
                onPress={() => setShowDeleteConfirm(false)}
              >
                <Text style={styles.confirmCancelText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmActionBtn, styles.deleteButton]}
                onPress={handleDeleteInvoice}
              >
                <Text style={styles.confirmActionText}>Löschen</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Toast Notification */}
      {toast && (
        <View style={[styles.toast, toast.type === 'success' ? styles.toastSuccess : styles.toastError]}>
          <Ionicons 
            name={toast.type === 'success' ? 'checkmark-circle' : 'alert-circle'} 
            size={22} 
            color="#fff" 
          />
          <Text style={styles.toastText}>{toast.message}</Text>
          <TouchableOpacity onPress={() => setToast(null)}>
            <Ionicons name="close" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f1a',
  },
  scrollView: {
    flex: 1,
  },
  desktopContent: {
    maxWidth: 1200,
    alignSelf: 'center',
    width: '100%',
    paddingHorizontal: 40,
  },
  desktopLayout: {
    flexDirection: 'row',
    gap: 24,
  },
  desktopLeftColumn: {
    flex: 1,
  },
  desktopRightColumn: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#a0a0a0',
    marginTop: 12,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: '#ff7675',
    marginTop: 16,
    fontSize: 16,
  },
  statusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    padding: 20,
    borderLeftWidth: 4,
  },
  statusInfo: {
    flex: 1,
  },
  statusText: {
    fontSize: 14,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  invoiceNumber: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 4,
  },
  grossAmount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#55efc4',
  },
  imageContainer: {
    margin: 16,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  invoiceImage: {
    width: '100%',
    height: 200,
    backgroundColor: '#1a1a2e',
  },
  imageOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  imageOverlayText: {
    color: '#fff',
    marginLeft: 8,
    fontSize: 14,
  },
  section: {
    padding: 16,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#a0a0a0',
    marginBottom: 12,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#6c5ce720',
    borderRadius: 8,
  },
  editButtonText: {
    color: '#6c5ce7',
    fontSize: 14,
    marginLeft: 4,
  },
  infoCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
  },
  vendorName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  vendorAddress: {
    fontSize: 14,
    color: '#a0a0a0',
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    marginTop: 8,
  },
  infoLabel: {
    fontSize: 14,
    color: '#636e72',
    width: 80,
  },
  infoValue: {
    fontSize: 14,
    color: '#fff',
    flex: 1,
  },
  accountingCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 3,
    borderLeftColor: '#6c5ce7',
  },
  accountingRow: {
    marginBottom: 12,
  },
  accountingLabel: {
    fontSize: 12,
    color: '#636e72',
    marginBottom: 4,
  },
  accountingValue: {
    fontSize: 14,
    color: '#fff',
  },
  detailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 8,
  },
  detailItem: {
    width: '50%',
    padding: 8,
  },
  detailLabel: {
    fontSize: 12,
    color: '#636e72',
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 16,
    color: '#fff',
  },
  amountsCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  amountLabel: {
    fontSize: 16,
    color: '#a0a0a0',
  },
  amountValue: {
    fontSize: 16,
    color: '#fff',
  },
  amountLabelBold: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  amountValueBold: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#55efc4',
  },
  divider: {
    height: 1,
    backgroundColor: '#2d2d44',
    marginVertical: 12,
  },
  lineItem: {
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  lineItemDesc: {
    fontSize: 14,
    color: '#fff',
    marginBottom: 8,
  },
  lineItemDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  lineItemQty: {
    fontSize: 13,
    color: '#a0a0a0',
  },
  lineItemTotal: {
    fontSize: 14,
    fontWeight: '600',
    color: '#55efc4',
  },
  rejectionCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(255, 118, 117, 0.1)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#ff7675',
  },
  rejectionText: {
    flex: 1,
    fontSize: 14,
    color: '#ff7675',
    marginLeft: 12,
  },
  gobdCard: {
    backgroundColor: 'rgba(85, 239, 196, 0.1)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#55efc4',
  },
  gobdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  gobdLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#55efc4',
    marginLeft: 8,
  },
  gobdHashLabel: {
    fontSize: 12,
    color: '#a0a0a0',
  },
  gobdHash: {
    fontSize: 10,
    color: '#74b9ff',
    fontFamily: 'monospace',
    marginBottom: 8,
  },
  gobdDate: {
    fontSize: 12,
    color: '#a0a0a0',
  },
  auditItem: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  auditDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#6c5ce7',
    marginTop: 6,
    marginRight: 12,
  },
  auditContent: {
    flex: 1,
  },
  auditAction: {
    fontSize: 14,
    color: '#fff',
    textTransform: 'capitalize',
  },
  auditMeta: {
    fontSize: 12,
    color: '#636e72',
    marginTop: 2,
  },
  actionsSection: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  desktopActions: {
    maxWidth: 600,
    alignSelf: 'center',
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: 12,
  },
  approveButton: {
    backgroundColor: '#55efc4',
  },
  rejectButton: {
    backgroundColor: '#ff7675',
  },
  archiveButton: {
    backgroundColor: '#74b9ff',
  },
  deleteButton: {
    backgroundColor: '#d63031',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  exportSection: {
    padding: 16,
    paddingBottom: 40,
  },
  desktopExport: {
    maxWidth: 600,
    alignSelf: 'center',
  },
  exportTitle: {
    fontSize: 14,
    color: '#a0a0a0',
    marginBottom: 12,
  },
  exportButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  exportButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1a2e',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#6c5ce7',
  },
  exportButtonText: {
    color: '#6c5ce7',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 20,
  },
  desktopModalContent: {
    maxWidth: 500,
    alignSelf: 'center',
    width: '100%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16,
  },
  modalLabel: {
    fontSize: 14,
    color: '#a0a0a0',
    marginBottom: 8,
    marginTop: 12,
  },
  pickerContainer: {
    backgroundColor: '#0f0f1a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2d2d44',
    overflow: 'hidden',
  },
  picker: {
    color: '#fff',
    height: 50,
  },
  modalInput: {
    backgroundColor: '#0f0f1a',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#2d2d44',
  },
  modalButtons: {
    flexDirection: 'row',
    marginTop: 20,
    gap: 12,
  },
  modalCancelButton: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    backgroundColor: '#2d2d44',
    alignItems: 'center',
  },
  modalCancelText: {
    color: '#a0a0a0',
    fontSize: 16,
    fontWeight: '600',
  },
  modalConfirmButton: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    backgroundColor: '#6c5ce7',
    alignItems: 'center',
  },
  modalConfirmText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  imageModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeImageButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    padding: 10,
  },
  fullImage: {
    width: '100%',
    height: '80%',
  },
  // Confirmation Dialog
  confirmOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  confirmBox: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    maxWidth: 400,
    width: '100%',
    gap: 12,
  },
  confirmTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  confirmMessage: {
    fontSize: 14,
    color: '#a0a0a0',
    textAlign: 'center',
    lineHeight: 20,
  },
  confirmButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
    width: '100%',
  },
  confirmCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#636e72',
    alignItems: 'center',
  },
  confirmCancelText: {
    color: '#a0a0a0',
    fontSize: 15,
    fontWeight: '600',
  },
  confirmActionBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  confirmActionText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },
  approveButton: {
    backgroundColor: '#00b894',
  },
  archiveButton: {
    backgroundColor: '#6c5ce7',
  },
  // Toast Notification
  toast: {
    position: 'absolute',
    bottom: 30,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    gap: 10,
    zIndex: 9999,
  },
  toastSuccess: {
    backgroundColor: '#00b894',
  },
  toastError: {
    backgroundColor: '#d63031',
  },
  toastText: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
});
