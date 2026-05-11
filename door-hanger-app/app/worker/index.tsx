import { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  ActivityIndicator, Modal, Image, Alert, StatusBar, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import {
  getCurrentWorker, getZones, getStreets, getYardSigns, saveYardSign, deleteYardSign,
  getActiveShift, startShift, endShift,
  clearCurrentWorker,
  Zone, Street, Worker, ShiftSession, YardSign,
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
  const [pins, setPins] = useState<YardSign[]>([]);
  const [mapType, setMapType] = useState<MapType>('dark');

  const [userLat, setUserLat] = useState<number | undefined>();
  const [userLng, setUserLng] = useState<number | undefined>();
  const [currentStreet, setCurrentStreet] = useState<string | null>(null);
  const locationSub = useRef<Location.LocationSubscription | null>(null);

  const [activeShift, setActiveShift] = useState<ShiftSession | null>(null);
  const [shiftSeconds, setShiftSeconds] = useState(0);
  const shiftTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const [dropping, setDropping] = useState(false);
  const [viewPin, setViewPin] = useState<YardSign | null>(null);
  const [listOpen, setListOpen] = useState(false);

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
    if (z.length > 0) await selectZone(z[0], w);
  }

  async function selectZone(zone: Zone, w?: Worker) {
    setSelectedZone(zone);
    const [s, p] = await Promise.all([getStreets(zone.id), getYardSigns(zone.id)]);
    setStreets(s);
    setPins(p);
    startTracking(w ?? worker!);
  }

  async function startTracking(_w: Worker) {
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

  // ── Drop pin ─────────────────────────────────────────
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
        Alert.alert('Camera permission needed', 'Please allow camera access in your device Settings to drop pins.');
        setDropping(false);
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
      });
      if (result.canceled) { setDropping(false); return; }

      const photoUri = result.assets[0].uri;
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
        photoUri,
        address: currentStreet ?? undefined,
      };

      await saveYardSign(pin);
      setPins(await getYardSigns(selectedZone.id));
    } finally {
      setDropping(false);
    }
  }

  async function handleDeletePin(pin: YardSign) {
    Alert.alert('Remove Pin', 'Remove this door hanger pin?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          await deleteYardSign(pin.id);
          setPins(await getYardSigns(selectedZone!.id));
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

  const shiftPins = activeShift ? pins.filter(p => p.shiftId === activeShift.id) : [];
  const totalPins = pins.length;

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
          completions={[]}
          yardSigns={pins}
          userLat={userLat}
          userLng={userLng}
          mapType={mapType}
          placingSign={false}
          onStreetPress={() => {}}
          onMapPress={() => {}}
          onYardSignPress={setViewPin}
        />
      ) : (
        <View style={s.emptyMap}>
          <Text style={s.emptyIcon}>🗺️</Text>
          <Text style={s.emptyTitle}>No zones assigned</Text>
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
                <Text style={s.shiftLabel}>  on shift</Text>
              </View>
              <View style={s.shiftRight}>
                <Text style={s.pinCount}>🚪 {shiftPins.length}</Text>
                <TouchableOpacity style={s.clockOutBtn} onPress={handleEndShift}>
                  <Text style={s.clockOutText}>Clock Out</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <TouchableOpacity style={s.startShiftBtn} onPress={handleStartShift}>
              <Text style={s.startShiftText}>⏱  Start Shift to Begin</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Current street label */}
      {currentStreet && (
        <View style={[s.streetLabel, { bottom: 120 + insets.bottom }]}>
          <Text style={s.streetLabelText} numberOfLines={1}>📍 {currentStreet}</Text>
        </View>
      )}

      {/* ── DROP PIN BUTTON ── */}
      {selectedZone && (
        <TouchableOpacity
          style={[s.dropBtn, { bottom: 32 + insets.bottom }, (!activeShift || dropping) && s.dropBtnDim]}
          onPress={handleDropPin}
          disabled={dropping || !activeShift}
          activeOpacity={0.85}
        >
          {dropping
            ? <ActivityIndicator color="#000" />
            : <>
                <Text style={s.dropBtnIcon}>📷</Text>
                <Text style={s.dropBtnText}>Drop Pin</Text>
              </>
          }
        </TouchableOpacity>
      )}

      {/* Pin count / list toggle */}
      {selectedZone && totalPins > 0 && (
        <TouchableOpacity
          style={[s.pinListBtn, { bottom: 32 + insets.bottom }]}
          onPress={() => setListOpen(true)}
        >
          <Text style={s.pinListCount}>{totalPins}</Text>
          <Text style={s.pinListLabel}>pins</Text>
        </TouchableOpacity>
      )}

      {/* ── PIN LIST MODAL ── */}
      <Modal visible={listOpen} animationType="slide" transparent statusBarTranslucent>
        <View style={s.listModalBg}>
          <View style={[s.listModal, { paddingBottom: insets.bottom + 16 }]}>
            <View style={s.listModalHandle} />
            <View style={s.listModalHeader}>
              <Text style={s.listModalTitle}>All Pins ({totalPins})</Text>
              <TouchableOpacity onPress={() => setListOpen(false)}>
                <Text style={s.listModalClose}>Done</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={[...pins].reverse()}
              keyExtractor={item => item.id}
              contentContainerStyle={{ paddingBottom: 16 }}
              renderItem={({ item }) => (
                <TouchableOpacity style={s.pinRow} onPress={() => { setListOpen(false); setViewPin(item); }} activeOpacity={0.7}>
                  {item.photoUri
                    ? <Image source={{ uri: item.photoUri }} style={s.pinThumb} />
                    : <View style={s.pinThumbEmpty}><Text>📍</Text></View>
                  }
                  <View style={s.pinRowInfo}>
                    <Text style={s.pinRowAddress}>{item.address ?? 'Unknown street'}</Text>
                    <Text style={s.pinRowMeta}>
                      {item.workerName} · {new Date(item.placedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                  <Text style={s.pinRowArrow}>›</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* ── VIEW PIN MODAL ── */}
      <Modal visible={!!viewPin} animationType="slide" transparent statusBarTranslucent>
        <View style={s.pinModalBg}>
          <View style={[s.pinModal, { paddingBottom: insets.bottom + 16 }]}>
            <View style={s.listModalHandle} />
            <Text style={s.pinModalStreet}>{viewPin?.address ?? 'Unknown street'}</Text>
            <Text style={s.pinModalMeta}>
              {viewPin?.workerName} · {viewPin && new Date(viewPin.placedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>

            {viewPin?.photoUri
              ? <Image source={{ uri: viewPin.photoUri }} style={s.pinModalPhoto} resizeMode="cover" />
              : <View style={s.pinModalNoPhoto}><Text style={s.noPhotoText}>No photo</Text></View>
            }

            <View style={s.pinModalBtns}>
              <TouchableOpacity style={s.removeBtn} onPress={() => viewPin && handleDeletePin(viewPin)}>
                <Text style={s.removeBtnText}>Remove Pin</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.closeBtn} onPress={() => setViewPin(null)}>
                <Text style={s.closeBtnText}>Close</Text>
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

  // TOP BAR
  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30,
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingBottom: 10,
  },
  topLeft: { flex: 1, marginRight: 8 },
  topName: { fontSize: 15, fontWeight: '800', color: '#fff', textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  topZone: { fontSize: 11, color: '#888', marginTop: 1 },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: { backgroundColor: 'rgba(0,0,0,0.8)', borderRadius: 20, width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#222' },
  iconBtnText: { fontSize: 16 },
  zoneChip: { backgroundColor: 'rgba(0,0,0,0.8)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: '#222' },
  zoneChipActive: { backgroundColor: '#fff', borderColor: '#fff' },
  zoneChipText: { fontSize: 11, color: '#666', fontWeight: '600' },
  zoneChipTextActive: { color: '#000' },
  exitBtn: { backgroundColor: 'rgba(239,68,68,0.12)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)' },
  exitText: { color: '#EF4444', fontSize: 12, fontWeight: '700' },

  // SHIFT BAR
  shiftBar: {
    position: 'absolute', left: 14, right: 14, zIndex: 25,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.88)', borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 10,
    borderWidth: 1, borderColor: '#1a1a1a',
  },
  shiftLeft: { flexDirection: 'row', alignItems: 'center' },
  shiftDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#4ADE80', marginRight: 8 },
  shiftTime: { fontSize: 18, fontWeight: '800', color: '#fff' },
  shiftLabel: { fontSize: 12, color: '#555' },
  shiftRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pinCount: { fontSize: 16, fontWeight: '700', color: '#fff' },
  clockOutBtn: { backgroundColor: 'rgba(239,68,68,0.12)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)' },
  clockOutText: { color: '#EF4444', fontSize: 12, fontWeight: '700' },
  startShiftBtn: { flex: 1, alignItems: 'center' },
  startShiftText: { color: '#3B82F6', fontSize: 15, fontWeight: '700' },

  // STREET LABEL
  streetLabel: {
    position: 'absolute', left: 14, right: 80, zIndex: 20,
    backgroundColor: 'rgba(0,0,0,0.8)', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: '#1a1a1a',
  },
  streetLabelText: { fontSize: 13, color: '#888', fontWeight: '500' },

  // DROP PIN BUTTON
  dropBtn: {
    position: 'absolute', left: '50%', zIndex: 30,
    transform: [{ translateX: -70 }],
    width: 140, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: '#fff', borderRadius: 30,
    paddingVertical: 14, paddingHorizontal: 24,
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  dropBtnDim: { opacity: 0.4 },
  dropBtnIcon: { fontSize: 20 },
  dropBtnText: { fontSize: 16, fontWeight: '800', color: '#000' },

  // PIN COUNT BUTTON
  pinListBtn: {
    position: 'absolute', right: 14, zIndex: 30,
    backgroundColor: 'rgba(0,0,0,0.88)', borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 10,
    alignItems: 'center', borderWidth: 1, borderColor: '#222',
  },
  pinListCount: { fontSize: 20, fontWeight: '800', color: '#fff' },
  pinListLabel: { fontSize: 10, color: '#555', fontWeight: '600' },

  // PIN LIST MODAL
  listModalBg: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.7)' },
  listModal: { backgroundColor: '#111', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '70%', borderTopWidth: 1, borderColor: '#1a1a1a' },
  listModalHandle: { width: 32, height: 3, backgroundColor: '#333', borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 14 },
  listModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 8 },
  listModalTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
  listModalClose: { color: '#3B82F6', fontSize: 15, fontWeight: '600' },
  pinRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1a1a1a', gap: 12 },
  pinThumb: { width: 48, height: 48, borderRadius: 10 },
  pinThumbEmpty: { width: 48, height: 48, borderRadius: 10, backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center' },
  pinRowInfo: { flex: 1 },
  pinRowAddress: { fontSize: 14, fontWeight: '600', color: '#fff' },
  pinRowMeta: { fontSize: 12, color: '#555', marginTop: 2 },
  pinRowArrow: { fontSize: 20, color: '#333' },

  // VIEW PIN MODAL
  pinModalBg: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.8)' },
  pinModal: { backgroundColor: '#111', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, borderTopWidth: 1, borderColor: '#1a1a1a' },
  pinModalStreet: { fontSize: 18, fontWeight: '700', color: '#fff', marginBottom: 4 },
  pinModalMeta: { fontSize: 13, color: '#555', marginBottom: 16 },
  pinModalPhoto: { width: '100%', height: 220, borderRadius: 14, marginBottom: 16 },
  pinModalNoPhoto: { height: 80, backgroundColor: '#1a1a1a', borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  noPhotoText: { color: '#333', fontSize: 13 },
  pinModalBtns: { flexDirection: 'row', gap: 10 },
  removeBtn: { flex: 1, borderWidth: 1, borderColor: '#EF4444', borderRadius: 12, padding: 14, alignItems: 'center' },
  removeBtnText: { color: '#EF4444', fontWeight: '700', fontSize: 14 },
  closeBtn: { flex: 2, backgroundColor: '#fff', borderRadius: 12, padding: 14, alignItems: 'center' },
  closeBtnText: { color: '#000', fontWeight: '800', fontSize: 14 },
});
