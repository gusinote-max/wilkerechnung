import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Invoice } from '../../services/api';

interface Props {
  invoice: Invoice;
  isAccountantOrAbove: boolean;
  isDesktop: boolean;
  datevStatus: any;
  paymentStatus: any;
  datevUploading: boolean;
  paymentInitiating: boolean;
  onDatevUpload: () => void;
  onPaymentInitiate: () => void;
}

export default function IntegrationCards({
  invoice, isAccountantOrAbove, isDesktop,
  datevStatus, paymentStatus, datevUploading, paymentInitiating,
  onDatevUpload, onPaymentInitiate,
}: Props) {
  if (invoice.status === 'pending' || !isAccountantOrAbove) return null;

  const datevDone = datevStatus?.status === 'simulated' || datevStatus?.status === 'success';
  const paymentDone = paymentStatus?.status === 'simulated' || paymentStatus?.status === 'completed';
  const showPayment = invoice.status === 'approved' || invoice.status === 'archived';

  return (
    <View style={[styles.section, isDesktop && styles.desktopExport, { marginTop: 0 }]}>
      <Text style={styles.sectionTitle}>Integrationen</Text>
      <View style={{ gap: 10 }}>
        {/* DATEV */}
        <View style={styles.card}>
          <View style={[styles.iconCircle, { backgroundColor: datevDone ? '#00b89420' : '#636e7220' }]}>
            <Ionicons name={datevDone ? 'checkmark-circle' : 'cloud-upload'} size={22}
              color={datevDone ? '#00b894' : '#636e72'} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>DATEV Upload</Text>
            <Text style={styles.cardDesc}>
              {datevStatus?.status === 'simulated' ? `Simuliert \u2014 ${datevStatus.datev_document_id}` :
               datevStatus?.status === 'success' ? `\u00dcbermittelt \u2014 ${datevStatus.datev_document_id}` :
               'Noch nicht an DATEV \u00fcbermittelt'}
            </Text>
          </View>
          {(!datevStatus || datevStatus.status === 'not_uploaded') && (
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#00b894' }]}
              onPress={onDatevUpload} disabled={datevUploading}>
              {datevUploading ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="cloud-upload" size={16} color="#fff" />}
              <Text style={styles.actionBtnText}>An DATEV senden</Text>
            </TouchableOpacity>
          )}
          {datevDone && (
            <View style={[styles.doneBadge, { backgroundColor: '#00b89420' }]}>
              <Text style={[styles.doneBadgeText, { color: '#00b894' }]}>Erledigt</Text>
            </View>
          )}
        </View>

        {/* Payment */}
        {showPayment && (
          <View style={styles.card}>
            <View style={[styles.iconCircle, { backgroundColor: paymentDone ? '#0984e320' : '#636e7220' }]}>
              <Ionicons name={paymentDone ? 'checkmark-circle' : 'card'} size={22}
                color={paymentDone ? '#0984e3' : '#636e72'} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>\u00dcberweisung</Text>
              <Text style={styles.cardDesc}>
                {paymentStatus?.status === 'simulated' ? `Simuliert \u2014 ${paymentStatus.provider_transaction_id}` :
                 paymentStatus?.status === 'completed' ? `Bezahlt \u2014 ${paymentStatus.provider_transaction_id}` :
                 paymentStatus?.status === 'processing' ? 'In Bearbeitung...' :
                 'Zahlung noch nicht ausgef\u00fchrt'}
              </Text>
            </View>
            {(!paymentStatus || paymentStatus.status === 'not_paid') && (
              <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#0984e3' }]}
                onPress={onPaymentInitiate} disabled={paymentInitiating}>
                {paymentInitiating ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="card" size={16} color="#fff" />}
                <Text style={styles.actionBtnText}>\u00dcberweisen</Text>
              </TouchableOpacity>
            )}
            {paymentDone && (
              <View style={[styles.doneBadge, { backgroundColor: '#0984e320' }]}>
                <Text style={[styles.doneBadgeText, { color: '#0984e3' }]}>Bezahlt</Text>
              </View>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { padding: 16, paddingBottom: 40 },
  desktopExport: { maxWidth: 600, alignSelf: 'center' },
  sectionTitle: { fontSize: 14, color: '#6e6e85', marginBottom: 12 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f4f0eb', borderRadius: 10, padding: 14, gap: 12 },
  iconCircle: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  cardTitle: { color: '#2c2c3e', fontSize: 14, fontWeight: '600' },
  cardDesc: { color: '#6e6e85', fontSize: 12, marginTop: 2 },
  actionBtn: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionBtnText: { color: '#2c2c3e', fontSize: 13, fontWeight: '600' },
  doneBadge: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  doneBadgeText: { fontSize: 12, fontWeight: 'bold' },
});
