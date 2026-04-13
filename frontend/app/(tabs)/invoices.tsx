import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiService, Invoice } from '../../src/services/api';
import { useDesktopPadding } from '../../src/hooks/useDesktopPadding';

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected';

export default function InvoicesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= 900;
  const paddingLeft = useDesktopPadding();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>((params.status as StatusFilter) || 'all');

  const loadInvoices = async () => {
    try {
      const status = filter === 'all' ? undefined : filter;
      const data = await apiService.getInvoices(status);
      setInvoices(data);
    } catch (error) {
      console.error('Error loading invoices:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadInvoices();
    }, [filter])
  );

  useEffect(() => {
    if (params.status) {
      setFilter(params.status as StatusFilter);
    }
  }, [params.status]);

  const onRefresh = () => {
    setRefreshing(true);
    loadInvoices();
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return '#ffeaa7';
      case 'approved': return '#55efc4';
      case 'rejected': return '#ff7675';
      case 'archived': return '#74b9ff';
      default: return '#a0a0a0';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return 'time';
      case 'approved': return 'checkmark-circle';
      case 'rejected': return 'close-circle';
      case 'archived': return 'archive';
      default: return 'help-circle';
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
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
          <Ionicons
            name={getStatusIcon(item.status) as any}
            size={16}
            color={getStatusColor(item.status)}
          />
          <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
            {getStatusLabel(item.status)}
          </Text>
        </View>
      </View>
      <View style={styles.invoiceDetails}>
        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>Datum:</Text>
          <Text style={styles.detailValue}>{formatDate(item.data.invoice_date)}</Text>
        </View>
        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>Betrag:</Text>
          <Text style={styles.detailValueHighlight}>
            {formatCurrency(item.data.gross_amount)}
          </Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={20} color="#636e72" style={styles.chevron} />
    </TouchableOpacity>
  );

  const FilterButton = ({ value, label }: { value: StatusFilter; label: string }) => (
    <TouchableOpacity
      style={[styles.filterButton, filter === value && styles.filterButtonActive]}
      onPress={() => setFilter(value)}
    >
      <Text style={[styles.filterButtonText, filter === value && styles.filterButtonTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { paddingLeft: paddingLeft }]} edges={['bottom']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6c5ce7" />
          <Text style={styles.loadingText}>Lade Rechnungen...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { paddingLeft: paddingLeft }]} edges={['bottom']}>
      {/* Filter Bar */}
      <View style={styles.filterBar}>
        <FilterButton value="all" label="Alle" />
        <FilterButton value="pending" label="Ausstehend" />
        <FilterButton value="approved" label="Genehmigt" />
        <FilterButton value="rejected" label="Abgelehnt" />
      </View>

      {/* Invoice List */}
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
            <Ionicons name="document-text-outline" size={64} color="#636e72" />
            <Text style={styles.emptyText}>Keine Rechnungen gefunden</Text>
            <TouchableOpacity
              style={styles.uploadPrompt}
              onPress={() => router.push('/upload')}
            >
              <Text style={styles.uploadPromptText}>Erste Rechnung hochladen</Text>
            </TouchableOpacity>
          </View>
        }
      />

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/upload')}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>
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
  filterBar: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5ddd5',
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    marginHorizontal: 4,
    backgroundColor: '#ede8e0',
  },
  filterButtonActive: {
    backgroundColor: '#6c5ce7',
  },
  filterButtonText: {
    color: '#6e6e85',
    fontSize: 13,
    fontWeight: '500',
  },
  filterButtonTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  listContent: {
    padding: 16,
    paddingBottom: 100,
  },
  invoiceCard: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e5ddd5',
    shadowColor: '#1e1535',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
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
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
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
    fontSize: 14,
    color: '#27ae60',
    fontWeight: '700',
  },
  chevron: {
    position: 'absolute',
    right: 16,
    top: '50%',
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
  uploadPrompt: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#6c5ce7',
    borderRadius: 8,
  },
  uploadPromptText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#6c5ce7',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#6c5ce7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
});
