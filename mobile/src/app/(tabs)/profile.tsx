import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/auth';
import { useCatalog } from '@/lib/catalog';
import { C, radius } from '@/lib/theme';

export default function Profile() {
  const { user, progress, logout } = useAuth();
  const { drafts } = useCatalog();
  const known = Object.values(progress).filter((st) => st === 'known').length;
  const seen = Object.keys(progress).length;
  const total = drafts.length || 362;
  const initial = (user?.name || user?.email || '?').trim()[0]?.toUpperCase() || '?';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <View style={s.head}>
          <View style={s.avatar}><Text style={s.avatarText}>{initial}</Text></View>
          <Text style={s.name}>{user?.name || 'Сурагч'}</Text>
          <Text style={s.email}>{user?.email}</Text>
        </View>

        <View style={s.stats}>
          <Stat label="Мэдсэн" value={known} color={C.success} />
          <View style={s.divider} />
          <Stat label="Үзсэн" value={seen} color={C.primaryStrong} />
          <View style={s.divider} />
          <Stat label="Нийт" value={total} color={C.brand} />
        </View>

        <Pressable style={s.logout} onPress={logout}>
          <Text style={s.logoutText}>Гарах</Text>
        </Pressable>

        <Text style={s.footer}>Edu Go · Хятад ханз сурах{'\n'}Twemoji · CC-CEDICT</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={[s.statValue, { color }]}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  head: { alignItems: 'center', paddingVertical: 16 },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: C.primaryWeak, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 30, fontWeight: '800', color: C.primaryInk },
  name: { fontSize: 22, fontWeight: '800', color: C.text, marginTop: 12 },
  email: { fontSize: 14, color: C.soft, marginTop: 2 },
  stats: { flexDirection: 'row', backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: radius.xl, paddingVertical: 18, marginTop: 24 },
  statValue: { fontSize: 26, fontWeight: '800' },
  statLabel: { fontSize: 13, color: C.muted, marginTop: 2 },
  divider: { width: 1, backgroundColor: C.border },
  logout: { marginTop: 28, height: 50, borderRadius: radius.md, borderWidth: 1, borderColor: C.dangerWeak, backgroundColor: C.dangerWeak, alignItems: 'center', justifyContent: 'center' },
  logoutText: { color: C.danger, fontWeight: '700', fontSize: 16 },
  footer: { textAlign: 'center', color: C.subtle, fontSize: 12, marginTop: 32, lineHeight: 18 },
});
