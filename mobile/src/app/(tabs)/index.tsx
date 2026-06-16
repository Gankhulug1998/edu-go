import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { useCatalog, LEVELS, levelStats } from '@/lib/catalog';
import { C, radius } from '@/lib/theme';

export default function Home() {
  const { user, progress } = useAuth();
  const { drafts, loading } = useCatalog();
  const router = useRouter();
  const known = Object.values(progress).filter((s) => s === 'known').length;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 32 }}>
        <View style={s.head}>
          <View>
            <Text style={s.hi}>Сайн уу{user?.name ? `, ${user.name}` : ''} 👋</Text>
            <Text style={s.sub}>Өнөөдөр шинэ ханз сурцгаая.</Text>
          </View>
          <View style={s.known}><Text style={s.knownText}>★ {known}</Text></View>
        </View>

        <Text style={s.section}>Чиний зам</Text>
        {loading ? (
          <ActivityIndicator color={C.brand} style={{ marginTop: 24 }} />
        ) : (
          <View style={{ gap: 14, marginTop: 12 }}>
            {LEVELS.map((lv) => {
              const st = levelStats(drafts, progress, lv.id);
              return (
                <Pressable key={lv.id} style={s.track} onPress={() => router.push(`/gallery?level=${lv.id}`)}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={[s.dot, { backgroundColor: lv.color }]} />
                    <Text style={[s.tag, { color: lv.color }]}>{lv.tag} · {lv.name}</Text>
                  </View>
                  <Text style={s.trackTitle}>{lv.name}</Text>
                  <View style={s.barTrack}>
                    <View style={[s.barFill, { width: `${st.pct}%`, backgroundColor: lv.color }]} />
                  </View>
                  <View style={s.trackFoot}>
                    <Text style={s.foot}>{st.known} / {st.total} ханз мэдсэн</Text>
                    <Text style={[s.cta, { color: C.primaryStrong }]}>{st.pct > 0 ? 'Үргэлжлүүлэх' : 'Эхлэх'} →</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        <Pressable style={s.browse} onPress={() => router.push('/gallery')}>
          <Text style={s.browseText}>Бүх картыг үзэх →</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  hi: { fontSize: 24, fontWeight: '800', color: C.text },
  sub: { fontSize: 14, color: C.muted, marginTop: 2 },
  known: { backgroundColor: C.primaryWeak, borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 6 },
  knownText: { color: C.primaryInk, fontWeight: '700' },
  section: { fontSize: 18, fontWeight: '800', color: C.text },
  track: { backgroundColor: C.surface, borderWidth: 2, borderColor: C.border, borderRadius: radius.xl, padding: 18 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  tag: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  trackTitle: { fontSize: 18, fontWeight: '800', color: C.text, marginTop: 4 },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: C.sunken, marginTop: 12, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  trackFoot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  foot: { fontSize: 13, color: C.muted },
  cta: { fontSize: 14, fontWeight: '700' },
  browse: { marginTop: 18, backgroundColor: C.brandWeak, borderRadius: radius.lg, padding: 16, alignItems: 'center' },
  browseText: { color: C.brandInk, fontWeight: '700', fontSize: 15 },
});
