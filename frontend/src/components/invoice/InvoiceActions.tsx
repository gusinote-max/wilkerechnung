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
  if (invoice.status === 'pending' && isManagerOrAbove) {
    return (
      <View style={[styles.actionsSection, isDesktop && styles.desktopActions]}>
        <TouchableOpacity style={[styles.actionButton, styles.approveButton]} onPress={onApprove} disabled={actionLoading}>
          {actionLoading ? <ActivityIndicator size="small" color="#fff" /> : (
            <View style={styles.btnContent}>
              <Ionicons name="checkmark" size={20} color="#fff" />
              <Text style={styles.actionButtonText}>Genehmigen</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionButton, styles.rejectButton]} onPress={onReject} disabled={actionLoading}>
          <Ionicons name="close" size={20} color="#fff" />
          <Text style={styles.actionButtonText}>Ablehnen</Text>
        </TouchableOpacity>
        {isAdmin && (
          <TouchableOpacity style={[styles.actionButton, styles.deleteButton]} onPress={onDelete} disabled={actionLoading}>
            <Ionicons name="trash" size={20} color="#fff" />
            <Text style={styles.actionButtonText}>L\u00f6schen</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  if (invoice.status === 'approved' && isManagerOrAbove) {
    return (
      <View style={[styles.actionsSection, isDesktop && styles.desktopActions]}>
        <TouchableOpacity style={[styles.actionButton, styles.archiveButton]} onPress={onArchive} disabled={actionLoading}>
          {actionLoading ? <ActivityIndicator size="small" color="#fff" /> : (
            <View style={styles.btnContent}>
              <Ionicons name="archive" size={20} color="#fff" />
              <Text style={styles.actionButtonText}>Archivieren</Text>
            </View>
          )}
        </TouchableOpacity>
        {isAdmin && (
          <TouchableOpacity style={[styles.actionButton, styles.deleteButton]} onPress={onDelete} disabled={actionLoading}>
            <Ionicons name="trash" size={20} color="#fff" />
            <Text style={styles.actionButtonText}>L\u00f6schen</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  if ((invoice.status === 'rejected' || invoice.status === 'archived') && isAdmin) {
    return (
      <View style={[styles.actionsSection, isDesktop && styles.desktopActions]}>
        <TouchableOpacity style={[styles.actionButton, styles.deleteButton]} onPress={onDelete} disabled={actionLoading}>
          <Ionicons name="trash" size={20} color="#fff" />
          <Text style={styles.actionButtonText}>L\u00f6schen</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  actionsSection: { flexDirection: 'row', padding: 16, gap: 12 },
  desktopActions: { maxWidth: 600, alignSelf: 'center' },
  actionButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 14, borderRadius: 12 },
  btnContent: { flexDirection: 'row', alignItems: 'center' },
  approveButton: { backgroundColor: '#55efc4' },
  rejectButton: { backgroundColor: '#ff7675' },
  archiveButton: { backgroundColor: '#74b9ff' },
  deleteButton: { backgroundColor: '#d63031' },
  actionButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginLeft: 8 },
});
