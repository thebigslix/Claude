import { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  ActivityIndicator, Animated, Modal, TextInput,
  KeyboardAvoidingView, Platform, StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import {
  getCurrentWorker, getZones, getStreets, getCompletions,
  markStreetComplete, unmarkStreetComplete, updateStreetNote, clearCurrentWorker,
  Zone, Street, Completion, Worker,
} from '../../lib/storage';
import { reverseGeocodeStreet } from '../../lib/overpass';
import StreetMap from '../../components/StreetMap';

type MapType = 'dark' | 'satellite';

export default function WorkerScreen() {
  const insets = useSafeAreaInsets();
  const [worker, setWorker] = useState<Worker | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [selectedZone, setSelectedZone] = useState<Zone | null>(null);
  const [streets, setStreets] = useState<Street[]>([]);
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [currentStreet, setCurrentStreet] = useState<string | null>(null);
  const [userLat, setUserLat] = useState<number | undefined>();
  const [userLng, setUserLng] = useState<number | undefined>();
  const [mapType, setMapType] = useState<MapType>('dark');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [noteModal, setNoteModal] = useState<{ street: Street; note: string } | null>(null);
  const [noteText, setNoteText] = useState('');
  const locationSub = useRef<Location.LocationSubscription | null>(null);
  const sheetAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    StatusBar.setBarStyle('light-content');
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
        const name = await reverseGeocodeStreet(loc.coords.latitude, loc.coords.longitude);
        setCurrentStreet(name);
      }
    );
  }

  async function handleStreetPress(street: Street) {
    if (!worker) return;
    const isDone = completions.some(c => c.streetId === street.id);
    if (isDone) {
      const comp = completions.find(c => c.streetId === street.id);
      setNoteText(comp?.note ?? '');
      setNoteModal({ street, note: comp?.note ?? '' });
    } else {
      await markStreetComplete(street.id, worker);
      setCompletions(await getCompletions(selectedZone!.id));
    }
  }

  async function handleSaveNote() {
    if (!noteModal) return;
    await updateStreetNote(noteModal.street.id, noteText);
    setCompletions(await getCompletions(selectedZone!.id));
    setNoteModal(null);
  }

  async function handleUnmark() {
    if (!noteModal) return;
    await unmarkStreetComplete(noteModal.street.id);
    setCompletions(await getCompletions(selectedZone!.id));
    setNoteModal(null);
  }

  function toggleSheet() {
    const toValue = sheetOpen ? 0 : 1;
    setSheetOpen(!sheetOpen);
    Animated.spring(sheetAnim, {
      toValue, useNativeDriver: false, tension: 80, friction: 13,
    }).start();
  }

  async function handleLogout() {
    locationSub.current?.remove();
    await clearCurrentWorker();
    router.replace('/');
  }

  const isComplete = (s: Street) => completions.some(c => c.streetId === s.id);
  const currentStreetObj = streets.find(
    s => currentStreet && s.name.toLowerCase() === currentStreet.toLowerCase()
  );
  const done = streets.filter(s => isComplete(s));
  const pending = streets.filter(s => !isComplete(s));
  const pct = streets.length > 0 ? Math.round((done.length / streets.length) * 100) : 0;

  const SHEET_HEIGHT = 320;
  const sheetTranslateY = sheetAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [SHEET_HEIGHT, 0],
  });

  if (!worker) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* MAP */}
      {selectedZone ? (
        <StreetMap
          centerLat={selectedZone.centerLat}
          centerLng={selectedZone.centerLng}
          streets={streets}
          completions={completions}
          userLat={userLat}
          userLng={userLng}
          mapType={mapType}
          onStreetPress={handleStreetPress}
        />
      ) : (
        <View style={styles.emptyMap}>
          <Text style={styles.emptyIcon}>🗺️</Text>
          <Text style={styles.emptyTitle}>No zones assigned</Text>
          <Text style={styles.emptySub}>Ask your manager to create a zone.</Text>
        </View>
      )}

      {/* ── TOP BAR ── */}
      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <View style={styles.topLeft}>
          <Text style={styles.topName}>{worker.name}</Text>
          {selectedZone && (
            <Text style={styles.topZone} numberOfLines={1}>{selectedZone.name}</Text>
          )}
        </View>

        <View style={styles.topRight}>
          {/* Map type toggle */}
          {selectedZone && (
            <TouchableOpacity
              style={styles.mapToggle}
              onPress={() => setMapType(t => t === 'dark' ? 'satellite' : 'dark')}
              activeOpacity={0.8}
            >
              <Text style={styles.mapToggleText}>
                {mapType === 'dark' ? '🛰 Satellite' : '🗺 Map'}
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.exitBtn} onPress={handleLogout} activeOpacity={0.8}>
            <Text style={styles.exitText}>Exit</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Zone tabs (only if multiple zones) */}
      {zones.length > 1 && (
        <View style={styles.zoneTabsWrap}>
          <View style={styles.zoneTabs}>
            {zones.map(z => (
              <TouchableOpacity
                key={z.id}
                style={[styles.zoneTab, selectedZone?.id === z.id && styles.zoneTabActive]}
                onPress={() => selectZone(z)}
                activeOpacity={0.8}
              >
                <Text style={[styles.zoneTabText, selectedZone?.id === z.id && styles.zoneTabTextActive]}>
                  {z.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Current street pill */}
      {currentStreetObj && selectedZone && (
        <TouchableOpacity
          style={[
            styles.currentPill,
            isComplete(currentStreetObj) ? styles.currentPillDone : styles.currentPillActive,
          ]}
          onPress={() => !isComplete(currentStreetObj) && handleStreetPress(currentStreetObj)}
          activeOpacity={isComplete(currentStreetObj) ? 1 : 0.8}
        >
          <View style={styles.currentPillDot} />
          <View style={styles.currentPillText}>
            <Text style={styles.currentPillLabel}>YOU ARE ON</Text>
            <Text style={styles.currentPillStreet} numberOfLines={1}>
              {currentStreetObj.name}
            </Text>
          </View>
          {isComplete(currentStreetObj) ? (
            <View style={styles.doneBadge}><Text style={styles.doneBadgeText}>✓ Done</Text></View>
          ) : (
            <View style={styles.tapBadge}><Text style={styles.tapBadgeText}>Tap ✓</Text></View>
          )}
        </TouchableOpacity>
      )}

      {/* ── BOTTOM SHEET ── */}
      {selectedZone && (
        <View style={[styles.sheetWrap, { paddingBottom: insets.bottom }]}>
          {/* Handle / progress bar — always visible */}
          <TouchableOpacity style={styles.sheetHandle} onPress={toggleSheet} activeOpacity={0.9}>
            <View style={styles.handleBar} />
            <View style={styles.progressRow}>
              <View style={styles.progressLeft}>
                <Text style={styles.progressDone}>{done.length}</Text>
                <Text style={styles.progressOf}>/{streets.length}</Text>
                <Text style={styles.progressLabel}> streets done</Text>
              </View>
              <View style={styles.progressRight}>
                <Text style={styles.pct}>{pct}%</Text>
                <Text style={styles.chevron}>{sheetOpen ? ' ▼' : ' ▲'}</Text>
              </View>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${pct}%` as any }]} />
            </View>
          </TouchableOpacity>

          {/* Animated street list */}
          <Animated.View style={[styles.streetListWrap, { maxHeight: sheetAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [0, SHEET_HEIGHT],
            }) }]}>
            <FlatList
              data={[...pending, ...done]}
              keyExtractor={item => item.id}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                const complete = isComplete(item);
                const comp = completions.find(c => c.streetId === item.id);
                const isCurrent = currentStreet?.toLowerCase() === item.name.toLowerCase();
                return (
                  <TouchableOpacity
                    style={[
                      styles.streetRow,
                      complete && styles.streetRowDone,
                      isCurrent && styles.streetRowCurrent,
                    ]}
                    onPress={() => handleStreetPress(item)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.streetRowLeft}>
                      <View style={styles.streetNameRow}>
                        {isCurrent && <Text style={styles.locationPin}>📍</Text>}
                        <Text style={[styles.streetName, complete && styles.streetNameDone]} numberOfLines={1}>
                          {item.name}
                        </Text>
                      </View>
                      {comp?.note ? (
                        <Text style={styles.notePreview} numberOfLines={1}>💬 {comp.note}</Text>
                      ) : complete ? (
                        <Text style={styles.tapNote}>tap to add note</Text>
                      ) : null}
                    </View>
                    <View style={[styles.streetBadge, complete ? styles.streetBadgeDone : styles.streetBadgePending]}>
                      <Text style={[styles.streetBadgeText, complete ? styles.streetBadgeTextDone : styles.streetBadgeTextPending]}>
                        {complete ? '✓' : '○'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          </Animated.View>
        </View>
      )}

      {/* Note modal */}
      <Modal visible={!!noteModal} transparent animationType="slide" statusBarTranslucent>
        <KeyboardAvoidingView
          style={styles.modalBg}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[styles.modalCard, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalStreet}>{noteModal?.street.name}</Text>
            <Text style={styles.modalHint}>Add a note or unmark this street</Text>

            <TextInput
              style={styles.noteInput}
              placeholder="e.g. skipped gated houses, 3 flyers placed..."
              placeholderTextColor="#475569"
              value={noteText}
              onChangeText={setNoteText}
              multiline
              autoFocus
              selectionColor="#3B82F6"
            />

            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.unmarkBtn} onPress={handleUnmark} activeOpacity={0.8}>
                <Text style={styles.unmarkText}>Unmark</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveNote} activeOpacity={0.8}>
                <Text style={styles.saveText}>Save Note</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setNoteModal(null)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0F172A' },
  loadingScreen: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0F172A' },

  emptyMap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyIcon: { fontSize: 52, marginBottom: 12 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#F1F5F9' },
  emptySub: { fontSize: 14, color: '#475569', marginTop: 6 },

  // TOP BAR
  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingBottom: 12,
    zIndex: 20,
  },
  topLeft: { flex: 1, marginRight: 10 },
  topName: {
    fontSize: 17, fontWeight: '800', color: '#F1F5F9',
    textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  topZone: {
    fontSize: 12, color: '#94A3B8', marginTop: 1,
    textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
  },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mapToggle: {
    backgroundColor: 'rgba(15,23,42,0.85)',
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: 1, borderColor: '#334155',
  },
  mapToggleText: { color: '#94A3B8', fontSize: 12, fontWeight: '600' },
  exitBtn: {
    backgroundColor: 'rgba(239,68,68,0.15)',
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)',
  },
  exitText: { color: '#EF4444', fontSize: 12, fontWeight: '700' },

  // ZONE TABS
  zoneTabsWrap: {
    position: 'absolute', top: 100, left: 0, right: 0,
    zIndex: 20, paddingHorizontal: 14,
  },
  zoneTabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  zoneTab: {
    backgroundColor: 'rgba(15,23,42,0.85)',
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1, borderColor: '#334155',
  },
  zoneTabActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  zoneTabText: { fontSize: 12, color: '#64748B', fontWeight: '600' },
  zoneTabTextActive: { color: '#fff' },

  // CURRENT STREET PILL
  currentPill: {
    position: 'absolute', bottom: 130, left: 14, right: 14,
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(15,23,42,0.92)',
    borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: '#334155',
    zIndex: 20,
    gap: 10,
  },
  currentPillActive: { borderColor: '#2563EB' },
  currentPillDone: { borderColor: '#16A34A' },
  currentPillDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: '#3B82F6',
  },
  currentPillText: { flex: 1 },
  currentPillLabel: { fontSize: 9, fontWeight: '800', color: '#3B82F6', letterSpacing: 1.2 },
  currentPillStreet: { fontSize: 15, fontWeight: '700', color: '#F1F5F9', marginTop: 1 },
  doneBadge: {
    backgroundColor: '#14532D', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  doneBadgeText: { color: '#4ADE80', fontSize: 12, fontWeight: '700' },
  tapBadge: {
    backgroundColor: '#172554', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  tapBadgeText: { color: '#60A5FA', fontSize: 12, fontWeight: '700' },

  // BOTTOM SHEET
  sheetWrap: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    zIndex: 20, backgroundColor: '#1E293B',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderTopWidth: 1, borderColor: '#334155',
    overflow: 'hidden',
  },
  sheetHandle: {
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12,
  },
  handleBar: {
    width: 32, height: 3, backgroundColor: '#334155',
    borderRadius: 2, alignSelf: 'center', marginBottom: 12,
  },
  progressRow: {
    flexDirection: 'row', alignItems: 'baseline',
    justifyContent: 'space-between', marginBottom: 10,
  },
  progressLeft: { flexDirection: 'row', alignItems: 'baseline' },
  progressDone: { fontSize: 24, fontWeight: '800', color: '#F1F5F9' },
  progressOf: { fontSize: 16, color: '#475569', fontWeight: '600' },
  progressLabel: { fontSize: 13, color: '#475569' },
  progressRight: { flexDirection: 'row', alignItems: 'center' },
  pct: { fontSize: 18, fontWeight: '800', color: '#60A5FA' },
  chevron: { fontSize: 11, color: '#475569' },
  progressTrack: { height: 3, backgroundColor: '#0F172A', borderRadius: 2 },
  progressFill: { height: 3, backgroundColor: '#3B82F6', borderRadius: 2 },

  streetListWrap: { overflow: 'hidden' },
  listContent: { paddingBottom: 8 },
  streetRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#0F172A',
  },
  streetRowDone: { backgroundColor: 'rgba(20,83,45,0.25)' },
  streetRowCurrent: { backgroundColor: 'rgba(23,37,84,0.5)' },
  streetRowLeft: { flex: 1, marginRight: 10 },
  streetNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  locationPin: { fontSize: 12 },
  streetName: { fontSize: 14, fontWeight: '600', color: '#CBD5E1', flex: 1 },
  streetNameDone: { color: '#4ADE80' },
  notePreview: { fontSize: 11, color: '#475569', marginTop: 2 },
  tapNote: { fontSize: 11, color: '#334155', marginTop: 2 },
  streetBadge: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  streetBadgeDone: { backgroundColor: '#14532D' },
  streetBadgePending: { backgroundColor: '#0F172A' },
  streetBadgeText: { fontSize: 14, fontWeight: '700' },
  streetBadgeTextDone: { color: '#4ADE80' },
  streetBadgeTextPending: { color: '#1E293B' },

  // NOTE MODAL
  modalBg: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.75)' },
  modalCard: {
    backgroundColor: '#1E293B',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, borderTopWidth: 1, borderColor: '#334155',
  },
  modalHandle: {
    width: 32, height: 3, backgroundColor: '#334155',
    borderRadius: 2, alignSelf: 'center', marginBottom: 16,
  },
  modalStreet: { fontSize: 18, fontWeight: '700', color: '#F1F5F9', marginBottom: 4 },
  modalHint: { fontSize: 13, color: '#475569', marginBottom: 14 },
  noteInput: {
    backgroundColor: '#0F172A', borderWidth: 1.5, borderColor: '#334155',
    borderRadius: 12, padding: 14, fontSize: 14, color: '#F1F5F9',
    minHeight: 80, textAlignVertical: 'top', marginBottom: 14,
  },
  modalBtns: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  unmarkBtn: {
    flex: 1, borderWidth: 1.5, borderColor: '#EF4444',
    borderRadius: 12, padding: 14, alignItems: 'center',
  },
  unmarkText: { color: '#EF4444', fontWeight: '700', fontSize: 14 },
  saveBtn: {
    flex: 2, backgroundColor: '#2563EB',
    borderRadius: 12, padding: 14, alignItems: 'center',
  },
  saveText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  cancelBtn: { alignItems: 'center', paddingVertical: 10 },
  cancelText: { color: '#475569', fontSize: 14 },
});
