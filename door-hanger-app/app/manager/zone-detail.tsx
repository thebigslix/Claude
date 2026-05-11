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
        getStreets(z.id), getCompletions(z.id),
        getYardSigns(z.id), getShifts(),
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
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>{zone?.name ?? 'Zone'}</Text>
        <View style={{ width: 60 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#3B82F6" /></View>
      ) : (
        <>
          <View style={styles.summary}>
            <View style={styles.summaryStats}>
              <SummaryStat label="Streets" value={streets.length} />
              <SummaryStat label="Done" value={done.length} color="#4ADE80" />
              <SummaryStat label="Hangers" value={totalHangers} color="#FBBF24" />
              <SummaryStat label="%" value={pct} color="#60A5FA" suffix="%" />
            </View>
            <View style={styles.summaryRow2}>
              <Text style={styles.summaryExtra}>🪧 {yardSigns.length} signs placed  ·  ⏱ {shifts.length} shifts logged</Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${pct}%` as any }]} />
            </View>
          </View>

          {/* Tabs */}
          <View style={styles.tabs}>
            {(['streets', 'signs', 'shifts'] as const).map(t => (
              <TouchableOpacity key={t} style={[styles.tabBtn, tab === t && styles.tabBtnActive]} onPress={() => setTab(t)}>
                <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
                  {t === 'streets' ? `Streets` : t === 'signs' ? `🪧 Signs` : `⏱ Shifts`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {tab === 'streets' && (
            <>
              <View style={styles.filterRow}>
                {(['all', 'pending', 'done'] as const).map(f => (
                  <TouchableOpacity key={f} style={[styles.filterChip, filter === f && styles.filterChipActive]} onPress={() => setFilter(f)}>
                    <Text style={[styles.filterChipText, filter === f && styles.filterChipTextActive]}>
                      {f === 'all' ? `All (${streets.length})` : f === 'done' ? `Done (${done.length})` : `Pending (${pending.length})`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <FlatList
                data={filtered}
                keyExtractor={item => item.id}
                contentContainerStyle={styles.list}
                renderItem={({ item }) => {
                  const completed = isComplete(item);
                  const comp = completionFor(item);
                  return (
                    <View style={[styles.row, completed && styles.rowDone]}>
                      <View style={styles.rowLeft}>
                        <Text style={[styles.streetName, completed && styles.streetNameDone]}>{item.name}</Text>
                        {comp && (
                          <Text style={styles.meta}>
                            {comp.workerName} · {new Date(comp.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            {comp.hangerCount != null ? `  ·  🚪 ${comp.hangerCount}` : ''}
                          </Text>
                        )}
                        {comp?.note && <Text style={styles.noteText}>💬 {comp.note}</Text>}
                      </View>
                      <View style={[styles.badge, completed ? styles.badgeDone : styles.badgePending]}>
                        <Text style={[styles.badgeText, completed ? styles.badgeTextDone : styles.badgeTextPending]}>
                          {completed ? '✓' : '·'}
                        </Text>
                      </View>
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
              contentContainerStyle={styles.list}
              ListEmptyComponent={<Text style={styles.emptyText}>No yard signs placed yet.</Text>}
              renderItem={({ item }) => (
                <View style={styles.row}>
                  <View style={styles.rowLeft}>
                    <Text style={styles.streetName}>🪧 {item.workerName}</Text>
                    <Text style={styles.meta}>
                      {new Date(item.placedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      {'  ·  '}{item.lat.toFixed(4)}, {item.lng.toFixed(4)}
                    </Text>
                    {item.photoUri && <Text style={styles.noteText}>📷 Photo attached</Text>}
                  </View>
                </View>
              )}
            />
          )}

          {tab === 'shifts' && (
            <FlatList
              data={shifts}
              keyExtractor={item => item.id}
              contentContainerStyle={styles.list}
              ListEmptyComponent={<Text style={styles.emptyText}>No shifts logged yet.</Text>}
              renderItem={({ item }) => (
                <View style={styles.row}>
                  <View style={styles.rowLeft}>
                    <Text style={styles.streetName}>{item.workerName}</Text>
                    <Text style={styles.meta}>
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

function SummaryStat({ label, value, color = '#F1F5F9', suffix = '' }: { label: string; value: number; color?: string; suffix?: string }) {
  return (
    <View style={styles.summaryStat}>
      <Text style={[styles.summaryNum, { color }]}>{value}{suffix}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderBottomWidth: 1, borderBottomColor: '#1E293B',
  },
  backBtn: { width: 60 },
  backText: { color: '#3B82F6', fontSize: 15 },
  title: { fontSize: 17, fontWeight: '700', color: '#F1F5F9', flex: 1, textAlign: 'center' },

  summary: {
    margin: 16, backgroundColor: '#1E293B',
    borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: '#334155',
  },
  summaryStats: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 14 },
  summaryStat: { alignItems: 'center' },
  summaryNum: { fontSize: 26, fontWeight: '800' },
  summaryLabel: { fontSize: 11, color: '#475569', marginTop: 2 },
  summaryRow2: { marginBottom: 10 },
  summaryExtra: { fontSize: 12, color: '#475569', textAlign: 'center' },
  progressTrack: { height: 4, backgroundColor: '#0F172A', borderRadius: 2 },
  progressFill: { height: 4, backgroundColor: '#3B82F6', borderRadius: 2 },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#1E293B', marginBottom: 4 },
  tabBtn: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  tabBtnActive: { borderBottomWidth: 2, borderBottomColor: '#3B82F6' },
  tabText: { fontSize: 13, color: '#475569', fontWeight: '600' },
  tabTextActive: { color: '#60A5FA' },
  emptyText: { textAlign: 'center', color: '#334155', padding: 32, fontSize: 14 },

  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 8 },
  filterChip: {
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1.5, borderColor: '#334155',
    backgroundColor: '#1E293B',
  },
  filterChipActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  filterChipText: { fontSize: 13, color: '#475569', fontWeight: '500' },
  filterChipTextActive: { color: '#fff', fontWeight: '600' },

  list: { paddingHorizontal: 16, paddingBottom: 24, gap: 8 },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#1E293B', borderRadius: 10, padding: 14,
    borderWidth: 1, borderColor: '#334155',
  },
  rowDone: { backgroundColor: '#0D2818', borderColor: '#14532D' },
  rowLeft: { flex: 1 },
  streetName: { fontSize: 14, fontWeight: '600', color: '#CBD5E1' },
  streetNameDone: { color: '#4ADE80' },
  meta: { fontSize: 11, color: '#475569', marginTop: 3 },
  noteText: { fontSize: 12, color: '#64748B', marginTop: 3 },
  badge: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  badgeDone: { backgroundColor: '#14532D' },
  badgePending: { backgroundColor: '#0F172A' },
  badgeText: { fontWeight: '700', fontSize: 16 },
  badgeTextDone: { color: '#4ADE80' },
  badgeTextPending: { color: '#334155' },
});
