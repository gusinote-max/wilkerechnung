import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export interface ToastData {
  type: 'success' | 'error';
  message: string;
}

interface ToastProps {
  toast: ToastData;
  onDismiss: () => void;
  position?: 'top' | 'bottom';
}

export default function Toast({ toast, onDismiss, position = 'top' }: ToastProps) {
  const positionStyle = position === 'top'
    ? { top: 50 }
    : { bottom: 30 };

  return (
    <View style={[styles.container, positionStyle, toast.type === 'success' ? styles.success : styles.error]}>
      <Ionicons
        name={toast.type === 'success' ? 'checkmark-circle' : 'alert-circle'}
        size={20}
        color="#fff"
      />
      <Text style={styles.text}>{toast.message}</Text>
      <TouchableOpacity onPress={onDismiss}>
        <Ionicons name="close" size={16} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 10,
    gap: 10,
    zIndex: 9999,
  },
  success: {
    backgroundColor: '#00b894',
  },
  error: {
    backgroundColor: '#e17055',
  },
  text: {
    flex: 1,
    color: '#2c2c3e',
    fontSize: 14,
    fontWeight: '500',
  },
});
