import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiService, Invoice } from '../../src/services/api';

export default function ArchiveScreen() {
  const router = useRouter();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadArchive = async () => {
    try {
      const data = await apiService.getArchivedInvoices();
      setInvoices(data);
    } catch (error) {
      console.error('Error loading archive:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadArchive();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadArchive();
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

  const renderInvoice = ({ item }: { item: Invoice }) => (
    <TouchableOpacity
      style={styles.invoiceCard}
      onPress={() => router.push(`/invoice/${item.id}`)}
    >
      <View style={styles.invoiceHeader}>
        <View style={styles.invoiceInfo}>
          <Text style={styles.invoiceNumber}>
            {item.data.invoice_number || 'Ohne Nummer'}
          </Text>
          <Text style={styles.vendorName}>
            {item.data.vendor_name || 'Unbekannter Lieferant'}
          </Text>
        </View>
        <View style={styles.gobdBadge}>
          <Ionicons name="shield-checkmark" size={16} color="#55efc4" />
          <Text style={styles.gobdText}>GoBD</Text>
        </View>
      </View>
      <View style={styles.invoiceDetails}>
        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>Archiviert:</Text>
          <Text style={styles.detailValue}>
            {item.archived_at ? formatDate(item.archived_at) : '-'}
          </Text>
        </View>
        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>Betrag:</Text>
          <Text style={styles.detailValueHighlight}>
            {formatCurrency(item.data.gross_amount)}
          </Text>
        </View>
      </View>
      {item.gobd_hash && (
        <View style={styles.hashContainer}>
          <Text style={styles.hashLabel}>Hash:</Text>
          <Text style={styles.hashValue} numberOfLines={1}>
            {item.gobd_hash.substring(0, 32)}...
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6c5ce7" />
          <Text style={styles.loadingText}>Lade Archiv...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Header Info */}
      <View style={styles.headerInfo}>
        <Ionicons name="shield-checkmark" size={24} color="#55efc4" />
        <View style={styles.headerTextContainer}>
          <Text style={styles.headerTitle}>GoBD-konformes Archiv</Text>
          <Text style={styles.headerSubtitle}>
            Alle archivierten Rechnungen sind revisionssicher gespeichert
          </Text>
        </View>
      </View>

      {/* Archive List */}
      <FlatList
        data={invoices}
        renderItem={renderInvoice}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6c5ce7" />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="archive-outline" size={64} color="#636e72" />
            <Text style={styles.emptyText}>Keine archivierten Rechnungen</Text>
            <Text style={styles.emptySubtext}>
              Genehmigte Rechnungen können archiviert werden
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f4f0eb',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#6e6e85',
    marginTop: 12,
    fontSize: 16,
  },
  headerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5ddd5',
    borderLeftWidth: 3,
    borderLeftColor: '#27ae60',
  },
  headerTextContainer: {
    marginLeft: 12,
    flex: 1,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#2c2c3e',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#6e6e85',
    marginTop: 2,
  },
  listContent: {
    padding: 16,
    paddingBottom: 30,
  },
  invoiceCard: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 16,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#27ae60',
  },
  invoiceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  invoiceInfo: {
    flex: 1,
  },
  invoiceNumber: {
    fontSize: 15,
    fontWeight: '700',
    color: '#2c2c3e',
  },
  vendorName: {
    fontSize: 13,
    color: '#6e6e85',
    marginTop: 3,
  },
  gobdBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#27ae6020',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  gobdText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#27ae60',
    marginLeft: 4,
  },
  invoiceDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  detailItem: {
    flexDirection: 'row',
  },
  detailLabel: {
    fontSize: 13,
    color: '#9e9eaa',
    marginRight: 6,
  },
  detailValue: {
    fontSize: 13,
    color: '#6e6e85',
  },
  detailValueHighlight: {
    fontSize: 13,
    color: '#27ae60',
    fontWeight: '600',
  },
  hashContainer: {
    flexDirection: 'row',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#e5ddd5',
  },
  hashLabel: {
    fontSize: 12,
    color: '#9e9eaa',
    marginRight: 8,
  },
  hashValue: {
    fontSize: 12,
    color: '#2980b9',
    fontFamily: 'monospace',
    flex: 1,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyText: {
    fontSize: 16,
    color: '#9e9eaa',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9e9eaa',
    marginTop: 8,
    textAlign: 'center',
  },
});
