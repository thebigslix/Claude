import { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator, SafeAreaView,
} from 'react-native';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { saveZone, saveStreets } from '../../lib/storage';
import { fetchStreetsInRadius } from '../../lib/overpass';

const RADIUS_OPTIONS = [
  { label: '0.5 km', value: 500 },
  { label: '1 km', value: 1000 },
  { label: '2 km', value: 2000 },
  { label: '5 km', value: 5000 },
];

export default function CreateZoneScreen() {
  const [name, setName] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [radius, setRadius] = useState(1000);
  const [detecting, setDetecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [streetCount, setStreetCount] = useState<number | null>(null);
  const [fetching, setFetching] = useState(false);

  async function useMyLocation() {
    setDetecting(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Location permission is required.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setLat(String(loc.coords.latitude));
      setLng(String(loc.coords.longitude));
    } catch {
      Alert.alert('Error', 'Could not get location.');
    } finally {
      setDetecting(false);
    }
  }

  async function previewStreets() {
    if (!lat || !lng) {
      Alert.alert('Set center first', 'Enter coordinates or use "My Location".');
      return;
    }
    setFetching(true);
    setStreetCount(null);
    try {
      const streets = await fetchStreetsInRadius(parseFloat(lat), parseFloat(lng), radius, 'preview');
      setStreetCount(streets.length);
    } catch {
      Alert.alert('Error', 'Could not load streets. Check your connection.');
    } finally {
      setFetching(false);
    }
  }

  async function handleCreate() {
    if (!name.trim()) { Alert.alert('Name required', 'Give this zone a name.'); return; }
    if (!lat || !lng) { Alert.alert('Location required', 'Set a center point.'); return; }

    setSaving(true);
    try {
      const zoneId = `zone-${Date.now()}`;
      const zone = {
        id: zoneId,
        name: name.trim(),
        centerLat: parseFloat(lat),
        centerLng: parseFloat(lng),
        radiusMeters: radius,
        createdAt: new Date().toISOString(),
      };

      const streets = await fetchStreetsInRadius(parseFloat(lat), parseFloat(lng), radius, zoneId);

      if (streets.length === 0) {
        Alert.alert('No streets found', 'No named streets found in this area. Try a larger radius.');
        setSaving(false);
        return;
      }

      await saveZone(zone);
      await saveStreets(streets);

      Alert.alert(
        'Zone created!',
        `"${name}" has ${streets.length} streets to cover.`,
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch {
      Alert.alert('Error', 'Failed to create zone. Check your internet connection.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Create Zone</Text>
        <View style={{ width: 60 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.form}>
          <Text style={styles.label}>Zone Name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Maple District North"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
          />

          <Text style={styles.label}>Center Point</Text>
          <TouchableOpacity style={styles.locationBtn} onPress={useMyLocation} disabled={detecting}>
            {detecting
              ? <ActivityIndicator size="small" color="#2563EB" />
              : <Text style={styles.locationBtnText}>📍 Use My Current Location</Text>
            }
          </TouchableOpacity>

          <View style={styles.coordRow}>
            <TextInput
              style={[styles.input, styles.coordInput]}
              placeholder="Latitude"
              value={lat}
              onChangeText={setLat}
              keyboardType="decimal-pad"
            />
            <TextInput
              style={[styles.input, styles.coordInput]}
              placeholder="Longitude"
              value={lng}
              onChangeText={setLng}
              keyboardType="decimal-pad"
            />
          </View>

          <Text style={styles.label}>Radius</Text>
          <View style={styles.radiusRow}>
            {RADIUS_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.value}
                style={[styles.radiusChip, radius === opt.value && styles.radiusChipActive]}
                onPress={() => { setRadius(opt.value); setStreetCount(null); }}
              >
                <Text style={[styles.radiusChipText, radius === opt.value && styles.radiusChipTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.previewBtn, fetching && styles.btnDisabled]}
            onPress={previewStreets}
            disabled={fetching}
          >
            {fetching
              ? <ActivityIndicator size="small" color="#2563EB" />
              : <Text style={styles.previewBtnText}>Preview Streets</Text>
            }
          </TouchableOpacity>

          {streetCount !== null && (
            <View style={styles.previewResult}>
              <Text style={styles.previewResultText}>
                Found <Text style={styles.previewCount}>{streetCount}</Text> streets in this area
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.createBtn, saving && styles.btnDisabled]}
            onPress={handleCreate}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.createBtnText}>Create Zone & Load Streets</Text>
            }
          </TouchableOpacity>

          <Text style={styles.note}>
            Street data is loaded from OpenStreetMap. Loading may take a few seconds.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F5F9' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#E2E8F0',
  },
  backBtn: { width: 60 },
  backText: { color: '#2563EB', fontSize: 15 },
  title: { fontSize: 18, fontWeight: '700', color: '#1E293B' },
  form: { padding: 16, gap: 6 },
  label: { fontSize: 13, fontWeight: '600', color: '#475569', marginTop: 10, marginBottom: 4 },
  input: {
    borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 10,
    padding: 13, fontSize: 15, backgroundColor: '#fff', marginBottom: 4,
  },
  locationBtn: {
    borderWidth: 1.5, borderColor: '#2563EB', borderRadius: 10,
    padding: 13, alignItems: 'center', backgroundColor: '#EFF6FF', marginBottom: 8,
  },
  locationBtnText: { color: '#2563EB', fontWeight: '600', fontSize: 14 },
  coordRow: { flexDirection: 'row', gap: 8 },
  coordInput: { flex: 1 },
  radiusRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  radiusChip: {
    flex: 1, padding: 10, borderRadius: 8,
    borderWidth: 1.5, borderColor: '#E2E8F0',
    alignItems: 'center', backgroundColor: '#fff',
  },
  radiusChipActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  radiusChipText: { fontWeight: '600', color: '#64748B', fontSize: 13 },
  radiusChipTextActive: { color: '#fff' },
  previewBtn: {
    borderWidth: 1.5, borderColor: '#2563EB', borderRadius: 10,
    padding: 13, alignItems: 'center', marginBottom: 8,
  },
  previewBtnText: { color: '#2563EB', fontWeight: '600', fontSize: 14 },
  previewResult: {
    backgroundColor: '#F0FDF4', borderRadius: 8, padding: 12,
    marginBottom: 8, borderWidth: 1, borderColor: '#BBF7D0',
  },
  previewResultText: { color: '#15803D', fontSize: 14, textAlign: 'center' },
  previewCount: { fontWeight: '700', fontSize: 16 },
  createBtn: {
    backgroundColor: '#2563EB', borderRadius: 10,
    padding: 15, alignItems: 'center', marginTop: 8,
  },
  createBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  btnDisabled: { opacity: 0.6 },
  note: { fontSize: 12, color: '#94A3B8', textAlign: 'center', marginTop: 12, lineHeight: 18 },
});
