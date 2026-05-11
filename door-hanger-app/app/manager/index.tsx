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
    Alert.alert('Delete Zone', `Delete "${zone.name}"? This cannot be undone.`, [
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
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Dashboard</Text>
          <Text style={styles.subtitle}>Manager view</Text>
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>Sign out</Text>
        </TouchableOpacity>
      </View>

      {!loading && stats.length > 0 && (
        <View style={styles.overallCard}>
          <View style={styles.overallStats}>
            <View style={styles.overallStat}>
              <Text style={styles.overallNum}>{stats.length}</Text>
              <Text style={styles.overallLabel}>Zones</Text>
            </View>
            <View style={styles.overallDivider} />
            <View style={styles.overallStat}>
              <Text style={styles.overallNum}>{totalStreets}</Text>
              <Text style={styles.overallLabel}>Streets</Text>
            </View>
            <View style={styles.overallDivider} />
            <View style={styles.overallStat}>
              <Text style={[styles.overallNum, { color: '#4ADE80' }]}>{totalDone}</Text>
              <Text style={styles.overallLabel}>Done</Text>
            </View>
            <View style={styles.overallDivider} />
            <View style={styles.overallStat}>
              <Text style={[styles.overallNum, { color: '#60A5FA' }]}>{overallPct}%</Text>
              <Text style={styles.overallLabel}>Complete</Text>
            </View>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${overallPct}%` as any }]} />
          </View>
        </View>
      )}

      <TouchableOpacity style={styles.createBtn} onPress={() => router.push('/manager/create-zone')}>
        <Text style={styles.createBtnText}>+ Create New Zone</Text>
      </TouchableOpacity>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#3B82F6" /></View>
      ) : stats.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🗺️</Text>
          <Text style={styles.emptyTitle}>No zones yet</Text>
          <Text style={styles.emptySub}>Create a zone to get your workers started.</Text>
        </View>
      ) : (
        <FlatList
          data={stats}
          keyExtractor={item => item.zone.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <ZoneCard
              stats={item}
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
    <TouchableOpacity style={styles.card} onPress={onView} activeOpacity={0.8}>
      <View style={styles.cardTop}>
        <View style={styles.cardLeft}>
          <Text style={styles.zoneName}>{zone.name}</Text>
          <Text style={styles.zoneRadius}>{(zone.radiusMeters / 1000).toFixed(1)} km radius</Text>
        </View>
        <View style={styles.cardRight}>
          <View style={[styles.pctBadge, pct === 100 && styles.pctBadgeDone]}>
            <Text style={[styles.pctText, pct === 100 && styles.pctTextDone]}>{pct}%</Text>
          </View>
        </View>
      </View>

      <View style={styles.cardStats}>
        <Stat label="Total" value={total} />
        <Stat label="Done" value={done} color="#4ADE80" />
        <Stat label="Left" value={total - done} color="#FBBF24" />
      </View>

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${pct}%` as any }, pct === 100 && styles.progressFillDone]} />
      </View>

      <View style={styles.cardActions}>
        <TouchableOpacity onPress={onView} style={styles.viewBtn}>
          <Text style={styles.viewBtnText}>View Streets →</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onDelete} style={styles.deleteBtn}>
          <Text style={styles.deleteBtnText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

function Stat({ label, value, color = '#F1F5F9' }: { label: string; value: number; color?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statNum, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 20, borderBottomWidth: 1, borderBottomColor: '#1E293B',
  },
  title: { fontSize: 24, fontWeight: '800', color: '#F1F5F9' },
  subtitle: { fontSize: 13, color: '#475569', marginTop: 2 },
  logoutBtn: { padding: 8 },
  logoutText: { color: '#EF4444', fontSize: 14, fontWeight: '600' },

  overallCard: {
    margin: 16, marginBottom: 0,
    backgroundColor: '#1E293B', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: '#334155',
  },
  overallStats: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 14 },
  overallStat: { alignItems: 'center' },
  overallNum: { fontSize: 26, fontWeight: '800', color: '#F1F5F9' },
  overallLabel: { fontSize: 11, color: '#475569', marginTop: 2 },
  overallDivider: { width: 1, backgroundColor: '#334155' },

  createBtn: {
    margin: 16, marginBottom: 8,
    backgroundColor: '#2563EB', borderRadius: 12,
    padding: 14, alignItems: 'center',
  },
  createBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyIcon: { fontSize: 56, marginBottom: 12 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#F1F5F9', marginBottom: 6 },
  emptySub: { fontSize: 14, color: '#475569', textAlign: 'center' },

  list: { padding: 16, gap: 12 },
  card: {
    backgroundColor: '#1E293B', borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: '#334155',
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  cardLeft: { flex: 1 },
  cardRight: {},
  zoneName: { fontSize: 17, fontWeight: '700', color: '#F1F5F9' },
  zoneRadius: { fontSize: 12, color: '#475569', marginTop: 2 },
  pctBadge: { backgroundColor: '#172554', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  pctBadgeDone: { backgroundColor: '#14532D' },
  pctText: { color: '#60A5FA', fontWeight: '700', fontSize: 15 },
  pctTextDone: { color: '#4ADE80' },
  cardStats: { flexDirection: 'row', gap: 24, marginBottom: 12 },
  stat: {},
  statNum: { fontSize: 20, fontWeight: '700' },
  statLabel: { fontSize: 11, color: '#475569', marginTop: 1 },
  progressTrack: { height: 4, backgroundColor: '#0F172A', borderRadius: 2, marginBottom: 14 },
  progressFill: { height: 4, backgroundColor: '#3B82F6', borderRadius: 2 },
  progressFillDone: { backgroundColor: '#4ADE80' },
  cardActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  viewBtn: {},
  viewBtnText: { color: '#3B82F6', fontWeight: '600', fontSize: 14 },
  deleteBtn: {},
  deleteBtnText: { color: '#EF4444', fontSize: 13 },
});
