import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Image, ActivityIndicator, StyleSheet, Alert, TextInput } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Linking } from 'react-native';
import { Platform, PermissionsAndroid } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function App() {
  const [image, setImage] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [hasPermission, setHasPermission] = useState(null);
  const [serverUrl, setServerUrl] = useState('');
  const [loadingServer, setLoadingServer] = useState(true);

  useEffect(() => {
    (async () => {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
      if (Platform.OS === 'android') {
        // On Android 13+ we need READ_MEDIA_IMAGES for gallery access
        const sdk = Platform.constants?.Version || 0;
        if (sdk >= 33) {
          try {
            const { status: mediaStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            // mediaStatus can be 'granted' or 'denied'
            if (mediaStatus !== 'granted') {
              console.log('Media library permission not granted:', mediaStatus);
            }
          } catch (e) {
            console.log('Error requesting media permission:', e);
          }
        }
      }
      if (status !== 'granted') {
        alert('Camera permission is required. Please allow camera access in settings.');
      }
      // load saved server URL
      try {
        const saved = await AsyncStorage.getItem('serverUrl');
        if (saved) setServerUrl(saved);
      } catch (e) {
        console.log('Failed to load serverUrl', e);
      } finally {
        setLoadingServer(false);
      }
    })();
  }, []);

  const takePhotoAndUpload = async () => {
    if (hasPermission === false) {
      alert('Camera permission denied. Please enable camera permission in your phone settings.');
      return;
    }
    // On Android, explicitly request runtime permissions before launching camera
    if (Platform.OS === 'android') {
      try {
        const sdk = Platform.constants?.Version || 0;
        const perms = [PermissionsAndroid.PERMISSIONS.CAMERA];
        if (sdk >= 33) {
          perms.push(PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES);
        } else {
          perms.push(PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE);
        }
        const granted = await PermissionsAndroid.requestMultiple(perms);
        const cameraOk = granted[PermissionsAndroid.PERMISSIONS.CAMERA] === PermissionsAndroid.RESULTS.GRANTED;
        const mediaKey = sdk >= 33 ? PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES : PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE;
        const mediaOk = granted[mediaKey] === PermissionsAndroid.RESULTS.GRANTED;
        if (!cameraOk || !mediaOk) {
          Alert.alert('Permissions required', 'Camera and media permissions are required to scan QR codes. Please enable them in settings.');
          return;
        }
      } catch (e) {
        console.log('Permission request error', e);
      }
    }
    setResult(null);
    let photo = await ImagePicker.launchCameraAsync({ base64: false, quality: 0.7 });
    if (!photo.cancelled) {
      setImage(photo.uri);
      setLoading(true);
      try {
        let localUri = photo.uri;
        let filename = localUri.split('/').pop();
        let match = /\.([0-9A-Za-z]+)$/.exec(filename);
        let type = match ? `image/${match[1]}` : `image`;

        let formData = new FormData();
        formData.append('image', { uri: localUri, name: filename, type });

        const serverBase = serverUrl || (Platform.OS === 'android' && !Constants.isDevice ? 'http://10.0.2.2:5000' : 'http://127.0.0.1:5000');
        const res = await fetch(`${serverBase}/scan`, {
          method: 'POST',
          body: formData,
        });
        let data;
        try {
          data = await res.json();
        } catch (e) {
          data = { message: `Server returned status ${res.status}` };
        }
        setResult({ status: res.status, body: data });
      } catch (e) {
        setResult({ message: 'Upload error', error: String(e) });
      }
      setLoading(false);
    }
  };

  const exportCsv = async () => {
    // Try to download today's attendance CSV and open share dialog
    const serverBase = serverUrl || (Platform.OS === 'android' && !Constants.isDevice ? 'http://10.0.2.2:5000' : 'http://127.0.0.1:5000');
    try {
      setLoading(true);
      const res = await fetch(`${serverBase}/export_csv`);
      if (!res.ok) {
        const txt = await res.text().catch(() => `Status ${res.status}`);
        Alert.alert('Export failed', txt);
        setLoading(false);
        return;
      }
      const csvText = await res.text();
      const dateStr = new Date().toISOString().slice(0, 10);
      const filename = `attendance_${dateStr}.csv`;
      const fileUri = FileSystem.cacheDirectory + filename;
      await FileSystem.writeAsStringAsync(fileUri, csvText, { encoding: FileSystem.EncodingType.UTF8 });
      // Share or show
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: `Attendance ${dateStr}` });
      } else {
        Alert.alert('CSV saved', `Saved to ${fileUri}`);
      }
    } catch (e) {
      Alert.alert('Error', String(e));
    } finally {
      setLoading(false);
    }
  };

  const saveServerUrl = async () => {
    try {
      await AsyncStorage.setItem('serverUrl', serverUrl);
      Alert.alert('Saved', `Server URL saved: ${serverUrl}`);
    } catch (e) {
      Alert.alert('Error', 'Could not save server URL');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>QR Attendance Scanner</Text>
      <Text style={styles.label}>Server URL (phone use your PC LAN IP):</Text>
      <TextInput
        style={styles.input}
        value={serverUrl}
        onChangeText={setServerUrl}
        placeholder="http://192.168.x.y:5000"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <TouchableOpacity style={[styles.button, {marginTop:8, backgroundColor:'#444'}]} onPress={saveServerUrl}>
        <Text style={styles.buttonText}>Save Server URL</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.button} onPress={takePhotoAndUpload}>
        <Text style={styles.buttonText}>Open Camera & Scan</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.button, {marginTop:12, backgroundColor:'#28A745'}]} onPress={exportCsv}>
        <Text style={styles.buttonText}>Export Today's CSV</Text>
      </TouchableOpacity>
      {hasPermission === false && (
        <TouchableOpacity style={[styles.button, {marginTop:12, backgroundColor:'#FF3B30'}]} onPress={() => Linking.openSettings()}>
          <Text style={styles.buttonText}>Open Settings to Enable Camera</Text>
        </TouchableOpacity>
      )}
      {loading && <ActivityIndicator size="large" color="#000" />}
      {image && <Image source={{ uri: image }} style={styles.preview} />}
      {result && (
        <View style={styles.resultBox}>
          <Text style={styles.resultTitle}>Result:</Text>
          <Text style={styles.resultText}>{(() => {
            try {
              // Prefer a friendly message with the student's name when available
              if (result && result.body && typeof result.body === 'object') {
                if (result.body.name) return `Attendance marked for ${result.body.name}`;
                if (result.body.message) return String(result.body.message);
              }
              if (result && result.status) return `Server returned status ${result.status}`;
              if (result && result.message) return String(result.message);
            } catch (e) {
              return 'Received response';
            }
            return 'Received response';
          })()}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 20 },
  label: { alignSelf: 'stretch', marginBottom: 6, color: '#333' },
  input: { alignSelf: 'stretch', borderWidth: 1, borderColor: '#ccc', padding: 8, borderRadius: 6, marginBottom: 6 },
  button: { backgroundColor: '#007AFF', padding: 12, borderRadius: 8 },
  buttonText: { color: '#fff', fontWeight: '600' },
  preview: { width: 250, height: 250, marginTop: 20, borderRadius: 8 },
  resultBox: { marginTop: 20, padding: 10, borderWidth: 1, borderColor: '#ddd', width: '100%' },
  resultTitle: { fontWeight: '700' },
  resultText: { marginTop: 6, fontSize: 16 },
});
