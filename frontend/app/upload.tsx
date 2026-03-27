import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { apiService } from '../src/services/api';

export default function UploadScreen() {
  const router = useRouter();
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState('');

  const pickFromCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Berechtigung erforderlich', 'Bitte erlauben Sie den Kamerazugriff.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      if (asset.base64) {
        const mimeType = asset.mimeType || 'image/jpeg';
        setSelectedImage(`data:${mimeType};base64,${asset.base64}`);
      }
    }
  };

  const pickFromGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Berechtigung erforderlich', 'Bitte erlauben Sie den Galerie-Zugriff.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      if (asset.base64) {
        const mimeType = asset.mimeType || 'image/jpeg';
        setSelectedImage(`data:${mimeType};base64,${asset.base64}`);
      }
    }
  };

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/*', 'application/pdf'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        // Read file as base64
        const base64 = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const mimeType = asset.mimeType || 'image/jpeg';
        setSelectedImage(`data:${mimeType};base64,${base64}`);
      }
    } catch (error) {
      console.error('Document pick error:', error);
      Alert.alert('Fehler', 'Dokument konnte nicht geladen werden.');
    }
  };

  const uploadInvoice = async () => {
    if (!selectedImage) {
      Alert.alert('Fehler', 'Bitte wählen Sie zuerst ein Bild aus.');
      return;
    }

    setUploading(true);
    setProgress('Lade Rechnung hoch...');

    try {
      setProgress('Analysiere Rechnung mit KI...');
      
      // Extract just the base64 part if it's a data URL
      let base64Data = selectedImage;
      if (selectedImage.includes(';base64,')) {
        base64Data = selectedImage.split(';base64,')[1];
      }

      const invoice = await apiService.createInvoice(base64Data);
      
      setProgress('Fertig!');
      
      Alert.alert(
        'Erfolg',
        'Rechnung wurde erfolgreich analysiert und erstellt.',
        [
          {
            text: 'Zur Rechnung',
            onPress: () => router.replace(`/invoice/${invoice.id}`),
          },
        ]
      );
    } catch (error: any) {
      console.error('Upload error:', error);
      const message = error.response?.data?.detail || 'Upload fehlgeschlagen. Bitte versuchen Sie es erneut.';
      Alert.alert('Fehler', message);
    } finally {
      setUploading(false);
      setProgress('');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Ionicons name="cloud-upload" size={48} color="#6c5ce7" />
          <Text style={styles.title}>Rechnung hochladen</Text>
          <Text style={styles.subtitle}>
            Wählen Sie ein Bild oder PDF Ihrer Rechnung
          </Text>
        </View>

        {/* Image Preview */}
        {selectedImage && (
          <View style={styles.previewContainer}>
            <Image
              source={{ uri: selectedImage }}
              style={styles.preview}
              resizeMode="contain"
            />
            <TouchableOpacity
              style={styles.removeButton}
              onPress={() => setSelectedImage(null)}
            >
              <Ionicons name="close-circle" size={32} color="#ff7675" />
            </TouchableOpacity>
          </View>
        )}

        {/* Upload Options */}
        {!selectedImage && (
          <View style={styles.optionsContainer}>
            <TouchableOpacity style={styles.optionCard} onPress={pickFromCamera}>
              <View style={[styles.optionIcon, { backgroundColor: '#6c5ce720' }]}>
                <Ionicons name="camera" size={32} color="#6c5ce7" />
              </View>
              <Text style={styles.optionTitle}>Kamera</Text>
              <Text style={styles.optionText}>Rechnung fotografieren</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.optionCard} onPress={pickFromGallery}>
              <View style={[styles.optionIcon, { backgroundColor: '#00cec920' }]}>
                <Ionicons name="images" size={32} color="#00cec9" />
              </View>
              <Text style={styles.optionTitle}>Galerie</Text>
              <Text style={styles.optionText}>Bild auswählen</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.optionCard} onPress={pickDocument}>
              <View style={[styles.optionIcon, { backgroundColor: '#fd79a820' }]}>
                <Ionicons name="document" size={32} color="#fd79a8" />
              </View>
              <Text style={styles.optionTitle}>Dokument</Text>
              <Text style={styles.optionText}>PDF/Bild wählen</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Upload Button */}
        {selectedImage && (
          <TouchableOpacity
            style={[styles.uploadButton, uploading && styles.uploadButtonDisabled]}
            onPress={uploadInvoice}
            disabled={uploading}
          >
            {uploading ? (
              <>
                <ActivityIndicator size="small" color="#fff" />
                <Text style={styles.uploadButtonText}>{progress}</Text>
              </>
            ) : (
              <>
                <Ionicons name="sparkles" size={24} color="#fff" />
                <Text style={styles.uploadButtonText}>Mit KI analysieren</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {/* Info */}
        <View style={styles.infoContainer}>
          <View style={styles.infoItem}>
            <Ionicons name="checkmark-circle" size={20} color="#55efc4" />
            <Text style={styles.infoText}>KI-gestützte OCR-Erkennung</Text>
          </View>
          <View style={styles.infoItem}>
            <Ionicons name="checkmark-circle" size={20} color="#55efc4" />
            <Text style={styles.infoText}>Deutsche Rechnungen optimiert</Text>
          </View>
          <View style={styles.infoItem}>
            <Ionicons name="checkmark-circle" size={20} color="#55efc4" />
            <Text style={styles.infoText}>Automatische Datenextraktion</Text>
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
  scrollContent: {
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 30,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 16,
  },
  subtitle: {
    fontSize: 14,
    color: '#a0a0a0',
    marginTop: 8,
    textAlign: 'center',
  },
  previewContainer: {
    position: 'relative',
    marginBottom: 20,
  },
  preview: {
    width: '100%',
    height: 300,
    borderRadius: 12,
    backgroundColor: '#1a1a2e',
  },
  removeButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: '#0f0f1a',
    borderRadius: 16,
  },
  optionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  optionCard: {
    width: '31%',
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  optionIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  optionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  optionText: {
    fontSize: 11,
    color: '#a0a0a0',
    textAlign: 'center',
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6c5ce7',
    borderRadius: 12,
    padding: 18,
    marginBottom: 20,
  },
  uploadButtonDisabled: {
    backgroundColor: '#4a4a6a',
  },
  uploadButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 10,
  },
  infoContainer: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  infoText: {
    fontSize: 14,
    color: '#a0a0a0',
    marginLeft: 10,
  },
});
