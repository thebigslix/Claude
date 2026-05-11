import { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  ActivityIndicator, SafeAreaView, Animated, Modal,
  TextInput, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import {
  getCurrentWorker, getZones, getStreets, getCompletions,
  markStreetComplete, unmarkStreetComplete, updateStreetNote, clearCurrentWorker,
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
  const [noteModal, setNoteModal] = useState<{ street: Street; existing: string } | null>(null);
  const [noteText, setNoteText] = useState('');
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
      const comp = completions.find(c => c.streetId === street.id);
      setNoteText(comp?.note ?? '');
      setNoteModal({ street, existing: comp?.note ?? '' });
    } else {
      await markStreetComplete(street.id, worker);
      const c = await getCompletions(selectedZone!.id);
      setCompletions(c);
    }
  }

  async function handleSaveNote() {
    if (!noteModal) return;
    await updateStreetNote(noteModal.street.id, noteText);
    const c = await getCompletions(selectedZone!.id);
    setCompletions(c);
    setNoteModal(null);
  }

  async function handleUnmark() {
    if (!noteModal) return;
    await unmarkStreetComplete(noteModal.street.id);
    const c = await getCompletions(selectedZone!.id);
    setCompletions(c);
    setNoteModal(null);
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
    outputRange: ['0%', '52%'],
  });

  if (!worker) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#3B82F6" /></View>;
  }

  return (
    <View style={styles.container}>
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
          <Text style={styles.noZoneTitle}>No zones yet</Text>
          <Text style={styles.noZoneSub}>Ask your manager to create a zone.</Text>
        </View>
      )}

      {/* Top HUD */}
      <SafeAreaView style={styles.hud} pointerEvents="box-none">
        <View style={styles.topBar}>
          <View style={styles.topLeft}>
            <Text style={styles.workerName}>{worker.name}</Text>
            {selectedZone && <Text style={styles.zoneName}>{selectedZone.name}</Text>}
          </View>
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
          <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
            <Text style={styles.logoutText}>Exit</Text>
          </TouchableOpacity>
        </View>

        {currentStreetObj && (
          <TouchableOpacity
            style={[styles.currentBanner, isComplete(currentStreetObj) && styles.currentBannerDone]}
            onPress={() => !isComplete(currentStreetObj) && handleStreetPress(currentStreetObj)}
            activeOpacity={isComplete(currentStreetObj) ? 1 : 0.8}
          >
            <View style={styles.currentBannerLeft}>
              <Text style={styles.currentLabel}>YOU ARE ON</Text>
              <Text style={styles.currentStreetName}>{currentStreetObj.name}</Text>
            </View>
            {isComplete(currentStreetObj) ? (
              <View style={styles.donePill}>
                <Text style={styles.donePillText}>✓ Done</Text>
              </View>
            ) : (
              <View style={styles.tapPill}>
                <Text style={styles.tapPillText}>Tap to mark done</Text>
              </View>
            )}
          </TouchableOpacity>
        )}
      </SafeAreaView>

      {/* Bottom sheet */}
      <View style={styles.bottomContainer} pointerEvents="box-none">
        <TouchableOpacity style={styles.handle} onPress={toggleList} activeOpacity={0.9}>
          <View style={styles.handleBar} />
          <View style={styles.progressRow}>
            <View style={styles.progressNumbers}>
              <Text style={styles.progressDone}>{done.length}</Text>
              <Text style={styles.progressTotal}>/{streets.length} streets</Text>
            </View>
            <View style={styles.pctBadge}>
              <Text style={styles.pctText}>{pct}%</Text>
            </View>
            <Text style={styles.chevron}>{listOpen ? '▼' : '▲'}</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${pct}%` as any }]} />
          </View>
        </TouchableOpacity>

        <Animated.View style={[styles.streetList, { height: listHeight }]}>
          <FlatList
            data={[...pending, ...done]}
            keyExtractor={item => item.id}
            contentContainerStyle={{ paddingBottom: 24 }}
            renderItem={({ item }) => {
              const done = isComplete(item);
              const comp = completions.find(c => c.streetId === item.id);
              const isCurrent = currentStreet?.toLowerCase() === item.name.toLowerCase();
              return (
                <TouchableOpacity
                  style={[styles.streetRow, done && styles.streetRowDone, isCurrent && styles.streetRowCurrent]}
                  onPress={() => handleStreetPress(item)}
                  activeOpacity={0.75}
                >
                  <View style={styles.streetRowLeft}>
                    <Text style={[styles.streetName, done && styles.streetNameDone]}>
                      {isCurrent ? '📍 ' : ''}{item.name}
                    </Text>
                    {comp?.note && (
                      <Text style={styles.noteText} numberOfLines={1}>💬 {comp.note}</Text>
                    )}
                    {done && !comp?.note && (
                      <Text style={styles.addNoteHint}>Tap to add note</Text>
                    )}
                  </View>
                  <View style={[styles.badge, done ? styles.badgeDone : styles.badgePending]}>
                    <Text style={[styles.badgeText, done ? styles.badgeTextDone : styles.badgeTextPending]}>
                      {done ? '✓' : '·'}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        </Animated.View>
      </View>

      {/* Note modal */}
      <Modal visible={!!noteModal} transparent animationType="slide">
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{noteModal?.street.name}</Text>
            <Text style={styles.modalSubtitle}>Add a note (optional)</Text>
            <TextInput
              style={styles.noteInput}
              placeholder="e.g. gated community, skipped 3 houses..."
              placeholderTextColor="#475569"
              value={noteText}
              onChangeText={setNoteText}
              multiline
              autoFocus
              selectionColor="#3B82F6"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalUnmark} onPress={handleUnmark}>
                <Text style={styles.modalUnmarkText}>Unmark Done</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSave} onPress={handleSaveNote}>
                <Text style={styles.modalSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.modalCancel} onPress={() => setNoteModal(null)}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0F172A' },
  noZone: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0F172A' },
  noZoneIcon: { fontSize: 56, marginBottom: 12 },
  noZoneTitle: { fontSize: 20, fontWeight: '700', color: '#F1F5F9' },
  noZoneSub: { fontSize: 14, color: '#64748B', marginTop: 6 },

  hud: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    margin: 12, backgroundColor: 'rgba(15,23,42,0.92)',
    borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: '#1E293B',
  },
  topLeft: { flex: 1 },
  workerName: { fontSize: 15, fontWeight: '700', color: '#F1F5F9' },
  zoneName: { fontSize: 12, color: '#64748B', marginTop: 1 },
  zoneTabs: { flexDirection: 'row', gap: 6, marginHorizontal: 8 },
  zoneTab: {
    paddingHorizontal: 10, paddingVertical: 4,
    backgroundColor: '#1E293B', borderRadius: 20,
    borderWidth: 1, borderColor: '#334155',
  },
  zoneTabActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  zoneTabText: { fontSize: 12, color: '#64748B', fontWeight: '500' },
  zoneTabTextActive: { color: '#fff' },
  logoutBtn: { paddingLeft: 10 },
  logoutText: { color: '#EF4444', fontSize: 13, fontWeight: '600' },

  currentBanner: {
    marginHorizontal: 12, marginTop: 4,
    backgroundColor: 'rgba(15,23,42,0.92)',
    borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: '#2563EB',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  currentBannerDone: { borderColor: '#16A34A' },
  currentBannerLeft: { flex: 1 },
  currentLabel: { fontSize: 10, fontWeight: '700', color: '#3B82F6', letterSpacing: 1 },
  currentStreetName: { fontSize: 17, fontWeight: '700', color: '#F1F5F9', marginTop: 2 },
  donePill: { backgroundColor: '#14532D', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  donePillText: { color: '#4ADE80', fontWeight: '700', fontSize: 12 },
  tapPill: { backgroundColor: '#1E3A5F', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  tapPillText: { color: '#60A5FA', fontWeight: '600', fontSize: 12 },

  bottomContainer: { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10 },
  handle: {
    backgroundColor: '#1E293B',
    borderTopLeftRadius: 18, borderTopRightRadius: 18,
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12,
    borderTopWidth: 1, borderColor: '#334155',
  },
  handleBar: {
    width: 36, height: 4, backgroundColor: '#334155',
    borderRadius: 2, alignSelf: 'center', marginBottom: 10,
  },
  progressRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  progressNumbers: { flex: 1, flexDirection: 'row', alignItems: 'baseline' },
  progressDone: { fontSize: 22, fontWeight: '800', color: '#F1F5F9' },
  progressTotal: { fontSize: 14, color: '#64748B', marginLeft: 3 },
  pctBadge: {
    backgroundColor: '#172554', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 3, marginRight: 10,
  },
  pctText: { color: '#60A5FA', fontWeight: '700', fontSize: 14 },
  chevron: { fontSize: 12, color: '#475569' },
  progressTrack: { height: 4, backgroundColor: '#0F172A', borderRadius: 2 },
  progressFill: { height: 4, backgroundColor: '#3B82F6', borderRadius: 2 },

  streetList: { backgroundColor: '#1E293B', overflow: 'hidden' },
  streetRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: '#0F172A',
  },
  streetRowDone: { backgroundColor: '#0D2818' },
  streetRowCurrent: { backgroundColor: '#172554' },
  streetRowLeft: { flex: 1 },
  streetName: { fontSize: 14, fontWeight: '600', color: '#CBD5E1' },
  streetNameDone: { color: '#4ADE80' },
  noteText: { fontSize: 12, color: '#64748B', marginTop: 3 },
  addNoteHint: { fontSize: 11, color: '#334155', marginTop: 2 },
  badge: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  badgeDone: { backgroundColor: '#14532D' },
  badgePending: { backgroundColor: '#1E293B' },
  badgeText: { fontWeight: '700', fontSize: 14 },
  badgeTextDone: { color: '#4ADE80' },
  badgeTextPending: { color: '#334155' },

  modalOverlay: {
    flex: 1, justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  modalCard: {
    backgroundColor: '#1E293B',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, borderTopWidth: 1, borderColor: '#334155',
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#F1F5F9', marginBottom: 4 },
  modalSubtitle: { fontSize: 13, color: '#64748B', marginBottom: 16 },
  noteInput: {
    backgroundColor: '#0F172A', borderWidth: 1.5, borderColor: '#334155',
    borderRadius: 10, padding: 14, fontSize: 15, color: '#F1F5F9',
    minHeight: 80, textAlignVertical: 'top', marginBottom: 16,
  },
  modalActions: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  modalUnmark: {
    flex: 1, borderWidth: 1.5, borderColor: '#EF4444',
    borderRadius: 10, padding: 14, alignItems: 'center',
  },
  modalUnmarkText: { color: '#EF4444', fontWeight: '600', fontSize: 14 },
  modalSave: {
    flex: 2, backgroundColor: '#2563EB',
    borderRadius: 10, padding: 14, alignItems: 'center',
  },
  modalSaveText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  modalCancel: { alignItems: 'center', padding: 10 },
  modalCancelText: { color: '#475569', fontSize: 14 },
});
