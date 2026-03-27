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
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { apiService, Invoice, AuditLog } from '../../src/services/api';

export default function InvoiceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [auditLog, setAuditLog] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showImageModal, setShowImageModal] = useState(false);

  useEffect(() => {
    if (id) {
      loadInvoice();
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
    } catch (error) {
      console.error('Error loading invoice:', error);
      Alert.alert('Fehler', 'Rechnung konnte nicht geladen werden');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    Alert.alert(
      'Rechnung genehmigen',
      'Möchten Sie diese Rechnung genehmigen?',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Genehmigen',
          onPress: async () => {
            setActionLoading(true);
            try {
              const updated = await apiService.approveInvoice(id!, 'Manager');
              setInvoice(updated);
              Alert.alert('Erfolg', 'Rechnung wurde genehmigt');
              loadInvoice();
            } catch (error) {
              Alert.alert('Fehler', 'Genehmigung fehlgeschlagen');
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      Alert.alert('Fehler', 'Bitte geben Sie einen Ablehnungsgrund ein');
      return;
    }

    setActionLoading(true);
    try {
      const updated = await apiService.rejectInvoice(id!, 'Manager', rejectReason);
      setInvoice(updated);
      setShowRejectModal(false);
      setRejectReason('');
      Alert.alert('Erfolg', 'Rechnung wurde abgelehnt');
      loadInvoice();
    } catch (error) {
      Alert.alert('Fehler', 'Ablehnung fehlgeschlagen');
    } finally {
      setActionLoading(false);
    }
  };

  const handleArchive = async () => {
    Alert.alert(
      'Rechnung archivieren',
      'Diese Rechnung wird GoBD-konform archiviert und kann danach nicht mehr bearbeitet werden.',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Archivieren',
          onPress: async () => {
            setActionLoading(true);
            try {
              const updated = await apiService.archiveInvoice(id!);
              setInvoice(updated);
              Alert.alert('Erfolg', 'Rechnung wurde archiviert');
              loadInvoice();
            } catch (error) {
              Alert.alert('Fehler', 'Archivierung fehlgeschlagen');
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
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

      const fileUri = FileSystem.documentDirectory + filename;
      await FileSystem.writeAsStringAsync(fileUri, content);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/xml',
          dialogTitle: 'E-Rechnung exportieren',
        });
      } else {
        Alert.alert('Erfolg', `Export gespeichert: ${filename}`);
      }
    } catch (error) {
      Alert.alert('Fehler', 'Export fehlgeschlagen');
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
      <ScrollView style={styles.scrollView}>
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
              source={{ uri: `data:image/jpeg;base64,${invoice.image_base64}` }}
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

        {/* Actions */}
        {invoice.status === 'pending' && (
          <View style={styles.actionsSection}>
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
          </View>
        )}

        {invoice.status === 'approved' && (
          <View style={styles.actionsSection}>
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
          </View>
        )}

        {/* Export Options */}
        <View style={styles.exportSection}>
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
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Rechnung ablehnen</Text>
            <TextInput
              style={styles.modalInput}
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
                style={styles.modalConfirmButton}
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
              source={{ uri: `data:image/jpeg;base64,${invoice.image_base64}` }}
              style={styles.fullImage}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>
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
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#a0a0a0',
    marginBottom: 12,
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
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16,
  },
  modalInput: {
    backgroundColor: '#0f0f1a',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#fff',
    minHeight: 100,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: '#2d2d44',
  },
  modalButtons: {
    flexDirection: 'row',
    marginTop: 16,
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
    backgroundColor: '#ff7675',
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
});
