import { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  ActivityIndicator, Animated, Modal, TextInput,
  KeyboardAvoidingView, Platform, StatusBar, Image, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import {
  getCurrentWorker, getZones, getStreets, getCompletions,
  markStreetComplete, unmarkStreetComplete, updateCompletion, clearCurrentWorker,
  getActiveShift, startShift, endShift,
  getYardSigns, saveYardSign, deleteYardSign,
  Zone, Street, Completion, Worker, ShiftSession, YardSign,
} from '../../lib/storage';
import { reverseGeocodeStreet } from '../../lib/overpass';
import StreetMap from '../../components/StreetMap';

type MapMode = 'navigate' | 'placeSign';
type MapType = 'dark' | 'satellite';
type SheetTab = 'streets' | 'signs';

export default function WorkerScreen() {
  const insets = useSafeAreaInsets();

  // Core state
  const [worker, setWorker] = useState<Worker | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [selectedZone, setSelectedZone] = useState<Zone | null>(null);
  const [streets, setStreets] = useState<Street[]>([]);
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [yardSigns, setYardSigns] = useState<YardSign[]>([]);

  // Location
  const [currentStreet, setCurrentStreet] = useState<string | null>(null);
  const [userLat, setUserLat] = useState<number | undefined>();
  const [userLng, setUserLng] = useState<number | undefined>();
  const locationSub = useRef<Location.LocationSubscription | null>(null);

  // Map UI
  const [mapType, setMapType] = useState<MapType>('dark');
  const [mapMode, setMapMode] = useState<MapMode>('navigate');

  // Shift
  const [activeShift, setActiveShift] = useState<ShiftSession | null>(null);
  const [shiftSeconds, setShiftSeconds] = useState(0);
  const shiftTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Sheet
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetTab, setSheetTab] = useState<SheetTab>('streets');
  const sheetAnim = useRef(new Animated.Value(0)).current;

  // Modals
  const [completeModal, setCompleteModal] = useState<Street | null>(null);
  const [editModal, setEditModal] = useState<{ street: Street; comp: Completion } | null>(null);
  const [signModal, setSignModal] = useState<{ lat: number; lng: number } | null>(null);
  const [viewSignModal, setViewSignModal] = useState<YardSign | null>(null);
  const [hangerCount, setHangerCount] = useState('');
  const [noteText, setNoteText] = useState('');
  const [signPhoto, setSignPhoto] = useState<string | null>(null);

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
    const [s, c, signs] = await Promise.all([
      getStreets(zone.id),
      getCompletions(zone.id),
      getYardSigns(zone.id),
    ]);
    setStreets(s);
    setCompletions(c);
    setYardSigns(signs);
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

  // ── Shift ────────────────────────────────────────────
  function startShiftTimer(shift: ShiftSession) {
    if (shiftTimer.current) clearInterval(shiftTimer.current);
    const tick = () => {
      const elapsed = Math.floor((Date.now() - new Date(shift.startTime).getTime()) / 1000);
      setShiftSeconds(elapsed);
    };
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
    Alert.alert('End Shift', 'Are you sure you want to clock out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End Shift', style: 'destructive', onPress: async () => {
          if (shiftTimer.current) clearInterval(shiftTimer.current);
          const lat = userLat ?? selectedZone?.centerLat ?? 0;
          const lng = userLng ?? selectedZone?.centerLng ?? 0;
          await endShift(lat, lng);
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

  // ── Street completion ────────────────────────────────
  function handleStreetPress(street: Street) {
    if (!worker) return;
    const comp = completions.find(c => c.streetId === street.id);
    if (comp) {
      setNoteText(comp.note ?? '');
      setHangerCount(comp.hangerCount != null ? String(comp.hangerCount) : '');
      setEditModal({ street, comp });
    } else {
      setHangerCount('');
      setNoteText('');
      setCompleteModal(street);
    }
  }

  async function handleConfirmComplete() {
    if (!worker || !completeModal || !selectedZone) return;
    const count = hangerCount.trim() ? parseInt(hangerCount) : undefined;
    await markStreetComplete(completeModal.id, worker, count, noteText);
    setCompletions(await getCompletions(selectedZone.id));
    setCompleteModal(null);
  }

  async function handleSaveEdit() {
    if (!editModal || !selectedZone) return;
    const count = hangerCount.trim() ? parseInt(hangerCount) : undefined;
    await updateCompletion(editModal.street.id, {
      note: noteText.trim() || undefined,
      hangerCount: count,
    });
    setCompletions(await getCompletions(selectedZone.id));
    setEditModal(null);
  }

  async function handleUnmark() {
    if (!editModal || !selectedZone) return;
    await unmarkStreetComplete(editModal.street.id);
    setCompletions(await getCompletions(selectedZone.id));
    setEditModal(null);
  }

  // ── Yard signs ───────────────────────────────────────
  function handleMapPress(lat: number, lng: number) {
    if (mapMode !== 'placeSign') return;
    setSignPhoto(null);
    setSignModal({ lat, lng });
    setMapMode('navigate');
  }

  async function pickSignPhoto() {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      setSignPhoto(result.assets[0].uri);
    }
  }

  async function pickSignPhotoFromLibrary() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      setSignPhoto(result.assets[0].uri);
    }
  }

  async function handleSaveSign() {
    if (!signModal || !worker || !selectedZone) return;
    const sign: YardSign = {
      id: `sign-${Date.now()}`,
      workerId: worker.id,
      workerName: worker.name,
      zoneId: selectedZone.id,
      lat: signModal.lat,
      lng: signModal.lng,
      placedAt: new Date().toISOString(),
      photoUri: signPhoto ?? undefined,
    };
    await saveYardSign(sign);
    setYardSigns(await getYardSigns(selectedZone.id));
    setSignModal(null);
    setSignPhoto(null);
  }

  async function handleDeleteSign(sign: YardSign) {
    Alert.alert('Remove Sign', 'Remove this yard sign pin?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          await deleteYardSign(sign.id);
          setYardSigns(await getYardSigns(selectedZone!.id));
          setViewSignModal(null);
        },
      },
    ]);
  }

  // ── Sheet ────────────────────────────────────────────
  function toggleSheet() {
    const toValue = sheetOpen ? 0 : 1;
    setSheetOpen(!sheetOpen);
    Animated.spring(sheetAnim, { toValue, useNativeDriver: false, tension: 80, friction: 13 }).start();
  }

  async function handleLogout() {
    locationSub.current?.remove();
    if (shiftTimer.current) clearInterval(shiftTimer.current);
    await clearCurrentWorker();
    router.replace('/');
  }

  const isComplete = (s: Street) => completions.some(c => c.streetId === s.id);
  const currentStreetObj = streets.find(s => currentStreet && s.name.toLowerCase() === currentStreet.toLowerCase());
  const done = streets.filter(s => isComplete(s));
  const pending = streets.filter(s => !isComplete(s));
  const pct = streets.length > 0 ? Math.round((done.length / streets.length) * 100) : 0;
  const totalHangers = completions.reduce((a, c) => a + (c.hangerCount ?? 0), 0);

  const SHEET_HEIGHT = 340;

  if (!worker) {
    return <View style={styles.loading}><ActivityIndicator size="large" color="#3B82F6" /></View>;
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
          yardSigns={yardSigns}
          userLat={userLat}
          userLng={userLng}
          mapType={mapType}
          placingSign={mapMode === 'placeSign'}
          onStreetPress={handleStreetPress}
          onMapPress={handleMapPress}
          onYardSignPress={setViewSignModal}
        />
      ) : (
        <View style={styles.emptyMap}>
          <Text style={styles.emptyIcon}>🗺️</Text>
          <Text style={styles.emptyTitle}>No zones assigned</Text>
          <Text style={styles.emptySub}>Ask your manager to create a zone.</Text>
        </View>
      )}

      {/* ── TOP BAR ── */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <View style={styles.topLeft}>
          <Text style={styles.topName}>{worker.name}</Text>
          {selectedZone && <Text style={styles.topZone} numberOfLines={1}>{selectedZone.name}</Text>}
        </View>
        <View style={styles.topRight}>
          {selectedZone && (
            <TouchableOpacity style={styles.iconBtn} onPress={() => setMapType(t => t === 'dark' ? 'satellite' : 'dark')}>
              <Text style={styles.iconBtnText}>{mapType === 'dark' ? '🛰' : '🗺'}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.exitBtn} onPress={handleLogout}>
            <Text style={styles.exitText}>Exit</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── SHIFT TIMER BAR ── */}
      {selectedZone && (
        <View style={[styles.shiftBar, { top: insets.top + 60 }]}>
          {activeShift ? (
            <>
              <View style={styles.shiftActive}>
                <View style={styles.shiftDot} />
                <Text style={styles.shiftTime}>{formatTime(shiftSeconds)}</Text>
                <Text style={styles.shiftLabel}> on shift</Text>
              </View>
              <TouchableOpacity style={styles.shiftEndBtn} onPress={handleEndShift}>
                <Text style={styles.shiftEndText}>Clock Out</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity style={styles.shiftStartBtn} onPress={handleStartShift}>
              <Text style={styles.shiftStartText}>⏱ Start Shift</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Zone tabs */}
      {zones.length > 1 && (
        <View style={[styles.zoneTabsWrap, { top: insets.top + 100 }]}>
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

      {/* Current street pill */}
      {currentStreetObj && selectedZone && (
        <TouchableOpacity
          style={[styles.currentPill, isComplete(currentStreetObj) ? styles.pillDone : styles.pillActive]}
          onPress={() => handleStreetPress(currentStreetObj)}
          activeOpacity={0.85}
        >
          <View style={[styles.pillDot, isComplete(currentStreetObj) && styles.pillDotDone]} />
          <View style={styles.pillMid}>
            <Text style={styles.pillLabel}>YOU ARE ON</Text>
            <Text style={styles.pillStreet} numberOfLines={1}>{currentStreetObj.name}</Text>
          </View>
          {isComplete(currentStreetObj)
            ? <View style={styles.doneBadge}><Text style={styles.doneBadgeText}>✓ Done</Text></View>
            : <View style={styles.tapBadge}><Text style={styles.tapBadgeText}>Mark ✓</Text></View>
          }
        </TouchableOpacity>
      )}

      {/* Place sign FAB */}
      {selectedZone && (
        <TouchableOpacity
          style={[styles.fab, mapMode === 'placeSign' && styles.fabActive]}
          onPress={() => setMapMode(m => m === 'placeSign' ? 'navigate' : 'placeSign')}
          activeOpacity={0.85}
        >
          <Text style={styles.fabIcon}>🪧</Text>
          <Text style={styles.fabLabel}>{mapMode === 'placeSign' ? 'Cancel' : 'Sign'}</Text>
        </TouchableOpacity>
      )}

      {/* ── BOTTOM SHEET ── */}
      {selectedZone && (
        <View style={[styles.sheet, { paddingBottom: insets.bottom }]}>
          <TouchableOpacity style={styles.sheetHandle} onPress={toggleSheet} activeOpacity={0.9}>
            <View style={styles.handleBar} />
            <View style={styles.progressRow}>
              <View style={styles.progressLeft}>
                <Text style={styles.progressDone}>{done.length}</Text>
                <Text style={styles.progressOf}>/{streets.length}</Text>
                <Text style={styles.progressLabel}> streets</Text>
                {totalHangers > 0 && (
                  <Text style={styles.hangerStat}>  ·  🚪 {totalHangers} hangers</Text>
                )}
              </View>
              <View style={styles.progressRight}>
                <Text style={styles.pctText}>{pct}%</Text>
                <Text style={styles.chevron}>{sheetOpen ? ' ▼' : ' ▲'}</Text>
              </View>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${pct}%` as any }]} />
            </View>
          </TouchableOpacity>

          <Animated.View style={[styles.sheetContent, {
            maxHeight: sheetAnim.interpolate({ inputRange: [0, 1], outputRange: [0, SHEET_HEIGHT] }),
          }]}>
            {/* Tabs */}
            <View style={styles.tabs}>
              <TouchableOpacity style={[styles.tab, sheetTab === 'streets' && styles.tabActive]} onPress={() => setSheetTab('streets')}>
                <Text style={[styles.tabText, sheetTab === 'streets' && styles.tabTextActive]}>Streets ({streets.length})</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.tab, sheetTab === 'signs' && styles.tabActive]} onPress={() => setSheetTab('signs')}>
                <Text style={[styles.tabText, sheetTab === 'signs' && styles.tabTextActive]}>🪧 Signs ({yardSigns.length})</Text>
              </TouchableOpacity>
            </View>

            {sheetTab === 'streets' ? (
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
                      style={[styles.streetRow, complete && styles.streetRowDone, isCurrent && styles.streetRowCurrent]}
                      onPress={() => handleStreetPress(item)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.streetLeft}>
                        <Text style={[styles.streetName, complete && styles.streetNameDone]} numberOfLines={1}>
                          {isCurrent ? '📍 ' : ''}{item.name}
                        </Text>
                        <View style={styles.streetMeta}>
                          {comp?.hangerCount != null && (
                            <Text style={styles.metaChip}>🚪 {comp.hangerCount}</Text>
                          )}
                          {comp?.note && (
                            <Text style={styles.metaNote} numberOfLines={1}>💬 {comp.note}</Text>
                          )}
                          {complete && !comp?.note && !comp?.hangerCount && (
                            <Text style={styles.tapEdit}>tap to edit</Text>
                          )}
                        </View>
                      </View>
                      <View style={[styles.streetBadge, complete ? styles.badgeDone : styles.badgePending]}>
                        <Text style={[styles.badgeText, complete ? styles.badgeTextDone : styles.badgeTextPending]}>
                          {complete ? '✓' : '○'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                }}
              />
            ) : (
              <FlatList
                data={yardSigns}
                keyExtractor={item => item.id}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={
                  <View style={styles.signsEmpty}>
                    <Text style={styles.signsEmptyText}>No yard signs placed yet.</Text>
                    <Text style={styles.signsEmptyHint}>Tap 🪧 Sign on the map to place one.</Text>
                  </View>
                }
                renderItem={({ item }) => (
                  <TouchableOpacity style={styles.signRow} onPress={() => setViewSignModal(item)} activeOpacity={0.7}>
                    {item.photoUri ? (
                      <Image source={{ uri: item.photoUri }} style={styles.signThumb} />
                    ) : (
                      <View style={styles.signThumbEmpty}><Text>🪧</Text></View>
                    )}
                    <View style={styles.signInfo}>
                      <Text style={styles.signWorker}>{item.workerName}</Text>
                      <Text style={styles.signTime}>
                        {new Date(item.placedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                    <Text style={styles.signArrow}>›</Text>
                  </TouchableOpacity>
                )}
              />
            )}
          </Animated.View>
        </View>
      )}

      {/* ── MARK DONE MODAL ── */}
      <Modal visible={!!completeModal} transparent animationType="slide" statusBarTranslucent>
        <KeyboardAvoidingView style={styles.modalBg} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.modalCard, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{completeModal?.name}</Text>
            <Text style={styles.modalSub}>Mark this street as complete</Text>

            <Text style={styles.fieldLabel}>DOOR HANGERS PLACED</Text>
            <TextInput
              style={styles.fieldInput}
              placeholder="0"
              placeholderTextColor="#475569"
              value={hangerCount}
              onChangeText={setHangerCount}
              keyboardType="number-pad"
              selectionColor="#3B82F6"
            />

            <Text style={styles.fieldLabel}>NOTE (OPTIONAL)</Text>
            <TextInput
              style={[styles.fieldInput, styles.fieldMulti]}
              placeholder="e.g. skipped gated houses..."
              placeholderTextColor="#475569"
              value={noteText}
              onChangeText={setNoteText}
              multiline
              selectionColor="#3B82F6"
            />

            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setCompleteModal(null)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={handleConfirmComplete}>
                <Text style={styles.confirmText}>✓ Mark Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── EDIT DONE STREET MODAL ── */}
      <Modal visible={!!editModal} transparent animationType="slide" statusBarTranslucent>
        <KeyboardAvoidingView style={styles.modalBg} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.modalCard, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{editModal?.street.name}</Text>
            <Text style={styles.modalSub}>Edit details for this street</Text>

            <Text style={styles.fieldLabel}>DOOR HANGERS PLACED</Text>
            <TextInput
              style={styles.fieldInput}
              placeholder="0"
              placeholderTextColor="#475569"
              value={hangerCount}
              onChangeText={setHangerCount}
              keyboardType="number-pad"
              selectionColor="#3B82F6"
            />

            <Text style={styles.fieldLabel}>NOTE</Text>
            <TextInput
              style={[styles.fieldInput, styles.fieldMulti]}
              placeholder="Add a note..."
              placeholderTextColor="#475569"
              value={noteText}
              onChangeText={setNoteText}
              multiline
              selectionColor="#3B82F6"
            />

            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.unmarkBtn} onPress={handleUnmark}>
                <Text style={styles.unmarkText}>Unmark</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={handleSaveEdit}>
                <Text style={styles.confirmText}>Save</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.cancelRow} onPress={() => setEditModal(null)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── PLACE SIGN MODAL ── */}
      <Modal visible={!!signModal} transparent animationType="slide" statusBarTranslucent>
        <View style={styles.modalBg}>
          <View style={[styles.modalCard, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Place Yard Sign 🪧</Text>
            <Text style={styles.modalSub}>Attach a photo of the sign you placed</Text>

            <TouchableOpacity style={styles.photoBox} onPress={pickSignPhoto}>
              {signPhoto ? (
                <Image source={{ uri: signPhoto }} style={styles.photoPreview} resizeMode="cover" />
              ) : (
                <View style={styles.photoPlaceholder}>
                  <Text style={styles.photoIcon}>📷</Text>
                  <Text style={styles.photoHint}>Tap to take photo</Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.libraryBtn} onPress={pickSignPhotoFromLibrary}>
              <Text style={styles.libraryBtnText}>Choose from library</Text>
            </TouchableOpacity>

            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => { setSignModal(null); setSignPhoto(null); }}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={handleSaveSign}>
                <Text style={styles.confirmText}>Save Sign</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── VIEW SIGN MODAL ── */}
      <Modal visible={!!viewSignModal} transparent animationType="slide" statusBarTranslucent>
        <View style={styles.modalBg}>
          <View style={[styles.modalCard, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Yard Sign 🪧</Text>
            <Text style={styles.modalSub}>
              Placed by {viewSignModal?.workerName} at{' '}
              {viewSignModal && new Date(viewSignModal.placedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>

            {viewSignModal?.photoUri ? (
              <Image source={{ uri: viewSignModal.photoUri }} style={styles.signFullPhoto} resizeMode="cover" />
            ) : (
              <View style={styles.signNoPhoto}><Text style={styles.signNoPhotoText}>No photo attached</Text></View>
            )}

            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.unmarkBtn} onPress={() => viewSignModal && handleDeleteSign(viewSignModal)}>
                <Text style={styles.unmarkText}>Remove Pin</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={() => setViewSignModal(null)}>
                <Text style={styles.confirmText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },
  emptyMap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyIcon: { fontSize: 52, marginBottom: 12 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#F1F5F9' },
  emptySub: { fontSize: 14, color: '#475569', marginTop: 6 },

  // TOP BAR
  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30,
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingBottom: 10,
  },
  topLeft: { flex: 1, marginRight: 8 },
  topName: { fontSize: 16, fontWeight: '800', color: '#F1F5F9', textShadowColor: 'rgba(0,0,0,0.7)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  topZone: { fontSize: 12, color: '#94A3B8', marginTop: 1 },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: { backgroundColor: 'rgba(0,0,0,0.85)', borderRadius: 20, width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#222' },
  iconBtnText: { fontSize: 16 },
  exitBtn: { backgroundColor: 'rgba(239,68,68,0.15)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)' },
  exitText: { color: '#EF4444', fontSize: 12, fontWeight: '700' },

  // SHIFT BAR
  shiftBar: {
    position: 'absolute', left: 14, right: 14, zIndex: 25,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.9)', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 9,
    borderWidth: 1, borderColor: '#222',
  },
  shiftActive: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  shiftDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#4ADE80' },
  shiftTime: { fontSize: 16, fontWeight: '800', color: '#F1F5F9' },
  shiftLabel: { fontSize: 12, color: '#64748B' },
  shiftEndBtn: { backgroundColor: 'rgba(239,68,68,0.15)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)' },
  shiftEndText: { color: '#EF4444', fontSize: 12, fontWeight: '700' },
  shiftStartBtn: { flex: 1, alignItems: 'center' },
  shiftStartText: { color: '#60A5FA', fontSize: 14, fontWeight: '700' },

  // ZONE TABS
  zoneTabsWrap: { position: 'absolute', left: 14, right: 14, zIndex: 25, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  zoneTab: { backgroundColor: 'rgba(0,0,0,0.85)', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: '#222' },
  zoneTabActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  zoneTabText: { fontSize: 12, color: '#64748B', fontWeight: '600' },
  zoneTabTextActive: { color: '#fff' },

  // CURRENT PILL
  currentPill: { position: 'absolute', bottom: 130, left: 14, right: 60, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.92)', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#222', zIndex: 20, gap: 10 },
  pillActive: { borderColor: '#2563EB' },
  pillDone: { borderColor: '#16A34A' },
  pillDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#3B82F6' },
  pillDotDone: { backgroundColor: '#4ADE80' },
  pillMid: { flex: 1 },
  pillLabel: { fontSize: 9, fontWeight: '800', color: '#3B82F6', letterSpacing: 1.2 },
  pillStreet: { fontSize: 14, fontWeight: '700', color: '#F1F5F9', marginTop: 1 },
  doneBadge: { backgroundColor: '#14532D', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  doneBadgeText: { color: '#4ADE80', fontSize: 11, fontWeight: '700' },
  tapBadge: { backgroundColor: '#172554', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  tapBadgeText: { color: '#60A5FA', fontSize: 11, fontWeight: '700' },

  // FAB
  fab: { position: 'absolute', bottom: 130, right: 14, zIndex: 20, backgroundColor: 'rgba(0,0,0,0.92)', borderRadius: 14, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: '#222', minWidth: 52 },
  fabActive: { backgroundColor: '#1E3A5F', borderColor: '#2563EB' },
  fabIcon: { fontSize: 22 },
  fabLabel: { fontSize: 9, color: '#94A3B8', fontWeight: '700', marginTop: 2 },

  // BOTTOM SHEET
  sheet: { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20, backgroundColor: '#111', borderTopLeftRadius: 20, borderTopRightRadius: 20, borderTopWidth: 1, borderColor: '#222', overflow: 'hidden' },
  sheetHandle: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10 },
  handleBar: { width: 32, height: 3, backgroundColor: '#222', borderRadius: 2, alignSelf: 'center', marginBottom: 10 },
  progressRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 },
  progressLeft: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap' },
  progressDone: { fontSize: 22, fontWeight: '800', color: '#F1F5F9' },
  progressOf: { fontSize: 14, color: '#475569', fontWeight: '600' },
  progressLabel: { fontSize: 13, color: '#475569' },
  hangerStat: { fontSize: 12, color: '#64748B' },
  progressRight: { flexDirection: 'row', alignItems: 'center' },
  pctText: { fontSize: 16, fontWeight: '800', color: '#60A5FA' },
  chevron: { fontSize: 11, color: '#475569' },
  progressTrack: { height: 3, backgroundColor: '#000', borderRadius: 2 },
  progressFill: { height: 3, backgroundColor: '#3B82F6', borderRadius: 2 },

  sheetContent: { overflow: 'hidden' },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#000' },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#3B82F6' },
  tabText: { fontSize: 13, color: '#475569', fontWeight: '600' },
  tabTextActive: { color: '#60A5FA' },

  listContent: { paddingBottom: 8 },
  streetRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#000' },
  streetRowDone: { backgroundColor: 'rgba(10,26,14,0.2)' },
  streetRowCurrent: { backgroundColor: 'rgba(10,15,40,0.4)' },
  streetLeft: { flex: 1, marginRight: 10 },
  streetName: { fontSize: 14, fontWeight: '600', color: '#CBD5E1' },
  streetNameDone: { color: '#4ADE80' },
  streetMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' },
  metaChip: { fontSize: 11, color: '#64748B' },
  metaNote: { fontSize: 11, color: '#475569', flex: 1 },
  tapEdit: { fontSize: 11, color: '#222' },
  streetBadge: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  badgeDone: { backgroundColor: '#14532D' },
  badgePending: { backgroundColor: '#000' },
  badgeText: { fontSize: 13, fontWeight: '700' },
  badgeTextDone: { color: '#4ADE80' },
  badgeTextPending: { color: '#111' },

  signRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#000', gap: 12 },
  signThumb: { width: 44, height: 44, borderRadius: 8 },
  signThumbEmpty: { width: 44, height: 44, borderRadius: 8, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  signInfo: { flex: 1 },
  signWorker: { fontSize: 13, fontWeight: '600', color: '#CBD5E1' },
  signTime: { fontSize: 11, color: '#475569', marginTop: 2 },
  signArrow: { fontSize: 20, color: '#222' },
  signsEmpty: { padding: 32, alignItems: 'center' },
  signsEmptyText: { fontSize: 14, color: '#475569', fontWeight: '600' },
  signsEmptyHint: { fontSize: 12, color: '#222', marginTop: 4 },

  // MODALS
  modalBg: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.75)' },
  modalCard: { backgroundColor: '#111', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, borderTopWidth: 1, borderColor: '#222' },
  modalHandle: { width: 32, height: 3, backgroundColor: '#222', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#F1F5F9', marginBottom: 4 },
  modalSub: { fontSize: 13, color: '#475569', marginBottom: 18 },
  fieldLabel: { fontSize: 10, fontWeight: '800', color: '#475569', letterSpacing: 1, marginBottom: 6 },
  fieldInput: { backgroundColor: '#000', borderWidth: 1.5, borderColor: '#222', borderRadius: 10, padding: 13, fontSize: 15, color: '#F1F5F9', marginBottom: 14 },
  fieldMulti: { minHeight: 64, textAlignVertical: 'top' },
  modalBtns: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn: { flex: 1, borderWidth: 1.5, borderColor: '#222', borderRadius: 12, padding: 14, alignItems: 'center' },
  cancelText: { color: '#64748B', fontWeight: '600', fontSize: 14 },
  cancelRow: { alignItems: 'center', paddingTop: 12 },
  unmarkBtn: { flex: 1, borderWidth: 1.5, borderColor: '#EF4444', borderRadius: 12, padding: 14, alignItems: 'center' },
  unmarkText: { color: '#EF4444', fontWeight: '700', fontSize: 14 },
  confirmBtn: { flex: 2, backgroundColor: '#2563EB', borderRadius: 12, padding: 14, alignItems: 'center' },
  confirmText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  photoBox: { height: 160, borderRadius: 12, overflow: 'hidden', marginBottom: 10, borderWidth: 1.5, borderColor: '#222' },
  photoPreview: { width: '100%', height: '100%' },
  photoPlaceholder: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', gap: 8 },
  photoIcon: { fontSize: 36 },
  photoHint: { fontSize: 13, color: '#475569' },
  libraryBtn: { alignItems: 'center', paddingVertical: 10, marginBottom: 4 },
  libraryBtnText: { color: '#3B82F6', fontSize: 13, fontWeight: '600' },

  signFullPhoto: { width: '100%', height: 200, borderRadius: 12, marginBottom: 16 },
  signNoPhoto: { height: 80, backgroundColor: '#000', borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  signNoPhotoText: { color: '#222', fontSize: 13 },
});
