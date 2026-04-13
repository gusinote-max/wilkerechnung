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
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
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
    setProgress('Rechnung wird hochgeladen...');
    setAnalysisResult(null);
    setAnalysisError(null);

    try {
      setProgress('KI analysiert Rechnung...');

      const invoice = await apiService.createInvoice(selectedBase64);
      
      setProgress('');
      setAnalysisResult(invoice);
      
    } catch (error: any) {
      console.error('Upload error:', error);
      const message = error.response?.data?.detail || error.message || 'Upload fehlgeschlagen. Bitte versuchen Sie es erneut.';
      setAnalysisError(message);
      setProgress('');
    } finally {
      setUploading(false);
    }
  };

  const resetUpload = () => {
    setSelectedImage(null);
    setSelectedBase64(null);
    setFileName('');
    setAnalysisResult(null);
    setAnalysisError(null);
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

        {/* Analysis Result - Success */}
        {analysisResult && (
          <View style={styles.resultContainer}>
            {/* Duplikat-Warnung Banner */}
            {analysisResult.duplicate_warning && (
              <View style={styles.duplicateWarningBanner}>
                <Ionicons name="warning" size={18} color="#e17055" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.duplicateWarningTitle}>⚠️ Mögliches Duplikat erkannt!</Text>
                  <Text style={styles.duplicateWarningText}>
                    Diese Rechnung ähnelt einer bereits vorhandenen. Bitte prüfen Sie, ob sie bereits importiert wurde.
                  </Text>
                  {(analysisResult.duplicate_ids || []).length > 0 && (
                    <TouchableOpacity onPress={() => router.push(`/invoice/${analysisResult.duplicate_ids![0]}`)}>
                      <Text style={styles.duplicateWarningLink}>→ Mögliches Original ansehen</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}
            <View style={styles.resultHeader}>
              <Ionicons name="checkmark-circle" size={32} color="#55efc4" />
              <Text style={styles.resultTitle}>KI-Analyse erfolgreich!</Text>
            </View>
            
            <View style={styles.resultCard}>
              <View style={styles.resultRow}>
                <Text style={styles.resultLabel}>Rechnungsnr.</Text>
                <Text style={styles.resultValue}>{analysisResult.data?.invoice_number || '—'}</Text>
              </View>
              <View style={styles.resultRow}>
                <Text style={styles.resultLabel}>Lieferant</Text>
                <Text style={styles.resultValue}>{analysisResult.data?.vendor_name || '—'}</Text>
              </View>
              <View style={styles.resultRow}>
                <Text style={styles.resultLabel}>Datum</Text>
                <Text style={styles.resultValue}>{analysisResult.data?.invoice_date || '—'}</Text>
              </View>
              <View style={styles.resultRow}>
                <Text style={styles.resultLabel}>Netto</Text>
                <Text style={styles.resultValue}>
                  {analysisResult.data?.net_amount ? `${Number(analysisResult.data.net_amount).toFixed(2)} ${analysisResult.data.currency || 'EUR'}` : '—'}
                </Text>
              </View>
              <View style={styles.resultRow}>
                <Text style={styles.resultLabel}>MwSt</Text>
                <Text style={styles.resultValue}>
                  {analysisResult.data?.vat_amount ? `${Number(analysisResult.data.vat_amount).toFixed(2)} ${analysisResult.data.currency || 'EUR'}` : '—'}
                </Text>
              </View>
              <View style={[styles.resultRow, styles.resultRowTotal]}>
                <Text style={[styles.resultLabel, styles.resultLabelBold]}>Gesamt</Text>
                <Text style={[styles.resultValue, styles.resultValueBold]}>
                  {analysisResult.data?.gross_amount ? `${Number(analysisResult.data.gross_amount).toFixed(2)} ${analysisResult.data.currency || 'EUR'}` : '—'}
                </Text>
              </View>
              {analysisResult.data?.line_items && analysisResult.data.line_items.length > 0 && (
                <View style={styles.resultItems}>
                  <Text style={styles.resultItemsTitle}>{analysisResult.data.line_items.length} Position(en) erkannt</Text>
                </View>
              )}
            </View>

            <View style={styles.resultActions}>
              <TouchableOpacity
                style={styles.resultButtonPrimary}
                onPress={() => router.replace(`/invoice/${analysisResult.id}`)}
              >
                <Ionicons name="open" size={20} color="#fff" />
                <Text style={styles.resultButtonText}>Rechnung öffnen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.resultButtonSecondary}
                onPress={resetUpload}
              >
                <Ionicons name="add-circle" size={20} color="#6c5ce7" />
                <Text style={styles.resultButtonTextSecondary}>Weitere hochladen</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Analysis Error */}
        {analysisError && (
          <View style={styles.errorContainer}>
            <Ionicons name="warning" size={32} color="#ff7675" />
            <Text style={styles.errorTitle}>Analyse fehlgeschlagen</Text>
            <Text style={styles.errorMessage}>{analysisError}</Text>
            <TouchableOpacity
              style={styles.errorRetryButton}
              onPress={() => {
                setAnalysisError(null);
                uploadInvoice();
              }}
            >
              <Ionicons name="refresh" size={18} color="#fff" />
              <Text style={styles.errorRetryText}>Erneut versuchen</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.resultButtonSecondary}
              onPress={resetUpload}
            >
              <Text style={styles.resultButtonTextSecondary}>Neue Datei wählen</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Upload Progress */}
        {uploading && (
          <View style={styles.progressContainer}>
            <ActivityIndicator size="large" color="#6c5ce7" />
            <Text style={styles.progressText}>{progress}</Text>
            <Text style={styles.progressHint}>Dies kann einige Sekunden dauern...</Text>
          </View>
        )}

        {/* Image Preview */}
        {selectedImage && !analysisResult && !analysisError && !uploading && (
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
              onPress={resetUpload}
            >
              <Ionicons name="close-circle" size={32} color="#ff7675" />
            </TouchableOpacity>
            {fileName ? (
              <Text style={styles.fileNameText}>{fileName}</Text>
            ) : null}
          </View>
        )}

        {/* Upload Options */}
        {!selectedImage && !analysisResult && !analysisError && !uploading && (
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
        {selectedImage && !analysisResult && !analysisError && !uploading && (
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

        {/* Info - only show when no result */}
        {!analysisResult && !uploading && (
          <View style={styles.infoContainer}>
            <View style={styles.infoItem}>
              <Ionicons name="checkmark-circle" size={20} color="#55efc4" />
              <Text style={styles.infoText}>KI-gestützte OCR-Erkennung</Text>
            </View>
            <View style={styles.infoItem}>
              <Ionicons name="checkmark-circle" size={20} color="#55efc4" />
              <Text style={styles.infoText}>PDF und Bilder werden unterstützt</Text>
            </View>
            <View style={styles.infoItem}>
              <Ionicons name="checkmark-circle" size={20} color="#55efc4" />
              <Text style={styles.infoText}>Automatische Datenextraktion</Text>
            </View>
          </View>
        )}
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
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 30,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2c2c3e',
    marginTop: 16,
  },
  subtitle: {
    fontSize: 14,
    color: '#6e6e85',
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
    backgroundColor: '#ffffff',
  },
  pdfPreview: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pdfFileName: {
    fontSize: 14,
    color: '#6e6e85',
    marginTop: 8,
  },
  removeButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: '#f4f0eb',
    borderRadius: 16,
  },
  fileNameText: {
    fontSize: 12,
    color: '#9e9eaa',
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
    backgroundColor: '#ffffff',
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
    color: '#2c2c3e',
    marginBottom: 4,
  },
  optionText: {
    fontSize: 11,
    color: '#6e6e85',
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
    backgroundColor: '#ffffff',
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
    color: '#6e6e85',
    marginLeft: 10,
  },
  // Analysis Result Styles
  resultContainer: {
    marginBottom: 20,
  },
  // Duplicate warning
  duplicateWarningBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#e1705520', borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#e1705550' },
  duplicateWarningTitle: { fontSize: 13, fontWeight: '700', color: '#c0392b', marginBottom: 2 },
  duplicateWarningText: { fontSize: 12, color: '#c0392b', lineHeight: 18 },
  duplicateWarningLink: { fontSize: 12, color: '#6c5ce7', fontWeight: '700', marginTop: 4 },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a2e1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    gap: 12,
  },
  resultTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#55efc4',
  },
  resultCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a3e',
  },
  resultRowTotal: {
    borderBottomWidth: 0,
    paddingTop: 12,
    marginTop: 4,
    borderTopWidth: 2,
    borderTopColor: '#6c5ce7',
  },
  resultLabel: {
    fontSize: 14,
    color: '#6e6e85',
  },
  resultLabelBold: {
    fontWeight: 'bold',
    color: '#2c2c3e',
  },
  resultValue: {
    fontSize: 14,
    color: '#2c2c3e',
    fontWeight: '500',
  },
  resultValueBold: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#6c5ce7',
  },
  resultItems: {
    marginTop: 8,
    paddingTop: 8,
  },
  resultItemsTitle: {
    fontSize: 12,
    color: '#9e9eaa',
    fontStyle: 'italic',
  },
  resultActions: {
    gap: 10,
  },
  resultButtonPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6c5ce7',
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  resultButtonSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#6c5ce7',
    padding: 14,
    gap: 8,
  },
  resultButtonText: {
    color: '#2c2c3e',
    fontSize: 16,
    fontWeight: 'bold',
  },
  resultButtonTextSecondary: {
    color: '#6c5ce7',
    fontSize: 14,
    fontWeight: '600',
  },
  // Error Styles
  errorContainer: {
    backgroundColor: '#2e1a1a',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
    gap: 10,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ff7675',
  },
  errorMessage: {
    fontSize: 13,
    color: '#6e6e85',
    textAlign: 'center',
    lineHeight: 18,
  },
  errorRetryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ff7675',
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    gap: 8,
    marginTop: 8,
  },
  errorRetryText: {
    color: '#2c2c3e',
    fontWeight: 'bold',
    fontSize: 14,
  },
  // Progress Styles
  progressContainer: {
    alignItems: 'center',
    padding: 40,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    marginBottom: 20,
    gap: 16,
  },
  progressText: {
    fontSize: 16,
    color: '#6c5ce7',
    fontWeight: '600',
  },
  progressHint: {
    fontSize: 12,
    color: '#9e9eaa',
  },
});
