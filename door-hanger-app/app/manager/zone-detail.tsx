import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, SafeAreaView,
} from 'react-native';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { getZones, getStreets, getCompletions, getYardSigns, getShifts, Zone, Street, Completion, YardSign, ShiftSession } from '../../lib/storage';

export default function ZoneDetailScreen() {
  const { zoneId } = useLocalSearchParams<{ zoneId: string }>();
  const [zone, setZone] = useState<Zone | null>(null);
  const [streets, setStreets] = useState<Street[]>([]);
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [yardSigns, setYardSigns] = useState<YardSign[]>([]);
  const [shifts, setShifts] = useState<ShiftSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'done' | 'pending'>('all');
  const [tab, setTab] = useState<'streets' | 'signs' | 'shifts'>('streets');

  useFocusEffect(useCallback(() => { load(); }, [zoneId]));

  async function load() {
    setLoading(true);
    const zones = await getZones();
    const z = zones.find(z => z.id === zoneId) ?? null;
    setZone(z);
    if (z) {
      const [s, c, signs, allShifts] = await Promise.all([
        getStreets(z.id), getCompletions(z.id), getYardSigns(z.id), getShifts(),
      ]);
      setStreets(s);
      setCompletions(c);
      setYardSigns(signs);
      setShifts(allShifts.filter(sh => sh.zoneId === z.id));
    }
    setLoading(false);
  }

  const isComplete = (s: Street) => completions.some(c => c.streetId === s.id);
  const completionFor = (s: Street) => completions.find(c => c.streetId === s.id);
  const done = streets.filter(s => isComplete(s));
  const pending = streets.filter(s => !isComplete(s));
  const pct = streets.length > 0 ? Math.round((done.length / streets.length) * 100) : 0;
  const totalHangers = completions.reduce((a, c) => a + (c.hangerCount ?? 0), 0);
  const filtered = filter === 'done' ? done : filter === 'pending' ? pending : [...pending, ...done];

  function shiftDuration(shift: ShiftSession) {
    if (!shift.endTime) return 'Active';
    const ms = new Date(shift.endTime).getTime() - new Date(shift.startTime).getTime();
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  return (
    <SafeAreaView style={s.root}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}><Text style={s.back}>← Back</Text></TouchableOpacity>
        <Text style={s.title} numberOfLines={1}>{zone?.name ?? 'Zone'}</Text>
        <View style={{ width: 60 }} />
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator color="#fff" /></View>
      ) : (
        <>
          <View style={s.summary}>
            <View style={s.summaryRow}>
              <Stat label="Streets" value={streets.length} />
              <Stat label="Done" value={done.length} color="#4ADE80" />
              <Stat label="Hangers" value={totalHangers} color="#FBBF24" />
              <Stat label="Complete" value={pct} color="#3B82F6" suffix="%" />
            </View>
            <Text style={s.summaryExtra}>🪧 {yardSigns.length} signs  ·  ⏱ {shifts.length} shifts</Text>
            <View style={s.track}><View style={[s.fill, { width: `${pct}%` as any }]} /></View>
          </View>

          <View style={s.tabs}>
            {(['streets', 'signs', 'shifts'] as const).map(t => (
              <TouchableOpacity key={t} style={[s.tab, tab === t && s.tabActive]} onPress={() => setTab(t)}>
                <Text style={[s.tabText, tab === t && s.tabTextActive]}>
                  {t === 'streets' ? 'Streets' : t === 'signs' ? '🪧 Signs' : '⏱ Shifts'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {tab === 'streets' && (
            <>
              <View style={s.filterRow}>
                {(['all', 'pending', 'done'] as const).map(f => (
                  <TouchableOpacity key={f} style={[s.chip, filter === f && s.chipActive]} onPress={() => setFilter(f)}>
                    <Text style={[s.chipText, filter === f && s.chipTextActive]}>
                      {f === 'all' ? `All (${streets.length})` : f === 'done' ? `Done (${done.length})` : `Pending (${pending.length})`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <FlatList
                data={filtered}
                keyExtractor={item => item.id}
                contentContainerStyle={s.list}
                renderItem={({ item }) => {
                  const completed = isComplete(item);
                  const comp = completionFor(item);
                  return (
                    <View style={[s.row, completed && s.rowDone]}>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.streetName, completed && s.streetDone]}>{item.name}</Text>
                        {comp && <Text style={s.meta}>{comp.workerName}{comp.hangerCount != null ? `  ·  🚪 ${comp.hangerCount}` : ''}</Text>}
                        {comp?.note && <Text style={s.note}>💬 {comp.note}</Text>}
                      </View>
                      <Text style={completed ? s.checkDone : s.checkPending}>{completed ? '✓' : '○'}</Text>
                    </View>
                  );
                }}
              />
            </>
          )}

          {tab === 'signs' && (
            <FlatList
              data={yardSigns}
              keyExtractor={item => item.id}
              contentContainerStyle={s.list}
              ListEmptyComponent={<Text style={s.empty}>No yard signs placed yet.</Text>}
              renderItem={({ item }) => (
                <View style={s.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.streetName}>🪧 {item.workerName}</Text>
                    <Text style={s.meta}>{new Date(item.placedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}{item.photoUri ? '  ·  📷 photo' : ''}</Text>
                  </View>
                </View>
              )}
            />
          )}

          {tab === 'shifts' && (
            <FlatList
              data={shifts}
              keyExtractor={item => item.id}
              contentContainerStyle={s.list}
              ListEmptyComponent={<Text style={s.empty}>No shifts logged yet.</Text>}
              renderItem={({ item }) => (
                <View style={s.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.streetName}>{item.workerName}</Text>
                    <Text style={s.meta}>
                      {new Date(item.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      {item.endTime ? ` → ${new Date(item.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ' (active)'}
                      {'  ·  '}{shiftDuration(item)}
                    </Text>
                  </View>
                </View>
              )}
            />
          )}
        </>
      )}
    </SafeAreaView>
  );
}

function Stat({ label, value, color = '#fff', suffix = '' }: { label: string; value: number; color?: string; suffix?: string }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={[{ fontSize: 24, fontWeight: '800', color }]}>{value}{suffix}</Text>
      <Text style={{ fontSize: 11, color: '#444', marginTop: 2 }}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#111' },
  back: { color: '#3B82F6', fontSize: 15, width: 60 },
  title: { fontSize: 17, fontWeight: '700', color: '#fff', flex: 1, textAlign: 'center' },
  summary: { margin: 16, backgroundColor: '#111', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#1a1a1a' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 8 },
  summaryExtra: { fontSize: 12, color: '#444', textAlign: 'center', marginBottom: 12 },
  track: { height: 3, backgroundColor: '#1a1a1a', borderRadius: 2 },
  fill: { height: 3, backgroundColor: '#3B82F6', borderRadius: 2 },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#111' },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#3B82F6' },
  tabText: { fontSize: 13, color: '#444', fontWeight: '600' },
  tabTextActive: { color: '#3B82F6' },
  filterRow: { flexDirection: 'row', gap: 8, padding: 12 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#222', backgroundColor: '#111' },
  chipActive: { backgroundColor: '#fff', borderColor: '#fff' },
  chipText: { fontSize: 12, color: '#555', fontWeight: '600' },
  chipTextActive: { color: '#000' },
  list: { paddingHorizontal: 16, paddingBottom: 24, gap: 1 },
  row: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#111', flexDirection: 'row', alignItems: 'center' },
  rowDone: { opacity: 0.7 },
  streetName: { fontSize: 14, fontWeight: '600', color: '#fff' },
  streetDone: { color: '#4ADE80' },
  meta: { fontSize: 12, color: '#444', marginTop: 2 },
  note: { fontSize: 12, color: '#555', marginTop: 2 },
  checkDone: { color: '#4ADE80', fontWeight: '700', fontSize: 16, marginLeft: 8 },
  checkPending: { color: '#222', fontWeight: '700', fontSize: 16, marginLeft: 8 },
  empty: { color: '#333', textAlign: 'center', padding: 32, fontSize: 14 },
});
