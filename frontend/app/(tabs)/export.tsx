import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { apiService, Invoice } from '../../src/services/api';
import { useDesktopPadding } from '../../src/hooks/useDesktopPadding';

type ExportType = 'datev_ascii' | 'datev_xml' | 'sepa';

export default function ExportScreen() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  const paddingLeft = useDesktopPadding();
  const [loading, setLoading] = useState<ExportType | null>(null);
  const [approvedInvoices, setApprovedInvoices] = useState<Invoice[]>([]);
  const [selectedForSepa, setSelectedForSepa] = useState<string[]>([]);

  useFocusEffect(
    useCallback(() => {
      loadApprovedInvoices();
    }, [])
  );

  const loadApprovedInvoices = async () => {
    try {
      const invoices = await apiService.getInvoices('approved');
      setApprovedInvoices(invoices);
    } catch (error) {
      console.error('Error loading invoices:', error);
    }
  };

  const handleExport = async (type: ExportType) => {
    setLoading(type);
    try {
      let content: string;
      let filename: string;

      switch (type) {
        case 'datev_ascii':
          content = await apiService.exportDatevAscii();
          filename = `datev_export_${Date.now()}.csv`;
          break;
        case 'datev_xml':
          content = await apiService.exportDatevXml();
          filename = `datev_export_${Date.now()}.xml`;
          break;
        case 'sepa':
          if (selectedForSepa.length === 0) {
            Alert.alert('Fehler', 'Bitte wählen Sie mindestens eine Rechnung aus');
            setLoading(null);
            return;
          }
          content = await apiService.exportSepa(selectedForSepa);
          filename = `sepa_payment_${Date.now()}.xml`;
          break;
        default:
          throw new Error('Unknown export type');
      }

      // Use blob download for web, show content for mobile
      if (typeof window !== 'undefined' && window.document) {
        // Web: Create download link
        const blob = new Blob([content], { type: type === 'datev_ascii' ? 'text/csv' : 'application/xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        Alert.alert('Erfolg', `Export wurde heruntergeladen: ${filename}`);
      } else {
        // Mobile: Show alert with info
        Alert.alert('Export bereit', `${filename}\n\nInhalt wurde generiert. Auf mobilen Geräten wird der Export über das Share-Menü verfügbar sein.`);
      }
      
      if (type === 'sepa') {
        setSelectedForSepa([]);
      }
    } catch (error) {
      console.error('Export error:', error);
      Alert.alert('Fehler', 'Export fehlgeschlagen. Bitte versuchen Sie es erneut.');
    } finally {
      setLoading(null);
    }
  };

  const toggleSepaSelection = (id: string) => {
    setSelectedForSepa(prev => 
      prev.includes(id) 
        ? prev.filter(i => i !== id)
        : [...prev, id]
    );
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  };

  const ExportCard = ({
    type,
    title,
    description,
    icon,
    color,
  }: {
    type: ExportType;
    title: string;
    description: string;
    icon: string;
    color: string;
  }) => (
    <TouchableOpacity
      style={[styles.exportCard, { borderLeftColor: color }, isDesktop && styles.desktopExportCard]}
      onPress={() => handleExport(type)}
      disabled={loading !== null}
    >
      <View style={styles.cardContent}>
        <View style={[styles.iconContainer, { backgroundColor: color + '20' }]}>
          <Ionicons name={icon as any} size={28} color={color} />
        </View>
        <View style={styles.cardText}>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.cardDescription}>{description}</Text>
        </View>
      </View>
      {loading === type ? (
        <ActivityIndicator size="small" color={color} />
      ) : (
        <Ionicons name="download-outline" size={24} color="#636e72" />
      )}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.container, { paddingLeft: paddingLeft }]} edges={['bottom']}>
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={isDesktop && styles.desktopContent}
      >
        {/* DATEV Section */}
        <View style={[styles.section, isDesktop && styles.desktopSection]}>
          <View style={styles.sectionHeader}>
            <Ionicons name="business" size={20} color="#6c5ce7" />
            <Text style={styles.sectionTitle}>DATEV Export</Text>
          </View>
          <Text style={styles.sectionDescription}>
            Exportieren Sie Ihre genehmigten Rechnungen für DATEV
          </Text>

          <View style={isDesktop && styles.desktopCardRow}>
            <ExportCard
              type="datev_ascii"
              title="DATEV ASCII"
              description="Standard CSV-Format für DATEV"
              icon="document-text"
              color="#6c5ce7"
            />

            <ExportCard
              type="datev_xml"
              title="DATEV XML Online"
              description="XML-Format für DATEV Online"
              icon="code-slash"
              color="#a29bfe"
            />
          </View>
        </View>

        {/* SEPA Section */}
        <View style={[styles.section, isDesktop && styles.desktopSection]}>
          <View style={styles.sectionHeader}>
            <Ionicons name="card" size={20} color="#00cec9" />
            <Text style={styles.sectionTitle}>SEPA Zahlungen</Text>
          </View>
          <Text style={styles.sectionDescription}>
            SEPA XML für Bankzahlungen generieren
          </Text>

          {approvedInvoices.length > 0 ? (
            <>
              <Text style={styles.selectHint}>
                Wählen Sie Rechnungen für die Zahlung ({selectedForSepa.length} ausgewählt)
              </Text>
              <View style={styles.invoiceList}>
                {approvedInvoices.slice(0, 10).map((invoice) => (
                  <TouchableOpacity
                    key={invoice.id}
                    style={[
                      styles.invoiceItem,
                      selectedForSepa.includes(invoice.id) && styles.invoiceItemSelected
                    ]}
                    onPress={() => toggleSepaSelection(invoice.id)}
                  >
                    <View style={styles.checkbox}>
                      {selectedForSepa.includes(invoice.id) && (
                        <Ionicons name="checkmark" size={16} color="#00cec9" />
                      )}
                    </View>
                    <View style={styles.invoiceInfo}>
                      <Text style={styles.invoiceNumber}>
                        {invoice.data.invoice_number || 'Ohne Nr.'}
                      </Text>
                      <Text style={styles.invoiceVendor}>
                        {invoice.data.vendor_name}
                      </Text>
                    </View>
                    <Text style={styles.invoiceAmount}>
                      {formatCurrency(invoice.data.gross_amount)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                style={[
                  styles.sepaButton,
                  selectedForSepa.length === 0 && styles.sepaButtonDisabled
                ]}
                onPress={() => handleExport('sepa')}
                disabled={loading !== null || selectedForSepa.length === 0}
              >
                {loading === 'sepa' ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="card-outline" size={20} color="#fff" />
                    <Text style={styles.sepaButtonText}>
                      SEPA XML exportieren ({formatCurrency(
                        approvedInvoices
                          .filter(i => selectedForSepa.includes(i.id))
                          .reduce((sum, i) => sum + i.data.gross_amount, 0)
                      )})
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="card-outline" size={48} color="#636e72" />
              <Text style={styles.emptyText}>Keine genehmigten Rechnungen</Text>
              <Text style={styles.emptySubtext}>
                Genehmigen Sie Rechnungen, um SEPA-Zahlungen zu erstellen
              </Text>
            </View>
          )}
        </View>

        {/* E-Rechnung Section */}
        <View style={[styles.section, isDesktop && styles.desktopSection]}>
          <View style={styles.sectionHeader}>
            <Ionicons name="receipt" size={20} color="#fd79a8" />
            <Text style={styles.sectionTitle}>E-Rechnungen</Text>
          </View>
          <Text style={styles.sectionDescription}>
            E-Rechnungsformate für einzelne Rechnungen (in Rechnungsdetails verfügbar)
          </Text>

          <View style={styles.infoCard}>
            <Ionicons name="information-circle" size={24} color="#74b9ff" />
            <View style={styles.infoText}>
              <Text style={styles.infoTitle}>ZUGFeRD 2.1 & XRechnung</Text>
              <Text style={styles.infoDescription}>
                E-Rechnungsexporte sind für einzelne Rechnungen in den Rechnungsdetails verfügbar.
                Wählen Sie eine Rechnung aus und nutzen Sie die Export-Funktion.
              </Text>
            </View>
          </View>
        </View>

        {/* n8n Integration Section */}
        <View style={[styles.section, isDesktop && styles.desktopSection]}>
          <View style={styles.sectionHeader}>
            <Ionicons name="git-network" size={20} color="#fd79a8" />
            <Text style={styles.sectionTitle}>n8n Integration</Text>
          </View>
          <Text style={styles.sectionDescription}>
            Automatisieren Sie Ihre Workflows mit n8n
          </Text>

          <View style={styles.webhookInfo}>
            <Text style={styles.webhookTitle}>Verfügbare Webhook-Events:</Text>
            <View style={styles.webhookList}>
              <View style={styles.webhookItem}>
                <Ionicons name="add-circle" size={16} color="#55efc4" />
                <Text style={styles.webhookText}>invoice.created</Text>
              </View>
              <View style={styles.webhookItem}>
                <Ionicons name="checkmark-circle" size={16} color="#55efc4" />
                <Text style={styles.webhookText}>invoice.approved</Text>
              </View>
              <View style={styles.webhookItem}>
                <Ionicons name="close-circle" size={16} color="#ff7675" />
                <Text style={styles.webhookText}>invoice.rejected</Text>
              </View>
            </View>
            <Text style={styles.webhookNote}>
              Webhooks können in den Einstellungen konfiguriert werden.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f4f0eb',
  },
  scrollView: {
    flex: 1,
  },
  desktopContent: {
    maxWidth: 1000,
    alignSelf: 'center',
    width: '100%',
    paddingHorizontal: 40,
  },
  section: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5ddd5',
  },
  desktopSection: {
    paddingVertical: 28,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#2c2c3e',
    marginLeft: 8,
  },
  sectionDescription: {
    fontSize: 13,
    color: '#6e6e85',
    marginBottom: 16,
  },
  desktopCardRow: {
    flexDirection: 'row',
    gap: 12,
  },
  exportCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 16,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderWidth: 1,
    borderColor: '#e5ddd5',
  },
  desktopExportCard: {
    flex: 1,
    marginBottom: 0,
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardText: {
    marginLeft: 12,
    flex: 1,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#2c2c3e',
  },
  cardDescription: {
    fontSize: 13,
    color: '#6e6e85',
    marginTop: 2,
  },
  selectHint: {
    fontSize: 13,
    color: '#6c5ce7',
    marginBottom: 10,
  },
  invoiceList: {
    marginBottom: 16,
  },
  invoiceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#e5ddd5',
  },
  invoiceItemSelected: {
    borderWidth: 2,
    borderColor: '#6c5ce7',
    backgroundColor: '#6c5ce705',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#6c5ce7',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  invoiceInfo: {
    flex: 1,
  },
  invoiceNumber: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2c2c3e',
  },
  invoiceVendor: {
    fontSize: 12,
    color: '#9e9eaa',
    marginTop: 2,
  },
  invoiceAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#27ae60',
  },
  sepaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6c5ce7',
    borderRadius: 10,
    padding: 14,
  },
  sepaButtonDisabled: {
    backgroundColor: '#d0c8c0',
  },
  sepaButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 8,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 30,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5ddd5',
  },
  emptyText: {
    fontSize: 16,
    color: '#9e9eaa',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 13,
    color: '#9e9eaa',
    marginTop: 4,
    textAlign: 'center',
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5ddd5',
    borderLeftWidth: 3,
    borderLeftColor: '#6c5ce7',
  },
  infoText: {
    marginLeft: 12,
    flex: 1,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2c2c3e',
  },
  infoDescription: {
    fontSize: 13,
    color: '#6e6e85',
    marginTop: 4,
    lineHeight: 20,
  },
  webhookInfo: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5ddd5',
  },
  webhookTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2c2c3e',
    marginBottom: 10,
  },
  webhookList: {
    marginBottom: 10,
  },
  webhookItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  webhookText: {
    fontSize: 13,
    color: '#6e6e85',
    marginLeft: 8,
    fontFamily: 'monospace',
  },
  webhookNote: {
    fontSize: 12,
    color: '#9e9eaa',
    fontStyle: 'italic',
  },
});
