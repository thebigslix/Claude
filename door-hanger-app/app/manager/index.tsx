import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  ActivityIndicator, Alert, SafeAreaView,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import {
  getCurrentWorker, getZones, getStreets, getCompletions,
  deleteZone, clearCurrentWorker,
  Zone, Street, Completion,
} from '../../lib/storage';

type ZoneStats = {
  zone: Zone;
  total: number;
  done: number;
};

export default function ManagerScreen() {
  const [stats, setStats] = useState<ZoneStats[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      loadStats();
    }, [])
  );

  async function loadStats() {
    setLoading(true);
    const zones = await getZones();
    const results: ZoneStats[] = await Promise.all(
      zones.map(async zone => {
        const streets = await getStreets(zone.id);
        const completions = await getCompletions(zone.id);
        return { zone, total: streets.length, done: completions.length };
      })
    );
    setStats(results);
    setLoading(false);
  }

  async function handleDeleteZone(zone: Zone) {
    Alert.alert(
      'Delete Zone',
      `Delete "${zone.name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            await deleteZone(zone.id);
            loadStats();
          },
        },
      ]
    );
  }

  async function handleLogout() {
    await clearCurrentWorker();
    router.replace('/');
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Manager Dashboard</Text>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>Sign out</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.createBtn} onPress={() => router.push('/manager/create-zone')}>
        <Text style={styles.createBtnText}>+ Create New Zone</Text>
      </TouchableOpacity>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#2563EB" /></View>
      ) : stats.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🗺️</Text>
          <Text style={styles.emptyTitle}>No zones yet</Text>
          <Text style={styles.emptySubtitle}>Tap "Create New Zone" to define an area for your workers.</Text>
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
              onDelete={() => handleDeleteZone(item.zone)}
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
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.zoneName}>{zone.name}</Text>
        <TouchableOpacity onPress={onDelete}>
          <Text style={styles.deleteText}>Delete</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.radius}>Radius: {(zone.radiusMeters / 1000).toFixed(1)} km</Text>

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statNum}>{total}</Text>
          <Text style={styles.statLabel}>Streets</Text>
        </View>
        <View style={styles.stat}>
          <Text style={[styles.statNum, { color: '#16A34A' }]}>{done}</Text>
          <Text style={styles.statLabel}>Done</Text>
        </View>
        <View style={styles.stat}>
          <Text style={[styles.statNum, { color: '#F59E0B' }]}>{total - done}</Text>
          <Text style={styles.statLabel}>Left</Text>
        </View>
        <View style={styles.stat}>
          <Text style={[styles.statNum, { color: '#2563EB' }]}>{pct}%</Text>
          <Text style={styles.statLabel}>Complete</Text>
        </View>
      </View>

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${pct}%` as any }]} />
      </View>

      <TouchableOpacity style={styles.viewBtn} onPress={onView}>
        <Text style={styles.viewBtnText}>View Street List →</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F5F9' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#E2E8F0',
  },
  title: { fontSize: 20, fontWeight: '700', color: '#1E293B' },
  logoutBtn: { padding: 8 },
  logoutText: { color: '#EF4444', fontSize: 14, fontWeight: '600' },
  createBtn: {
    margin: 12,
    backgroundColor: '#2563EB',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  createBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyIcon: { fontSize: 56, marginBottom: 12 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#1E293B', marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: '#64748B', textAlign: 'center' },
  list: { padding: 12, gap: 12 },
  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  zoneName: { fontSize: 17, fontWeight: '700', color: '#1E293B' },
  deleteText: { color: '#EF4444', fontSize: 13 },
  radius: { fontSize: 12, color: '#94A3B8', marginBottom: 12 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 12 },
  stat: { alignItems: 'center' },
  statNum: { fontSize: 22, fontWeight: '700', color: '#1E293B' },
  statLabel: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  progressTrack: { height: 6, backgroundColor: '#E2E8F0', borderRadius: 3, marginBottom: 14 },
  progressFill: { height: 6, backgroundColor: '#2563EB', borderRadius: 3 },
  viewBtn: {
    borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 8,
    padding: 10, alignItems: 'center',
  },
  viewBtnText: { color: '#2563EB', fontWeight: '600', fontSize: 14 },
});
