import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { Worker, Zone, Street, Completion, ShiftSession, YardSign } from './storage';

export type { Worker, Zone, Street, Completion, ShiftSession, YardSign };

// ── Workers ──────────────────────────────────────────────
export async function getWorkers(): Promise<Worker[]> {
  const { data } = await supabase.from('workers').select('*');
  return (data ?? []).map(row => ({
    id: row.id, name: row.name, pin: row.pin, role: row.role,
  }));
}

export async function saveWorker(worker: Worker) {
  await supabase.from('workers').upsert({
    id: worker.id, name: worker.name, pin: worker.pin, role: worker.role,
  });
}

export async function findWorkerByNameAndPin(name: string, pin: string): Promise<Worker | null> {
  const { data } = await supabase
    .from('workers')
    .select('*')
    .ilike('name', name)
    .eq('pin', pin)
    .maybeSingle();
  if (!data) return null;
  return { id: data.id, name: data.name, pin: data.pin, role: data.role };
}

// current worker is device-local — stays in AsyncStorage
export async function saveCurrentWorker(worker: Worker) {
  await AsyncStorage.setItem('current_worker', JSON.stringify(worker));
}
export async function getCurrentWorker(): Promise<Worker | null> {
  const raw = await AsyncStorage.getItem('current_worker');
  return raw ? JSON.parse(raw) : null;
}
export async function clearCurrentWorker() {
  await AsyncStorage.removeItem('current_worker');
}

// ── Zones ────────────────────────────────────────────────
export async function getZones(): Promise<Zone[]> {
  const { data } = await supabase.from('zones').select('*').order('created_at');
  return (data ?? []).map(row => ({
    id: row.id, name: row.name,
    centerLat: row.center_lat, centerLng: row.center_lng,
    radiusMeters: row.radius_meters, createdAt: row.created_at,
  }));
}

export async function saveZone(zone: Zone) {
  await supabase.from('zones').upsert({
    id: zone.id, name: zone.name,
    center_lat: zone.centerLat, center_lng: zone.centerLng,
    radius_meters: zone.radiusMeters, created_at: zone.createdAt,
  });
}

export async function deleteZone(zoneId: string) {
  await supabase.from('zones').delete().eq('id', zoneId);
}

// ── Streets ──────────────────────────────────────────────
export async function getStreets(zoneId?: string): Promise<Street[]> {
  const q = supabase.from('streets').select('*');
  const { data } = zoneId ? await q.eq('zone_id', zoneId) : await q;
  return (data ?? []).map(row => ({
    id: row.id, zoneId: row.zone_id, name: row.name,
    osmId: row.osm_id, geometry: row.geometry,
  }));
}

export async function saveStreets(streets: Street[]) {
  if (streets.length === 0) return;
  // Delete existing streets for these zones then insert fresh
  const zoneIds = [...new Set(streets.map(s => s.zoneId))];
  await supabase.from('streets').delete().in('zone_id', zoneIds);
  await supabase.from('streets').insert(
    streets.map(s => ({
      id: s.id, zone_id: s.zoneId, name: s.name,
      osm_id: s.osmId, geometry: s.geometry,
    }))
  );
}

export async function addStreet(street: Street) {
  await supabase.from('streets').insert({
    id: street.id, zone_id: street.zoneId, name: street.name,
    osm_id: street.osmId, geometry: street.geometry,
  });
}

// ── Completions ──────────────────────────────────────────
export async function getCompletions(zoneId?: string): Promise<Completion[]> {
  if (!zoneId) {
    const { data } = await supabase.from('completions').select('*');
    return toCompletions(data ?? []);
  }
  // Join through streets to filter by zone
  const { data: streetData } = await supabase
    .from('streets').select('id').eq('zone_id', zoneId);
  const ids = (streetData ?? []).map(s => s.id);
  if (ids.length === 0) return [];
  const { data } = await supabase.from('completions').select('*').in('street_id', ids);
  return toCompletions(data ?? []);
}

function toCompletions(rows: any[]): Completion[] {
  return rows.map(row => ({
    streetId: row.street_id, workerId: row.worker_id, workerName: row.worker_name,
    completedAt: row.completed_at,
    ...(row.note != null && { note: row.note }),
    ...(row.hanger_count != null && { hangerCount: row.hanger_count }),
  }));
}

export async function markStreetComplete(
  streetId: string, worker: Worker, hangerCount?: number, note?: string
) {
  await supabase.from('completions').upsert({
    street_id: streetId, worker_id: worker.id, worker_name: worker.name,
    completed_at: new Date().toISOString(),
    hanger_count: hangerCount ?? null,
    note: note?.trim() || null,
  });
}

export async function updateCompletion(streetId: string, updates: Partial<Completion>) {
  await supabase.from('completions').update({
    ...(updates.note !== undefined && { note: updates.note ?? null }),
    ...(updates.hangerCount !== undefined && { hanger_count: updates.hangerCount ?? null }),
    ...(updates.workerName !== undefined && { worker_name: updates.workerName }),
    ...(updates.completedAt !== undefined && { completed_at: updates.completedAt }),
  }).eq('street_id', streetId);
}

export async function unmarkStreetComplete(streetId: string) {
  await supabase.from('completions').delete().eq('street_id', streetId);
}

export async function updateStreetNote(streetId: string, note: string) {
  await updateCompletion(streetId, { note: note.trim() || undefined });
}

// ── Shifts ───────────────────────────────────────────────
export async function getShifts(workerId?: string): Promise<ShiftSession[]> {
  const q = supabase.from('shifts').select('*').order('start_time', { ascending: false });
  const { data } = workerId ? await q.eq('worker_id', workerId) : await q;
  return toShifts(data ?? []);
}

function toShifts(rows: any[]): ShiftSession[] {
  return rows.map(row => ({
    id: row.id, workerId: row.worker_id, workerName: row.worker_name,
    zoneId: row.zone_id, zoneName: row.zone_name,
    startTime: row.start_time, startLat: row.start_lat, startLng: row.start_lng,
    ...(row.end_time != null && { endTime: row.end_time }),
    ...(row.end_lat != null && { endLat: row.end_lat }),
    ...(row.end_lng != null && { endLng: row.end_lng }),
  }));
}

// active shift is device-local
export async function getActiveShift(): Promise<ShiftSession | null> {
  const raw = await AsyncStorage.getItem('active_shift');
  return raw ? JSON.parse(raw) : null;
}

export async function startShift(
  worker: Worker, zone: Zone, lat: number, lng: number
): Promise<ShiftSession> {
  const shift: ShiftSession = {
    id: `shift-${Date.now()}`,
    workerId: worker.id, workerName: worker.name,
    zoneId: zone.id, zoneName: zone.name,
    startTime: new Date().toISOString(),
    startLat: lat, startLng: lng,
  };
  await AsyncStorage.setItem('active_shift', JSON.stringify(shift));
  return shift;
}

export async function endShift(lat: number, lng: number): Promise<ShiftSession | null> {
  const shift = await getActiveShift();
  if (!shift) return null;
  const ended: ShiftSession = {
    ...shift, endTime: new Date().toISOString(), endLat: lat, endLng: lng,
  };
  // Save completed shift to Supabase
  await supabase.from('shifts').insert({
    id: ended.id, worker_id: ended.workerId, worker_name: ended.workerName,
    zone_id: ended.zoneId, zone_name: ended.zoneName,
    start_time: ended.startTime, start_lat: ended.startLat, start_lng: ended.startLng,
    end_time: ended.endTime, end_lat: ended.endLat, end_lng: ended.endLng,
  });
  await AsyncStorage.removeItem('active_shift');
  return ended;
}

// ── Yard Signs / Pins ────────────────────────────────────
export async function getYardSigns(zoneId?: string): Promise<YardSign[]> {
  const q = supabase.from('yard_signs').select('*').order('placed_at', { ascending: false });
  const { data } = zoneId ? await q.eq('zone_id', zoneId) : await q;
  return (data ?? []).map(row => ({
    id: row.id, workerId: row.worker_id, workerName: row.worker_name,
    zoneId: row.zone_id, shiftId: row.shift_id ?? undefined,
    lat: row.lat, lng: row.lng, placedAt: row.placed_at,
    photoUri: row.photo_url ?? undefined,
    address: row.address ?? undefined,
  }));
}

export async function saveYardSign(sign: YardSign) {
  const photoUrl = sign.photoUri ? await uploadPhoto(sign.photoUri) : null;
  await supabase.from('yard_signs').insert({
    id: sign.id, worker_id: sign.workerId, worker_name: sign.workerName,
    zone_id: sign.zoneId, shift_id: sign.shiftId ?? null,
    lat: sign.lat, lng: sign.lng, placed_at: sign.placedAt,
    photo_url: photoUrl,
    address: sign.address ?? null,
  });
}

export async function deleteYardSign(id: string) {
  await supabase.from('yard_signs').delete().eq('id', id);
}

// ── Photo upload ─────────────────────────────────────────
async function uploadPhoto(uri: string): Promise<string | null> {
  // Already a remote URL (e.g. re-saving an existing pin)
  if (uri.startsWith('http')) return uri;
  try {
    const filename = `pins/${Date.now()}.jpg`;
    const response = await fetch(uri);
    const blob = await response.blob();
    const { error } = await supabase.storage.from('photos').upload(filename, blob, {
      contentType: 'image/jpeg',
      upsert: false,
    });
    if (error) throw error;
    const { data } = supabase.storage.from('photos').getPublicUrl(filename);
    return data.publicUrl;
  } catch (e) {
    console.warn('Photo upload failed, storing without photo', e);
    return null;
  }
}
