import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiService, Invoice } from '../../src/services/api';
import useAuthStore from '../../src/store/authStore';
import { useDesktopPadding } from '../../src/hooks/useDesktopPadding';

interface Stats {
  counts: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    archived: number;
    pending_reminders: number;
  };
  amounts: {
    net: number;
    vat: number;
    gross: number;
  };
}

export default function DashboardScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  const paddingLeft = useDesktopPadding();
  
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Invoice[]>([]);
  const [searching, setSearching] = useState(false);
  const { user } = useAuthStore();
  const isViewer = user?.role === 'viewer';

  const loadStats = async () => {
    try {
      const data = await apiService.getStats();
      setStats(data);
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadStats();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadStats();
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    
    setSearching(true);
    try {
      const results = await apiService.searchInvoices(searchQuery);
      setSearchResults(results);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    const delaySearch = setTimeout(() => {
      if (searchQuery.length >= 2) {
        handleSearch();
      } else {
        setSearchResults([]);
      }
    }, 300);

    return () => clearTimeout(delaySearch);
  }, [searchQuery]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6c5ce7" />
          <Text style={styles.loadingText}>Lade Dashboard...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          isDesktop && styles.desktopContent
        ]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6c5ce7" />
        }
      >
        {/* Header */}
        <View style={[styles.header, isDesktop && styles.desktopHeader]}>
          <View>
            <Text style={styles.title}>Autohaus Wilke</Text>
            <Text style={styles.subtitle}>KI-Rechnungsmanagement</Text>
          </View>
          {isDesktop && !isViewer && (
            <TouchableOpacity
              style={styles.desktopUploadButton}
              onPress={() => router.push('/upload')}
            >
              <Ionicons name="cloud-upload" size={20} color="#fff" />
              <Text style={styles.desktopUploadText}>Rechnung hochladen</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Search Bar */}
        <View style={[styles.searchContainer, isDesktop && styles.desktopSearchContainer]}>
          <View style={styles.searchInputContainer}>
            <Ionicons name="search" size={20} color="#636e72" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Volltextsuche in Rechnungen..."
              placeholderTextColor="#636e72"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
            />
            {searching && <ActivityIndicator size="small" color="#6c5ce7" />}
            {searchQuery.length > 0 && !searching && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={20} color="#636e72" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Search Results */}
        {searchResults.length > 0 && (
          <View style={[styles.searchResults, isDesktop && styles.desktopSearchResults]}>
            <Text style={styles.searchResultsTitle}>
              {searchResults.length} Ergebnis{searchResults.length !== 1 ? 'se' : ''} gefunden
            </Text>
            {searchResults.slice(0, 5).map((invoice) => (
              <TouchableOpacity
                key={invoice.id}
                style={styles.searchResultItem}
                onPress={() => {
                  setSearchQuery('');
                  setSearchResults([]);
                  router.push(`/invoice/${invoice.id}`);
                }}
              >
                <View style={styles.searchResultInfo}>
                  <Text style={styles.searchResultNumber}>
                    {invoice.data.invoice_number || 'Ohne Nummer'}
                  </Text>
                  <Text style={styles.searchResultVendor}>
                    {invoice.data.vendor_name}
                  </Text>
                </View>
                <Text style={styles.searchResultAmount}>
                  {formatCurrency(invoice.data.gross_amount)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Quick Action - Mobile Only */}
        {!isDesktop && (
          <TouchableOpacity
            style={styles.uploadButton}
            onPress={() => router.push('/upload')}
          >
            <Ionicons name="cloud-upload" size={32} color="#fff" />
            <Text style={styles.uploadButtonText}>Rechnung hochladen</Text>
            <Text style={styles.uploadButtonSubtext}>KI-gestützte OCR-Erkennung</Text>
          </TouchableOpacity>
        )}

        {/* Stats Grid */}
        <View style={[styles.statsGrid, isDesktop && styles.desktopStatsGrid]}>
          <TouchableOpacity
            style={[styles.statCard, styles.pendingCard, isDesktop && styles.desktopStatCard]}
            onPress={() => router.push('/invoices?status=pending')}
          >
            <Ionicons name="time" size={28} color="#ffeaa7" />
            <Text style={styles.statNumber}>{stats?.counts.pending || 0}</Text>
            <Text style={styles.statLabel}>Ausstehend</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.statCard, styles.approvedCard, isDesktop && styles.desktopStatCard]}
            onPress={() => router.push('/invoices?status=approved')}
          >
            <Ionicons name="checkmark-circle" size={28} color="#55efc4" />
            <Text style={styles.statNumber}>{stats?.counts.approved || 0}</Text>
            <Text style={styles.statLabel}>Genehmigt</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.statCard, styles.rejectedCard, isDesktop && styles.desktopStatCard]}
            onPress={() => router.push('/invoices?status=rejected')}
          >
            <Ionicons name="close-circle" size={28} color="#ff7675" />
            <Text style={styles.statNumber}>{stats?.counts.rejected || 0}</Text>
            <Text style={styles.statLabel}>Abgelehnt</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.statCard, styles.archivedCard, isDesktop && styles.desktopStatCard]}
            onPress={() => router.push('/archive')}
          >
            <Ionicons name="archive" size={28} color="#74b9ff" />
            <Text style={styles.statNumber}>{stats?.counts.archived || 0}</Text>
            <Text style={styles.statLabel}>Archiviert</Text>
          </TouchableOpacity>
        </View>

        {/* Desktop: Two Column Layout */}
        <View style={[styles.bottomSection, isDesktop && styles.desktopBottomSection]}>
          {/* Financial Summary */}
          <View style={[styles.financialCard, isDesktop && styles.desktopFinancialCard]}>
            <Text style={styles.financialTitle}>Finanzübersicht</Text>
            <View style={styles.financialRow}>
              <Text style={styles.financialLabel}>Netto:</Text>
              <Text style={styles.financialValue}>{formatCurrency(stats?.amounts.net || 0)}</Text>
            </View>
            <View style={styles.financialRow}>
              <Text style={styles.financialLabel}>MwSt:</Text>
              <Text style={styles.financialValue}>{formatCurrency(stats?.amounts.vat || 0)}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.financialRow}>
              <Text style={styles.financialLabelBold}>Brutto:</Text>
              <Text style={styles.financialValueBold}>{formatCurrency(stats?.amounts.gross || 0)}</Text>
            </View>
          </View>

          {/* Reminders Card */}
          {(stats?.counts.pending_reminders || 0) > 0 && (
            <View style={[styles.reminderCard, isDesktop && styles.desktopReminderCard]}>
              <View style={styles.reminderHeader}>
                <Ionicons name="notifications" size={24} color="#fd79a8" />
                <Text style={styles.reminderTitle}>Erinnerungen</Text>
              </View>
              <Text style={styles.reminderCount}>
                {stats?.counts.pending_reminders} offene Erinnerung{stats?.counts.pending_reminders !== 1 ? 'en' : ''}
              </Text>
            </View>
          )}
        </View>

        {/* Quick Links */}
        <View style={[styles.quickLinks, isDesktop && styles.desktopQuickLinks]}>
          <TouchableOpacity
            style={[styles.quickLink, isDesktop && styles.desktopQuickLink]}
            onPress={() => router.push('/export')}
          >
            <Ionicons name="download-outline" size={24} color="#6c5ce7" />
            <Text style={styles.quickLinkText}>DATEV Export</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.quickLink, isDesktop && styles.desktopQuickLink]}
            onPress={() => router.push('/settings')}
          >
            <Ionicons name="cog-outline" size={24} color="#6c5ce7" />
            <Text style={styles.quickLinkText}>Einstellungen</Text>
          </TouchableOpacity>
          {isDesktop && (
            <>
              <TouchableOpacity
                style={[styles.quickLink, styles.desktopQuickLink]}
                onPress={() => router.push('/invoices')}
              >
                <Ionicons name="document-text-outline" size={24} color="#6c5ce7" />
                <Text style={styles.quickLinkText}>Alle Rechnungen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.quickLink, styles.desktopQuickLink]}
                onPress={() => router.push('/archive')}
              >
                <Ionicons name="archive-outline" size={24} color="#6c5ce7" />
                <Text style={styles.quickLinkText}>Archiv</Text>
              </TouchableOpacity>
            </>
          )}
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
  scrollContent: {
    paddingBottom: 30,
  },
  desktopContent: {
    maxWidth: 1200,
    alignSelf: 'center',
    width: '100%',
    paddingHorizontal: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f4f0eb',
  },
  loadingText: {
    color: '#6e6e85',
    marginTop: 12,
    fontSize: 16,
  },
  header: {
    padding: 20,
    paddingTop: 10,
  },
  desktopHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 30,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#2c2c3e',
  },
  subtitle: {
    fontSize: 14,
    color: '#6e6e85',
    marginTop: 4,
  },
  desktopUploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6c5ce7',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    shadowColor: '#6c5ce7',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  desktopUploadText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  searchContainer: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  desktopSearchContainer: {
    paddingHorizontal: 0,
    marginBottom: 24,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 50,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#2c2c3e',
  },
  searchResults: {
    marginHorizontal: 20,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e5ddd5',
  },
  desktopSearchResults: {
    marginHorizontal: 0,
  },
  searchResultsTitle: {
    fontSize: 13,
    color: '#9e9eaa',
    marginBottom: 10,
  },
  searchResultItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f4f0eb',
  },
  searchResultInfo: {
    flex: 1,
  },
  searchResultNumber: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2c2c3e',
  },
  searchResultVendor: {
    fontSize: 12,
    color: '#9e9eaa',
    marginTop: 2,
  },
  searchResultAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: '#27ae60',
  },
  uploadButton: {
    backgroundColor: '#6c5ce7',
    marginHorizontal: 20,
    borderRadius: 14,
    padding: 22,
    alignItems: 'center',
    shadowColor: '#6c5ce7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  uploadButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    marginTop: 8,
  },
  uploadButtonSubtext: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    marginTop: 4,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 10,
    marginTop: 10,
  },
  desktopStatsGrid: {
    padding: 0,
    marginTop: 20,
  },
  statCard: {
    width: '46%',
    margin: '2%',
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5ddd5',
    shadowColor: '#1e1535',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  desktopStatCard: {
    width: '23%',
    margin: '1%',
    padding: 24,
  },
  pendingCard: {
    borderLeftWidth: 3,
    borderLeftColor: '#e67e22',
  },
  approvedCard: {
    borderLeftWidth: 3,
    borderLeftColor: '#27ae60',
  },
  rejectedCard: {
    borderLeftWidth: 3,
    borderLeftColor: '#e74c3c',
  },
  archivedCard: {
    borderLeftWidth: 3,
    borderLeftColor: '#2980b9',
  },
  statNumber: {
    fontSize: 32,
    fontWeight: '700',
    color: '#2c2c3e',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 13,
    color: '#6e6e85',
    marginTop: 4,
  },
  bottomSection: {
    paddingHorizontal: 20,
  },
  desktopBottomSection: {
    flexDirection: 'row',
    paddingHorizontal: 0,
    gap: 20,
    marginTop: 20,
  },
  financialCard: {
    backgroundColor: '#ffffff',
    marginTop: 10,
    borderRadius: 10,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e5ddd5',
  },
  desktopFinancialCard: {
    flex: 1,
    marginTop: 0,
  },
  financialTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2c2c3e',
    marginBottom: 16,
  },
  financialRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  financialLabel: {
    fontSize: 14,
    color: '#6e6e85',
  },
  financialValue: {
    fontSize: 14,
    color: '#2c2c3e',
    fontWeight: '500',
  },
  financialLabelBold: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2c2c3e',
  },
  financialValueBold: {
    fontSize: 16,
    fontWeight: '700',
    color: '#27ae60',
  },
  divider: {
    height: 1,
    backgroundColor: '#e5ddd5',
    marginVertical: 12,
  },
  reminderCard: {
    backgroundColor: '#ffffff',
    marginTop: 10,
    borderRadius: 10,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e5ddd5',
    borderLeftWidth: 3,
    borderLeftColor: '#e74c3c',
  },
  desktopReminderCard: {
    flex: 1,
    marginTop: 0,
  },
  reminderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  reminderTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#2c2c3e',
    marginLeft: 10,
  },
  reminderCount: {
    fontSize: 13,
    color: '#e74c3c',
  },
  quickLinks: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginTop: 16,
  },
  desktopQuickLinks: {
    paddingHorizontal: 0,
    marginTop: 24,
    flexWrap: 'wrap',
  },
  quickLink: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    marginHorizontal: 5,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e5ddd5',
  },
  desktopQuickLink: {
    flex: 0,
    flexGrow: 1,
    marginHorizontal: 8,
    marginBottom: 8,
  },
  quickLinkText: {
    color: '#2c2c3e',
    fontSize: 13,
    fontWeight: '500',
    marginLeft: 8,
  },
});
