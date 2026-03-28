import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput,
  Modal, ScrollView, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiService, User } from '../../services/api';
import { getRoleColor, getRoleName, getRoleIcon } from '../../utils/roleHelpers';

interface Props {
  users: User[];
  currentUserId?: string;
  isDesktop: boolean;
  showToast: (type: 'success' | 'error', message: string) => void;
  onUsersChange: (users: User[]) => void;
}

export default function UserManagementSection({ users, currentUserId, isDesktop, showToast, onUsersChange }: Props) {
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<'admin' | 'manager' | 'accountant' | 'viewer'>('viewer');
  const [creatingUser, setCreatingUser] = useState(false);

  const handleUpdateUserRole = async (userId: string, newRole: string) => {
    try {
      await apiService.updateUser(userId, { role: newRole } as any);
      onUsersChange(users.map(u => u.id === userId ? { ...u, role: newRole as any } : u));
      setEditingUser(null);
      showToast('success', 'Benutzerrolle wurde aktualisiert');
    } catch (error: any) {
      showToast('error', 'Rolle konnte nicht geändert werden');
    }
  };

  const handleToggleUserActive = async (userId: string, active: boolean) => {
    try {
      await apiService.updateUser(userId, { active } as any);
      onUsersChange(users.map(u => u.id === userId ? { ...u, active } : u));
      showToast('success', active ? 'Benutzer aktiviert' : 'Benutzer deaktiviert');
    } catch (error: any) {
      showToast('error', 'Status konnte nicht geändert werden');
    }
  };

  const confirmDeleteUser = async () => {
    if (!showDeleteConfirm) return;
    try {
      await apiService.deleteUser(showDeleteConfirm);
      onUsersChange(users.filter(u => u.id !== showDeleteConfirm));
      setEditingUser(null);
      setShowDeleteConfirm(null);
      showToast('success', 'Benutzer wurde gelöscht');
    } catch (error: any) {
      setShowDeleteConfirm(null);
      showToast('error', 'Benutzer konnte nicht gelöscht werden');
    }
  };

  const handleCreateUser = async () => {
    if (!newUserName.trim() || !newUserEmail.trim() || !newUserPassword.trim()) {
      showToast('error', 'Bitte alle Felder ausfüllen');
      return;
    }
    setCreatingUser(true);
    try {
      const newUser = await apiService.register({
        name: newUserName.trim(),
        email: newUserEmail.trim(),
        password: newUserPassword.trim(),
        role: newUserRole,
      });
      onUsersChange([...users, newUser]);
      setShowCreateUser(false);
      setNewUserName('');
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserRole('viewer');
      showToast('success', `Benutzer "${newUser.name}" wurde erstellt`);
    } catch (error: any) {
      const msg = error?.response?.data?.detail || 'Benutzer konnte nicht erstellt werden';
      showToast('error', msg);
    } finally {
      setCreatingUser(false);
    }
  };

  const roleOptions = [
    { key: 'admin', name: 'Admin', desc: 'Vollzugriff auf alle Funktionen', icon: 'shield-checkmark' as const },
    { key: 'manager', name: 'Manager', desc: 'Rechnungen genehmigen und verwalten', icon: 'briefcase' as const },
    { key: 'accountant', name: 'Buchhalter', desc: 'Rechnungen bearbeiten und exportieren', icon: 'calculator' as const },
    { key: 'viewer', name: 'Nur Lesen', desc: 'Rechnungen nur einsehen', icon: 'eye' as const },
  ];

  return (
    <View style={[styles.section, isDesktop && styles.desktopSection]}>
      <View style={styles.sectionHeader}>
        <Ionicons name="people" size={20} color="#6c5ce7" />
        <Text style={styles.sectionTitle}>Benutzerverwaltung</Text>
        <View style={styles.userCount}>
          <Text style={styles.userCountText}>{users.length}</Text>
        </View>
      </View>

      {users.length === 0 ? (
        <Text style={styles.emptyText}>Keine Benutzer vorhanden</Text>
      ) : (
        users.map((u) => (
          <View key={u.id} style={styles.userListItem}>
            <View style={styles.userListAvatar}>
              <Ionicons
                name={getRoleIcon(u.role)}
                size={22}
                color={u.active ? '#6c5ce7' : '#636e72'}
              />
            </View>
            <View style={styles.userListInfo}>
              <Text style={[styles.userListName, !u.active && styles.userInactive]}>{u.name}</Text>
              <Text style={styles.userListEmail}>{u.email}</Text>
            </View>
            <View style={[styles.userRoleBadge, { backgroundColor: getRoleColor(u.role) + '20' }]}>
              <Text style={[styles.userRoleBadgeText, { color: getRoleColor(u.role) }]}>
                {getRoleName(u.role)}
              </Text>
            </View>
            {u.id !== currentUserId && (
              <TouchableOpacity style={styles.userEditBtn} onPress={() => setEditingUser(u)}>
                <Ionicons name="create-outline" size={20} color="#6c5ce7" />
              </TouchableOpacity>
            )}
          </View>
        ))
      )}

      <TouchableOpacity style={styles.addUserBtn} onPress={() => setShowCreateUser(true)}>
        <Ionicons name="person-add" size={20} color="#fff" />
        <Text style={styles.addUserBtnText}>Neuen Benutzer anlegen</Text>
      </TouchableOpacity>

      {/* User Edit Modal */}
      {editingUser && (
        <Modal visible={true} transparent animationType="fade" onRequestClose={() => setEditingUser(null)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Benutzer bearbeiten</Text>
                <TouchableOpacity onPress={() => setEditingUser(null)}>
                  <Ionicons name="close" size={24} color="#fff" />
                </TouchableOpacity>
              </View>
              <ScrollView style={{ padding: 16, maxHeight: 500 }}>
                <View style={styles.userEditHeader}>
                  <Ionicons name="person-circle" size={48} color="#6c5ce7" />
                  <Text style={styles.userEditName}>{editingUser.name}</Text>
                  <Text style={styles.userEditEmail}>{editingUser.email}</Text>
                </View>
                <Text style={styles.userEditSectionTitle}>Rolle zuweisen</Text>
                {roleOptions.map((role) => (
                  <TouchableOpacity
                    key={role.key}
                    style={[styles.roleOption, editingUser.role === role.key && styles.roleOptionSelected]}
                    onPress={() => handleUpdateUserRole(editingUser.id, role.key)}
                  >
                    <Ionicons
                      name={role.icon}
                      size={22}
                      color={editingUser.role === role.key ? '#fff' : getRoleColor(role.key)}
                    />
                    <View style={styles.roleOptionInfo}>
                      <Text style={[styles.roleOptionName, editingUser.role === role.key && styles.roleOptionNameSelected]}>
                        {role.name}
                      </Text>
                      <Text style={[styles.roleOptionDesc, editingUser.role === role.key && styles.roleOptionDescSelected]}>
                        {role.desc}
                      </Text>
                    </View>
                    {editingUser.role === role.key && (
                      <Ionicons name="checkmark-circle" size={22} color="#fff" />
                    )}
                  </TouchableOpacity>
                ))}
                <View style={styles.userEditActions}>
                  <TouchableOpacity
                    style={[styles.userToggleBtn, editingUser.active ? styles.userDeactivateBtn : styles.userActivateBtn]}
                    onPress={() => handleToggleUserActive(editingUser.id, !editingUser.active)}
                  >
                    <Ionicons name={editingUser.active ? 'close-circle' : 'checkmark-circle'} size={18} color="#fff" />
                    <Text style={styles.userToggleBtnText}>{editingUser.active ? 'Deaktivieren' : 'Aktivieren'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.userDeleteBtn} onPress={() => setShowDeleteConfirm(editingUser.id)}>
                    <Ionicons name="trash" size={18} color="#ff7675" />
                    <Text style={styles.userDeleteBtnText}>Benutzer löschen</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}

      {/* Delete User Confirm */}
      <Modal visible={showDeleteConfirm !== null} transparent animationType="fade" onRequestClose={() => setShowDeleteConfirm(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxWidth: 380 }]}>
            <View style={{ padding: 24, alignItems: 'center' }}>
              <Ionicons name="trash-outline" size={48} color="#ff7675" />
              <Text style={[styles.modalTitle, { marginTop: 16, textAlign: 'center' }]}>Benutzer löschen</Text>
              <Text style={{ color: '#a0a0a0', fontSize: 14, marginTop: 8, textAlign: 'center' }}>
                Dieser Vorgang kann nicht rückgängig gemacht werden. Möchten Sie fortfahren?
              </Text>
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 24, width: '100%' }}>
                <TouchableOpacity
                  style={[styles.cancelButton, { flex: 1 }]}
                  onPress={() => setShowDeleteConfirm(null)}
                >
                  <Text style={styles.cancelButtonText}>Abbrechen</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 1, alignItems: 'center', backgroundColor: '#ff7675', borderRadius: 8, padding: 12 }}
                  onPress={confirmDeleteUser}
                >
                  <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>Löschen</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Create User Modal */}
      <Modal visible={showCreateUser} transparent animationType="fade" onRequestClose={() => setShowCreateUser(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxWidth: 480 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Neuen Benutzer anlegen</Text>
              <TouchableOpacity onPress={() => setShowCreateUser(false)}>
                <Ionicons name="close" size={24} color="#a0a0a0" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 500 }}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Name *</Text>
                <TextInput style={styles.input} value={newUserName} onChangeText={setNewUserName}
                  placeholder="Vor- und Nachname" placeholderTextColor="#636e72" />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>E-Mail *</Text>
                <TextInput style={styles.input} value={newUserEmail} onChangeText={setNewUserEmail}
                  placeholder="benutzer@firma.de" placeholderTextColor="#636e72"
                  keyboardType="email-address" autoCapitalize="none" />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Passwort *</Text>
                <TextInput style={styles.input} value={newUserPassword} onChangeText={setNewUserPassword}
                  placeholder="Mindestens 6 Zeichen" placeholderTextColor="#636e72" secureTextEntry />
              </View>
              <View style={styles.inputGroup}>
                <Text style={[styles.label, { marginBottom: 10 }]}>Rolle *</Text>
                {roleOptions.map((role) => (
                  <TouchableOpacity
                    key={role.key}
                    style={[styles.roleOption, newUserRole === role.key && styles.roleOptionSelected]}
                    onPress={() => setNewUserRole(role.key as 'admin' | 'manager' | 'accountant' | 'viewer')}
                  >
                    <Ionicons name={role.icon} size={20} color={newUserRole === role.key ? '#fff' : '#6c5ce7'} />
                    <View style={styles.roleOptionInfo}>
                      <Text style={[styles.roleOptionName, newUserRole === role.key && styles.roleOptionNameSelected]}>{role.name}</Text>
                      <Text style={[styles.roleOptionDesc, newUserRole === role.key && styles.roleOptionDescSelected]}>{role.desc}</Text>
                    </View>
                    {newUserRole === role.key && <Ionicons name="checkmark-circle" size={20} color="#fff" />}
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
              <TouchableOpacity style={[styles.cancelButton, { flex: 1 }]} onPress={() => setShowCreateUser(false)}>
                <Text style={styles.cancelButtonText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, alignItems: 'center', backgroundColor: '#6c5ce7', borderRadius: 8, padding: 14, flexDirection: 'row', justifyContent: 'center', gap: 8 }}
                onPress={handleCreateUser}
                disabled={creatingUser}
              >
                {creatingUser ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="person-add" size={18} color="#fff" />
                    <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>Erstellen</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { backgroundColor: '#1a1a2e', marginHorizontal: 16, marginTop: 16, borderRadius: 16, padding: 20 },
  desktopSection: { marginHorizontal: 0 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 10 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff', flex: 1 },
  userCount: { backgroundColor: '#6c5ce730', width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  userCountText: { color: '#6c5ce7', fontSize: 13, fontWeight: 'bold' },
  emptyText: { color: '#636e72', fontSize: 14, textAlign: 'center', paddingVertical: 20 },
  userListItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#2d2d44', gap: 12 },
  userListAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#6c5ce715', justifyContent: 'center', alignItems: 'center' },
  userListInfo: { flex: 1 },
  userListName: { fontSize: 15, fontWeight: '600', color: '#fff' },
  userInactive: { opacity: 0.5 },
  userListEmail: { fontSize: 13, color: '#a0a0a0', marginTop: 2 },
  userRoleBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, marginRight: 8 },
  userRoleBadgeText: { fontSize: 12, fontWeight: 'bold' },
  userEditBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#6c5ce715', justifyContent: 'center', alignItems: 'center' },
  addUserBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#6c5ce7', borderRadius: 10, padding: 14, marginTop: 12, gap: 8 },
  addUserBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#1a1a2e', borderRadius: 16, padding: 20, maxWidth: 500, alignSelf: 'center', width: '100%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  userEditHeader: { alignItems: 'center', marginBottom: 24 },
  userEditName: { fontSize: 20, fontWeight: 'bold', color: '#fff', marginTop: 8 },
  userEditEmail: { fontSize: 14, color: '#a0a0a0', marginTop: 4 },
  userEditSectionTitle: { fontSize: 14, fontWeight: '600', color: '#a0a0a0', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 },
  roleOption: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0f0f1a', borderRadius: 10, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#2d2d44' },
  roleOptionSelected: { backgroundColor: '#6c5ce7', borderColor: '#6c5ce7' },
  roleOptionInfo: { flex: 1, marginLeft: 12 },
  roleOptionName: { fontSize: 15, fontWeight: '600', color: '#fff' },
  roleOptionNameSelected: { color: '#fff' },
  roleOptionDesc: { fontSize: 12, color: '#a0a0a0', marginTop: 2 },
  roleOptionDescSelected: { color: 'rgba(255,255,255,0.8)' },
  userEditActions: { marginTop: 24, gap: 10 },
  userToggleBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 12, borderRadius: 8, gap: 8 },
  userDeactivateBtn: { backgroundColor: '#e17055' },
  userActivateBtn: { backgroundColor: '#00b894' },
  userToggleBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  userDeleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#ff767540', gap: 8 },
  userDeleteBtnText: { color: '#ff7675', fontSize: 14, fontWeight: '600' },
  inputGroup: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', color: '#a0a0a0', marginBottom: 8 },
  input: { backgroundColor: '#0f0f1a', borderRadius: 10, padding: 14, fontSize: 15, color: '#fff', borderWidth: 1, borderColor: '#2d2d44' },
  cancelButton: { alignItems: 'center', backgroundColor: '#2d2d44', borderRadius: 8, padding: 12 },
  cancelButtonText: { color: '#a0a0a0', fontSize: 14, fontWeight: '600' },
});
