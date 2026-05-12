import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, SafeAreaView,
  Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { getWorkers, saveWorker, Worker } from '../../lib/db';

export default function WorkersScreen() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editWorker, setEditWorker] = useState<Worker | null>(null);
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [role, setRole] = useState<'worker' | 'manager'>('worker');
  const [saving, setSaving] = useState(false);

  useFocusEffect(useCallback(() => { load(); }, []));

  async function load() {
    setLoading(true);
    setWorkers(await getWorkers());
    setLoading(false);
  }

  function openAdd() {
    setEditWorker(null);
    setName(''); setPin(''); setRole('worker');
    setModalOpen(true);
  }

  function openEdit(w: Worker) {
    setEditWorker(w);
    setName(w.name); setPin(w.pin); setRole(w.role);
    setModalOpen(true);
  }

  async function handleSave() {
    if (!name.trim()) { Alert.alert('Name required'); return; }
    if (pin.length < 4) { Alert.alert('PIN must be at least 4 digits'); return; }
    setSaving(true);
    const worker: Worker = {
      id: editWorker?.id ?? `worker-${Date.now()}`,
      name: name.trim(),
      pin,
      role,
    };
    await saveWorker(worker);
    await load();
    setSaving(false);
    setModalOpen(false);
  }

  async function handleDelete(w: Worker) {
    if (w.id === 'mgr-1') { Alert.alert('Cannot delete the default manager account'); return; }
    Alert.alert('Remove Worker', `Remove ${w.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          // Soft delete — set a flag or just remove from UI
          // Using a marker pin so they can't log in but history is preserved
          await saveWorker({ ...w, pin: `__deleted_${w.pin}` });
          await load();
        },
      },
    ]);
  }

  const active = workers.filter(w => !w.pin.startsWith('__deleted_'));

  return (
    <SafeAreaView style={s.root}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}><Text style={s.back}>← Back</Text></TouchableOpacity>
        <Text style={s.title}>Workers</Text>
        <TouchableOpacity onPress={openAdd}><Text style={s.addBtn}>+ Add</Text></TouchableOpacity>
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator color="#fff" /></View>
      ) : (
        <FlatList
          data={active}
          keyExtractor={item => item.id}
          contentContainerStyle={s.list}
          ListEmptyComponent={<Text style={s.empty}>No workers yet. Tap + Add to create one.</Text>}
          renderItem={({ item }) => (
            <View style={s.row}>
              <View style={s.rowLeft}>
                <View style={[s.badge, item.role === 'manager' && s.badgeManager]}>
                  <Text style={s.badgeText}>{item.role === 'manager' ? 'MGR' : 'WKR'}</Text>
                </View>
                <View>
                  <Text style={s.workerName}>{item.name}</Text>
                  <Text style={s.workerPin}>PIN: {item.pin}</Text>
                </View>
              </View>
              <View style={s.rowActions}>
                <TouchableOpacity onPress={() => openEdit(item)} style={s.editBtn}>
                  <Text style={s.editBtnText}>Edit</Text>
                </TouchableOpacity>
                {item.id !== 'mgr-1' && (
                  <TouchableOpacity onPress={() => handleDelete(item)}>
                    <Text style={s.deleteText}>Remove</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
        />
      )}

      <Modal visible={modalOpen} animationType="slide" transparent statusBarTranslucent>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={s.modalBg}>
            <View style={s.modal}>
              <Text style={s.modalTitle}>{editWorker ? 'Edit Worker' : 'Add Worker'}</Text>

              <Text style={s.fieldLabel}>NAME</Text>
              <TextInput
                style={s.input}
                placeholder="e.g. John"
                placeholderTextColor="#333"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                selectionColor="#fff"
                autoFocus
              />

              <Text style={s.fieldLabel}>PIN (4+ digits)</Text>
              <TextInput
                style={s.input}
                placeholder="e.g. 1234"
                placeholderTextColor="#333"
                keyboardType="number-pad"
                value={pin}
                onChangeText={setPin}
                selectionColor="#fff"
                maxLength={8}
              />

              <Text style={s.fieldLabel}>ROLE</Text>
              <View style={s.roleRow}>
                {(['worker', 'manager'] as const).map(r => (
                  <TouchableOpacity
                    key={r}
                    style={[s.roleChip, role === r && s.roleChipActive]}
                    onPress={() => setRole(r)}
                  >
                    <Text style={[s.roleChipText, role === r && s.roleChipTextActive]}>
                      {r === 'manager' ? 'Manager' : 'Worker'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={s.modalBtns}>
                <TouchableOpacity
                  style={[s.saveBtn, saving && s.dim]}
                  onPress={handleSave}
                  disabled={saving}
                >
                  {saving ? <ActivityIndicator color="#000" /> : <Text style={s.saveBtnText}>Save</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={s.cancelBtn} onPress={() => setModalOpen(false)}>
                  <Text style={s.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#111' },
  back: { color: '#3B82F6', fontSize: 15, width: 50 },
  title: { fontSize: 17, fontWeight: '700', color: '#fff' },
  addBtn: { color: '#3B82F6', fontSize: 15, fontWeight: '700', width: 50, textAlign: 'right' },
  list: { padding: 16, gap: 1 },
  empty: { color: '#333', textAlign: 'center', padding: 40, fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#111' },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  badge: { backgroundColor: '#1a1a1a', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: '#222' },
  badgeManager: { backgroundColor: 'rgba(59,130,246,0.12)', borderColor: 'rgba(59,130,246,0.3)' },
  badgeText: { fontSize: 10, fontWeight: '800', color: '#555', letterSpacing: 0.5 },
  workerName: { fontSize: 15, fontWeight: '600', color: '#fff' },
  workerPin: { fontSize: 12, color: '#444', marginTop: 2 },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  editBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: '#222' },
  editBtnText: { color: '#888', fontSize: 12, fontWeight: '600' },
  deleteText: { color: '#EF4444', fontSize: 13 },
  modalBg: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.7)' },
  modal: { backgroundColor: '#111', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, borderTopWidth: 1, borderColor: '#1a1a1a' },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#fff', marginBottom: 20 },
  fieldLabel: { fontSize: 10, fontWeight: '800', color: '#444', letterSpacing: 1.2, marginBottom: 6 },
  input: { backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#222', borderRadius: 10, padding: 13, fontSize: 15, color: '#fff', marginBottom: 14 },
  roleRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  roleChip: { flex: 1, borderRadius: 10, borderWidth: 1, borderColor: '#222', padding: 12, alignItems: 'center', backgroundColor: '#1a1a1a' },
  roleChipActive: { backgroundColor: '#fff', borderColor: '#fff' },
  roleChipText: { fontWeight: '600', color: '#555', fontSize: 14 },
  roleChipTextActive: { color: '#000' },
  modalBtns: { flexDirection: 'row', gap: 10 },
  saveBtn: { flex: 2, backgroundColor: '#fff', borderRadius: 12, padding: 14, alignItems: 'center' },
  saveBtnText: { color: '#000', fontWeight: '800', fontSize: 14 },
  cancelBtn: { flex: 1, borderWidth: 1, borderColor: '#222', borderRadius: 12, padding: 14, alignItems: 'center' },
  cancelBtnText: { color: '#555', fontWeight: '600', fontSize: 14 },
  dim: { opacity: 0.5 },
});
