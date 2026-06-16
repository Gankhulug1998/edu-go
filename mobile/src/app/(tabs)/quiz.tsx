import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/lib/auth';
import { useCatalog, LEVELS } from '@/lib/catalog';
import { api, SrsState } from '@/lib/api';
import { selectCards, buildQuestions, scoreMessage, QuizQuestion, QMode } from '@/lib/quiz';
import { C, radius } from '@/lib/theme';

const COUNT = 12;

const MODE_META: Record<QMode, { label: string; color: string; weak: string }> = {
  meaning: { label: 'Утга', color: C.brand, weak: C.brandWeak },
  character: { label: 'Ханз', color: C.t1, weak: C.t1Weak },
  pinyin: { label: 'Пиньин', color: C.primaryStrong, weak: C.primaryWeak },
  tone: { label: 'Аялгуу', color: C.brand, weak: C.brandWeak },
  image: { label: 'Дүрс', color: C.t1, weak: C.t1Weak },
  cloze: { label: 'Нөхөх', color: C.primaryStrong, weak: C.primaryWeak },
  structure: { label: 'Бүтэц', color: C.brand, weak: C.brandWeak },
};

type Phase = 'setup' | 'loading' | 'play' | 'result';

export default function Quiz() {
  const { drafts } = useCatalog();
  const { user, refresh } = useAuth();
  const [phase, setPhase] = useState<Phase>('setup');
  const [stats, setStats] = useState<SrsState['stats'] | null>(null);

  const [scopeLevel, setScopeLevel] = useState<number | null>(null);
  const [qs, setQs] = useState<QuizQuestion[]>([]);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);

  const [score, setScore] = useState(0);
  const [xp, setXp] = useState(0);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [gain, setGain] = useState(0);

  const fb = useRef(new Animated.Value(0)).current;

  const loadStats = useCallback(async () => {
    if (!user) { setStats(null); return; }
    try { setStats((await api.srs()).stats); } catch { setStats(null); }
  }, [user]);
  useEffect(() => { if (phase === 'setup') loadStats(); }, [phase, loadStats]);

  const start = async (level: number | null) => {
    if (!drafts.length) return;
    setPhase('loading');
    let items: SrsState['items'] = {};
    if (user) { try { const st = await api.srs(); items = st.items; setStats(st.stats); } catch {} }
    const chosen = selectCards(drafts, items, COUNT, level ?? undefined);
    const settled = await Promise.allSettled(chosen.map((d) => api.fullCard(d.character)));
    const full = settled.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
    const built = buildQuestions(full, drafts);
    if (!built.length) { setPhase('setup'); return; }
    setScopeLevel(level); setQs(built);
    setI(0); setPicked(null); setScore(0); setXp(0); setCombo(0); setMaxCombo(0); setGain(0);
    setPhase('play');
  };

  const pick = (opt: string) => {
    if (picked) return;
    const q = qs[i];
    const ok = opt === q.answer;
    setPicked(opt);
    try { Haptics.notificationAsync(ok ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning); } catch {}
    if (ok) {
      const c = combo + 1;
      const g = 10 + Math.min(c - 1, 5) * 2;
      setCombo(c); setMaxCombo((m) => Math.max(m, c)); setScore((s) => s + 1); setXp((x) => x + g); setGain(g);
    } else { setCombo(0); setGain(0); }
    if (user) api.grade(q.card.character, ok ? 2 : 0);
    fb.setValue(0);
    Animated.timing(fb, { toValue: 1, duration: 240, useNativeDriver: true }).start();
  };

  const next = () => {
    if (i + 1 >= qs.length) {
      if (user) { refresh(); loadStats(); }
      setPhase('result');
    } else { setI(i + 1); setPicked(null); }
  };

  // ───────────── SETUP ─────────────
  if (phase === 'setup') {
    const due = stats?.dueCount ?? 0;
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
          <Text style={s.h1}>Дасгал</Text>
          <Text style={s.sub}>Зайны давталтаар (SRS) ханзаа удаан санах ой руугаа суулга.</Text>

          <View style={s.hero}>
            <View style={s.heroTop}>
              <View style={s.heroIcon}><Ionicons name="flash" size={20} color={C.primaryInk} /></View>
              <Text style={s.heroLabel}>Ухаалаг давталт</Text>
            </View>
            <Text style={s.heroBig}>{user ? (due > 0 ? `${due} карт` : 'Шинэ хичээл') : 'Туршиж үзэх'}</Text>
            <Text style={s.heroDesc}>
              {user
                ? due > 0 ? 'Давтах цаг болсон картууд хүлээж байна' : 'Өнөөдөр давтах карт алга — шинэ ханз сурцгаая'
                : 'Нэвтэрвэл давталт, цуваа, оноо хадгалагдана'}
            </Text>
            {user && stats && (
              <View style={s.statRow}>
                <Stat icon="flame" tint={C.primaryStrong} value={`${stats.streak}`} label="өдөр" />
                <View style={s.statSep} />
                <Stat icon="checkmark-done" tint={C.t1} value={`${stats.today.reviews}/${stats.today.goal}`} label="өнөөдөр" />
                <View style={s.statSep} />
                <Stat icon="star" tint={C.primary} value={`${stats.totalXp}`} label="XP" />
              </View>
            )}
            <Pressable style={s.heroBtn} onPress={() => start(null)} disabled={!drafts.length}>
              <Text style={s.heroBtnText}>Эхлүүлэх</Text>
              <Ionicons name="arrow-forward" size={18} color={C.text} />
            </Pressable>
          </View>

          <Text style={s.section}>Түвшингээр дасгал</Text>
          <View style={{ gap: 12 }}>
            {LEVELS.map((lv) => (
              <ScopeCard key={lv.id} title={`${lv.tag} · ${lv.name}`} desc={`${drafts.filter((d) => d.level === lv.id).length} ханз`} color={lv.color} onPress={() => start(lv.id)} />
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ───────────── LOADING ─────────────
  if (phase === 'loading') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 }}>
          <ActivityIndicator color={C.primary} size="large" />
          <Text style={{ color: C.muted, fontSize: 15, fontWeight: '600' }}>Дасгал бэлдэж байна…</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ───────────── RESULT ─────────────
  if (phase === 'result') {
    const pct = qs.length ? Math.round((score / qs.length) * 100) : 0;
    const ring = pct >= 70 ? C.success : pct >= 50 ? C.primary : C.danger;
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <View style={[s.scoreCircle, { borderColor: ring }]}>
            <Text style={s.scoreNum}>{score}<Text style={s.scoreDen}>/{qs.length}</Text></Text>
            <Text style={s.scorePct}>{pct}%</Text>
          </View>
          <Text style={s.resultMsg}>{scoreMessage(pct)}</Text>

          <View style={s.resultStats}>
            <ResultChip icon="star" tint={C.primary} value={`+${xp}`} label="XP" />
            <ResultChip icon="flash" tint={C.primaryStrong} value={`×${maxCombo}`} label="Дээд цуваа" />
            {user && stats && <ResultChip icon="flame" tint={C.danger} value={`${stats.streak}`} label="Өдрийн цуваа" />}
          </View>

          <View style={{ flexDirection: 'row', gap: 12, marginTop: 28, alignSelf: 'stretch' }}>
            <Pressable style={[s.btn, s.btnGhost]} onPress={() => setPhase('setup')}><Text style={s.btnGhostText}>Дуусгах</Text></Pressable>
            <Pressable style={[s.btn, s.btnPri]} onPress={() => start(scopeLevel)}><Text style={s.btnPriText}>Дахин</Text></Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ───────────── PLAY ─────────────
  const q = qs[i];
  const meta = MODE_META[q.mode];
  const shown = !!picked;
  const ok = picked === q.answer;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      <View style={{ flex: 1 }}>
        <View style={s.topRow}>
          <Pressable onPress={() => setPhase('setup')} hitSlop={10}><Ionicons name="close" size={24} color={C.soft} /></Pressable>
          <View style={s.progTrack}><View style={[s.progFill, { width: `${((i + (shown ? 1 : 0)) / qs.length) * 100}%` }]} /></View>
          {combo >= 2 ? (
            <View style={s.comboPill}><Ionicons name="flash" size={13} color={C.primaryStrong} /><Text style={s.comboText}>×{combo}</Text></View>
          ) : (
            <Text style={s.count}>{i + 1}/{qs.length}</Text>
          )}
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 6, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          <View style={s.qHead}>
            <View style={[s.modeChip, { backgroundColor: meta.weak }]}><Text style={[s.modeChipText, { color: meta.color }]}>{meta.label}</Text></View>
            <Text style={s.xpHud}><Ionicons name="star" size={12} color={C.primary} /> {xp}</Text>
          </View>
          <Text style={s.qLabel}>{q.question}</Text>

          <Prompt q={q} />

          <View style={{ gap: 11, marginTop: 4 }}>
            {q.options.map((opt) => {
              const isAnswer = opt === q.answer;
              const isPicked = opt === picked;
              return (
                <Pressable
                  key={opt}
                  onPress={() => pick(opt)}
                  disabled={shown}
                  style={[
                    s.opt,
                    shown && isAnswer && s.optCorrect,
                    shown && isPicked && !isAnswer && s.optWrong,
                    shown && !isAnswer && !isPicked && s.optDim,
                  ]}>
                  <Text style={[q.optionHan ? s.optHan : s.optTextBase, shown && isAnswer && { color: C.success }, shown && isPicked && !isAnswer && { color: C.danger }]}>{opt}</Text>
                  {shown && isAnswer && <Ionicons name="checkmark-circle" size={20} color={C.success} />}
                  {shown && isPicked && !isAnswer && <Ionicons name="close-circle" size={20} color={C.danger} />}
                </Pressable>
              );
            })}
          </View>

          {shown && <Feedback q={q} ok={ok} gain={gain} anim={fb} onNext={next} last={i + 1 >= qs.length} />}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

function Prompt({ q }: { q: QuizQuestion }) {
  if (q.mode === 'structure' && q.promptParts) {
    return (
      <View style={s.structWrap}>
        {q.promptParts.map((p, idx) => (
          <React.Fragment key={idx}>
            {idx > 0 && <Text style={s.structOp}>+</Text>}
            <View style={s.structPart}><Text style={s.structHan}>{p.char}</Text><Text style={s.structLabel}>{p.label}</Text></View>
          </React.Fragment>
        ))}
        <Text style={s.structOp}>=</Text>
        <View style={s.structPart}><Text style={[s.structHan, { color: C.subtle }]}>?</Text></View>
      </View>
    );
  }
  return (
    <View style={s.prompt}>
      <Text style={q.mode === 'image' ? s.emoji : q.promptHan ? s.promptHan : s.promptText}>{q.promptMain}</Text>
      {!!q.promptSub && <Text style={s.promptSub}>{q.promptSub}</Text>}
    </View>
  );
}

function Feedback({ q, ok, gain, anim, onNext, last }: { q: QuizQuestion; ok: boolean; gain: number; anim: Animated.Value; onNext: () => void; last: boolean }) {
  const c = q.card;
  const hasStruct = !!(c.structure && c.structure.parts && c.structure.parts.length >= 2);
  return (
    <Animated.View style={[s.fb, { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }]}>
      <View style={[s.fbBanner, { backgroundColor: ok ? C.successWeak : C.dangerWeak }]}>
        <Ionicons name={ok ? 'checkmark-circle' : 'close-circle'} size={20} color={ok ? C.success : C.danger} />
        <Text style={[s.fbBannerText, { color: ok ? C.success : C.danger }]}>{ok ? 'Зөв!' : `Зөв хариу: ${q.answer}`}</Text>
        {ok && gain > 0 && <View style={s.fbXpPill}><Text style={s.fbXpText}>+{gain} XP</Text></View>}
      </View>

      <View style={s.fbCard}>
        <View style={s.fbHead}>
          <Text style={s.fbHan}>{c.character}</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.fbPinyin}>{c.pinyin}</Text>
            <Text style={s.fbMeaning}>{c.meaning}</Text>
          </View>
          {!!c.images?.icon?.emoji && <Text style={s.fbEmoji}>{c.images.icon.emoji}</Text>}
        </View>
        {hasStruct && (
          <Text style={s.fbStruct}>{c.structure!.parts.map((p) => p.char).join('  +  ')}  →  {c.structure!.result.char}</Text>
        )}
        {!!c.story && <Text style={s.fbStory}>{c.story}</Text>}
        {!!c.example?.word && (
          <View style={s.fbExample}>
            <Text style={s.fbExHan}>{c.example.word}</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.fbExPinyin}>{c.example.pinyin}</Text>
              <Text style={s.fbExTr}>{c.example.translation}</Text>
            </View>
          </View>
        )}
      </View>

      <Pressable style={[s.btn, s.btnPri]} onPress={onNext}>
        <Text style={s.btnPriText}>{last ? 'Дүн харах' : 'Дараах'}</Text>
        <Ionicons name="arrow-forward" size={18} color={C.text} />
      </Pressable>
    </Animated.View>
  );
}

function Stat({ icon, tint, value, label }: { icon: any; tint: string; value: string; label: string }) {
  return (
    <View style={s.stat}>
      <Ionicons name={icon} size={15} color={tint} />
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

function ResultChip({ icon, tint, value, label }: { icon: any; tint: string; value: string; label: string }) {
  return (
    <View style={s.rChip}>
      <Ionicons name={icon} size={18} color={tint} />
      <Text style={s.rChipValue}>{value}</Text>
      <Text style={s.rChipLabel}>{label}</Text>
    </View>
  );
}

function ScopeCard({ title, desc, color, onPress }: { title: string; desc: string; color: string; onPress: () => void }) {
  return (
    <Pressable style={s.scope} onPress={onPress}>
      <View style={[s.scopeDot, { backgroundColor: color }]} />
      <View style={{ flex: 1 }}>
        <Text style={s.scopeTitle}>{title}</Text>
        <Text style={s.scopeDesc}>{desc}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={C.subtle} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  h1: { fontSize: 28, fontWeight: '800', color: C.text },
  sub: { fontSize: 15, color: C.muted, lineHeight: 22, marginTop: 6 },

  hero: { backgroundColor: C.primaryWeak, borderRadius: radius.xl, borderWidth: 1, borderColor: '#F6E4B8', padding: 20, marginTop: 22 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#FBE3AE', alignItems: 'center', justifyContent: 'center' },
  heroLabel: { fontSize: 13, fontWeight: '800', color: C.primaryInk, letterSpacing: 0.3, textTransform: 'uppercase' },
  heroBig: { fontSize: 32, fontWeight: '800', color: C.text, marginTop: 14 },
  heroDesc: { fontSize: 14, color: '#8A6A2E', marginTop: 4, lineHeight: 20 },
  statRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.55)', borderRadius: radius.md, paddingVertical: 12, marginTop: 16 },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { fontSize: 17, fontWeight: '800', color: C.text },
  statLabel: { fontSize: 11, color: '#8A6A2E', fontWeight: '600' },
  statSep: { width: 1, height: 28, backgroundColor: '#F0DCB0' },
  heroBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, borderRadius: radius.md, backgroundColor: C.primary, marginTop: 18 },
  heroBtnText: { color: C.text, fontWeight: '800', fontSize: 16 },

  section: { fontSize: 13, fontWeight: '800', color: C.soft, letterSpacing: 0.4, textTransform: 'uppercase', marginTop: 28, marginBottom: 12 },
  scope: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: radius.lg, padding: 16 },
  scopeDot: { width: 12, height: 12, borderRadius: 6 },
  scopeTitle: { fontSize: 16, fontWeight: '700', color: C.text },
  scopeDesc: { fontSize: 13, color: C.soft, marginTop: 2 },

  topRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  progTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: C.sunken, overflow: 'hidden' },
  progFill: { height: 8, borderRadius: 4, backgroundColor: C.primary },
  count: { fontSize: 13, fontWeight: '700', color: C.soft, fontVariant: ['tabular-nums'], minWidth: 38, textAlign: 'right' },
  comboPill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: C.primaryWeak, borderRadius: radius.full, paddingHorizontal: 9, paddingVertical: 4 },
  comboText: { fontSize: 13, fontWeight: '800', color: C.primaryInk },

  qHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  modeChip: { borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 5 },
  modeChipText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.3 },
  xpHud: { fontSize: 14, fontWeight: '800', color: C.muted },
  qLabel: { fontSize: 16, fontWeight: '600', color: C.muted, textAlign: 'center' },

  prompt: { alignItems: 'center', paddingVertical: 22 },
  promptHan: { fontSize: 78, fontWeight: '700', color: C.text },
  promptText: { fontSize: 30, fontWeight: '700', color: C.text, textAlign: 'center' },
  promptSub: { fontSize: 16, color: C.brand, fontWeight: '600', marginTop: 8 },
  emoji: { fontSize: 92 },

  structWrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 8, paddingVertical: 26 },
  structPart: { alignItems: 'center', backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 10, minWidth: 64 },
  structHan: { fontSize: 40, fontWeight: '700', color: C.text },
  structLabel: { fontSize: 12, color: C.soft, marginTop: 2 },
  structOp: { fontSize: 26, fontWeight: '700', color: C.subtle },

  opt: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 56, paddingHorizontal: 16, borderRadius: radius.lg, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.surface },
  optTextBase: { fontSize: 17, fontWeight: '600', color: C.text },
  optHan: { fontSize: 30, fontWeight: '700', color: C.text },
  optCorrect: { borderColor: C.success, backgroundColor: C.successWeak },
  optWrong: { borderColor: C.danger, backgroundColor: C.dangerWeak },
  optDim: { opacity: 0.5 },

  fb: { marginTop: 18 },
  fbBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 11 },
  fbBannerText: { fontSize: 15, fontWeight: '800', flex: 1 },
  fbXpPill: { backgroundColor: C.primary, borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 3 },
  fbXpText: { fontSize: 12, fontWeight: '800', color: C.text },
  fbCard: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: radius.lg, padding: 16, marginTop: 10, gap: 12 },
  fbHead: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  fbHan: { fontSize: 46, fontWeight: '700', color: C.text },
  fbPinyin: { fontSize: 16, fontWeight: '700', color: C.brand },
  fbMeaning: { fontSize: 15, color: C.text, marginTop: 2 },
  fbEmoji: { fontSize: 34 },
  fbStruct: { fontSize: 17, fontWeight: '600', color: C.muted, textAlign: 'center', backgroundColor: C.surface2, borderRadius: radius.sm, paddingVertical: 8 },
  fbStory: { fontSize: 14, color: C.muted, lineHeight: 21 },
  fbExample: { flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: C.divider, paddingTop: 12 },
  fbExHan: { fontSize: 24, fontWeight: '700', color: C.text },
  fbExPinyin: { fontSize: 13, fontWeight: '600', color: C.brand },
  fbExTr: { fontSize: 14, color: C.muted, marginTop: 1 },

  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, borderRadius: radius.md, paddingHorizontal: 24 },
  btnPri: { backgroundColor: C.primary, flex: 1, marginTop: 14 },
  btnPriText: { color: C.text, fontWeight: '800', fontSize: 16 },
  btnGhost: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderStrong, flex: 1 },
  btnGhostText: { color: C.text, fontWeight: '700', fontSize: 16 },

  scoreCircle: { width: 156, height: 156, borderRadius: 78, borderWidth: 8, alignItems: 'center', justifyContent: 'center' },
  scoreNum: { fontSize: 42, fontWeight: '800', color: C.text },
  scoreDen: { fontSize: 22, color: C.soft },
  scorePct: { fontSize: 16, color: C.muted, fontWeight: '600' },
  resultMsg: { fontSize: 22, fontWeight: '800', color: C.text, marginTop: 22 },
  resultStats: { flexDirection: 'row', gap: 10, marginTop: 22, alignSelf: 'stretch' },
  rChip: { flex: 1, alignItems: 'center', gap: 3, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: radius.lg, paddingVertical: 14 },
  rChipValue: { fontSize: 19, fontWeight: '800', color: C.text },
  rChipLabel: { fontSize: 11, color: C.soft, fontWeight: '600' },
});
