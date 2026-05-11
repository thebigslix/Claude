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
        // New worker — create account
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
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.card}>
        <Text style={styles.logo}>📍</Text>
        <Text style={styles.title}>StreetTracker</Text>
        <Text style={styles.subtitle}>Enter your name and PIN to start</Text>

        <TextInput
          style={styles.input}
          placeholder="Your name"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          returnKeyType="next"
        />
        <TextInput
          style={styles.input}
          placeholder="PIN (4 digits)"
          value={pin}
          onChangeText={setPin}
          keyboardType="number-pad"
          maxLength={6}
          secureTextEntry
          returnKeyType="done"
          onSubmitEditing={handleLogin}
        />

        <TouchableOpacity
          style={[styles.button, submitting && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={submitting}
        >
          {submitting
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.buttonText}>Sign In</Text>
          }
        </TouchableOpacity>

        <Text style={styles.hint}>
          Manager PIN is 0000 — workers can create their own PIN on first login
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 28,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  logo: { fontSize: 48, textAlign: 'center', marginBottom: 8 },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1E293B',
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 24,
  },
  input: {
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    marginBottom: 14,
    backgroundColor: '#F8FAFC',
  },
  button: {
    backgroundColor: '#2563EB',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  hint: {
    marginTop: 20,
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 18,
  },
});
