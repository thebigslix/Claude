import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  ActivityIndicator, Alert, SafeAreaView,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import {
  getCurrentWorker, getZones, getStreets, getCompletions,
  deleteZone, clearCurrentWorker, Zone,
} from '../../lib/storage';

type ZoneStats = { zone: Zone; total: number; done: number };

export default function ManagerScreen() {
  const [stats, setStats] = useState<ZoneStats[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => { loadStats(); }, []));

  async function loadStats() {
    setLoading(true);
    const zones = await getZones();
    const results: ZoneStats[] = await Promise.all(
      zones.map(async zone => {
        const [streets, completions] = await Promise.all([getStreets(zone.id), getCompletions(zone.id)]);
        return { zone, total: streets.length, done: completions.length };
      })
    );
    setStats(results);
    setLoading(false);
  }

  async function handleDelete(zone: Zone) {
    Alert.alert('Delete Zone', `Delete "${zone.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await deleteZone(zone.id); loadStats(); } },
    ]);
  }

  async function handleLogout() {
    await clearCurrentWorker();
    router.replace('/');
  }

  const totalStreets = stats.reduce((a, s) => a + s.total, 0);
  const totalDone = stats.reduce((a, s) => a + s.done, 0);
  const overallPct = totalStreets > 0 ? Math.round((totalDone / totalStreets) * 100) : 0;

  return (
    <SafeAreaView style={s.root}>
      <View style={s.header}>
        <Text style={s.title}>Dashboard</Text>
        <TouchableOpacity onPress={handleLogout}>
          <Text style={s.logout}>Sign out</Text>
        </TouchableOpacity>
      </View>

      {!loading && stats.length > 0 && (
        <View style={s.overallCard}>
          <View style={s.overallRow}>
            <Num label="Zones" value={stats.length} />
            <Num label="Streets" value={totalStreets} />
            <Num label="Done" value={totalDone} color="#4ADE80" />
            <Num label="Overall" value={overallPct} color="#3B82F6" suffix="%" />
          </View>
          <View style={s.track}><View style={[s.fill, { width: `${overallPct}%` as any }]} /></View>
        </View>
      )}

      <TouchableOpacity style={s.createBtn} onPress={() => router.push('/manager/create-zone')} activeOpacity={0.8}>
        <Text style={s.createBtnText}>+ New Zone</Text>
      </TouchableOpacity>

      {loading ? (
        <View style={s.center}><ActivityIndicator color="#fff" /></View>
      ) : stats.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyIcon}>🗺️</Text>
          <Text style={s.emptyTitle}>No zones yet</Text>
          <Text style={s.emptySub}>Create a zone to get started.</Text>
        </View>
      ) : (
        <FlatList
          data={stats}
          keyExtractor={item => item.zone.id}
          contentContainerStyle={s.list}
          renderItem={({ item }) => (
            <ZoneCard stats={item}
              onView={() => router.push({ pathname: '/manager/zone-detail', params: { zoneId: item.zone.id } })}
              onDelete={() => handleDelete(item.zone)}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

function ZoneCard({ stats, onView, onDelete }: { stats: ZoneStats; onView: () => void; onDelete: () => void }) {
  const { zone, total, done } = stats;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <TouchableOpacity style={s.card} onPress={onView} activeOpacity={0.75}>
      <View style={s.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={s.zoneName}>{zone.name}</Text>
          <Text style={s.zoneRadius}>{(zone.radiusMeters / 1000).toFixed(1)} km radius</Text>
        </View>
        <Text style={[s.pct, pct === 100 && s.pctDone]}>{pct}%</Text>
      </View>
      <View style={s.cardStats}>
        <Text style={s.stat}>{total} streets</Text>
        <Text style={[s.stat, { color: '#4ADE80' }]}>{done} done</Text>
        <Text style={[s.stat, { color: '#FBBF24' }]}>{total - done} left</Text>
      </View>
      <View style={s.track}>
        <View style={[s.fill, { width: `${pct}%` as any }, pct === 100 && s.fillDone]} />
      </View>
      <View style={s.cardActions}>
        <Text style={s.viewLink}>View Streets →</Text>
        <TouchableOpacity onPress={onDelete}><Text style={s.deleteLink}>Delete</Text></TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

function Num({ label, value, color = '#fff', suffix = '' }: { label: string; value: number; color?: string; suffix?: string }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={[s.numVal, { color }]}>{value}{suffix}</Text>
      <Text style={s.numLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
  title: { fontSize: 26, fontWeight: '800', color: '#fff' },
  logout: { color: '#EF4444', fontSize: 14, fontWeight: '600' },
  overallCard: { marginHorizontal: 16, marginBottom: 12, backgroundColor: '#111', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#1a1a1a' },
  overallRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 14 },
  numVal: { fontSize: 24, fontWeight: '800' },
  numLabel: { fontSize: 11, color: '#444', marginTop: 2 },
  track: { height: 3, backgroundColor: '#1a1a1a', borderRadius: 2 },
  fill: { height: 3, backgroundColor: '#3B82F6', borderRadius: 2 },
  fillDone: { backgroundColor: '#4ADE80' },
  createBtn: { marginHorizontal: 16, marginBottom: 16, backgroundColor: '#fff', borderRadius: 12, padding: 14, alignItems: 'center' },
  createBtnText: { color: '#000', fontWeight: '800', fontSize: 15 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  emptySub: { fontSize: 13, color: '#444', marginTop: 4 },
  list: { paddingHorizontal: 16, gap: 10, paddingBottom: 24 },
  card: { backgroundColor: '#111', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#1a1a1a' },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  zoneName: { fontSize: 16, fontWeight: '700', color: '#fff' },
  zoneRadius: { fontSize: 12, color: '#444', marginTop: 2 },
  pct: { fontSize: 22, fontWeight: '800', color: '#3B82F6' },
  pctDone: { color: '#4ADE80' },
  cardStats: { flexDirection: 'row', gap: 16, marginBottom: 10 },
  stat: { fontSize: 13, color: '#555' },
  cardActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  viewLink: { color: '#3B82F6', fontWeight: '600', fontSize: 13 },
  deleteLink: { color: '#EF4444', fontSize: 13 },
});
