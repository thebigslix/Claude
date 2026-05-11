import { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ActivityIndicator, Modal, Alert, StatusBar, Platform,
  KeyboardAvoidingView, Animated, Keyboard, TouchableWithoutFeedback,
  Image, FlatList,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import {
  getCurrentWorker, getZones, getStreets, getCompletions,
  markStreetComplete, unmarkStreetComplete, addStreet,
  getActiveShift, startShift, endShift, clearCurrentWorker,
  getYardSigns, saveYardSign, deleteYardSign,
  Zone, Street, Worker, Completion, ShiftSession, YardSign,
} from '../../lib/db';
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
  const [pins, setPins] = useState<YardSign[]>([]);
  const [mapType, setMapType] = useState<MapType>('dark');

  const [userLat, setUserLat] = useState<number | undefined>();
  const [userLng, setUserLng] = useState<number | undefined>();
  const [currentStreet, setCurrentStreet] = useState<string | null>(null);
  const locationSub = useRef<Location.LocationSubscription | null>(null);

  const [activeShift, setActiveShift] = useState<ShiftSession | null>(null);
  const [shiftSeconds, setShiftSeconds] = useState(0);
  const shiftTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Street bottom sheet
  const [selectedStreet, setSelectedStreet] = useState<Street | null>(null);
  const [hangerCount, setHangerCount] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const sheetAnim = useRef(new Animated.Value(0)).current;

  // Add missing street modal
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newStreetName, setNewStreetName] = useState('');
  const [addingSaving, setAddingSaving] = useState(false);

  // Photo pin
  const [dropping, setDropping] = useState(false);
  const [viewPin, setViewPin] = useState<YardSign | null>(null);
  const [pinListOpen, setPinListOpen] = useState(false);

  useEffect(() => {
    StatusBar.setBarStyle('light-content');
    load();
    return () => {
      locationSub.current?.remove();
      if (shiftTimer.current) clearInterval(shiftTimer.current);
    };
  }, []);

  async function load() {
    const w = await getCurrentWorker();
    if (!w) { router.replace('/'); return; }
    setWorker(w);
    const [z, shift] = await Promise.all([getZones(), getActiveShift()]);
    setZones(z);
    if (shift) { setActiveShift(shift); startShiftTimer(shift); }
    if (z.length > 0) await selectZone(z[0]);
    await startTracking();
  }

  async function selectZone(zone: Zone) {
    setSelectedZone(zone);
    closeSheet();
    const [s, c, p] = await Promise.all([getStreets(zone.id), getCompletions(zone.id), getYardSigns(zone.id)]);
    setStreets(s);
    setCompletions(c);
    setPins(p);
  }

  async function refreshData(zone: Zone) {
    const [s, c, p] = await Promise.all([getStreets(zone.id), getCompletions(zone.id), getYardSigns(zone.id)]);
    setStreets(s);
    setCompletions(c);
    setPins(p);
  }

  async function startTracking() {
    locationSub.current?.remove();
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;
    locationSub.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, distanceInterval: 10 },
      async (loc) => {
        setUserLat(loc.coords.latitude);
        setUserLng(loc.coords.longitude);
        const name = await reverseGeocodeStreet(loc.coords.latitude, loc.coords.longitude);
        setCurrentStreet(name);
      }
    );
  }

  // ── Sheet ────────────────────────────────────────────
  function openSheet(street: Street) {
    Keyboard.dismiss();
    const comp = completions.find(c => c.streetId === street.id);
    setSelectedStreet(street);
    setHangerCount(comp?.hangerCount != null ? String(comp.hangerCount) : '');
    setNote(comp?.note ?? '');
    Animated.spring(sheetAnim, { toValue: 1, useNativeDriver: true, tension: 65, friction: 11 }).start();
  }

  function closeSheet() {
    Keyboard.dismiss();
    Animated.timing(sheetAnim, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => {
      setSelectedStreet(null);
      setHangerCount('');
      setNote('');
    });
  }

  // ── Shift ────────────────────────────────────────────
  function startShiftTimer(shift: ShiftSession) {
    if (shiftTimer.current) clearInterval(shiftTimer.current);
    const tick = () => setShiftSeconds(Math.floor((Date.now() - new Date(shift.startTime).getTime()) / 1000));
    tick();
    shiftTimer.current = setInterval(tick, 1000);
  }

  async function handleStartShift() {
    if (!worker || !selectedZone) return;
    const lat = userLat ?? selectedZone.centerLat;
    const lng = userLng ?? selectedZone.centerLng;
    const shift = await startShift(worker, selectedZone, lat, lng);
    setActiveShift(shift);
    startShiftTimer(shift);
  }

  async function handleEndShift() {
    Alert.alert('Clock Out', 'End your shift?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clock Out', style: 'destructive', onPress: async () => {
          if (shiftTimer.current) clearInterval(shiftTimer.current);
          await endShift(userLat ?? 0, userLng ?? 0);
          setActiveShift(null);
          setShiftSeconds(0);
        },
      },
    ]);
  }

  function formatTime(secs: number) {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${m}:${String(s).padStart(2, '0')}`;
  }

  // ── Mark street ──────────────────────────────────────
  const isComplete = (street: Street) => completions.some(c => c.streetId === street.id);

  async function handleMarkDone() {
    if (!selectedStreet || !worker || !selectedZone) return;
    Keyboard.dismiss();
    setSaving(true);
    const count = parseInt(hangerCount, 10);
    await markStreetComplete(selectedStreet.id, worker, isNaN(count) ? undefined : count, note);
    await refreshData(selectedZone);
    setSaving(false);
    closeSheet();
  }

  async function handleUnmark() {
    if (!selectedStreet || !selectedZone) return;
    setSaving(true);
    await unmarkStreetComplete(selectedStreet.id);
    await refreshData(selectedZone);
    setSaving(false);
    closeSheet();
  }

  // ── Add missing street ───────────────────────────────
  function openAddStreet() {
    setNewStreetName(currentStreet ?? '');
    setAddModalOpen(true);
  }

  async function handleAddStreet() {
    if (!newStreetName.trim() || !selectedZone) return;
    setAddingSaving(true);
    const lat = userLat ?? selectedZone.centerLat;
    const lng = userLng ?? selectedZone.centerLng;
    const street: Street = {
      id: `custom-${Date.now()}`,
      zoneId: selectedZone.id,
      name: newStreetName.trim(),
      osmId: `custom-${Date.now()}`,
      geometry: [[[lat - 0.0001, lng - 0.0001], [lat + 0.0001, lng + 0.0001]]],
    };
    await addStreet(street);
    await refreshData(selectedZone);
    setAddingSaving(false);
    setAddModalOpen(false);
    setNewStreetName('');
  }

  // ── Photo pin drop ───────────────────────────────────
  async function handleDropPin() {
    if (!worker || !selectedZone) return;
    if (!activeShift) {
      Alert.alert('Start your shift first', 'Tap "Start Shift" before dropping pins.');
      return;
    }
    setDropping(true);
    try {
      const camPerm = await ImagePicker.requestCameraPermissionsAsync();
      if (camPerm.status !== 'granted') {
        Alert.alert('Camera permission needed', 'Allow camera access in Settings to drop pins.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
      if (result.canceled) return;

      const lat = userLat ?? selectedZone.centerLat;
      const lng = userLng ?? selectedZone.centerLng;
      const pin: YardSign = {
        id: `pin-${Date.now()}`,
        workerId: worker.id,
        workerName: worker.name,
        zoneId: selectedZone.id,
        shiftId: activeShift.id,
        lat, lng,
        placedAt: new Date().toISOString(),
        photoUri: result.assets[0].uri,
        address: currentStreet ?? undefined,
      };
      await saveYardSign(pin);
      setPins(await getYardSigns(selectedZone.id));
    } finally {
      setDropping(false);
    }
  }

  async function handleDeletePin(pin: YardSign) {
    Alert.alert('Remove Pin', 'Remove this photo pin?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          await deleteYardSign(pin.id);
          if (selectedZone) setPins(await getYardSigns(selectedZone.id));
          setViewPin(null);
        },
      },
    ]);
  }

  async function handleLogout() {
    locationSub.current?.remove();
    if (shiftTimer.current) clearInterval(shiftTimer.current);
    await clearCurrentWorker();
    router.replace('/');
  }

  const sheetTranslateY = sheetAnim.interpolate({ inputRange: [0, 1], outputRange: [340, 0] });
  const done = completions.length;
  const total = streets.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const shiftPins = activeShift ? pins.filter(p => p.shiftId === activeShift.id) : [];

  if (!worker) {
    return <View style={s.loading}><ActivityIndicator color="#fff" /></View>;
  }

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* MAP */}
      {selectedZone ? (
        <StreetMap
          centerLat={selectedZone.centerLat}
          centerLng={selectedZone.centerLng}
          streets={streets}
          completions={completions}
          yardSigns={pins}
          userLat={userLat}
          userLng={userLng}
          mapType={mapType}
          placingSign={false}
          onStreetPress={openSheet}
          onMapPress={() => {}}
          onYardSignPress={setViewPin}
        />
      ) : (
        <View style={s.emptyMap}>
          <Text style={s.emptyIcon}>🗺️</Text>
          <Text style={s.emptyTitle}>No zones yet</Text>
          <Text style={s.emptySub}>Ask your manager to create a zone.</Text>
        </View>
      )}

      {/* ── TOP BAR ── */}
      <View style={[s.topBar, { paddingTop: insets.top + 8 }]}>
        <View style={s.topLeft}>
          <Text style={s.topName}>{worker.name}</Text>
          {selectedZone && <Text style={s.topZone} numberOfLines={1}>{selectedZone.name}</Text>}
        </View>
        <View style={s.topRight}>
          {selectedZone && (
            <TouchableOpacity style={s.iconBtn} onPress={() => setMapType(t => t === 'dark' ? 'satellite' : 'dark')}>
              <Text style={s.iconBtnText}>{mapType === 'dark' ? '🛰' : '🗺'}</Text>
            </TouchableOpacity>
          )}
          {zones.length > 1 && zones.map(z => (
            <TouchableOpacity
              key={z.id}
              style={[s.zoneChip, selectedZone?.id === z.id && s.zoneChipActive]}
              onPress={() => selectZone(z)}
            >
              <Text style={[s.zoneChipText, selectedZone?.id === z.id && s.zoneChipTextActive]}>{z.name}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={s.exitBtn} onPress={handleLogout}>
            <Text style={s.exitText}>Exit</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── SHIFT BAR ── */}
      {selectedZone && (
        <View style={[s.shiftBar, { top: insets.top + 60 }]}>
          {activeShift ? (
            <>
              <View style={s.shiftLeft}>
                <View style={s.shiftDot} />
                <Text style={s.shiftTime}>{formatTime(shiftSeconds)}</Text>
              </View>
              <View style={s.shiftCenter}>
                <Text style={s.progressText}>{done}/{total} streets · {pct}%</Text>
                <View style={s.progressTrack}><View style={[s.progressFill, { width: `${pct}%` as any }]} /></View>
              </View>
              <TouchableOpacity style={s.clockOutBtn} onPress={handleEndShift}>
                <Text style={s.clockOutText}>Clock Out</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity style={s.startShiftBtn} onPress={handleStartShift}>
              <Text style={s.startShiftText}>⏱  Start Shift to Begin</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Current street label */}
      {currentStreet && !selectedStreet && (
        <View style={[s.streetLabel, { bottom: 100 + insets.bottom }]}>
          <Text style={s.streetLabelText} numberOfLines={1}>📍 {currentStreet}</Text>
        </View>
      )}

      {/* ── BOTTOM BUTTONS (no sheet open) ── */}
      {selectedZone && !selectedStreet && (
        <View style={[s.bottomRow, { bottom: 24 + insets.bottom }]}>
          <TouchableOpacity style={s.addStreetBtn} onPress={openAddStreet}>
            <Text style={s.addStreetText}>+ Missing Street</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.dropPinBtn, (!activeShift || dropping) && s.dropPinDim]}
            onPress={handleDropPin}
            disabled={dropping || !activeShift}
            activeOpacity={0.85}
          >
            {dropping
              ? <ActivityIndicator color="#000" size="small" />
              : <Text style={s.dropPinText}>📷  Drop Pin{activeShift && shiftPins.length > 0 ? `  ·  ${shiftPins.length}` : ''}</Text>
            }
          </TouchableOpacity>
        </View>
      )}

      {/* ── BOTTOM SHEET ── */}
      {selectedStreet && (
        <>
          {/* Backdrop to dismiss keyboard on tap outside inputs */}
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>

          <Animated.View style={[s.sheet, { paddingBottom: insets.bottom + 8, transform: [{ translateY: sheetTranslateY }] }]}>
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
              <View style={s.sheetHandle} />
            </TouchableWithoutFeedback>

            <View style={s.sheetHeader}>
              <Text style={s.sheetStreetName} numberOfLines={2}>{selectedStreet.name}</Text>
              {isComplete(selectedStreet) && (
                <View style={s.doneBadge}><Text style={s.doneBadgeText}>Done ✓</Text></View>
              )}
            </View>

            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <View style={s.sheetField}>
                <Text style={s.sheetFieldLabel}>DOOR HANGERS PLACED</Text>
                <TextInput
                  style={s.sheetInput}
                  placeholder="0"
                  placeholderTextColor="#333"
                  keyboardType="number-pad"
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                  value={hangerCount}
                  onChangeText={setHangerCount}
                  selectionColor="#fff"
                />
              </View>

              <View style={s.sheetField}>
                <Text style={s.sheetFieldLabel}>NOTE (optional)</Text>
                <TextInput
                  style={s.sheetInput}
                  placeholder="e.g. gated community, dogs..."
                  placeholderTextColor="#333"
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                  value={note}
                  onChangeText={setNote}
                  selectionColor="#fff"
                />
              </View>

              <View style={s.sheetBtns}>
                {isComplete(selectedStreet) && (
                  <TouchableOpacity style={s.unmarkBtn} onPress={handleUnmark} disabled={saving}>
                    {saving ? <ActivityIndicator color="#EF4444" /> : <Text style={s.unmarkBtnText}>Unmark</Text>}
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[s.doneBtn, saving && s.dim]}
                  onPress={handleMarkDone}
                  disabled={saving}
                >
                  {saving
                    ? <ActivityIndicator color="#000" />
                    : <Text style={s.doneBtnText}>{isComplete(selectedStreet) ? 'Update' : 'Mark Done ✓'}</Text>
                  }
                </TouchableOpacity>
                <TouchableOpacity style={s.cancelBtn} onPress={closeSheet}>
                  <Text style={s.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </KeyboardAvoidingView>
          </Animated.View>
        </>
      )}

      {/* ── ADD STREET MODAL ── */}
      <Modal visible={addModalOpen} animationType="slide" transparent statusBarTranslucent>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={s.modalBg}>
            <View style={[s.modal, { paddingBottom: insets.bottom + 16 }]}>
              <View style={s.sheetHandle} />
              <Text style={s.modalTitle}>Add Missing Street</Text>
              <Text style={s.modalSub}>This street will be added to your zone for tracking.</Text>
              <Text style={s.sheetFieldLabel}>STREET NAME</Text>
              <TextInput
                style={s.sheetInput}
                placeholder="Enter street name"
                placeholderTextColor="#333"
                value={newStreetName}
                onChangeText={setNewStreetName}
                autoCapitalize="words"
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
                selectionColor="#fff"
                autoFocus
              />
              <View style={[s.sheetBtns, { marginTop: 16 }]}>
                <TouchableOpacity
                  style={[s.doneBtn, (!newStreetName.trim() || addingSaving) && s.dim]}
                  onPress={handleAddStreet}
                  disabled={!newStreetName.trim() || addingSaving}
                >
                  {addingSaving ? <ActivityIndicator color="#000" /> : <Text style={s.doneBtnText}>Add Street</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={s.cancelBtn} onPress={() => setAddModalOpen(false)}>
                  <Text style={s.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* ── PIN LIST MODAL ── */}
      <Modal visible={pinListOpen} animationType="slide" transparent statusBarTranslucent>
        <View style={s.modalBg}>
          <View style={[s.modal, { paddingBottom: insets.bottom + 16, maxHeight: '75%' }]}>
            <View style={s.sheetHandle} />
            <View style={s.listHeader}>
              <Text style={s.modalTitle}>Photo Pins ({pins.length})</Text>
              <TouchableOpacity onPress={() => setPinListOpen(false)}>
                <Text style={s.listClose}>Done</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={[...pins].reverse()}
              keyExtractor={item => item.id}
              contentContainerStyle={{ paddingBottom: 8 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={s.pinRow}
                  onPress={() => { setPinListOpen(false); setViewPin(item); }}
                  activeOpacity={0.7}
                >
                  {item.photoUri
                    ? <Image source={{ uri: item.photoUri }} style={s.pinThumb} />
                    : <View style={s.pinThumbEmpty}><Text>📍</Text></View>
                  }
                  <View style={s.pinRowInfo}>
                    <Text style={s.pinRowAddr}>{item.address ?? 'Unknown street'}</Text>
                    <Text style={s.pinRowMeta}>
                      {item.workerName} · {new Date(item.placedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                  <Text style={s.pinArrow}>›</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* ── VIEW PIN MODAL ── */}
      <Modal visible={!!viewPin} animationType="slide" transparent statusBarTranslucent>
        <View style={s.modalBg}>
          <View style={[s.modal, { paddingBottom: insets.bottom + 16 }]}>
            <View style={s.sheetHandle} />
            <Text style={s.modalTitle}>{viewPin?.address ?? 'Unknown street'}</Text>
            <Text style={s.modalSub}>
              {viewPin?.workerName} · {viewPin && new Date(viewPin.placedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
            {viewPin?.photoUri
              ? <Image source={{ uri: viewPin.photoUri }} style={s.pinPhoto} resizeMode="cover" />
              : <View style={s.pinNoPhoto}><Text style={s.noPhotoText}>No photo</Text></View>
            }
            <View style={s.sheetBtns}>
              <TouchableOpacity style={s.unmarkBtn} onPress={() => viewPin && handleDeletePin(viewPin)}>
                <Text style={s.unmarkBtnText}>Remove</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.doneBtn} onPress={() => setViewPin(null)}>
                <Text style={s.doneBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },
  emptyMap: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  emptySub: { fontSize: 13, color: '#444', marginTop: 4 },

  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30,
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingBottom: 10,
  },
  topLeft: { flex: 1, marginRight: 8 },
  topName: { fontSize: 15, fontWeight: '800', color: '#fff', textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  topZone: { fontSize: 11, color: '#aaa', marginTop: 1, textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: { backgroundColor: 'rgba(0,0,0,0.8)', borderRadius: 20, width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#222' },
  iconBtnText: { fontSize: 16 },
  zoneChip: { backgroundColor: 'rgba(0,0,0,0.8)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: '#222' },
  zoneChipActive: { backgroundColor: '#fff', borderColor: '#fff' },
  zoneChipText: { fontSize: 11, color: '#666', fontWeight: '600' },
  zoneChipTextActive: { color: '#000' },
  exitBtn: { backgroundColor: 'rgba(239,68,68,0.12)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)' },
  exitText: { color: '#EF4444', fontSize: 12, fontWeight: '700' },

  shiftBar: {
    position: 'absolute', left: 14, right: 14, zIndex: 25,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.88)', borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: '#1a1a1a',
  },
  shiftLeft: { flexDirection: 'row', alignItems: 'center' },
  shiftDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#4ADE80', marginRight: 8 },
  shiftTime: { fontSize: 16, fontWeight: '800', color: '#fff' },
  shiftCenter: { flex: 1, paddingHorizontal: 12 },
  progressText: { fontSize: 11, color: '#888', marginBottom: 4 },
  progressTrack: { height: 2, backgroundColor: '#222', borderRadius: 1 },
  progressFill: { height: 2, backgroundColor: '#3B82F6', borderRadius: 1 },
  clockOutBtn: { backgroundColor: 'rgba(239,68,68,0.12)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)' },
  clockOutText: { color: '#EF4444', fontSize: 12, fontWeight: '700' },
  startShiftBtn: { flex: 1, alignItems: 'center' },
  startShiftText: { color: '#3B82F6', fontSize: 15, fontWeight: '700' },

  streetLabel: {
    position: 'absolute', left: 14, right: 14, zIndex: 20,
    backgroundColor: 'rgba(0,0,0,0.8)', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: '#1a1a1a',
  },
  streetLabelText: { fontSize: 13, color: '#888', fontWeight: '500' },

  bottomRow: {
    position: 'absolute', left: 14, right: 14, zIndex: 20,
    flexDirection: 'row', gap: 10, alignItems: 'center',
  },
  addStreetBtn: {
    backgroundColor: 'rgba(0,0,0,0.88)', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 11,
    borderWidth: 1, borderColor: '#222',
  },
  addStreetText: { color: '#3B82F6', fontSize: 12, fontWeight: '700' },
  dropPinBtn: {
    flex: 1, backgroundColor: '#fff', borderRadius: 24,
    paddingVertical: 13, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 6,
  },
  dropPinDim: { opacity: 0.4 },
  dropPinText: { fontSize: 15, fontWeight: '800', color: '#000' },

  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 40,
    backgroundColor: '#111', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, borderTopWidth: 1, borderColor: '#1a1a1a',
  },
  sheetHandle: { width: 32, height: 3, backgroundColor: '#333', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sheetHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 },
  sheetStreetName: { fontSize: 20, fontWeight: '800', color: '#fff', flex: 1, marginRight: 8 },
  doneBadge: { backgroundColor: 'rgba(74,222,128,0.12)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: 'rgba(74,222,128,0.3)' },
  doneBadgeText: { color: '#4ADE80', fontSize: 12, fontWeight: '700' },
  sheetField: { marginBottom: 12 },
  sheetFieldLabel: { fontSize: 10, fontWeight: '800', color: '#444', letterSpacing: 1.2, marginBottom: 6 },
  sheetInput: { backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#222', borderRadius: 10, padding: 12, fontSize: 15, color: '#fff' },
  sheetBtns: { flexDirection: 'row', gap: 10, marginTop: 4 },
  doneBtn: { flex: 2, backgroundColor: '#fff', borderRadius: 12, padding: 14, alignItems: 'center' },
  doneBtnText: { color: '#000', fontWeight: '800', fontSize: 14 },
  unmarkBtn: { flex: 1, borderWidth: 1, borderColor: '#EF4444', borderRadius: 12, padding: 14, alignItems: 'center' },
  unmarkBtnText: { color: '#EF4444', fontWeight: '700', fontSize: 13 },
  cancelBtn: { flex: 1, borderWidth: 1, borderColor: '#222', borderRadius: 12, padding: 14, alignItems: 'center' },
  cancelBtnText: { color: '#555', fontWeight: '600', fontSize: 14 },
  dim: { opacity: 0.4 },

  modalBg: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.7)' },
  modal: { backgroundColor: '#111', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, borderTopWidth: 1, borderColor: '#1a1a1a' },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#fff', marginBottom: 4 },
  modalSub: { fontSize: 13, color: '#555', marginBottom: 16 },
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  listClose: { color: '#3B82F6', fontSize: 15, fontWeight: '600' },
  pinRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1a1a1a', gap: 12 },
  pinThumb: { width: 48, height: 48, borderRadius: 10 },
  pinThumbEmpty: { width: 48, height: 48, borderRadius: 10, backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center' },
  pinRowInfo: { flex: 1 },
  pinRowAddr: { fontSize: 14, fontWeight: '600', color: '#fff' },
  pinRowMeta: { fontSize: 12, color: '#555', marginTop: 2 },
  pinArrow: { fontSize: 20, color: '#333' },
  pinPhoto: { width: '100%', height: 220, borderRadius: 14, marginBottom: 16 },
  pinNoPhoto: { height: 80, backgroundColor: '#1a1a1a', borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  noPhotoText: { color: '#333', fontSize: 13 },
});
