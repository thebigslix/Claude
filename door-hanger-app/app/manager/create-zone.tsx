import { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  Alert, ActivityIndicator, SafeAreaView, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { saveZone, saveStreets } from '../../lib/storage';
import { fetchStreetsInRadius } from '../../lib/overpass';
import ZonePicker from '../../components/ZonePicker';

const RADIUS_OPTIONS = [
  { label: '0.5 km', value: 500 },
  { label: '1 km', value: 1000 },
  { label: '2 km', value: 2000 },
  { label: '5 km', value: 5000 },
];

// Default center (San Jose, CA — will be replaced by user's location or tap)
const DEFAULT_LAT = 37.3382;
const DEFAULT_LNG = -121.8863;

export default function CreateZoneScreen() {
  const [name, setName] = useState('');
  const [lat, setLat] = useState(DEFAULT_LAT);
  const [lng, setLng] = useState(DEFAULT_LNG);
  const [hasSetLocation, setHasSetLocation] = useState(false);
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
      setLat(loc.coords.latitude);
      setLng(loc.coords.longitude);
      setHasSetLocation(true);
      setStreetCount(null);
    } catch {
      Alert.alert('Error', 'Could not get location.');
    } finally {
      setDetecting(false);
    }
  }

  function handleMapMove(newLat: number, newLng: number) {
    setLat(newLat);
    setLng(newLng);
    setHasSetLocation(true);
    setStreetCount(null);
  }

  async function previewStreets() {
    if (!hasSetLocation) {
      Alert.alert('Set a location first', 'Tap on the map or use "My Location" to set the zone center.');
      return;
    }
    setFetching(true);
    setStreetCount(null);
    try {
      const streets = await fetchStreetsInRadius(lat, lng, radius, 'preview');
      setStreetCount(streets.length);
    } catch {
      Alert.alert('Error', 'Could not load streets. Check your connection.');
    } finally {
      setFetching(false);
    }
  }

  async function handleCreate() {
    if (!name.trim()) { Alert.alert('Name required', 'Give this zone a name.'); return; }
    if (!hasSetLocation) { Alert.alert('Location required', 'Tap the map or use "My Location".'); return; }

    setSaving(true);
    try {
      const zoneId = `zone-${Date.now()}`;
      const zone = {
        id: zoneId,
        name: name.trim(),
        centerLat: lat,
        centerLng: lng,
        radiusMeters: radius,
        createdAt: new Date().toISOString(),
      };

      const streets = await fetchStreetsInRadius(lat, lng, radius, zoneId);

      if (streets.length === 0) {
        Alert.alert('No streets found', 'No named streets in this area. Try a larger radius or different location.');
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

      {/* Map takes up top half */}
      <View style={styles.mapContainer}>
        <ZonePicker
          lat={lat}
          lng={lng}
          radiusMeters={radius}
          onMove={handleMapMove}
        />
        {!hasSetLocation && (
          <View style={styles.mapOverlay} pointerEvents="none">
            <View style={styles.mapHint}>
              <Text style={styles.mapHintText}>Tap the map to place the zone center</Text>
            </View>
          </View>
        )}
        <TouchableOpacity style={styles.myLocationBtn} onPress={useMyLocation} disabled={detecting}>
          {detecting
            ? <ActivityIndicator size="small" color="#3B82F6" />
            : <Text style={styles.myLocationText}>📍 My Location</Text>
          }
        </TouchableOpacity>
      </View>

      {/* Controls below map */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.controls}>

          <TextInput
            style={styles.nameInput}
            placeholder="Zone name (e.g. Maple District)"
            placeholderTextColor="#475569"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            selectionColor="#3B82F6"
          />

          {hasSetLocation && (
            <Text style={styles.coordsText}>
              📌 {lat.toFixed(5)}, {lng.toFixed(5)}
            </Text>
          )}

          <Text style={styles.sectionLabel}>RADIUS</Text>
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
              ? <ActivityIndicator size="small" color="#3B82F6" />
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
            style={[styles.createBtn, (saving || !hasSetLocation) && styles.btnDisabled]}
            onPress={handleCreate}
            disabled={saving || !hasSetLocation}
          >
            {saving
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.createBtnText}>Create Zone & Load Streets</Text>
            }
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderBottomWidth: 1, borderBottomColor: '#1E293B',
  },
  backBtn: { width: 60 },
  backText: { color: '#3B82F6', fontSize: 15 },
  title: { fontSize: 18, fontWeight: '700', color: '#F1F5F9' },

  mapContainer: { height: 280, position: 'relative' },
  mapOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center', alignItems: 'center',
    pointerEvents: 'none',
  } as any,
  mapHint: {
    backgroundColor: 'rgba(15,23,42,0.85)',
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1, borderColor: '#334155',
  },
  mapHintText: { color: '#94A3B8', fontSize: 13, fontWeight: '500' },
  myLocationBtn: {
    position: 'absolute', bottom: 12, right: 12,
    backgroundColor: 'rgba(15,23,42,0.9)',
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1, borderColor: '#334155',
  },
  myLocationText: { color: '#3B82F6', fontSize: 13, fontWeight: '600' },

  controls: { padding: 16, gap: 12 },
  nameInput: {
    backgroundColor: '#1E293B', borderWidth: 1.5, borderColor: '#334155',
    borderRadius: 10, padding: 14, fontSize: 15, color: '#F1F5F9',
  },
  coordsText: { fontSize: 12, color: '#475569' },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#475569', letterSpacing: 1, marginTop: 4 },
  radiusRow: { flexDirection: 'row', gap: 8 },
  radiusChip: {
    flex: 1, padding: 10, borderRadius: 8,
    borderWidth: 1.5, borderColor: '#334155',
    alignItems: 'center', backgroundColor: '#1E293B',
  },
  radiusChipActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  radiusChipText: { fontWeight: '600', color: '#64748B', fontSize: 13 },
  radiusChipTextActive: { color: '#fff' },
  previewBtn: {
    borderWidth: 1.5, borderColor: '#3B82F6', borderRadius: 10,
    padding: 13, alignItems: 'center',
  },
  previewBtnText: { color: '#3B82F6', fontWeight: '600', fontSize: 14 },
  previewResult: {
    backgroundColor: '#0D2818', borderRadius: 8, padding: 12,
    borderWidth: 1, borderColor: '#14532D',
  },
  previewResultText: { color: '#4ADE80', fontSize: 14, textAlign: 'center' },
  previewCount: { fontWeight: '700', fontSize: 16 },
  createBtn: {
    backgroundColor: '#2563EB', borderRadius: 10,
    padding: 15, alignItems: 'center',
  },
  createBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  btnDisabled: { opacity: 0.4 },
});
