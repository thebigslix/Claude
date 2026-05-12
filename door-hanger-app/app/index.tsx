import { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { getCurrentWorker, findWorkerByNameAndPin, saveCurrentWorker, saveWorker } from '../lib/db';

export default function LoginScreen() {
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getCurrentWorker().then(worker => {
      if (worker) router.replace(worker.role === 'manager' ? '/manager' : '/worker');
      else setLoading(false);
    });
  }, []);

  async function handleLogin() {
    if (!name.trim() || !pin.trim()) {
      Alert.alert('Missing info', 'Enter your name and PIN.');
      return;
    }
    setSubmitting(true);
    try {
      const worker = await findWorkerByNameAndPin(name.trim(), pin.trim());
      if (!worker) {
        // Check if name exists with a different PIN (wrong PIN) vs brand new user
        Alert.alert('Not found', 'No account with that name and PIN. Ask your manager to create your account.');
        return;
      }
      await saveCurrentWorker(worker);
      router.replace(worker.role === 'manager' ? '/manager' : '/worker');
    } catch (e) {
      Alert.alert('Connection error', 'Could not reach the server. Check your internet connection.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <View style={s.center}><ActivityIndicator color="#fff" /></View>;
  }

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={s.inner}>
        <Text style={s.logo}>📍</Text>
        <Text style={s.appName}>FieldTrack</Text>
        <Text style={s.tagline}>Street coverage tracker</Text>

        <View style={s.form}>
          <TextInput
            style={s.input}
            placeholder="Name"
            placeholderTextColor="#333"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            returnKeyType="next"
            selectionColor="#fff"
          />
          <TextInput
            style={s.input}
            placeholder="PIN"
            placeholderTextColor="#333"
            value={pin}
            onChangeText={setPin}
            keyboardType="number-pad"
            maxLength={6}
            secureTextEntry
            returnKeyType="done"
            onSubmitEditing={handleLogin}
            selectionColor="#fff"
          />
          <TouchableOpacity style={[s.btn, submitting && s.btnDim]} onPress={handleLogin} disabled={submitting} activeOpacity={0.8}>
            {submitting ? <ActivityIndicator color="#000" /> : <Text style={s.btnText}>Sign In</Text>}
          </TouchableOpacity>
        </View>

        <Text style={s.hint}>New workers must be added by a manager first.</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  inner: { flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
  logo: { fontSize: 44, textAlign: 'center', marginBottom: 10 },
  appName: { fontSize: 34, fontWeight: '800', color: '#fff', textAlign: 'center', letterSpacing: -1 },
  tagline: { fontSize: 13, color: '#444', textAlign: 'center', marginBottom: 48, marginTop: 4 },
  form: { gap: 12 },
  input: {
    backgroundColor: '#111', borderWidth: 1, borderColor: '#222',
    borderRadius: 12, padding: 16, fontSize: 16, color: '#fff',
  },
  btn: { backgroundColor: '#fff', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 4 },
  btnDim: { opacity: 0.5 },
  btnText: { color: '#000', fontSize: 16, fontWeight: '800' },
  hint: { marginTop: 36, fontSize: 12, color: '#333', textAlign: 'center' },
  hintBold: { color: '#555', fontWeight: '700' },
});
