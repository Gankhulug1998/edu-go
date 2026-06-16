import { useState } from 'react';
import {
  View, Text, TextInput, Pressable, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/auth';
import { C, radius } from '@/lib/theme';

export default function Login() {
  const { login, signup } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setErr('');
    setBusy(true);
    try {
      if (mode === 'signup') await signup(email.trim(), password, name.trim() || undefined);
      else await login(email.trim(), password);
    } catch (e: any) {
      setErr(e?.message || 'Алдаа гарлаа');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <View style={s.brandRow}>
            <View style={s.logo}><Text style={s.logoMark}>＋</Text></View>
            <Text style={s.brand}>Edu Go</Text>
          </View>
          <Text style={s.title}>{mode === 'signup' ? 'Бүртгүүлэх' : 'Тавтай морил'}</Text>
          <Text style={s.sub}>Хятад ханзыг зургаар, түүхээр сур.</Text>

          <View style={{ gap: 12, marginTop: 24 }}>
            {mode === 'signup' && (
              <Field label="Нэр (заавал биш)" value={name} onChangeText={setName} placeholder="Таны нэр" />
            )}
            <Field label="Имэйл" value={email} onChangeText={setEmail} placeholder="name@example.com"
              keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
            <Field label="Нууц үг" value={password} onChangeText={setPassword} placeholder="••••••••"
              secureTextEntry autoCapitalize="none" />
            {!!err && <View style={s.errBox}><Text style={s.errText}>{err}</Text></View>}
            <Pressable style={[s.btn, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy}>
              {busy ? <ActivityIndicator color={C.text} /> : <Text style={s.btnText}>{mode === 'signup' ? 'Бүртгүүлэх' : 'Нэвтрэх'}</Text>}
            </Pressable>
          </View>

          <Pressable onPress={() => { setMode(mode === 'signup' ? 'login' : 'signup'); setErr(''); }} style={{ marginTop: 20 }}>
            <Text style={s.toggle}>
              {mode === 'signup' ? 'Бүртгэлтэй юу? ' : 'Шинэ хэрэглэгч үү? '}
              <Text style={{ color: C.brand, fontWeight: '700' }}>{mode === 'signup' ? 'Нэвтрэх' : 'Бүртгүүлэх'}</Text>
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field(props: React.ComponentProps<typeof TextInput> & { label: string }) {
  const { label, ...rest } = props;
  return (
    <View>
      <Text style={s.label}>{label}</Text>
      <TextInput {...rest} placeholderTextColor={C.subtle} style={s.input} />
    </View>
  );
}

const s = StyleSheet.create({
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center', marginBottom: 8 },
  logo: { width: 32, height: 32, borderRadius: 9, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  logoMark: { color: C.text, fontSize: 20, fontWeight: '900', lineHeight: 24 },
  brand: { fontSize: 22, fontWeight: '800', color: C.text },
  title: { fontSize: 28, fontWeight: '800', color: C.text, textAlign: 'center', marginTop: 12 },
  sub: { fontSize: 15, color: C.muted, textAlign: 'center', marginTop: 4 },
  label: { fontSize: 13, fontWeight: '600', color: C.muted, marginBottom: 6 },
  input: { height: 48, borderWidth: 1, borderColor: C.borderStrong, borderRadius: radius.md, backgroundColor: C.surface, paddingHorizontal: 14, fontSize: 16, color: C.text },
  btn: { height: 50, borderRadius: radius.md, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  btnText: { color: C.text, fontWeight: '700', fontSize: 16 },
  toggle: { textAlign: 'center', color: C.muted, fontSize: 15 },
  errBox: { backgroundColor: C.dangerWeak, borderRadius: radius.sm, padding: 10 },
  errText: { color: C.danger, fontSize: 13 },
});
