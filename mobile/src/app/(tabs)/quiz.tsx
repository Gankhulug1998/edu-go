import { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { useCatalog, LEVELS } from '@/lib/catalog';
import { buildQuiz, scoreMessage, QuizQuestion } from '@/lib/quiz';
import { C, radius } from '@/lib/theme';

type Phase = 'setup' | 'play' | 'result';

export default function Quiz() {
  const { drafts } = useCatalog();
  const { progress, setStatus } = useAuth();
  const [phase, setPhase] = useState<Phase>('setup');
  const [scope, setScope] = useState<string>('');
  const [qs, setQs] = useState<QuizQuestion[]>([]);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [correct, setCorrect] = useState<string[]>([]);

  const start = (level: number | null, label: string) => {
    const pool = level ? drafts.filter((d) => d.level === level) : drafts;
    const built = buildQuiz(pool, 10);
    if (!built.length) return;
    setScope(label); setQs(built); setI(0); setPicked(null); setScore(0); setCorrect([]); setPhase('play');
  };

  const pick = (opt: string) => {
    if (picked) return;
    setPicked(opt);
    const q = qs[i];
    if (opt === q.answer) { setScore((s) => s + 1); setCorrect((c) => [...c, q.char]); }
  };

  const next = () => {
    if (i + 1 >= qs.length) {
      correct.forEach((ch) => { if (progress[ch] !== 'known') setStatus(ch, 'studied'); });
      setPhase('result');
    } else { setI(i + 1); setPicked(null); }
  };

  // ── SETUP ──
  if (phase === 'setup') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <View style={s.iconTile}><Ionicons name="ribbon-outline" size={28} color={C.primaryInk} /></View>
          <Text style={s.h1}>Шалгалт</Text>
          <Text style={s.sub}>Санамсаргүй 10 асуултаар ханзны мэдлэгээ шалга. Утга, ханз, пиньин холилдоно.</Text>
          <View style={{ gap: 12, marginTop: 24 }}>
            <ScopeCard title="Бүх ханз" desc={`${drafts.length} ханзаас`} color={C.primary} onPress={() => start(null, 'Бүх ханз')} />
            {LEVELS.map((lv) => (
              <ScopeCard key={lv.id} title={`${lv.tag} · ${lv.name}`} desc={`${drafts.filter((d) => d.level === lv.id).length} ханз`} color={lv.color} onPress={() => start(lv.id, lv.tag)} />
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── RESULT ──
  if (phase === 'result') {
    const pct = Math.round((score / qs.length) * 100);
    const learned = correct.length;
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <View style={[s.scoreCircle, { borderColor: pct >= 70 ? C.success : pct >= 50 ? C.primary : C.danger }]}>
            <Text style={s.scoreNum}>{score}<Text style={s.scoreDen}>/{qs.length}</Text></Text>
            <Text style={s.scorePct}>{pct}%</Text>
          </View>
          <Text style={s.resultMsg}>{scoreMessage(pct)}</Text>
          {learned > 0 && <Text style={s.resultSub}>{learned} ханзыг зөв таньж "сурсан" болголоо ✓</Text>}
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 28 }}>
            <Pressable style={[s.btn, s.btnGhost]} onPress={() => setPhase('setup')}><Text style={s.btnGhostText}>Дуусгах</Text></Pressable>
            <Pressable style={[s.btn, s.btnPri]} onPress={() => start(scope === 'Бүх ханз' ? null : LEVELS.find((l) => l.tag === scope)?.id ?? null, scope)}><Text style={s.btnPriText}>Дахин</Text></Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ── PLAY ──
  const q = qs[i];
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      <View style={{ flex: 1, padding: 20 }}>
        <View style={s.topRow}>
          <Pressable onPress={() => setPhase('setup')} hitSlop={10}><Ionicons name="close" size={24} color={C.soft} /></Pressable>
          <View style={s.progTrack}><View style={[s.progFill, { width: `${((i + (picked ? 1 : 0)) / qs.length) * 100}%` }]} /></View>
          <Text style={s.count}>{i + 1}/{qs.length}</Text>
        </View>

        <Text style={s.qLabel}>{q.question}</Text>
        <View style={s.prompt}>
          <Text style={q.promptHan ? s.promptHan : s.promptText}>{q.promptMain}</Text>
          {!!q.promptSub && <Text style={s.promptSub}>{q.promptSub}</Text>}
        </View>

        <View style={{ gap: 12, marginTop: 8 }}>
          {q.options.map((opt) => {
            const shown = !!picked;
            const isAnswer = opt === q.answer;
            const isPicked = opt === picked;
            return (
              <Pressable
                key={opt}
                style={[
                  s.opt,
                  shown && isAnswer && s.optCorrect,
                  shown && isPicked && !isAnswer && s.optWrong,
                  shown && !isAnswer && !isPicked && s.optDim,
                ]}
                onPress={() => pick(opt)}
                disabled={shown}>
                <Text
                  style={[
                    q.optionHan ? s.optHan : s.optTextBase,
                    shown && isAnswer && s.optCorrectText,
                    shown && isPicked && !isAnswer && s.optWrongText,
                  ]}>
                  {opt}
                </Text>
                {shown && isAnswer && <Ionicons name="checkmark-circle" size={20} color={C.success} />}
                {shown && isPicked && !isAnswer && <Ionicons name="close-circle" size={20} color={C.danger} />}
              </Pressable>
            );
          })}
        </View>

        <View style={{ flex: 1 }} />
        {picked && (
          <Pressable style={[s.btn, s.btnPri]} onPress={next}>
            <Text style={s.btnPriText}>{i + 1 >= qs.length ? 'Дүн харах' : 'Дараах'}</Text>
            <Ionicons name="arrow-forward" size={18} color={C.text} />
          </Pressable>
        )}
      </View>
    </SafeAreaView>
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
  iconTile: { width: 56, height: 56, borderRadius: radius.lg, backgroundColor: C.primaryWeak, alignItems: 'center', justifyContent: 'center' },
  h1: { fontSize: 28, fontWeight: '800', color: C.text, marginTop: 14 },
  sub: { fontSize: 15, color: C.muted, lineHeight: 22, marginTop: 6 },
  scope: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: radius.lg, padding: 16 },
  scopeDot: { width: 12, height: 12, borderRadius: 6 },
  scopeTitle: { fontSize: 16, fontWeight: '700', color: C.text },
  scopeDesc: { fontSize: 13, color: C.soft, marginTop: 2 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 },
  progTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: C.sunken, overflow: 'hidden' },
  progFill: { height: 8, borderRadius: 4, backgroundColor: C.primary },
  count: { fontSize: 13, fontWeight: '700', color: C.soft, fontVariant: ['tabular-nums'] },
  qLabel: { fontSize: 15, fontWeight: '600', color: C.muted, textAlign: 'center' },
  prompt: { alignItems: 'center', paddingVertical: 28 },
  promptHan: { fontSize: 80, fontWeight: '700', color: C.text },
  promptText: { fontSize: 30, fontWeight: '700', color: C.text, textAlign: 'center' },
  promptSub: { fontSize: 16, color: C.brand, fontWeight: '600', marginTop: 8 },
  opt: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 58, paddingHorizontal: 16, borderRadius: radius.lg, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.surface },
  optText: { color: C.text },
  optTextBase: { fontSize: 17, fontWeight: '600', color: C.text },
  optHan: { fontSize: 30, fontWeight: '700', color: C.text },
  optCorrect: { borderColor: C.success, backgroundColor: C.successWeak },
  optCorrectText: { color: C.success },
  optWrong: { borderColor: C.danger, backgroundColor: C.dangerWeak },
  optWrongText: { color: C.danger },
  optDim: { opacity: 0.5 },
  optDimText: {},
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, borderRadius: radius.md, paddingHorizontal: 24 },
  btnPri: { backgroundColor: C.primary, flex: 1 },
  btnPriText: { color: C.text, fontWeight: '700', fontSize: 16 },
  btnGhost: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderStrong, flex: 1 },
  btnGhostText: { color: C.text, fontWeight: '700', fontSize: 16 },
  scoreCircle: { width: 160, height: 160, borderRadius: 80, borderWidth: 8, alignItems: 'center', justifyContent: 'center' },
  scoreNum: { fontSize: 44, fontWeight: '800', color: C.text },
  scoreDen: { fontSize: 24, color: C.soft },
  scorePct: { fontSize: 16, color: C.muted, fontWeight: '600' },
  resultMsg: { fontSize: 22, fontWeight: '800', color: C.text, marginTop: 24 },
  resultSub: { fontSize: 14, color: C.success, marginTop: 8 },
});
