import { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { getCurrentWorker, findWorkerByNameAndPin, saveCurrentWorker, saveWorker } from '../lib/storage';

export default function LoginScreen() {
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getCurrentWorker().then(worker => {
      if (worker) {
        router.replace(worker.role === 'manager' ? '/manager' : '/worker');
      } else {
        setLoading(false);
      }
    });
  }, []);

  async function handleLogin() {
    if (!name.trim() || !pin.trim()) {
      Alert.alert('Missing info', 'Please enter your name and PIN.');
      return;
    }
    setSubmitting(true);
    try {
      let worker = await findWorkerByNameAndPin(name.trim(), pin.trim());
      if (!worker) {
        worker = {
          id: `worker-${Date.now()}`,
          name: name.trim(),
          pin: pin.trim(),
          role: 'worker',
        };
        await saveWorker(worker);
      }
      await saveCurrentWorker(worker);
      router.replace(worker.role === 'manager' ? '/manager' : '/worker');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.inner}>
        <View style={styles.logoWrap}>
          <View style={styles.logoIcon}>
            <Text style={styles.logoEmoji}>📍</Text>
          </View>
          <Text style={styles.appName}>FieldTrack</Text>
          <Text style={styles.tagline}>Street coverage, simplified</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Sign In</Text>

          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            placeholder="Your name"
            placeholderTextColor="#475569"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            returnKeyType="next"
            selectionColor="#3B82F6"
          />

          <Text style={styles.label}>PIN</Text>
          <TextInput
            style={styles.input}
            placeholder="4-digit PIN"
            placeholderTextColor="#475569"
            value={pin}
            onChangeText={setPin}
            keyboardType="number-pad"
            maxLength={6}
            secureTextEntry
            returnKeyType="done"
            onSubmitEditing={handleLogin}
            selectionColor="#3B82F6"
          />

          <TouchableOpacity
            style={[styles.button, submitting && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={submitting}
            activeOpacity={0.85}
          >
            {submitting
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.buttonText}>Sign In</Text>
            }
          </TouchableOpacity>
        </View>

        <Text style={styles.hint}>
          Manager: name <Text style={styles.hintBold}>Manager</Text> · PIN <Text style={styles.hintBold}>0000</Text>{'\n'}
          New workers are created automatically on first sign in
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0F172A' },
  container: { flex: 1, backgroundColor: '#0F172A' },
  inner: { flex: 1, justifyContent: 'center', padding: 24 },
  logoWrap: { alignItems: 'center', marginBottom: 36 },
  logoIcon: {
    width: 72, height: 72, borderRadius: 20,
    backgroundColor: '#1E3A5F',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 14,
    borderWidth: 1, borderColor: '#2563EB',
  },
  logoEmoji: { fontSize: 36 },
  appName: { fontSize: 32, fontWeight: '800', color: '#F1F5F9', letterSpacing: -0.5 },
  tagline: { fontSize: 14, color: '#64748B', marginTop: 4 },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardTitle: { fontSize: 20, fontWeight: '700', color: '#F1F5F9', marginBottom: 20 },
  label: { fontSize: 12, fontWeight: '600', color: '#64748B', marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' },
  input: {
    backgroundColor: '#0F172A',
    borderWidth: 1.5,
    borderColor: '#334155',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: '#F1F5F9',
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#2563EB',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  hint: { marginTop: 24, fontSize: 12, color: '#475569', textAlign: 'center', lineHeight: 20 },
  hintBold: { color: '#64748B', fontWeight: '700' },
});
