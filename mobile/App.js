import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Image, ActivityIndicator, StyleSheet, Alert, TextInput, Modal, Linking, Platform, SafeAreaView, useColorScheme, Pressable } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Camera } from 'expo-camera';
import { BarCodeScanner } from 'expo-barcode-scanner';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Animated } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

export default function App() {
  const [image, setImage] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [hasPermission, setHasPermission] = useState(null);
  const [cameraVisible, setCameraVisible] = useState(false);
  const cameraRef = useRef(null);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [screen, setScreen] = useState('home'); // 'home' | 'attendance'
  const [serverUrl, setServerUrl] = useState('');
  const [loadingServer, setLoadingServer] = useState(true);
  const [todayCount, setTodayCount] = useState(0);
  const pulse = useRef(new Animated.Value(1)).current;
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const theme = {
    bg: isDark ? '#0b1220' : '#f3f6fb',
    card: isDark ? '#071022' : '#fff',
    primary: '#2563eb',
    success: '#10b981',
    text: isDark ? '#e6eef8' : '#0f172a',
    subtext: isDark ? '#94a3b8' : '#475569',
    muted: isDark ? '#94a3b8' : '#6b7280'
  };

  // Animated pressable button component (scale on press)
  function AnimatedButton({ children, onPress, style }) {
    const scale = useRef(new Animated.Value(1)).current;
    return (
      <Pressable
        onPressIn={() => Animated.spring(scale, { toValue: 0.96, useNativeDriver: true }).start()}
        onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start()}
        onPress={onPress}
      >
        <Animated.View style={[{ transform: [{ scale }] }, style]}>
          {children}
        </Animated.View>
      </Pressable>
    );
  }

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
      // fetch today's count if serverUrl present
      try {
        if (saved) await fetchTodayCount(saved);
      } catch (e) {}
    })();
  }, []);

  const fetchTodayCount = async (overrideUrl) => {
    const serverBase = overrideUrl || serverUrl || (Platform.OS === 'android' && !Constants.isDevice ? 'http://10.0.2.2:5000' : 'http://127.0.0.1:5000');
    try {
      if (!serverBase) return;
      const res = await fetch(`${serverBase}/check_attendance`);
      if (!res.ok) return;
      const data = await res.json();
      const today = new Date().toISOString().slice(0,10);
      const rows = Array.isArray(data[today]) ? data[today] : (data[today] ? Object.values(data[today]).flat() : []);
      setTodayCount(rows.length || 0);
    } catch (e) {
      console.log('fetchTodayCount error', e);
    }
  };

  useEffect(() => {
    if (todayCount > 0) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.12, duration: 600, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1.0, duration: 600, useNativeDriver: true }),
        ])
      ).start();
    }
  }, [todayCount]);

  const takePhotoAndUpload = async () => {
    // Request camera permission using expo-camera and open in-app camera preview to avoid external intent issues
    try {
      const { status } = await Camera.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permissions required', 'Camera permission is required to scan QR codes. Please enable it in settings.');
        return;
      }
      // Optionally request media library permission for sharing/exporting captured images
      const mediaPerm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (mediaPerm.status !== 'granted') {
        console.log('Media library permission not granted:', mediaPerm.status);
      }
    } catch (e) {
      console.log('Permission request error', e);
      Alert.alert('Error', 'Failed to request permissions.');
      return;
    }
    // Prefer live barcode scanner (more reliable) — open scanner modal
    setResult(null);
    try {
      const { status } = await BarCodeScanner.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission required', 'Camera permission is required to scan QR codes.');
        return;
      }
      setScanned(false);
      setScannerVisible(true);
    } catch (e) {
      console.log('Barcode permission error', e);
      setCameraVisible(true); // fallback to camera modal
    }
  };

  const uploadImage = async (localUri) => {
    setLoading(true);
    try {
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
      if (res.ok) fetchTodayCount();
    } catch (e) {
      setResult({ message: 'Upload error', error: String(e) });
    } finally {
      setLoading(false);
    }
  };

  const captureAndUpload = async () => {
    if (!cameraRef.current) return;
    try {
      setLoading(true);
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.7 });
      if (photo && photo.uri) {
        setImage(photo.uri);
        await uploadImage(photo.uri);
      }
    } catch (e) {
      Alert.alert('Capture error', String(e));
    } finally {
      setLoading(false);
      setCameraVisible(false);
    }
  };

  const processScannedData = async (rawData) => {
    setScannerVisible(false);
    setScanned(true);
    let payload = null;
    try {
      // try parse JSON first
      payload = JSON.parse(rawData);
    } catch (_e) {
      // fallback: comma-separated values regno,name,designation,department,year
      const parts = rawData.split(',').map(p => p.trim());
      if (parts.length >= 2) {
        payload = {
          regno: parts[0] || '',
          name: parts[1] || '',
          designation: parts[2] || '',
          department: parts[3] || '',
          year: parts[4] || ''
        };
      } else {
        payload = { raw: rawData };
      }
    }

    // POST to backend mark_attendance if available, otherwise send as JSON to /scan
    const serverBase = serverUrl || (Platform.OS === 'android' && !Constants.isDevice ? 'http://10.0.2.2:5000' : 'http://127.0.0.1:5000');
    try {
      setLoading(true);
      const res = await fetch(`${serverBase}/mark_attendance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      let data;
      try { data = await res.json(); } catch (e) { data = { message: `Status ${res.status}` }; }
      setResult({ status: res.status, body: data });
      if (res.ok) fetchTodayCount();
    } catch (e) {
      setResult({ message: 'Scan upload error', error: String(e) });
    } finally {
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

  const AttendanceScreen = ({ onBack }) => {
    const [entries, setEntries] = useState([]);
    const [loadingEntries, setLoadingEntries] = useState(false);

    const loadEntries = async () => {
      setLoadingEntries(true);
      const serverBase = serverUrl || (Platform.OS === 'android' && !Constants.isDevice ? 'http://10.0.2.2:5000' : 'http://127.0.0.1:5000');
      try {
        if (!serverUrl) {
          Alert.alert('Server URL missing', 'Please set and save the server URL on the home screen (use your PC LAN IP).');
          setLoadingEntries(false);
          return;
        }
        const res = await fetch(`${serverBase}/check_attendance`);
        if (!res.ok) {
          const txt = await res.text().catch(() => `Status ${res.status}`);
          Alert.alert('Failed to load attendance', txt);
          setLoadingEntries(false);
          return;
        }
        const data = await res.json();
        const today = new Date().toISOString().slice(0, 10);
        const rows = Array.isArray(data[today]) ? data[today] : [];
        setEntries(rows);
      } catch (e) {
        console.log('Attendance load error', e);
        Alert.alert('Error', `Failed to load attendance: ${String(e)}`);
      } finally {
        setLoadingEntries(false);
      }
    };

    useEffect(() => { loadEntries(); }, []);

    const exportToday = async () => {
      const serverBase = serverUrl || (Platform.OS === 'android' && !Constants.isDevice ? 'http://10.0.2.2:5000' : 'http://127.0.0.1:5000');
      try {
        setLoadingEntries(true);
        const dateStr = new Date().toISOString().slice(0,10);
        const res = await fetch(`${serverBase}/export_csv?date=${dateStr}`);
        if (!res.ok) { Alert.alert('Export failed', `Status ${res.status}`); return; }
        const csvText = await res.text();
        const filename = `attendance_${dateStr}.csv`;
        const fileUri = FileSystem.cacheDirectory + filename;
        await FileSystem.writeAsStringAsync(fileUri, csvText, { encoding: FileSystem.EncodingType.UTF8 });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: `Attendance ${dateStr}` });
        } else Alert.alert('Saved', `Saved to ${fileUri}`);
      } catch (e) {
        Alert.alert('Error', String(e));
      } finally { setLoadingEntries(false); }
    };

    return (
      <SafeAreaView style={{flex:1, padding:16, backgroundColor: theme.bg}}>
        <View style={styles.headerCard}>
          <Text style={[styles.title, {fontSize:20}]}>Today's Attendance</Text>
        </View>

        <View style={{marginTop:12}}>
          <View style={styles.card}>
            {loadingEntries ? <ActivityIndicator/> : (
              entries.length === 0 ? <Text style={{color: theme.subtext}}>No attendance yet</Text> : entries.map((r, i) => {
                const name = r && (r.name || r[0] || r[1] || JSON.stringify(r));
                const regno = r && (r.regno || r[1] || r[0] || '');
                const time = r && (r.time || r[2] || '');
                const initials = (name || '').split(' ').slice(0,2).map(n => n[0]).join('').toUpperCase().slice(0,2);
                return (
                  <View key={i} style={styles.listItem}>
                    <View style={{flexDirection:'row', alignItems:'center'}}>
                      <View style={{width:44,height:44,borderRadius:22,backgroundColor:'#eef2ff',alignItems:'center',justifyContent:'center',marginRight:12}}>
                        <Text style={{color:'#3730a3', fontWeight:'700'}}>{initials}</Text>
                      </View>
                      <View>
                        <Text style={[styles.listName, {color: '#0f172a'}]}>{name}</Text>
                        <Text style={[styles.listReg, {color: '#6b7280'}]}>{regno}</Text>
                      </View>
                    </View>
                    {time ? <Text style={[styles.timeText, {color: '#0f172a'}]}>{time}</Text> : null}
                  </View>
                );
              })
            )}

            <View style={{marginTop:20}}>
              <TouchableOpacity style={styles.primaryButtonFull} onPress={exportToday}>
                <Text style={styles.primaryTextWhite}>Export Today's CSV</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={{marginTop:18, alignItems:'center'}}>
          <AnimatedButton onPress={onBack} style={[styles.ghostButton, {paddingHorizontal:18}] }>
            <View style={{flexDirection:'row', alignItems:'center'}}>
              <Text style={styles.ghostText}>Back</Text>
            </View>
          </AnimatedButton>
        </View>
      </SafeAreaView>
    );
  };

  if (screen === 'attendance') {
    return <AttendanceScreen onBack={() => setScreen('home')} />;
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}> 
      <View style={styles.headerCard}>
        <Text style={styles.title}>QR Attendance</Text>
        <Text style={styles.subtitle}>Quick scan and mark attendance</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Server URL</Text>
        <TextInput
          style={styles.input}
          value={serverUrl}
          onChangeText={setServerUrl}
          placeholder="http://192.168.x.y:5000"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <View style={styles.row}>
            <TouchableOpacity style={[styles.ghostButton]} onPress={saveServerUrl}>
              <View style={{flexDirection:'row', alignItems:'center'}}>
                <MaterialIcons name="save" size={18} color="#3730a3" style={{marginRight:8}} />
                <Text style={styles.ghostText}>Save</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.primaryButton]} onPress={takePhotoAndUpload}>
              <View style={{flexDirection:'row', alignItems:'center'}}>
                <MaterialIcons name="qr-code-scanner" size={18} color="#fff" style={{marginRight:8}} />
                <Text style={styles.primaryText}>Scan QR</Text>
              </View>
            </TouchableOpacity>
        </View>

        <AnimatedButton onPress={() => { setScreen('attendance'); }} style={styles.tertiaryButton}>
          <View style={{flexDirection:'row', justifyContent:'center', alignItems:'center'}}>
            <MaterialIcons name="list-alt" size={18} color="#fff" style={{marginRight:8}} />
            <Text style={styles.tertiaryText}>View Today's Attendance</Text>
            {todayCount > 0 && (
              <Animated.View style={{backgroundColor:'#fff', paddingHorizontal:8, paddingVertical:4, borderRadius:12, marginLeft:8, transform:[{scale:pulse}]}}>
                <Text style={{color:'#10b981', fontWeight:'700'}}>{todayCount}</Text>
              </Animated.View>
            )}
          </View>
        </AnimatedButton>

        {result && (
          <View style={styles.resultBox}>
            <Text style={styles.resultTitle}>Result</Text>
            <Text style={styles.resultText}>{(() => {
              try {
                const body = result.body || {};
                if (body && typeof body === 'object') {
                  if (body.name) {
                    const when = body.time || body.attendance_time || result.time || '';
                    if (body.is_new === true || body.is_new === 'true') return `Attendance marked for ${body.name}${when ? ' at ' + when : ''}`;
                    return `Attendance already marked for ${body.name}${when ? ' at ' + when : ''}`;
                  }
                  if (body.message) return String(body.message);
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

      <Modal visible={cameraVisible} animationType="slide">
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <Camera style={{ flex: 1 }} type={Camera.Constants.Type.back} ref={cameraRef}>
            <View style={{ flex: 1, backgroundColor: 'transparent', justifyContent: 'flex-end', padding: 20 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <TouchableOpacity style={[styles.ghostButton, {backgroundColor:'rgba(255,255,255,0.2)'}]} onPress={() => { setCameraVisible(false); }}>
                  <Text style={styles.ghostText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.primaryButton, {paddingHorizontal:20}]} onPress={captureAndUpload}>
                  <Text style={styles.primaryText}>Capture</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Camera>
        </View>
      </Modal>
      <Modal visible={scannerVisible} animationType="slide">
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <BarCodeScanner
            onBarCodeScanned={scanned ? undefined : ({ data }) => processScannedData(data)}
            style={{ flex: 1 }}
          >
            <View style={{ flex: 1, justifyContent: 'flex-end', padding: 20 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <TouchableOpacity style={[styles.ghostButton, {backgroundColor:'rgba(255,255,255,0.2)'}]} onPress={() => { setScannerVisible(false); }}>
                  <Text style={styles.ghostText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          </BarCodeScanner>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f6fb', padding: 16 },
  headerCard: { backgroundColor: '#fff', padding: 18, borderRadius: 12, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  title: { fontSize: 22, fontWeight: '800', textAlign: 'left', color: '#0f172a' },
  subtitle: { color: '#475569', marginTop: 6 },
  card: { backgroundColor: '#fff', padding: 20, borderRadius: 14, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10, elevation: 4 },
  label: { marginTop: 4, marginBottom: 8, color: '#334155', fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#e6eef8', padding: 12, borderRadius: 10, backgroundColor: '#fbfdff' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, gap: 8 },

  primaryButton: { backgroundColor: '#2563eb', paddingVertical: 14, paddingHorizontal: 20, borderRadius: 12, minWidth: 140, alignItems: 'center' },
  primaryText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  ghostButton: { backgroundColor: '#eef2ff', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center' },
  ghostText: { color: '#3730a3', fontWeight: '700' },
  tertiaryButton: { marginTop: 14, backgroundColor: '#10b981', paddingVertical: 14, borderRadius: 12, alignItems: 'center' , flexDirection:'row', justifyContent:'center'},
  tertiaryText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  primaryButtonFull: { marginTop: 12, backgroundColor: '#10b981', paddingVertical: 14, borderRadius: 12, alignItems: 'center', width: '100%' },
  primaryTextWhite: { color: '#fff', fontWeight: '800', fontSize: 16 },

  resultBox: { marginTop: 18, padding: 14, borderRadius: 12, backgroundColor: '#f8fafc' },
  resultTitle: { fontWeight: '700', marginBottom: 6 },
  resultText: { marginTop: 6, fontSize: 16, color: '#0f172a' },

  listItem: { padding: 14, borderRadius: 12, backgroundColor: '#fff', marginBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
  listName: { fontWeight: '800', fontSize: 15 },
  listReg: { color: '#6b7280', marginTop: 4 },
  timeText: { color: '#475569', fontSize: 13 }
});

