import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiService } from '../../src/services/api';

interface Stats {
  counts: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    archived: number;
  };
  amounts: {
    net: number;
    vat: number;
    gross: number;
  };
}

export default function DashboardScreen() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6c5ce7" />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Candis-Kopie</Text>
          <Text style={styles.subtitle}>KI-Rechnungsmanagement</Text>
        </View>

        {/* Quick Action */}
        <TouchableOpacity
          style={styles.uploadButton}
          onPress={() => router.push('/upload')}
        >
          <Ionicons name="cloud-upload" size={32} color="#fff" />
          <Text style={styles.uploadButtonText}>Rechnung hochladen</Text>
          <Text style={styles.uploadButtonSubtext}>KI-gestützte OCR-Erkennung</Text>
        </TouchableOpacity>

        {/* Stats Cards */}
        <View style={styles.statsGrid}>
          <TouchableOpacity
            style={[styles.statCard, styles.pendingCard]}
            onPress={() => router.push('/invoices?status=pending')}
          >
            <Ionicons name="time" size={28} color="#ffeaa7" />
            <Text style={styles.statNumber}>{stats?.counts.pending || 0}</Text>
            <Text style={styles.statLabel}>Ausstehend</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.statCard, styles.approvedCard]}
            onPress={() => router.push('/invoices?status=approved')}
          >
            <Ionicons name="checkmark-circle" size={28} color="#55efc4" />
            <Text style={styles.statNumber}>{stats?.counts.approved || 0}</Text>
            <Text style={styles.statLabel}>Genehmigt</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.statCard, styles.rejectedCard]}
            onPress={() => router.push('/invoices?status=rejected')}
          >
            <Ionicons name="close-circle" size={28} color="#ff7675" />
            <Text style={styles.statNumber}>{stats?.counts.rejected || 0}</Text>
            <Text style={styles.statLabel}>Abgelehnt</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.statCard, styles.archivedCard]}
            onPress={() => router.push('/archive')}
          >
            <Ionicons name="archive" size={28} color="#74b9ff" />
            <Text style={styles.statNumber}>{stats?.counts.archived || 0}</Text>
            <Text style={styles.statLabel}>Archiviert</Text>
          </TouchableOpacity>
        </View>

        {/* Financial Summary */}
        <View style={styles.financialCard}>
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

        {/* Quick Links */}
        <View style={styles.quickLinks}>
          <TouchableOpacity
            style={styles.quickLink}
            onPress={() => router.push('/export')}
          >
            <Ionicons name="download-outline" size={24} color="#6c5ce7" />
            <Text style={styles.quickLinkText}>DATEV Export</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickLink}
            onPress={() => router.push('/settings')}
          >
            <Ionicons name="cog-outline" size={24} color="#6c5ce7" />
            <Text style={styles.quickLinkText}>Einstellungen</Text>
          </TouchableOpacity>
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
  header: {
    padding: 20,
    paddingTop: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  subtitle: {
    fontSize: 16,
    color: '#6c5ce7',
    marginTop: 4,
  },
  uploadButton: {
    backgroundColor: '#6c5ce7',
    marginHorizontal: 20,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#6c5ce7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  uploadButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 8,
  },
  uploadButtonSubtext: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    marginTop: 4,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 10,
    marginTop: 10,
  },
  statCard: {
    width: '46%',
    margin: '2%',
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  pendingCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#ffeaa7',
  },
  approvedCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#55efc4',
  },
  rejectedCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#ff7675',
  },
  archivedCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#74b9ff',
  },
  statNumber: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 14,
    color: '#a0a0a0',
    marginTop: 4,
  },
  financialCard: {
    backgroundColor: '#1a1a2e',
    marginHorizontal: 20,
    marginTop: 10,
    borderRadius: 12,
    padding: 20,
  },
  financialTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16,
  },
  financialRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  financialLabel: {
    fontSize: 16,
    color: '#a0a0a0',
  },
  financialValue: {
    fontSize: 16,
    color: '#fff',
  },
  financialLabelBold: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  financialValueBold: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#55efc4',
  },
  divider: {
    height: 1,
    backgroundColor: '#2d2d44',
    marginVertical: 12,
  },
  quickLinks: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginTop: 16,
    marginBottom: 30,
  },
  quickLink: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1a2e',
    marginHorizontal: 5,
    borderRadius: 12,
    padding: 16,
  },
  quickLinkText: {
    color: '#fff',
    fontSize: 14,
    marginLeft: 8,
  },
});
