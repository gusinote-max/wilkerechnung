import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { apiService } from '../../src/services/api';

type ExportType = 'datev_ascii' | 'datev_xml' | 'zugferd' | 'xrechnung';

export default function ExportScreen() {
  const [loading, setLoading] = useState<ExportType | null>(null);

  const handleExport = async (type: ExportType) => {
    setLoading(type);
    try {
      let content: string;
      let filename: string;
      let mimeType: string;

      switch (type) {
        case 'datev_ascii':
          content = await apiService.exportDatevAscii();
          filename = `datev_export_${Date.now()}.csv`;
          mimeType = 'text/csv';
          break;
        case 'datev_xml':
          content = await apiService.exportDatevXml();
          filename = `datev_export_${Date.now()}.xml`;
          mimeType = 'application/xml';
          break;
        default:
          throw new Error('Export type not supported for bulk export');
      }

      const fileUri = FileSystem.documentDirectory + filename;
      await FileSystem.writeAsStringAsync(fileUri, content);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType,
          dialogTitle: 'Export speichern',
        });
      } else {
        Alert.alert('Erfolg', `Export wurde gespeichert: ${filename}`);
      }
    } catch (error) {
      console.error('Export error:', error);
      Alert.alert('Fehler', 'Export fehlgeschlagen. Bitte versuchen Sie es erneut.');
    } finally {
      setLoading(null);
    }
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
      style={[styles.exportCard, { borderLeftColor: color }]}
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
      <ScrollView style={styles.scrollView}>
        {/* DATEV Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="business" size={20} color="#6c5ce7" />
            <Text style={styles.sectionTitle}>DATEV Export</Text>
          </View>
          <Text style={styles.sectionDescription}>
            Exportieren Sie Ihre genehmigten Rechnungen für DATEV
          </Text>

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

        {/* E-Rechnung Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="receipt" size={20} color="#00cec9" />
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
        <View style={styles.section}>
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
  section: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#2d2d44',
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
