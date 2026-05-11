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
  geometry: [number, number][];
};

export type Completion = {
  streetId: string;
  workerId: string;
  workerName: string;
  completedAt: string;
  note?: string;
};

const KEYS = {
  currentWorker: 'current_worker',
  workers: 'workers',
  zones: 'zones',
  streets: 'streets',
  completions: 'completions',
};

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
  const defaults: Worker[] = [
    { id: 'mgr-1', name: 'Manager', pin: '0000', role: 'manager' },
  ];
  await AsyncStorage.setItem(KEYS.workers, JSON.stringify(defaults));
  return defaults;
}

export async function saveWorker(worker: Worker) {
  const workers = await getWorkers();
  const idx = workers.findIndex(w => w.id === worker.id);
  if (idx >= 0) workers[idx] = worker;
  else workers.push(worker);
  await AsyncStorage.setItem(KEYS.workers, JSON.stringify(workers));
}

export async function findWorkerByNameAndPin(name: string, pin: string): Promise<Worker | null> {
  const workers = await getWorkers();
  return workers.find(w => w.name.toLowerCase() === name.toLowerCase() && w.pin === pin) ?? null;
}

export async function getZones(): Promise<Zone[]> {
  const raw = await AsyncStorage.getItem(KEYS.zones);
  return raw ? JSON.parse(raw) : [];
}

export async function saveZone(zone: Zone) {
  const zones = await getZones();
  const idx = zones.findIndex(z => z.id === zone.id);
  if (idx >= 0) zones[idx] = zone;
  else zones.push(zone);
  await AsyncStorage.setItem(KEYS.zones, JSON.stringify(zones));
}

export async function deleteZone(zoneId: string) {
  const zones = await getZones();
  await AsyncStorage.setItem(KEYS.zones, JSON.stringify(zones.filter(z => z.id !== zoneId)));
}

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

export async function getCompletions(zoneId?: string): Promise<Completion[]> {
  const raw = await AsyncStorage.getItem(KEYS.completions);
  const completions: Completion[] = raw ? JSON.parse(raw) : [];
  if (!zoneId) return completions;
  const streets = await getStreets(zoneId);
  const streetIds = new Set(streets.map(s => s.id));
  return completions.filter(c => streetIds.has(c.streetId));
}

export async function markStreetComplete(streetId: string, worker: Worker) {
  const completions = await getCompletions();
  if (completions.find(c => c.streetId === streetId)) return;
  completions.push({
    streetId,
    workerId: worker.id,
    workerName: worker.name,
    completedAt: new Date().toISOString(),
  });
  await AsyncStorage.setItem(KEYS.completions, JSON.stringify(completions));
}

export async function updateStreetNote(streetId: string, note: string) {
  const completions = await getCompletions();
  const idx = completions.findIndex(c => c.streetId === streetId);
  if (idx >= 0) {
    completions[idx] = { ...completions[idx], note: note.trim() || undefined };
    await AsyncStorage.setItem(KEYS.completions, JSON.stringify(completions));
  }
}

export async function unmarkStreetComplete(streetId: string) {
  const completions = await getCompletions();
  await AsyncStorage.setItem(
    KEYS.completions,
    JSON.stringify(completions.filter(c => c.streetId !== streetId))
  );
}
