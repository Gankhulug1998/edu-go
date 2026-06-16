import { useState } from 'react';
import { View, Text, TextInput, Pressable, FlatList, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { useCatalog, LEVELS } from '@/lib/catalog';
import { cardImageSource, Draft } from '@/lib/api';
import { C, radius } from '@/lib/theme';

export default function Gallery() {
  const params = useLocalSearchParams<{ level?: string; cat?: string }>();
  const { drafts, packs, loading } = useCatalog();
  const { progress } = useAuth();
  const router = useRouter();
  const [level, setLevel] = useState(Number(params.level) || 1);
  const [cat, setCat] = useState(params.cat || '');
  const [q, setQ] = useState('');

  const cats = packs ? packs.categories.filter((c) => drafts.some((d) => d.level === level && d.category === c.slug)) : [];
  let items = drafts.filter((d) => d.level === level);
  if (cat) items = items.filter((d) => d.category === cat);
  if (q) {
    const ql = q.toLowerCase();
    items = items.filter((d) => d.character.includes(q) || (d.meaning || '').toLowerCase().includes(ql) || (d.pinyin || '').toLowerCase().includes(ql));
  }

  const renderCard = ({ item }: { item: Draft }) => {
    const st = progress[item.character];
    return (
      <Pressable style={s.cell} onPress={() => router.push(`/card/${encodeURIComponent(item.character)}`)}>
        <Image source={cardImageSource(item.character)} style={s.thumb} contentFit="cover" contentPosition="top" transition={200} />
        <View style={s.cellFoot}>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1}><Text style={s.han}>{item.character}</Text> <Text style={s.pin}>{item.pinyin}</Text></Text>
            <Text style={s.mean} numberOfLines={1}>{item.meaning}</Text>
          </View>
          {st === 'known'
            ? <Ionicons name="checkmark-circle" size={20} color={C.success} />
            : st === 'studied'
              ? <View style={[s.ring, { borderColor: C.primary }]} />
              : <View style={[s.ring, { borderColor: C.borderStrong }]} />}
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      <View style={s.header}>
        <View style={s.segment}>
          {LEVELS.map((lv) => (
            <Pressable key={lv.id} onPress={() => { setLevel(lv.id); setCat(''); }} style={[s.seg, level === lv.id && s.segOn]}>
              <Text style={[s.segText, level === lv.id && s.segTextOn]}>{lv.tag}</Text>
            </Pressable>
          ))}
        </View>
        <View style={s.searchBox}>
          <Ionicons name="search" size={16} color={C.subtle} />
          <TextInput value={q} onChangeText={setQ} placeholder="Ханз · пиньин · утга" placeholderTextColor={C.subtle} style={s.search} autoCapitalize="none" />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
          <Chip label="Бүгд" active={!cat} onPress={() => setCat('')} />
          {cats.map((c) => <Chip key={c.slug} label={`${c.icon || ''} ${c.name}`} active={cat === c.slug} onPress={() => setCat(c.slug)} />)}
        </ScrollView>
      </View>

      {loading ? (
        <ActivityIndicator color={C.brand} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={items}
          renderItem={renderCard}
          keyExtractor={(d) => d.character}
          numColumns={2}
          columnWrapperStyle={{ gap: 12, paddingHorizontal: 16 }}
          contentContainerStyle={{ gap: 12, paddingVertical: 14, paddingBottom: 24 }}
          ListEmptyComponent={<Text style={s.empty}>Энэ шүүлтэд ханз алга.</Text>}
        />
      )}
    </SafeAreaView>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[s.chip, active ? s.chipOn : s.chipOff]}>
      <Text style={[s.chipText, { color: active ? C.brandInk : C.muted }]}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingTop: 8, gap: 10, borderBottomWidth: 1, borderBottomColor: C.border, paddingBottom: 10 },
  segment: { flexDirection: 'row', backgroundColor: C.sunken, borderRadius: radius.full, padding: 4, alignSelf: 'flex-start' },
  seg: { paddingHorizontal: 18, height: 34, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: C.surface },
  segText: { fontSize: 13, fontWeight: '600', color: C.soft },
  segTextOn: { color: C.text },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: C.borderStrong, borderRadius: radius.md, backgroundColor: C.surface, paddingHorizontal: 12, height: 40 },
  search: { flex: 1, fontSize: 14, color: C.text, height: 40 },
  chip: { paddingHorizontal: 12, height: 32, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: C.brandWeak },
  chipOff: { backgroundColor: C.surface2 },
  chipText: { fontSize: 13, fontWeight: '600' },
  cell: { flex: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: radius.lg, overflow: 'hidden' },
  thumb: { width: '100%', aspectRatio: 4 / 3, backgroundColor: C.surface2 },
  cellFoot: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: C.divider },
  han: { fontSize: 17, fontWeight: '700', color: C.text },
  pin: { fontSize: 13, color: C.brand, fontWeight: '600' },
  mean: { fontSize: 12, color: C.soft, marginTop: 1 },
  ring: { width: 20, height: 20, borderRadius: 10, borderWidth: 2 },
  empty: { textAlign: 'center', color: C.soft, marginTop: 40 },
});
