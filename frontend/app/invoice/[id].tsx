import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
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
import { apiService, Invoice, AuditLog, Account, CostCenter, InvoiceData } from '../../src/services/api';
import useAuthStore from '../../src/store/authStore';
import { formatCurrency, formatDate, formatDateTime } from '../../src/utils/formatters';

// Refactored Components
import Toast, { ToastData } from '../../src/components/shared/Toast';
import ConfirmModal from '../../src/components/shared/ConfirmModal';
import InvoiceActions from '../../src/components/invoice/InvoiceActions';
import IntegrationCards from '../../src/components/invoice/IntegrationCards';

export default function InvoiceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  const { user } = useAuthStore();

  // Role-based permissions
  const userRole = user?.role || 'viewer';
  const isAdmin = userRole === 'admin';
  const isManagerOrAbove = ['admin', 'manager'].includes(userRole);
  const isAccountantOrAbove = ['admin', 'manager', 'accountant'].includes(userRole);

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [auditLog, setAuditLog] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showImageModal, setShowImageModal] = useState(false);

  // Accounting fields
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [selectedCostCenter, setSelectedCostCenter] = useState<string>('');
  const [bookingText, setBookingText] = useState<string>('');
  const [showAccountingModal, setShowAccountingModal] = useState(false);
  const [activeKontenrahmen, setActiveKontenrahmen] = useState('SKR03');
  const [toast, setToast] = useState<ToastData | null>(null);
  const [showConfirm, setShowConfirm] = useState<{ action: string; title: string; message: string } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // OCR Edit Modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editVendorName, setEditVendorName] = useState('');
  const [editVendorAddress, setEditVendorAddress] = useState('');
  const [editVendorVatId, setEditVendorVatId] = useState('');
  const [editVendorIban, setEditVendorIban] = useState('');
  const [editInvoiceNumber, setEditInvoiceNumber] = useState('');
  const [editInvoiceDate, setEditInvoiceDate] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [editNetAmount, setEditNetAmount] = useState('');
  const [editVatRate, setEditVatRate] = useState('');
  const [editVatAmount, setEditVatAmount] = useState('');
  const [editGrossAmount, setEditGrossAmount] = useState('');

  // DATEV & Payment states
  const [datevStatus, setDatevStatus] = useState<any>(null);
  const [paymentStatus, setPaymentStatus] = useState<any>(null);
  const [datevUploading, setDatevUploading] = useState(false);
  const [paymentInitiating, setPaymentInitiating] = useState(false);

  useEffect(() => {
    if (id) { loadInvoice(); loadAccountingData(); }
  }, [id]);

  // Toast auto-dismiss
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const showToast = (type: 'success' | 'error', message: string) => setToast({ type, message });

  const loadInvoice = async () => {
    try {
      const [invoiceData, auditData] = await Promise.all([
        apiService.getInvoice(id!),
        apiService.getAuditLog(id!),
      ]);
      setInvoice(invoiceData);
      setAuditLog(auditData);

      if (invoiceData.data.account_number) setSelectedAccount(invoiceData.data.account_number);
      if (invoiceData.data.cost_center) setSelectedCostCenter(invoiceData.data.cost_center);
      if (invoiceData.data.booking_text) setBookingText(invoiceData.data.booking_text);

      try {
        const [datevData, paymentData] = await Promise.all([
          apiService.getDatevStatus(id!),
          apiService.getPaymentStatus(id!),
        ]);
        setDatevStatus(datevData);
        setPaymentStatus(paymentData);
      } catch (e) {
        console.log('Could not load DATEV/Payment status');
      }
    } catch (error) {
      console.error('Error loading invoice:', error);
      showToast('error', 'Rechnung konnte nicht geladen werden');
    } finally {
      setLoading(false);
    }
  };

  const loadAccountingData = async () => {
    try {
      let kontenrahmen = 'SKR03';
      try {
        const settings = await apiService.getSettings();
        if (settings.default_kontenrahmen) kontenrahmen = settings.default_kontenrahmen;
      } catch (e) { console.warn('Could not load settings, using default SKR03'); }

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

  const executeAction = async (action: string) => {
    setShowConfirm(null);
    setActionLoading(true);
    try {
      if (action === 'approve') {
        await apiService.approveInvoice(id!, 'Manager');
        showToast('success', 'Rechnung wurde genehmigt');
      } else if (action === 'archive') {
        await apiService.archiveInvoice(id!);
        showToast('success', 'Rechnung wurde GoBD-konform archiviert');
      }
      loadInvoice();
    } catch (error: any) {
      showToast('error', error.response?.data?.detail || 'Aktion fehlgeschlagen');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) { showToast('error', 'Bitte geben Sie einen Ablehnungsgrund ein'); return; }
    setActionLoading(true);
    try {
      await apiService.rejectInvoice(id!, 'Manager', rejectReason);
      setShowRejectModal(false);
      setRejectReason('');
      showToast('success', 'Rechnung wurde abgelehnt');
      loadInvoice();
    } catch (error: any) {
      showToast('error', error.response?.data?.detail || 'Ablehnung fehlgeschlagen');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteInvoice = async () => {
    setShowDeleteConfirm(false);
    setActionLoading(true);
    try {
      await apiService.deleteInvoice(id!);
      showToast('success', 'Rechnung wurde gelöscht');
      setTimeout(() => router.back(), 1000);
    } catch (error: any) {
      showToast('error', error.response?.data?.detail || 'Rechnung konnte nicht gelöscht werden');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDatevUpload = async () => {
    setDatevUploading(true);
    try {
      const result = await apiService.uploadToDatev(id!);
      setDatevStatus({ status: result.mode === 'simulation' ? 'simulated' : 'success', datev_document_id: result.document_id });
      showToast('success', result.message);
    } catch (error: any) {
      showToast('error', error.response?.data?.detail || 'DATEV-Upload fehlgeschlagen');
    } finally {
      setDatevUploading(false);
    }
  };

  const handlePaymentInitiate = async () => {
    setPaymentInitiating(true);
    try {
      const result = await apiService.initiatePayment(id!);
      setPaymentStatus({ status: result.mode === 'simulation' ? 'simulated' : 'completed', provider_transaction_id: result.transaction_id, amount: result.amount });
      showToast('success', result.message);
    } catch (error: any) {
      showToast('error', error.response?.data?.detail || 'Zahlung konnte nicht initiiert werden');
    } finally {
      setPaymentInitiating(false);
    }
  };

  const handleOpenEditModal = () => {
    if (!invoice) return;
    const d = invoice.data;
    setEditVendorName(d.vendor_name || '');
    setEditVendorAddress(d.vendor_address || '');
    setEditVendorVatId(d.vendor_vat_id || '');
    setEditVendorIban(d.vendor_iban || '');
    setEditInvoiceNumber(d.invoice_number || '');
    setEditInvoiceDate(d.invoice_date || '');
    setEditDueDate(d.due_date || '');
    setEditNetAmount(String(d.net_amount ?? 0));
    setEditVatRate(String(d.vat_rate ?? 19));
    setEditVatAmount(String(d.vat_amount ?? 0));
    setEditGrossAmount(String(d.gross_amount ?? 0));
    setShowEditModal(true);
  };

  const handleSaveInvoiceData = async () => {
    if (!invoice) return;
    setActionLoading(true);
    try {
      const updatedData: InvoiceData = {
        ...invoice.data,
        vendor_name: editVendorName,
        vendor_address: editVendorAddress,
        vendor_vat_id: editVendorVatId,
        vendor_iban: editVendorIban,
        invoice_number: editInvoiceNumber,
        invoice_date: editInvoiceDate,
        due_date: editDueDate,
        net_amount: parseFloat(editNetAmount) || 0,
        vat_rate: parseFloat(editVatRate) || 0,
        vat_amount: parseFloat(editVatAmount) || 0,
        gross_amount: parseFloat(editGrossAmount) || 0,
      };
      const updated = await apiService.updateInvoice(id!, updatedData);
      setInvoice(updated);
      setShowEditModal(false);
      showToast('success', 'Rechnungsdaten wurden aktualisiert');
    } catch (error: any) {
      showToast('error', error.response?.data?.detail || 'Speichern fehlgeschlagen');
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
      showToast('success', 'Kontierung wurde gespeichert');
    } catch (error: any) {
      showToast('error', error.response?.data?.detail || 'Speichern fehlgeschlagen');
    } finally {
      setActionLoading(false);
    }
  };

  const handleExport = async (format: 'zugferd' | 'xrechnung') => {
    setActionLoading(true);
    try {
      const content = format === 'zugferd'
        ? await apiService.exportZugferd(id!)
        : await apiService.exportXrechnung(id!);
      const filename = `${format === 'zugferd' ? 'zugferd' : 'xrechnung'}_${invoice?.data.invoice_number || id}.xml`;

      if (typeof window !== 'undefined' && window.document) {
        const blob = new Blob([content], { type: 'application/xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a); URL.revokeObjectURL(url);
        showToast('success', `Export heruntergeladen: ${filename}`);
      } else {
        showToast('success', `${filename} wurde generiert`);
      }
    } catch (error: any) {
      showToast('error', error.response?.data?.detail || 'Export fehlgeschlagen');
    } finally {
      setActionLoading(false);
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
        <View style={isDesktop && styles.desktopLayout}>
          {/* Left Column */}
          <View style={isDesktop && styles.desktopLeftColumn}>
            {/* Status Header */}
            <View style={[styles.statusHeader, { borderLeftColor: getStatusColor(invoice.status) }]}>
              <View style={styles.statusInfo}>
                <View style={styles.statusRow}>
                  <Text style={[styles.statusText, { color: getStatusColor(invoice.status) }]}>{getStatusLabel(invoice.status)}</Text>
                  {invoice.status !== 'archived' && isAccountantOrAbove && (
                    <TouchableOpacity style={styles.ocrEditButton} onPress={handleOpenEditModal}>
                      <Ionicons name="create-outline" size={14} color="#6c5ce7" />
                      <Text style={styles.ocrEditButtonText}>OCR korrigieren</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <Text style={styles.invoiceNumber}>{data.invoice_number || 'Ohne Nummer'}</Text>
              </View>
              <Text style={styles.grossAmount}>{formatCurrency(data.gross_amount)}</Text>
            </View>

            {/* Invoice Image */}
            {invoice.image_base64 && (
              <TouchableOpacity style={styles.imageContainer} onPress={() => setShowImageModal(true)}>
                <Image
                  source={{ uri: invoice.image_base64.startsWith('data:') ? invoice.image_base64 : `data:image/jpeg;base64,${invoice.image_base64}` }}
                  style={styles.invoiceImage} resizeMode="cover"
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
            {/* Accounting Section */}
            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>Kontierung</Text>
                {invoice.status !== 'archived' && (
                  <TouchableOpacity style={styles.editButton} onPress={() => setShowAccountingModal(true)}>
                    <Ionicons name="pencil" size={16} color="#6c5ce7" />
                    <Text style={styles.editButtonText}>Bearbeiten</Text>
                  </TouchableOpacity>
                )}
              </View>
              <View style={styles.accountingCard}>
                <View style={styles.accountingRow}>
                  <Text style={styles.accountingLabel}>Sachkonto:</Text>
                  <Text style={styles.accountingValue}>{data.account_number ? `${data.account_number} - ${data.account_name}` : 'Nicht zugewiesen'}</Text>
                </View>
                <View style={styles.accountingRow}>
                  <Text style={styles.accountingLabel}>Kostenstelle:</Text>
                  <Text style={styles.accountingValue}>{data.cost_center ? `${data.cost_center} - ${data.cost_center_name}` : 'Nicht zugewiesen'}</Text>
                </View>
                <View style={styles.accountingRow}>
                  <Text style={styles.accountingLabel}>Buchungstext:</Text>
                  <Text style={styles.accountingValue}>{data.booking_text || data.vendor_name || '-'}</Text>
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
                      <Text style={styles.lineItemQty}>{item.quantity} x {formatCurrency(item.unit_price)}</Text>
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
                    <Text style={styles.gobdDate}>Archiviert am: {formatDateTime(invoice.archived_at)}</Text>
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
                      <Text style={styles.auditMeta}>{log.actor} • {formatDateTime(log.timestamp)}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>

        {/* Actions (extracted component) */}
        <InvoiceActions
          invoice={invoice}
          isAdmin={isAdmin}
          isManagerOrAbove={isManagerOrAbove}
          isAccountantOrAbove={isAccountantOrAbove}
          isDesktop={isDesktop}
          actionLoading={actionLoading}
          onApprove={() => setShowConfirm({ action: 'approve', title: 'Rechnung genehmigen', message: 'Möchten Sie diese Rechnung genehmigen?' })}
          onReject={() => setShowRejectModal(true)}
          onArchive={() => setShowConfirm({ action: 'archive', title: 'Rechnung archivieren', message: 'Diese Rechnung wird GoBD-konform archiviert und kann danach nicht mehr bearbeitet werden.' })}
          onDelete={() => setShowDeleteConfirm(true)}
        />

        {/* Integrations (extracted component) */}
        <IntegrationCards
          invoice={invoice}
          isAccountantOrAbove={isAccountantOrAbove}
          isDesktop={isDesktop}
          datevStatus={datevStatus}
          paymentStatus={paymentStatus}
          datevUploading={datevUploading}
          paymentInitiating={paymentInitiating}
          onDatevUpload={handleDatevUpload}
          onPaymentInitiate={handlePaymentInitiate}
        />

        {/* Export Options */}
        <View style={[styles.exportSection, isDesktop && styles.desktopExport]}>
          <Text style={styles.exportTitle}>E-Rechnung Export</Text>
          <View style={styles.exportButtons}>
            <TouchableOpacity style={styles.exportButton} onPress={() => handleExport('zugferd')} disabled={actionLoading}>
              <Ionicons name="document-text" size={20} color="#6c5ce7" />
              <Text style={styles.exportButtonText}>ZUGFeRD 2.1</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.exportButton} onPress={() => handleExport('xrechnung')} disabled={actionLoading}>
              <Ionicons name="code-slash" size={20} color="#6c5ce7" />
              <Text style={styles.exportButtonText}>XRechnung</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* OCR Edit Modal */}
      <Modal visible={showEditModal} transparent animationType="slide" onRequestClose={() => setShowEditModal(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={[styles.modalContent, isDesktop && styles.desktopModalContent, { maxHeight: '90%' }]}>
            <View style={styles.editModalHeader}>
              <Text style={styles.modalTitle}>OCR-Daten korrigieren</Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)}>
                <Ionicons name="close" size={24} color="#6e6e85" />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} nestedScrollEnabled>
              {/* Lieferant */}
              <Text style={styles.editSectionTitle}>Lieferant</Text>
              <Text style={styles.modalLabel}>Lieferantenname</Text>
              <TextInput style={styles.modalInput} value={editVendorName} onChangeText={setEditVendorName} placeholder="Lieferant..." placeholderTextColor="#9e9eaa" />
              <Text style={styles.modalLabel}>Adresse</Text>
              <TextInput style={styles.modalInput} value={editVendorAddress} onChangeText={setEditVendorAddress} placeholder="Straße, PLZ Ort..." placeholderTextColor="#9e9eaa" />
              <Text style={styles.modalLabel}>USt-IdNr</Text>
              <TextInput style={styles.modalInput} value={editVendorVatId} onChangeText={setEditVendorVatId} placeholder="DE123456789" placeholderTextColor="#9e9eaa" />
              <Text style={styles.modalLabel}>IBAN</Text>
              <TextInput style={styles.modalInput} value={editVendorIban} onChangeText={setEditVendorIban} placeholder="DE89..." placeholderTextColor="#9e9eaa" />

              {/* Rechnungsdaten */}
              <Text style={[styles.editSectionTitle, { marginTop: 16 }]}>Rechnungsdaten</Text>
              <Text style={styles.modalLabel}>Rechnungsnummer</Text>
              <TextInput style={styles.modalInput} value={editInvoiceNumber} onChangeText={setEditInvoiceNumber} placeholder="RE-2024-001" placeholderTextColor="#9e9eaa" />
              <Text style={styles.modalLabel}>Rechnungsdatum (JJJJ-MM-TT)</Text>
              <TextInput style={styles.modalInput} value={editInvoiceDate} onChangeText={setEditInvoiceDate} placeholder="2024-01-15" placeholderTextColor="#9e9eaa" />
              <Text style={styles.modalLabel}>Fälligkeitsdatum (JJJJ-MM-TT)</Text>
              <TextInput style={styles.modalInput} value={editDueDate} onChangeText={setEditDueDate} placeholder="2024-02-15" placeholderTextColor="#9e9eaa" />

              {/* Beträge */}
              <Text style={[styles.editSectionTitle, { marginTop: 16 }]}>Beträge</Text>
              <View style={styles.editAmountsRow}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.modalLabel}>Netto (€)</Text>
                  <TextInput style={styles.modalInput} value={editNetAmount} onChangeText={setEditNetAmount} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor="#9e9eaa" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalLabel}>MwSt-Satz (%)</Text>
                  <TextInput style={styles.modalInput} value={editVatRate} onChangeText={setEditVatRate} keyboardType="decimal-pad" placeholder="19" placeholderTextColor="#9e9eaa" />
                </View>
              </View>
              <View style={styles.editAmountsRow}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.modalLabel}>MwSt-Betrag (€)</Text>
                  <TextInput style={styles.modalInput} value={editVatAmount} onChangeText={setEditVatAmount} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor="#9e9eaa" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalLabel}>Brutto (€)</Text>
                  <TextInput style={styles.modalInput} value={editGrossAmount} onChangeText={setEditGrossAmount} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor="#9e9eaa" />
                </View>
              </View>
              <View style={{ height: 16 }} />
            </ScrollView>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancelButton} onPress={() => setShowEditModal(false)}>
                <Text style={styles.modalCancelText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirmButton} onPress={handleSaveInvoiceData} disabled={actionLoading}>
                {actionLoading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.modalConfirmText}>Speichern</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Accounting Modal */}
      <Modal visible={showAccountingModal} transparent animationType="slide" onRequestClose={() => setShowAccountingModal(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={[styles.modalContent, isDesktop && styles.desktopModalContent]}>
            <Text style={styles.modalTitle}>Kontierung bearbeiten</Text>
            <Text style={styles.modalLabel}>Sachkonto ({activeKontenrahmen})</Text>
            <View style={styles.pickerContainer}>
              <ScrollView style={{ maxHeight: 160 }} nestedScrollEnabled>
                {[{ number: '', name: '-- Konto wählen --' }, ...accounts].map((acc) => (
                  <TouchableOpacity
                    key={acc.number || 'empty'}
                    style={[styles.pickerItem, selectedAccount === acc.number && styles.pickerItemActive]}
                    onPress={() => setSelectedAccount(acc.number)}
                  >
                    <Text style={[styles.pickerItemText, selectedAccount === acc.number && styles.pickerItemTextActive]}>
                      {acc.number ? `${acc.number} - ${acc.name}` : acc.name}
                    </Text>
                    {selectedAccount === acc.number && acc.number !== '' && (
                      <Ionicons name="checkmark" size={16} color="#6c5ce7" />
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
            <Text style={styles.modalLabel}>Kostenstelle</Text>
            <View style={styles.pickerContainer}>
              <ScrollView style={{ maxHeight: 120 }} nestedScrollEnabled>
                {[{ number: '', name: '-- Keine Kostenstelle --' }, ...costCenters].map((cc) => (
                  <TouchableOpacity
                    key={cc.number || 'empty'}
                    style={[styles.pickerItem, selectedCostCenter === cc.number && styles.pickerItemActive]}
                    onPress={() => setSelectedCostCenter(cc.number)}
                  >
                    <Text style={[styles.pickerItemText, selectedCostCenter === cc.number && styles.pickerItemTextActive]}>
                      {cc.number ? `${cc.number} - ${cc.name}` : cc.name}
                    </Text>
                    {selectedCostCenter === cc.number && cc.number !== '' && (
                      <Ionicons name="checkmark" size={16} color="#6c5ce7" />
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
            <Text style={styles.modalLabel}>Buchungstext</Text>
            <TextInput style={styles.modalInput} value={bookingText} onChangeText={setBookingText}
              placeholder="Buchungstext eingeben..." placeholderTextColor="#636e72" />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancelButton} onPress={() => setShowAccountingModal(false)}>
                <Text style={styles.modalCancelText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirmButton} onPress={handleSaveAccounting} disabled={actionLoading}>
                {actionLoading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.modalConfirmText}>Speichern</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Reject Modal */}
      <Modal visible={showRejectModal} transparent animationType="slide" onRequestClose={() => setShowRejectModal(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={[styles.modalContent, isDesktop && styles.desktopModalContent]}>
            <Text style={styles.modalTitle}>Rechnung ablehnen</Text>
            <TextInput style={[styles.modalInput, { minHeight: 100, textAlignVertical: 'top' }]}
              value={rejectReason} onChangeText={setRejectReason}
              placeholder="Ablehnungsgrund eingeben..." placeholderTextColor="#636e72" multiline numberOfLines={4} />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancelButton} onPress={() => { setShowRejectModal(false); setRejectReason(''); }}>
                <Text style={styles.modalCancelText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalConfirmButton, { backgroundColor: '#ff7675' }]} onPress={handleReject} disabled={actionLoading}>
                {actionLoading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.modalConfirmText}>Ablehnen</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Image Modal */}
      <Modal visible={showImageModal} transparent animationType="fade" onRequestClose={() => setShowImageModal(false)}>
        <View style={styles.imageModalOverlay}>
          <TouchableOpacity style={styles.closeImageButton} onPress={() => setShowImageModal(false)}>
            <Ionicons name="close" size={32} color="#fff" />
          </TouchableOpacity>
          {invoice.image_base64 && (
            <Image
              source={{ uri: invoice.image_base64.startsWith('data:') ? invoice.image_base64 : `data:image/jpeg;base64,${invoice.image_base64}` }}
              style={styles.fullImage} resizeMode="contain"
            />
          )}
        </View>
      </Modal>

      {/* Confirmation Dialog */}
      {showConfirm && (
        <ConfirmModal
          visible={true}
          icon={showConfirm.action === 'approve' ? 'checkmark-circle' : 'archive'}
          iconColor={showConfirm.action === 'approve' ? '#55efc4' : '#6c5ce7'}
          title={showConfirm.title}
          message={showConfirm.message}
          confirmText={showConfirm.action === 'approve' ? 'Genehmigen' : 'Archivieren'}
          confirmColor={showConfirm.action === 'approve' ? '#00b894' : '#6c5ce7'}
          onCancel={() => setShowConfirm(null)}
          onConfirm={() => executeAction(showConfirm.action)}
        />
      )}

      {/* Delete Confirmation */}
      <ConfirmModal
        visible={showDeleteConfirm}
        icon="trash"
        iconColor="#ff7675"
        title="Rechnung löschen"
        message="Diese Rechnung wird unwiderruflich gelöscht. Möchten Sie fortfahren?"
        confirmText="Löschen"
        confirmColor="#d63031"
        onCancel={() => setShowDeleteConfirm(false)}
        onConfirm={handleDeleteInvoice}
      />

      {/* Toast */}
      {toast && <Toast toast={toast} onDismiss={() => setToast(null)} position="bottom" />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f0eb' },
  scrollView: { flex: 1 },
  desktopContent: { maxWidth: 1200, alignSelf: 'center', width: '100%', paddingHorizontal: 40 },
  desktopLayout: { flexDirection: 'row', gap: 24 },
  desktopLeftColumn: { flex: 1 },
  desktopRightColumn: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#6e6e85', marginTop: 12, fontSize: 16 },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { color: '#ff7675', marginTop: 16, fontSize: 16 },
  statusHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#ffffff', padding: 20, borderLeftWidth: 4 },
  statusInfo: { flex: 1 },
  statusText: { fontSize: 14, fontWeight: 'bold', textTransform: 'uppercase' },
  invoiceNumber: { fontSize: 20, fontWeight: 'bold', color: '#2c2c3e', marginTop: 4 },
  grossAmount: { fontSize: 24, fontWeight: 'bold', color: '#55efc4' },
  imageContainer: { margin: 16, borderRadius: 12, overflow: 'hidden', position: 'relative' },
  invoiceImage: { width: '100%', height: 200, backgroundColor: '#ffffff' },
  imageOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.6)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 8 },
  imageOverlayText: { color: '#ffffff', marginLeft: 8, fontSize: 14 },
  section: { padding: 16 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#6e6e85', marginBottom: 12 },
  editButton: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#6c5ce720', borderRadius: 8 },
  editButtonText: { color: '#6c5ce7', fontSize: 14, marginLeft: 4 },
  infoCard: { backgroundColor: '#ffffff', borderRadius: 12, padding: 16 },
  vendorName: { fontSize: 18, fontWeight: 'bold', color: '#2c2c3e', marginBottom: 4 },
  vendorAddress: { fontSize: 14, color: '#6e6e85', marginBottom: 12 },
  infoRow: { flexDirection: 'row', marginTop: 8 },
  infoLabel: { fontSize: 14, color: '#9e9eaa', width: 80 },
  infoValue: { fontSize: 14, color: '#2c2c3e', flex: 1 },
  accountingCard: { backgroundColor: '#ffffff', borderRadius: 12, padding: 16, borderLeftWidth: 3, borderLeftColor: '#6c5ce7' },
  accountingRow: { marginBottom: 12 },
  accountingLabel: { fontSize: 12, color: '#9e9eaa', marginBottom: 4 },
  accountingValue: { fontSize: 14, color: '#2c2c3e' },
  detailsGrid: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: '#ffffff', borderRadius: 12, padding: 8 },
  detailItem: { width: '50%', padding: 8 },
  detailLabel: { fontSize: 12, color: '#9e9eaa', marginBottom: 4 },
  detailValue: { fontSize: 16, color: '#2c2c3e' },
  amountsCard: { backgroundColor: '#ffffff', borderRadius: 12, padding: 16 },
  amountRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  amountLabel: { fontSize: 16, color: '#6e6e85' },
  amountValue: { fontSize: 16, color: '#2c2c3e' },
  amountLabelBold: { fontSize: 18, fontWeight: 'bold', color: '#2c2c3e' },
  amountValueBold: { fontSize: 18, fontWeight: 'bold', color: '#55efc4' },
  divider: { height: 1, backgroundColor: '#e5ddd5', marginVertical: 12 },
  lineItem: { backgroundColor: '#ffffff', borderRadius: 8, padding: 12, marginBottom: 8 },
  lineItemDesc: { fontSize: 14, color: '#2c2c3e', marginBottom: 8 },
  lineItemDetails: { flexDirection: 'row', justifyContent: 'space-between' },
  lineItemQty: { fontSize: 13, color: '#6e6e85' },
  lineItemTotal: { fontSize: 14, fontWeight: '600', color: '#55efc4' },
  rejectionCard: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: 'rgba(255, 118, 117, 0.1)', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#ff7675' },
  rejectionText: { flex: 1, fontSize: 14, color: '#ff7675', marginLeft: 12 },
  gobdCard: { backgroundColor: 'rgba(85, 239, 196, 0.1)', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#55efc4' },
  gobdRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  gobdLabel: { fontSize: 14, fontWeight: '600', color: '#55efc4', marginLeft: 8 },
  gobdHashLabel: { fontSize: 12, color: '#6e6e85' },
  gobdHash: { fontSize: 10, color: '#74b9ff', fontFamily: 'monospace', marginBottom: 8 },
  gobdDate: { fontSize: 12, color: '#6e6e85' },
  auditItem: { flexDirection: 'row', marginBottom: 16 },
  auditDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#6c5ce7', marginTop: 6, marginRight: 12 },
  auditContent: { flex: 1 },
  auditAction: { fontSize: 14, color: '#2c2c3e', textTransform: 'capitalize' },
  auditMeta: { fontSize: 12, color: '#9e9eaa', marginTop: 2 },
  exportSection: { padding: 16, paddingBottom: 40 },
  desktopExport: { maxWidth: 600, alignSelf: 'center' },
  exportTitle: { fontSize: 14, color: '#6e6e85', marginBottom: 12 },
  exportButtons: { flexDirection: 'row', gap: 12 },
  exportButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#6c5ce7' },
  exportButtonText: { color: '#6c5ce7', fontSize: 14, fontWeight: '600', marginLeft: 8 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#ffffff', borderRadius: 16, padding: 20 },
  desktopModalContent: { maxWidth: 500, alignSelf: 'center', width: '100%' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#2c2c3e', marginBottom: 16 },
  modalLabel: { fontSize: 14, color: '#6e6e85', marginBottom: 8, marginTop: 12 },
  pickerContainer: { backgroundColor: '#ffffff', borderRadius: 8, borderWidth: 1, borderColor: '#e5ddd5', overflow: 'hidden', marginBottom: 4 },
  pickerItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 11, borderBottomWidth: 1, borderBottomColor: '#e5ddd5' },
  pickerItemActive: { backgroundColor: '#e5ddd5' },
  pickerItemText: { color: '#636e72', fontSize: 14, flex: 1 },
  pickerItemTextActive: { color: '#2c2c3e', fontWeight: '600' },
  modalInput: { backgroundColor: '#f4f0eb', borderRadius: 8, padding: 12, fontSize: 16, color: '#2c2c3e', borderWidth: 1, borderColor: '#e5ddd5' },
  modalButtons: { flexDirection: 'row', marginTop: 20, gap: 12 },
  modalCancelButton: { flex: 1, padding: 14, borderRadius: 8, backgroundColor: '#e5ddd5', alignItems: 'center' },
  modalCancelText: { color: '#6e6e85', fontSize: 16, fontWeight: '600' },
  modalConfirmButton: { flex: 1, padding: 14, borderRadius: 8, backgroundColor: '#6c5ce7', alignItems: 'center' },
  modalConfirmText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  imageModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' },
  closeImageButton: { position: 'absolute', top: 50, right: 20, zIndex: 10, padding: 10 },
  fullImage: { width: '100%', height: '80%' },
  // OCR Edit styles
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  ocrEditButton: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#6c5ce720', borderRadius: 8 },
  ocrEditButtonText: { color: '#6c5ce7', fontSize: 12, marginLeft: 4, fontWeight: '600' },
  editModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  editSectionTitle: { fontSize: 13, fontWeight: '700', color: '#6c5ce7', marginBottom: 8, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: '#e5ddd5' },
  editAmountsRow: { flexDirection: 'row', marginBottom: 4 },
});
