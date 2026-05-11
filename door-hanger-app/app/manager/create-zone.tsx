import { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  Alert, ActivityIndicator, SafeAreaView, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { saveZone, saveStreets } from '../../lib/db';
import { fetchStreetsInRadius } from '../../lib/overpass';
import ZonePicker from '../../components/ZonePicker';

const RADIUS_OPTIONS = [
  { label: '0.5 km', value: 500 },
  { label: '1 km', value: 1000 },
  { label: '2 km', value: 2000 },
  { label: '5 km', value: 5000 },
];

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
      if (status !== 'granted') { Alert.alert('Permission needed', 'Location permission is required.'); return; }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setLat(loc.coords.latitude);
      setLng(loc.coords.longitude);
      setHasSetLocation(true);
      setStreetCount(null);
    } catch { Alert.alert('Error', 'Could not get location.'); }
    finally { setDetecting(false); }
  }

  function handleMapMove(newLat: number, newLng: number) {
    setLat(newLat); setLng(newLng);
    setHasSetLocation(true); setStreetCount(null);
  }

  async function previewStreets() {
    if (!hasSetLocation) { Alert.alert('Set a location first', 'Tap the map to place the zone center.'); return; }
    setFetching(true); setStreetCount(null);
    try {
      const streets = await fetchStreetsInRadius(lat, lng, radius, 'preview');
      setStreetCount(streets.length);
    } catch { Alert.alert('Error', 'Could not load streets. Check your connection.'); }
    finally { setFetching(false); }
  }

  async function handleCreate() {
    if (!name.trim()) { Alert.alert('Name required', 'Give this zone a name.'); return; }
    if (!hasSetLocation) { Alert.alert('Location required', 'Tap the map first.'); return; }
    setSaving(true);
    try {
      const zoneId = `zone-${Date.now()}`;
      const zone = { id: zoneId, name: name.trim(), centerLat: lat, centerLng: lng, radiusMeters: radius, createdAt: new Date().toISOString() };
      const streets = await fetchStreetsInRadius(lat, lng, radius, zoneId);
      if (streets.length === 0) { Alert.alert('No streets found', 'Try a larger radius or different location.'); setSaving(false); return; }
      await saveZone(zone);
      await saveStreets(streets);
      Alert.alert('Zone created!', `"${name}" has ${streets.length} streets.`, [{ text: 'OK', onPress: () => router.back() }]);
    } catch { Alert.alert('Error', 'Failed to create zone. Check your connection.'); }
    finally { setSaving(false); }
  }

  return (
    <SafeAreaView style={s.root}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}><Text style={s.back}>← Back</Text></TouchableOpacity>
        <Text style={s.title}>New Zone</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={s.mapWrap}>
        <ZonePicker lat={lat} lng={lng} radiusMeters={radius} onMove={handleMapMove} />
        {!hasSetLocation && (
          <View style={s.mapHintWrap} pointerEvents="none">
            <View style={s.mapHint}><Text style={s.mapHintText}>Tap map to place center</Text></View>
          </View>
        )}
        <TouchableOpacity style={s.myLocBtn} onPress={useMyLocation} disabled={detecting}>
          {detecting ? <ActivityIndicator size="small" color="#3B82F6" /> : <Text style={s.myLocText}>📍 My Location</Text>}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.controls}>
          <TextInput
            style={s.input}
            placeholder="Zone name"
            placeholderTextColor="#333"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            selectionColor="#fff"
          />

          <Text style={s.sectionLabel}>RADIUS</Text>
          <View style={s.radiusRow}>
            {RADIUS_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.value}
                style={[s.radiusChip, radius === opt.value && s.radiusChipActive]}
                onPress={() => { setRadius(opt.value); setStreetCount(null); }}
              >
                <Text style={[s.radiusChipText, radius === opt.value && s.radiusChipTextActive]}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={[s.previewBtn, fetching && s.dim]} onPress={previewStreets} disabled={fetching}>
            {fetching ? <ActivityIndicator size="small" color="#3B82F6" /> : <Text style={s.previewText}>Preview Streets</Text>}
          </TouchableOpacity>

          {streetCount !== null && (
            <Text style={s.previewResult}>{streetCount} streets found in this area</Text>
          )}

          <TouchableOpacity
            style={[s.createBtn, (!hasSetLocation || saving) && s.dim]}
            onPress={handleCreate}
            disabled={saving || !hasSetLocation}
          >
            {saving ? <ActivityIndicator color="#000" /> : <Text style={s.createBtnText}>Create Zone & Load Streets</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#111' },
  back: { color: '#3B82F6', fontSize: 15, width: 60 },
  title: { fontSize: 18, fontWeight: '700', color: '#fff' },
  mapWrap: { height: 280, position: 'relative' },
  mapHintWrap: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' } as any,
  mapHint: { backgroundColor: 'rgba(0,0,0,0.8)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#222' },
  mapHintText: { color: '#888', fontSize: 13 },
  myLocBtn: { position: 'absolute', bottom: 12, right: 12, backgroundColor: 'rgba(0,0,0,0.85)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#222' },
  myLocText: { color: '#3B82F6', fontSize: 13, fontWeight: '600' },
  controls: { padding: 16, gap: 12 },
  input: { backgroundColor: '#111', borderWidth: 1, borderColor: '#222', borderRadius: 12, padding: 14, fontSize: 15, color: '#fff' },
  sectionLabel: { fontSize: 10, fontWeight: '800', color: '#444', letterSpacing: 1.2 },
  radiusRow: { flexDirection: 'row', gap: 8 },
  radiusChip: { flex: 1, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#222', alignItems: 'center', backgroundColor: '#111' },
  radiusChipActive: { backgroundColor: '#fff', borderColor: '#fff' },
  radiusChipText: { fontWeight: '600', color: '#555', fontSize: 13 },
  radiusChipTextActive: { color: '#000' },
  previewBtn: { borderWidth: 1, borderColor: '#222', borderRadius: 12, padding: 13, alignItems: 'center' },
  previewText: { color: '#3B82F6', fontWeight: '600', fontSize: 14 },
  previewResult: { color: '#4ADE80', fontSize: 13, textAlign: 'center' },
  createBtn: { backgroundColor: '#fff', borderRadius: 12, padding: 15, alignItems: 'center', marginTop: 4 },
  createBtnText: { color: '#000', fontWeight: '800', fontSize: 15 },
  dim: { opacity: 0.4 },
});
