import { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  Alert, ActivityIndicator, Platform, SafeAreaView, Animated,
} from 'react-native';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import {
  getCurrentWorker, getZones, getStreets, getCompletions,
  markStreetComplete, unmarkStreetComplete, clearCurrentWorker,
  Zone, Street, Completion, Worker,
} from '../../lib/storage';
import { reverseGeocodeStreet } from '../../lib/overpass';
import StreetMap from '../../components/StreetMap';

export default function WorkerScreen() {
  const [worker, setWorker] = useState<Worker | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [selectedZone, setSelectedZone] = useState<Zone | null>(null);
  const [streets, setStreets] = useState<Street[]>([]);
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [currentStreet, setCurrentStreet] = useState<string | null>(null);
  const [userLat, setUserLat] = useState<number | undefined>();
  const [userLng, setUserLng] = useState<number | undefined>();
  const [listOpen, setListOpen] = useState(false);
  const locationSub = useRef<Location.LocationSubscription | null>(null);
  const listAnim = useRef(new Animated.Value(0)).current;

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
    if (z.length > 0) await selectZone(z[0], w);
  }

  async function selectZone(zone: Zone, w?: Worker) {
    setSelectedZone(zone);
    const [s, c] = await Promise.all([getStreets(zone.id), getCompletions(zone.id)]);
    setStreets(s);
    setCompletions(c);
    startTracking(w ?? worker!);
  }

  async function startTracking(w: Worker) {
    locationSub.current?.remove();
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;

    locationSub.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, distanceInterval: 8 },
      async (loc) => {
        setUserLat(loc.coords.latitude);
        setUserLng(loc.coords.longitude);
        const street = await reverseGeocodeStreet(loc.coords.latitude, loc.coords.longitude);
        setCurrentStreet(street);
      }
    );
  }

  async function handleStreetPress(street: Street) {
    if (!worker) return;
    const isDone = completions.some(c => c.streetId === street.id);
    if (isDone) {
      Alert.alert(
        street.name,
        'This street is already marked done. Undo it?',
        [
          { text: 'Keep done', style: 'cancel' },
          { text: 'Undo', onPress: () => unmark(street) },
        ]
      );
    } else {
      await markStreetComplete(street.id, worker);
      const c = await getCompletions(selectedZone!.id);
      setCompletions(c);
    }
  }

  async function unmark(street: Street) {
    await unmarkStreetComplete(street.id);
    const c = await getCompletions(selectedZone!.id);
    setCompletions(c);
  }

  function toggleList() {
    const toValue = listOpen ? 0 : 1;
    setListOpen(!listOpen);
    Animated.spring(listAnim, { toValue, useNativeDriver: false, tension: 65, friction: 11 }).start();
  }

  async function handleLogout() {
    locationSub.current?.remove();
    await clearCurrentWorker();
    router.replace('/');
  }

  const isComplete = (street: Street) => completions.some(c => c.streetId === street.id);
  const currentStreetObj = streets.find(s => currentStreet && s.name.toLowerCase() === currentStreet.toLowerCase());
  const done = streets.filter(s => isComplete(s));
  const pending = streets.filter(s => !isComplete(s));
  const pct = streets.length > 0 ? Math.round((done.length / streets.length) * 100) : 0;

  const listHeight = listAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '50%'],
  });

  if (!worker) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#2563EB" /></View>;
  }

  return (
    <View style={styles.container}>
      {/* Map fills the screen */}
      {selectedZone ? (
        <StreetMap
          centerLat={selectedZone.centerLat}
          centerLng={selectedZone.centerLng}
          streets={streets}
          completions={completions}
          userLat={userLat}
          userLng={userLng}
          onStreetPress={handleStreetPress}
        />
      ) : (
        <View style={styles.noZone}>
          <Text style={styles.noZoneIcon}>🗺️</Text>
          <Text style={styles.noZoneText}>No zones assigned yet</Text>
          <Text style={styles.noZoneSubText}>Ask your manager to create a zone.</Text>
        </View>
      )}

      {/* Top HUD */}
      <SafeAreaView style={styles.hud} pointerEvents="box-none">
        <View style={styles.topBar}>
          <View style={styles.topLeft}>
            <Text style={styles.workerName}>{worker.name}</Text>
            {selectedZone && <Text style={styles.zoneName}>{selectedZone.name}</Text>}
          </View>
          <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
            <Text style={styles.logoutText}>Sign out</Text>
          </TouchableOpacity>
        </View>

        {/* Zone tabs */}
        {zones.length > 1 && (
          <View style={styles.zoneTabs}>
            {zones.map(z => (
              <TouchableOpacity
                key={z.id}
                style={[styles.zoneTab, selectedZone?.id === z.id && styles.zoneTabActive]}
                onPress={() => selectZone(z)}
              >
                <Text style={[styles.zoneTabText, selectedZone?.id === z.id && styles.zoneTabTextActive]}>
                  {z.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Current street banner */}
        {currentStreetObj && !isComplete(currentStreetObj) && (
          <TouchableOpacity style={styles.currentBanner} onPress={() => handleStreetPress(currentStreetObj)}>
            <Text style={styles.currentLabel}>📍 You're on</Text>
            <Text style={styles.currentStreetName}>{currentStreetObj.name}</Text>
            <Text style={styles.tapHint}>Tap to mark done</Text>
          </TouchableOpacity>
        )}
        {currentStreetObj && isComplete(currentStreetObj) && (
          <View style={[styles.currentBanner, styles.currentBannerDone]}>
            <Text style={styles.currentLabel}>📍 You're on</Text>
            <Text style={[styles.currentStreetName, { color: '#16A34A' }]}>{currentStreetObj.name}</Text>
            <Text style={[styles.tapHint, { color: '#16A34A' }]}>✓ Already done</Text>
          </View>
        )}
      </SafeAreaView>

      {/* Bottom sheet: progress + street list */}
      <View style={styles.bottomContainer} pointerEvents="box-none">
        {/* Pull-up handle bar */}
        <TouchableOpacity style={styles.handle} onPress={toggleList} activeOpacity={0.8}>
          <View style={styles.handleBar} />
          <View style={styles.progressRow}>
            <Text style={styles.progressText}>
              {done.length}/{streets.length} streets done — {pct}%
            </Text>
            <Text style={styles.chevron}>{listOpen ? '▼' : '▲'}</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${pct}%` as any }]} />
          </View>
        </TouchableOpacity>

        {/* Expandable street list */}
        <Animated.View style={[styles.streetList, { height: listHeight }]}>
          <FlatList
            data={[...pending, ...done]}
            keyExtractor={item => item.id}
            contentContainerStyle={{ paddingBottom: 20 }}
            renderItem={({ item }) => {
              const done = isComplete(item);
              const isCurrent = currentStreet?.toLowerCase() === item.name.toLowerCase();
              return (
                <TouchableOpacity
                  style={[styles.streetRow, done && styles.streetRowDone, isCurrent && styles.streetRowCurrent]}
                  onPress={() => handleStreetPress(item)}
                >
                  <Text style={[styles.streetName, done && styles.streetNameDone]}>
                    {isCurrent ? '📍 ' : ''}{item.name}
                  </Text>
                  <View style={[styles.badge, done ? styles.badgeDone : styles.badgePending]}>
                    <Text style={[styles.badgeText, done ? styles.badgeTextDone : styles.badgeTextPending]}>
                      {done ? '✓ Done' : 'Pending'}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#E2E8F0' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  noZone: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F1F5F9' },
  noZoneIcon: { fontSize: 56, marginBottom: 12 },
  noZoneText: { fontSize: 20, fontWeight: '700', color: '#1E293B' },
  noZoneSubText: { fontSize: 14, color: '#64748B', marginTop: 4 },

  hud: {
    position: 'absolute', top: 0, left: 0, right: 0,
    zIndex: 10,
  },
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    margin: 12, backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 12, padding: 12,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 4,
  },
  topLeft: { flex: 1 },
  workerName: { fontSize: 15, fontWeight: '700', color: '#1E293B' },
  zoneName: { fontSize: 12, color: '#64748B', marginTop: 1 },
  logoutBtn: { paddingLeft: 12 },
  logoutText: { color: '#EF4444', fontSize: 13, fontWeight: '600' },

  zoneTabs: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6,
    marginHorizontal: 12, marginBottom: 6,
  },
  zoneTab: {
    paddingHorizontal: 12, paddingVertical: 5,
    backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 20,
    borderWidth: 1.5, borderColor: '#E2E8F0',
  },
  zoneTabActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  zoneTabText: { fontSize: 12, color: '#64748B', fontWeight: '500' },
  zoneTabTextActive: { color: '#fff' },

  currentBanner: {
    marginHorizontal: 12,
    backgroundColor: 'rgba(239,246,255,0.97)',
    borderRadius: 10, padding: 10,
    borderWidth: 1.5, borderColor: '#BFDBFE',
    shadowColor: '#000', shadowOpacity: 0.08,
    shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  currentBannerDone: { backgroundColor: 'rgba(240,253,244,0.97)', borderColor: '#BBF7D0' },
  currentLabel: { fontSize: 11, color: '#3B82F6', fontWeight: '600' },
  currentStreetName: { fontSize: 16, fontWeight: '700', color: '#1E293B' },
  tapHint: { fontSize: 11, color: '#3B82F6', marginTop: 2 },

  bottomContainer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    zIndex: 10,
  },
  handle: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16, borderTopRightRadius: 16,
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10,
    shadowColor: '#000', shadowOpacity: 0.1,
    shadowRadius: 8, shadowOffset: { width: 0, height: -2 }, elevation: 5,
  },
  handleBar: {
    width: 36, height: 4, backgroundColor: '#CBD5E1',
    borderRadius: 2, alignSelf: 'center', marginBottom: 8,
  },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  progressText: { fontSize: 13, fontWeight: '600', color: '#1E293B' },
  chevron: { fontSize: 12, color: '#94A3B8' },
  progressTrack: { height: 6, backgroundColor: '#E2E8F0', borderRadius: 3 },
  progressFill: { height: 6, backgroundColor: '#2563EB', borderRadius: 3 },

  streetList: {
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  streetRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  streetRowDone: { backgroundColor: '#F0FDF4' },
  streetRowCurrent: { backgroundColor: '#EFF6FF' },
  streetName: { fontSize: 14, fontWeight: '500', color: '#1E293B', flex: 1 },
  streetNameDone: { color: '#16A34A', textDecorationLine: 'line-through' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  badgeDone: { backgroundColor: '#DCFCE7' },
  badgePending: { backgroundColor: '#F1F5F9' },
  badgeText: { fontSize: 11, fontWeight: '600' },
  badgeTextDone: { color: '#16A34A' },
  badgeTextPending: { color: '#94A3B8' },
});
