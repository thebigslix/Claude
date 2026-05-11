import AsyncStorage from '@react-native-async-storage/async-storage';

export type Worker = {
  id: string;
  name: string;
  pin: string;
  role: 'worker' | 'manager';
};

export type Zone = {
  id: string;
  name: string;
  centerLat: number;
  centerLng: number;
  radiusMeters: number;
  createdAt: string;
};

export type Street = {
  id: string;
  zoneId: string;
  name: string;
  osmId: string;
  geometry: [number, number][][]; // array of disconnected segments
};

export type Completion = {
  streetId: string;
  workerId: string;
  workerName: string;
  completedAt: string;
  note?: string;
  hangerCount?: number;
};

export type ShiftSession = {
  id: string;
  workerId: string;
  workerName: string;
  zoneId: string;
  zoneName: string;
  startTime: string;
  startLat: number;
  startLng: number;
  endTime?: string;
  endLat?: number;
  endLng?: number;
};

export type HangerPin = {
  id: string;
  workerId: string;
  workerName: string;
  zoneId: string;
  shiftId?: string;
  lat: number;
  lng: number;
  placedAt: string;
  photoUri?: string;
  address?: string;
};

// Keep YardSign as alias for backwards compat
export type YardSign = HangerPin;

const KEYS = {
  currentWorker: 'current_worker',
  workers: 'workers',
  zones: 'zones',
  streets: 'streets',
  completions: 'completions',
  shifts: 'shifts',
  yardSigns: 'yard_signs',
  activeShift: 'active_shift',
};

// ── Workers ──────────────────────────────────────────────
export async function saveCurrentWorker(worker: Worker) {
  await AsyncStorage.setItem(KEYS.currentWorker, JSON.stringify(worker));
}
export async function getCurrentWorker(): Promise<Worker | null> {
  const raw = await AsyncStorage.getItem(KEYS.currentWorker);
  return raw ? JSON.parse(raw) : null;
}
export async function clearCurrentWorker() {
  await AsyncStorage.removeItem(KEYS.currentWorker);
}
export async function getWorkers(): Promise<Worker[]> {
  const raw = await AsyncStorage.getItem(KEYS.workers);
  if (raw) return JSON.parse(raw);
  const defaults: Worker[] = [{ id: 'mgr-1', name: 'Manager', pin: '0000', role: 'manager' }];
  await AsyncStorage.setItem(KEYS.workers, JSON.stringify(defaults));
  return defaults;
}
export async function saveWorker(worker: Worker) {
  const workers = await getWorkers();
  const idx = workers.findIndex(w => w.id === worker.id);
  if (idx >= 0) workers[idx] = worker; else workers.push(worker);
  await AsyncStorage.setItem(KEYS.workers, JSON.stringify(workers));
}
export async function findWorkerByNameAndPin(name: string, pin: string): Promise<Worker | null> {
  const workers = await getWorkers();
  return workers.find(w => w.name.toLowerCase() === name.toLowerCase() && w.pin === pin) ?? null;
}

// ── Zones ────────────────────────────────────────────────
export async function getZones(): Promise<Zone[]> {
  const raw = await AsyncStorage.getItem(KEYS.zones);
  return raw ? JSON.parse(raw) : [];
}
export async function saveZone(zone: Zone) {
  const zones = await getZones();
  const idx = zones.findIndex(z => z.id === zone.id);
  if (idx >= 0) zones[idx] = zone; else zones.push(zone);
  await AsyncStorage.setItem(KEYS.zones, JSON.stringify(zones));
}
export async function deleteZone(zoneId: string) {
  const zones = await getZones();
  await AsyncStorage.setItem(KEYS.zones, JSON.stringify(zones.filter(z => z.id !== zoneId)));
}

// ── Streets ──────────────────────────────────────────────
export async function getStreets(zoneId?: string): Promise<Street[]> {
  const raw = await AsyncStorage.getItem(KEYS.streets);
  const streets: Street[] = raw ? JSON.parse(raw) : [];
  return zoneId ? streets.filter(s => s.zoneId === zoneId) : streets;
}
export async function saveStreets(streets: Street[]) {
  const existing = await getStreets();
  const zoneIds = new Set(streets.map(s => s.zoneId));
  const others = existing.filter(s => !zoneIds.has(s.zoneId));
  await AsyncStorage.setItem(KEYS.streets, JSON.stringify([...others, ...streets]));
}
export async function addStreet(street: Street) {
  const existing = await getStreets();
  existing.push(street);
  await AsyncStorage.setItem(KEYS.streets, JSON.stringify(existing));
}

// ── Completions ──────────────────────────────────────────
export async function getCompletions(zoneId?: string): Promise<Completion[]> {
  const raw = await AsyncStorage.getItem(KEYS.completions);
  const completions: Completion[] = raw ? JSON.parse(raw) : [];
  if (!zoneId) return completions;
  const streets = await getStreets(zoneId);
  const streetIds = new Set(streets.map(s => s.id));
  return completions.filter(c => streetIds.has(c.streetId));
}
export async function markStreetComplete(
  streetId: string, worker: Worker, hangerCount?: number, note?: string
) {
  const completions = await getCompletions();
  const existing = completions.findIndex(c => c.streetId === streetId);
  const entry: Completion = {
    streetId, workerId: worker.id, workerName: worker.name,
    completedAt: new Date().toISOString(),
    ...(hangerCount != null && { hangerCount }),
    ...(note?.trim() && { note: note.trim() }),
  };
  if (existing >= 0) completions[existing] = entry;
  else completions.push(entry);
  await AsyncStorage.setItem(KEYS.completions, JSON.stringify(completions));
}
export async function updateCompletion(streetId: string, updates: Partial<Completion>) {
  const completions = await getCompletions();
  const idx = completions.findIndex(c => c.streetId === streetId);
  if (idx >= 0) {
    completions[idx] = { ...completions[idx], ...updates };
    await AsyncStorage.setItem(KEYS.completions, JSON.stringify(completions));
  }
}
export async function unmarkStreetComplete(streetId: string) {
  const completions = await getCompletions();
  await AsyncStorage.setItem(KEYS.completions, JSON.stringify(completions.filter(c => c.streetId !== streetId)));
}

// ── Shifts ───────────────────────────────────────────────
export async function getShifts(workerId?: string): Promise<ShiftSession[]> {
  const raw = await AsyncStorage.getItem(KEYS.shifts);
  const shifts: ShiftSession[] = raw ? JSON.parse(raw) : [];
  return workerId ? shifts.filter(s => s.workerId === workerId) : shifts;
}
export async function getActiveShift(): Promise<ShiftSession | null> {
  const raw = await AsyncStorage.getItem(KEYS.activeShift);
  return raw ? JSON.parse(raw) : null;
}
export async function startShift(worker: Worker, zone: Zone, lat: number, lng: number): Promise<ShiftSession> {
  const shift: ShiftSession = {
    id: `shift-${Date.now()}`,
    workerId: worker.id,
    workerName: worker.name,
    zoneId: zone.id,
    zoneName: zone.name,
    startTime: new Date().toISOString(),
    startLat: lat,
    startLng: lng,
  };
  await AsyncStorage.setItem(KEYS.activeShift, JSON.stringify(shift));
  return shift;
}
export async function endShift(lat: number, lng: number): Promise<ShiftSession | null> {
  const shift = await getActiveShift();
  if (!shift) return null;
  const ended: ShiftSession = { ...shift, endTime: new Date().toISOString(), endLat: lat, endLng: lng };
  const shifts = await getShifts();
  shifts.push(ended);
  await AsyncStorage.setItem(KEYS.shifts, JSON.stringify(shifts));
  await AsyncStorage.removeItem(KEYS.activeShift);
  return ended;
}

// ── Yard Signs ───────────────────────────────────────────
export async function getYardSigns(zoneId?: string): Promise<YardSign[]> {
  const raw = await AsyncStorage.getItem(KEYS.yardSigns);
  const signs: YardSign[] = raw ? JSON.parse(raw) : [];
  return zoneId ? signs.filter(s => s.zoneId === zoneId) : signs;
}
export async function saveYardSign(sign: YardSign) {
  const signs = await getYardSigns();
  signs.push(sign);
  await AsyncStorage.setItem(KEYS.yardSigns, JSON.stringify(signs));
}
export async function deleteYardSign(id: string) {
  const signs = await getYardSigns();
  await AsyncStorage.setItem(KEYS.yardSigns, JSON.stringify(signs.filter(s => s.id !== id)));
}
export async function updateStreetNote(streetId: string, note: string) {
  await updateCompletion(streetId, { note: note.trim() || undefined });
}
