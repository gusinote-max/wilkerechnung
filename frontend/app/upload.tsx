import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  ScrollView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { apiService } from '../src/services/api';

// Helper: Convert blob URI or File to base64 (works on web)
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data:...;base64, prefix
      const base64 = result.split(';base64,')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

// Helper: Fetch blob from URI and convert to base64
const uriToBase64 = async (uri: string): Promise<string> => {
  const response = await fetch(uri);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(';base64,')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

export default function UploadScreen() {
  const router = useRouter();
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedBase64, setSelectedBase64] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState('');
  const [fileName, setFileName] = useState<string>('');
  const [isWeb, setIsWeb] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    // Detect web platform on client side (SSR-safe)
    setIsWeb(Platform.OS === 'web');
  }, []);

  const pickFromCamera = async () => {
    if (isWeb) {
      Alert.alert('Hinweis', 'Kamera ist im Web-Browser nicht verfügbar. Bitte verwenden Sie die Galerie oder Dokument-Option.');
      return;
    }
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
        setSelectedBase64(asset.base64);
        setFileName('camera-photo.jpg');
      }
    }
  };

  const pickFromGallery = async () => {
    try {
      if (isWeb) {
        // On web, use a file input for images
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = async (e: any) => {
          const file = e.target.files[0];
          if (file) {
            try {
              const base64 = await fileToBase64(file);
              const dataUrl = `data:${file.type};base64,${base64}`;
              setSelectedImage(dataUrl);
              setSelectedBase64(base64);
              setFileName(file.name);
            } catch (err) {
              console.error('File read error:', err);
              Alert.alert('Fehler', 'Datei konnte nicht gelesen werden.');
            }
          }
        };
        input.click();
        return;
      }

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
          setSelectedBase64(asset.base64);
          setFileName(asset.fileName || 'gallery-image.jpg');
        }
      }
    } catch (error) {
      console.error('Gallery picker error:', error);
      Alert.alert('Fehler', 'Bild konnte nicht geladen werden.');
    }
  };

  const pickDocument = async () => {
    try {
      if (isWeb) {
        // On web, use a file input for documents
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*,application/pdf';
        input.onchange = async (e: any) => {
          const file = e.target.files[0];
          if (file) {
            try {
              const base64 = await fileToBase64(file);
              // For images, show preview; for PDFs, show placeholder
              if (file.type.startsWith('image/')) {
                setSelectedImage(`data:${file.type};base64,${base64}`);
              } else {
                // PDF - show PDF icon placeholder
                setSelectedImage('pdf');
              }
              setSelectedBase64(base64);
              setFileName(file.name);
            } catch (err) {
              console.error('File read error:', err);
              Alert.alert('Fehler', 'Datei konnte nicht gelesen werden.');
            }
          }
        };
        input.click();
        return;
      }

      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/*', 'application/pdf'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        // On native, use the URI to read file
        try {
          const FileSystem = require('expo-file-system');
          const base64 = await FileSystem.readAsStringAsync(asset.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          const mimeType = asset.mimeType || 'application/pdf';
          if (mimeType.startsWith('image/')) {
            setSelectedImage(`data:${mimeType};base64,${base64}`);
          } else {
            setSelectedImage('pdf');
          }
          setSelectedBase64(base64);
          setFileName(asset.name || 'document');
        } catch (fsError) {
          // Fallback: try using fetch for blob URIs
          console.log('FileSystem failed, trying fetch...', fsError);
          const base64 = await uriToBase64(asset.uri);
          const mimeType = asset.mimeType || 'application/pdf';
          if (mimeType.startsWith('image/')) {
            setSelectedImage(`data:${mimeType};base64,${base64}`);
          } else {
            setSelectedImage('pdf');
          }
          setSelectedBase64(base64);
          setFileName(asset.name || 'document');
        }
      }
    } catch (error) {
      console.error('Document pick error:', error);
      Alert.alert('Fehler', 'Dokument konnte nicht geladen werden.');
    }
  };

  const uploadInvoice = async () => {
    if (!selectedBase64) {
      Alert.alert('Fehler', 'Bitte wählen Sie zuerst ein Bild oder Dokument aus.');
      return;
    }

    setUploading(true);
    setProgress('Lade Rechnung hoch...');

    try {
      setProgress('Analysiere Rechnung mit KI...');

      const invoice = await apiService.createInvoice(selectedBase64);
      
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
            {selectedImage === 'pdf' ? (
              <View style={styles.pdfPreview}>
                <Ionicons name="document-text" size={64} color="#6c5ce7" />
                <Text style={styles.pdfFileName}>{fileName}</Text>
              </View>
            ) : (
              <Image
                source={{ uri: selectedImage }}
                style={styles.preview}
                resizeMode="contain"
              />
            )}
            <TouchableOpacity
              style={styles.removeButton}
              onPress={() => {
                setSelectedImage(null);
                setSelectedBase64(null);
                setFileName('');
              }}
            >
              <Ionicons name="close-circle" size={32} color="#ff7675" />
            </TouchableOpacity>
            {fileName ? (
              <Text style={styles.fileNameText}>{fileName}</Text>
            ) : null}
          </View>
        )}

        {/* Upload Options */}
        {!selectedImage && (
          <View style={styles.optionsContainer}>
            {!isWeb && (
              <TouchableOpacity style={styles.optionCard} onPress={pickFromCamera}>
                <View style={[styles.optionIcon, { backgroundColor: '#6c5ce720' }]}>
                  <Ionicons name="camera" size={32} color="#6c5ce7" />
                </View>
                <Text style={styles.optionTitle}>Kamera</Text>
                <Text style={styles.optionText}>Rechnung fotografieren</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={[styles.optionCard, isWeb && styles.optionCardWide]} onPress={pickFromGallery}>
              <View style={[styles.optionIcon, { backgroundColor: '#00cec920' }]}>
                <Ionicons name="images" size={32} color="#00cec9" />
              </View>
              <Text style={styles.optionTitle}>Galerie</Text>
              <Text style={styles.optionText}>Bild auswählen</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.optionCard, isWeb && styles.optionCardWide]} onPress={pickDocument}>
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
  pdfPreview: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pdfFileName: {
    fontSize: 14,
    color: '#a0a0a0',
    marginTop: 8,
  },
  removeButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: '#0f0f1a',
    borderRadius: 16,
  },
  fileNameText: {
    fontSize: 12,
    color: '#636e72',
    textAlign: 'center',
    marginTop: 8,
  },
  optionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 20,
    gap: 12,
  },
  optionCard: {
    width: '31%',
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  optionCardWide: {
    width: '48%',
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
