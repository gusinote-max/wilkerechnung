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

type ExportType = 'datev_ascii' | 'datev_xml' | 'sepa';

export default function ExportScreen() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
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
    <SafeAreaView style={styles.container} edges={['bottom']}>
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
    backgroundColor: '#0f0f1a',
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
    borderBottomColor: '#2d2d44',
  },
  desktopSection: {
    paddingVertical: 30,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginLeft: 8,
  },
  sectionDescription: {
    fontSize: 14,
    color: '#a0a0a0',
    marginBottom: 16,
  },
  desktopCardRow: {
    flexDirection: 'row',
    gap: 16,
  },
  exportCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
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
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardText: {
    marginLeft: 12,
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  cardDescription: {
    fontSize: 13,
    color: '#a0a0a0',
    marginTop: 2,
  },
  selectHint: {
    fontSize: 14,
    color: '#00cec9',
    marginBottom: 12,
  },
  invoiceList: {
    marginBottom: 16,
  },
  invoiceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  invoiceItemSelected: {
    borderWidth: 1,
    borderColor: '#00cec9',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#00cec9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  invoiceInfo: {
    flex: 1,
  },
  invoiceNumber: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fff',
  },
  invoiceVendor: {
    fontSize: 12,
    color: '#a0a0a0',
    marginTop: 2,
  },
  invoiceAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#55efc4',
  },
  sepaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00cec9',
    borderRadius: 12,
    padding: 16,
  },
  sepaButtonDisabled: {
    backgroundColor: '#2d2d44',
  },
  sepaButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 30,
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
  },
  emptyText: {
    fontSize: 16,
    color: '#636e72',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#636e72',
    marginTop: 4,
    textAlign: 'center',
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
  },
  infoText: {
    marginLeft: 12,
    flex: 1,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fff',
  },
  infoDescription: {
    fontSize: 13,
    color: '#a0a0a0',
    marginTop: 4,
    lineHeight: 20,
  },
  webhookInfo: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
  },
  webhookTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
  },
  webhookList: {
    marginBottom: 12,
  },
  webhookItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  webhookText: {
    fontSize: 14,
    color: '#a0a0a0',
    marginLeft: 8,
    fontFamily: 'monospace',
  },
  webhookNote: {
    fontSize: 12,
    color: '#636e72',
    fontStyle: 'italic',
  },
});
