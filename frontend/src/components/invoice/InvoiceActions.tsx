import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Invoice } from '../../services/api';

interface Props {
  invoice: Invoice;
  isAdmin: boolean;
  isManagerOrAbove: boolean;
  isAccountantOrAbove: boolean;
  isDesktop: boolean;
  actionLoading: boolean;
  onApprove: () => void;
  onReject: () => void;
  onArchive: () => void;
  onDelete: () => void;
}

export default function InvoiceActions({
  invoice, isAdmin, isManagerOrAbove, isAccountantOrAbove, isDesktop,
  actionLoading, onApprove, onReject, onArchive, onDelete,
}: Props) {

  // Kontierung-Prüfung: Sachkonto muss gesetzt sein
  const hasKontierung = Boolean(invoice.data?.account_number?.trim());

  if (invoice.status === 'pending' && isManagerOrAbove) {
    return (
      <View style={[styles.actionsSection, isDesktop && styles.desktopActions]}>
        {/* Kontierung-Warnung */}
        {!hasKontierung && (
          <View style={styles.kontierungWarning}>
            <Ionicons name="warning" size={16} color="#fdcb6e" />
            <Text style={styles.kontierungWarningText}>
              Genehmigung gesperrt – bitte zuerst Kontierung (Sachkonto) hinterlegen.
            </Text>
          </View>
        )}

        <View style={styles.btnRow}>
          {/* Genehmigen – nur wenn kontiert */}
          <TouchableOpacity
            style={[
              styles.actionButton,
              hasKontierung ? styles.approveButton : styles.approveButtonDisabled,
            ]}
            onPress={hasKontierung ? onApprove : undefined}
            disabled={actionLoading || !hasKontierung}
            activeOpacity={hasKontierung ? 0.7 : 1}
          >
            {actionLoading ? <ActivityIndicator size="small" color="#fff" /> : (
              <View style={styles.btnContent}>
                <Ionicons
                  name={hasKontierung ? 'checkmark' : 'lock-closed'}
                  size={18}
                  color={hasKontierung ? '#fff' : '#a0a0a0'}
                />
                <Text style={[styles.actionButtonText, !hasKontierung && styles.disabledText]}>
                  {hasKontierung ? 'Genehmigen' : 'Kontierung fehlt'}
                </Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={[styles.actionButton, styles.rejectButton]} onPress={onReject} disabled={actionLoading}>
            <Ionicons name="close" size={18} color="#fff" />
            <Text style={styles.actionButtonText}>Ablehnen</Text>
          </TouchableOpacity>

          {isAdmin && (
            <TouchableOpacity style={[styles.actionButton, styles.deleteButton]} onPress={onDelete} disabled={actionLoading}>
              <Ionicons name="trash" size={18} color="#fff" />
              <Text style={styles.actionButtonText}>Löschen</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  if (invoice.status === 'approved' && isManagerOrAbove) {
    return (
      <View style={[styles.actionsSection, isDesktop && styles.desktopActions]}>
        <View style={styles.btnRow}>
          <TouchableOpacity style={[styles.actionButton, styles.archiveButton]} onPress={onArchive} disabled={actionLoading}>
            {actionLoading ? <ActivityIndicator size="small" color="#fff" /> : (
              <View style={styles.btnContent}>
                <Ionicons name="archive" size={18} color="#fff" />
                <Text style={styles.actionButtonText}>Archivieren</Text>
              </View>
            )}
          </TouchableOpacity>
          {isAdmin && (
            <TouchableOpacity style={[styles.actionButton, styles.deleteButton]} onPress={onDelete} disabled={actionLoading}>
              <Ionicons name="trash" size={18} color="#fff" />
              <Text style={styles.actionButtonText}>Löschen</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  if ((invoice.status === 'rejected' || invoice.status === 'archived') && isAdmin) {
    return (
      <View style={[styles.actionsSection, isDesktop && styles.desktopActions]}>
        <View style={styles.btnRow}>
          <TouchableOpacity style={[styles.actionButton, styles.deleteButton]} onPress={onDelete} disabled={actionLoading}>
            <Ionicons name="trash" size={18} color="#fff" />
            <Text style={styles.actionButtonText}>Löschen</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  actionsSection: { padding: 16 },
  desktopActions: { maxWidth: 600, alignSelf: 'center' },
  kontierungWarning: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fdcb6e20', borderRadius: 10, padding: 12,
    marginBottom: 12, borderWidth: 1, borderColor: '#fdcb6e40',
  },
  kontierungWarningText: { fontSize: 13, color: '#fdcb6e', flex: 1, lineHeight: 18 },
  btnRow: { flexDirection: 'row', gap: 10 },
  actionButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 14, borderRadius: 12, gap: 6 },
  btnContent: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  approveButton: { backgroundColor: '#55efc4' },
  approveButtonDisabled: { backgroundColor: '#2d2d44', borderWidth: 1, borderColor: '#636e72' },
  rejectButton: { backgroundColor: '#ff7675' },
  archiveButton: { backgroundColor: '#74b9ff' },
  deleteButton: { backgroundColor: '#d63031' },
  actionButtonText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  disabledText: { color: '#636e72' },
});
