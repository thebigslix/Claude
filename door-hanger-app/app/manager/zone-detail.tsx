import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, SafeAreaView,
} from 'react-native';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import {
  getZones, getStreets, getCompletions,
  Zone, Street, Completion,
} from '../../lib/storage';

export default function ZoneDetailScreen() {
  const { zoneId } = useLocalSearchParams<{ zoneId: string }>();
  const [zone, setZone] = useState<Zone | null>(null);
  const [streets, setStreets] = useState<Street[]>([]);
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [zoneId])
  );

  async function load() {
    setLoading(true);
    const zones = await getZones();
    const z = zones.find(z => z.id === zoneId) ?? null;
    setZone(z);
    if (z) {
      const [s, c] = await Promise.all([getStreets(z.id), getCompletions(z.id)]);
      setStreets(s);
      setCompletions(c);
    }
    setLoading(false);
  }

  function isComplete(street: Street) {
    return completions.some(c => c.streetId === street.id);
  }

  function completionFor(street: Street) {
    return completions.find(c => c.streetId === street.id);
  }

  const done = streets.filter(s => isComplete(s));
  const pending = streets.filter(s => !isComplete(s));
  const pct = streets.length > 0 ? Math.round((done.length / streets.length) * 100) : 0;

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
        <View style={styles.center}><ActivityIndicator size="large" color="#2563EB" /></View>
      ) : (
        <>
          <View style={styles.summary}>
            <View style={styles.summaryStats}>
              <Stat label="Total" value={streets.length} />
              <Stat label="Done" value={done.length} color="#16A34A" />
              <Stat label="Left" value={pending.length} color="#F59E0B" />
              <Stat label="%" value={pct} color="#2563EB" suffix="%" />
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${pct}%` as any }]} />
            </View>
          </View>

          <FlatList
            data={[...pending, ...done]}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => {
              const completed = isComplete(item);
              const comp = completionFor(item);
              return (
                <View style={[styles.row, completed && styles.rowDone]}>
                  <View style={styles.rowLeft}>
                    <Text style={[styles.streetName, completed && styles.streetNameDone]}>
                      {item.name}
                    </Text>
                    {comp && (
                      <Text style={styles.meta}>
                        ✓ {comp.workerName} · {new Date(comp.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    )}
                  </View>
                  <View style={[styles.badge, completed ? styles.badgeDone : styles.badgePending]}>
                    <Text style={[styles.badgeText, completed ? styles.badgeTextDone : styles.badgeTextPending]}>
                      {completed ? 'Done' : 'Pending'}
                    </Text>
                  </View>
                </View>
              );
            }}
          />
        </>
      )}
    </SafeAreaView>
  );
}

function Stat({ label, value, color = '#1E293B', suffix = '' }: { label: string; value: number; color?: string; suffix?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statNum, { color }]}>{value}{suffix}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F5F9' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#E2E8F0',
  },
  backBtn: { width: 60 },
  backText: { color: '#2563EB', fontSize: 15 },
  title: { fontSize: 17, fontWeight: '700', color: '#1E293B', flex: 1, textAlign: 'center' },
  summary: {
    backgroundColor: '#fff', margin: 12, borderRadius: 12, padding: 16,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  summaryStats: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 12 },
  stat: { alignItems: 'center' },
  statNum: { fontSize: 24, fontWeight: '700' },
  statLabel: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  progressTrack: { height: 8, backgroundColor: '#E2E8F0', borderRadius: 4 },
  progressFill: { height: 8, backgroundColor: '#2563EB', borderRadius: 4 },
  list: { paddingHorizontal: 12, paddingBottom: 20, gap: 8 },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', borderRadius: 10, padding: 14,
    borderWidth: 1.5, borderColor: '#E2E8F0',
  },
  rowDone: { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' },
  rowLeft: { flex: 1 },
  streetName: { fontSize: 15, fontWeight: '500', color: '#1E293B' },
  streetNameDone: { color: '#16A34A' },
  meta: { fontSize: 11, color: '#86EFAC', marginTop: 3 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeDone: { backgroundColor: '#DCFCE7' },
  badgePending: { backgroundColor: '#FEF3C7' },
  badgeText: { fontSize: 12, fontWeight: '600' },
  badgeTextDone: { color: '#16A34A' },
  badgeTextPending: { color: '#B45309' },
});
