import { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  Alert, ActivityIndicator, Platform, SafeAreaView,
} from 'react-native';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import {
  getCurrentWorker, getZones, getStreets, getCompletions,
  markStreetComplete, unmarkStreetComplete, clearCurrentWorker,
  Zone, Street, Completion, Worker,
} from '../../lib/storage';
import { reverseGeocodeStreet } from '../../lib/overpass';

export default function WorkerScreen() {
  const [worker, setWorker] = useState<Worker | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [selectedZone, setSelectedZone] = useState<Zone | null>(null);
  const [streets, setStreets] = useState<Street[]>([]);
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [currentStreet, setCurrentStreet] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const locationSub = useRef<Location.LocationSubscription | null>(null);

  useEffect(() => {
    load();
    return () => { locationSub.current?.remove(); };
  }, []);

  async function load() {
    const w = await getCurrentWorker();
    if (!w) { router.replace('/'); return; }
    setWorker(w);
    const z = await getZones();
    setZones(z);
    if (z.length > 0) selectZone(z[0], w);
  }

  async function selectZone(zone: Zone, w?: Worker) {
    setSelectedZone(zone);
    const [s, c] = await Promise.all([
      getStreets(zone.id),
      getCompletions(zone.id),
    ]);
    setStreets(s);
    setCompletions(c);
    startTracking(w ?? worker!);
  }

  async function startTracking(w: Worker) {
    locationSub.current?.remove();
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Location needed', 'Please allow location access to detect your street.');
      return;
    }
    setLocating(true);
    locationSub.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, distanceInterval: 10 },
      async (loc) => {
        const street = await reverseGeocodeStreet(loc.coords.latitude, loc.coords.longitude);
        setCurrentStreet(street);
        setLocating(false);
      }
    );
  }

  async function handleMarkDone(street: Street) {
    if (!worker) return;
    await markStreetComplete(street.id, worker);
    const c = await getCompletions(selectedZone!.id);
    setCompletions(c);
  }

  async function handleUnmark(street: Street) {
    await unmarkStreetComplete(street.id);
    const c = await getCompletions(selectedZone!.id);
    setCompletions(c);
  }

  async function handleLogout() {
    locationSub.current?.remove();
    await clearCurrentWorker();
    router.replace('/');
  }

  function isComplete(street: Street) {
    return completions.some(c => c.streetId === street.id);
  }

  const currentStreetObj = streets.find(
    s => currentStreet && s.name.toLowerCase() === currentStreet.toLowerCase()
  );

  const done = streets.filter(s => isComplete(s));
  const pending = streets.filter(s => !isComplete(s));

  if (!worker) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#2563EB" /></View>;
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hey, {worker.name}</Text>
          {selectedZone && <Text style={styles.zoneName}>{selectedZone.name}</Text>}
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>Sign out</Text>
        </TouchableOpacity>
      </View>

      {/* Zone selector */}
      {zones.length > 1 && (
        <View style={styles.zoneRow}>
          {zones.map(z => (
            <TouchableOpacity
              key={z.id}
              style={[styles.zoneChip, selectedZone?.id === z.id && styles.zoneChipActive]}
              onPress={() => selectZone(z)}
            >
              <Text style={[styles.zoneChipText, selectedZone?.id === z.id && styles.zoneChipTextActive]}>
                {z.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* No zones state */}
      {zones.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🗺️</Text>
          <Text style={styles.emptyTitle}>No zones assigned yet</Text>
          <Text style={styles.emptySubtitle}>Ask your manager to create a zone for you.</Text>
        </View>
      )}

      {/* Current street banner */}
      {selectedZone && (
        <View style={styles.currentBanner}>
          {locating ? (
            <View style={styles.locatingRow}>
              <ActivityIndicator size="small" color="#2563EB" />
              <Text style={styles.locatingText}>Detecting your street...</Text>
            </View>
          ) : (
            <>
              <Text style={styles.currentLabel}>You are on:</Text>
              <Text style={styles.currentStreetName}>{currentStreet ?? 'Unknown street'}</Text>
              {currentStreetObj && !isComplete(currentStreetObj) && (
                <TouchableOpacity
                  style={styles.markBtn}
                  onPress={() => handleMarkDone(currentStreetObj)}
                >
                  <Text style={styles.markBtnText}>✓ Mark this street done</Text>
                </TouchableOpacity>
              )}
              {currentStreetObj && isComplete(currentStreetObj) && (
                <View style={styles.alreadyDone}>
                  <Text style={styles.alreadyDoneText}>✓ Already marked done</Text>
                </View>
              )}
            </>
          )}
        </View>
      )}

      {/* Progress bar */}
      {streets.length > 0 && (
        <View style={styles.progressSection}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressLabel}>Progress</Text>
            <Text style={styles.progressCount}>{done.length}/{streets.length} streets</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${(done.length / streets.length) * 100}%` as any }]} />
          </View>
        </View>
      )}

      {/* Street list */}
      {selectedZone && streets.length > 0 && (
        <FlatList
          data={[...pending, ...done]}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const done = isComplete(item);
            const isCurrent = currentStreet?.toLowerCase() === item.name.toLowerCase();
            return (
              <View style={[styles.streetRow, done && styles.streetRowDone, isCurrent && styles.streetRowCurrent]}>
                <View style={styles.streetInfo}>
                  {isCurrent && <Text style={styles.currentDot}>📍 </Text>}
                  <Text style={[styles.streetName, done && styles.streetNameDone]}>{item.name}</Text>
                  {done && (
                    <Text style={styles.completedBy}>
                      {completions.find(c => c.streetId === item.id)?.workerName}
                    </Text>
                  )}
                </View>
                {done ? (
                  <TouchableOpacity onPress={() => handleUnmark(item)} style={styles.undoBtn}>
                    <Text style={styles.undoText}>Undo</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity onPress={() => handleMarkDone(item)} style={styles.doneBtn}>
                    <Text style={styles.doneBtnText}>Done</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: { flex: 1, backgroundColor: '#F1F5F9' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  greeting: { fontSize: 18, fontWeight: '700', color: '#1E293B' },
  zoneName: { fontSize: 13, color: '#64748B', marginTop: 2 },
  logoutBtn: { padding: 8 },
  logoutText: { color: '#EF4444', fontSize: 14, fontWeight: '600' },
  zoneRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 12, backgroundColor: '#fff' },
  zoneChip: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1.5, borderColor: '#E2E8F0',
  },
  zoneChipActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  zoneChipText: { fontSize: 13, color: '#64748B', fontWeight: '500' },
  zoneChipTextActive: { color: '#fff' },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyIcon: { fontSize: 56, marginBottom: 12 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#1E293B', marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: '#64748B', textAlign: 'center' },
  currentBanner: {
    margin: 12,
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  locatingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  locatingText: { fontSize: 14, color: '#2563EB' },
  currentLabel: { fontSize: 12, color: '#3B82F6', fontWeight: '600', marginBottom: 2 },
  currentStreetName: { fontSize: 18, fontWeight: '700', color: '#1E293B', marginBottom: 8 },
  markBtn: {
    backgroundColor: '#2563EB',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  markBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  alreadyDone: {
    backgroundColor: '#DCFCE7',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
  },
  alreadyDoneText: { color: '#16A34A', fontWeight: '600' },
  progressSection: { paddingHorizontal: 12, paddingBottom: 8 },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  progressLabel: { fontSize: 13, fontWeight: '600', color: '#1E293B' },
  progressCount: { fontSize: 13, color: '#64748B' },
  progressTrack: { height: 6, backgroundColor: '#E2E8F0', borderRadius: 3 },
  progressFill: { height: 6, backgroundColor: '#2563EB', borderRadius: 3 },
  list: { padding: 12, gap: 8 },
  streetRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', borderRadius: 10, padding: 14,
    borderWidth: 1.5, borderColor: '#E2E8F0',
  },
  streetRowDone: { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' },
  streetRowCurrent: { borderColor: '#2563EB', borderWidth: 2 },
  streetInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  currentDot: { fontSize: 14 },
  streetName: { fontSize: 15, fontWeight: '500', color: '#1E293B', flex: 1 },
  streetNameDone: { color: '#16A34A', textDecorationLine: 'line-through' },
  completedBy: { fontSize: 11, color: '#86EFAC', width: '100%', marginTop: 2 },
  doneBtn: {
    backgroundColor: '#2563EB', borderRadius: 6,
    paddingHorizontal: 14, paddingVertical: 6,
  },
  doneBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  undoBtn: {
    borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 6,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  undoText: { color: '#64748B', fontSize: 13 },
});
