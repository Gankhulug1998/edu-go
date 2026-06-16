import { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { WebView } from 'react-native-webview';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { useCatalog } from '@/lib/catalog';
import { api, cardImageSource } from '@/lib/api';
import { C, radius } from '@/lib/theme';

export default function CardScreen() {
  const params = useLocalSearchParams<{ character: string }>();
  const raw = Array.isArray(params.character) ? params.character[0] : params.character || '';
  const ch = useMemo(() => { try { return decodeURIComponent(raw); } catch { return raw; } }, [raw]);
  const { progress, setStatus } = useAuth();
  const { drafts } = useCatalog();
  const router = useRouter();
  const [tab, setTab] = useState<'card' | 'write'>('card');
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    let alive = true;
    setData(null);
    api.card(ch).then((d) => { if (alive) setData(d.data); }).catch(() => {});
    return () => { alive = false; };
  }, [ch]);

  const known = progress[ch] === 'known';
  const idx = drafts.findIndex((d) => d.character === ch);
  const nav = (dir: number) => { const nx = drafts[idx + dir]; if (nx) router.replace(`/card/${encodeURIComponent(nx.character)}`); };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['bottom']}>
      <View style={s.tabs}>
        <Pressable onPress={() => setTab('card')} style={[s.tab, tab === 'card' && s.tabOn]}><Text style={[s.tabText, tab === 'card' && s.tabTextOn]}>Карт</Text></Pressable>
        <Pressable onPress={() => setTab('write')} style={[s.tab, tab === 'write' && s.tabOn]}><Text style={[s.tabText, tab === 'write' && s.tabTextOn]}>Бичих дасгал</Text></Pressable>
        <View style={{ flex: 1 }} />
        <Pressable onPress={() => router.back()} style={s.close}><Ionicons name="close" size={22} color={C.soft} /></Pressable>
      </View>

      {tab === 'card' ? (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
          <Image source={cardImageSource(ch)} style={s.cardImg} contentFit="contain" transition={200} />
          {!data ? <ActivityIndicator color={C.brand} style={{ marginTop: 20 }} /> : <CardMeta data={data} />}
        </ScrollView>
      ) : (
        <WriteView ch={ch} onComplete={() => { if (progress[ch] !== 'known') setStatus(ch, 'studied'); }} />
      )}

      <View style={s.bar}>
        <Pressable style={[s.known, known ? s.knownOn : s.knownOff]} onPress={() => setStatus(ch, known ? null : 'known')}>
          <Ionicons name={known ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={known ? C.white : C.text} />
          <Text style={[s.knownText, { color: known ? C.white : C.text }]}>{known ? 'Мэдсэн' : 'Мэдсэн гэж тэмдэглэх'}</Text>
        </Pressable>
        <Pressable style={s.navBtn} onPress={() => nav(-1)} disabled={idx <= 0}><Ionicons name="chevron-back" size={20} color={idx <= 0 ? C.subtle : C.text} /></Pressable>
        <Pressable style={s.navBtn} onPress={() => nav(1)} disabled={idx >= drafts.length - 1}><Ionicons name="chevron-forward" size={20} color={idx >= drafts.length - 1 ? C.subtle : C.text} /></Pressable>
      </View>
    </SafeAreaView>
  );
}

function CardMeta({ data }: { data: any }) {
  const parts: any[] = data.structure?.parts || [];
  const res = data.structure?.result;
  return (
    <View style={{ gap: 16, marginTop: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <Text style={s.bigHan}>{data.character}</Text>
        <View style={{ paddingTop: 4 }}>
          <Text style={s.pinyin}>{data.pinyin}</Text>
          <Text style={s.meaning}>{data.meaning}</Text>
        </View>
      </View>
      {parts.length > 0 && (
        <Section title="Бүтэц">
          <View style={[s.box, { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }]}>
            {parts.map((p, i) => (
              <Text key={i}><Text style={s.han}>{p.char}</Text><Text style={s.dim}> ({p.label}) </Text>{i < parts.length - 1 ? <Text style={s.dim}>+ </Text> : null}</Text>
            ))}
            <Text style={s.dim}>= </Text><Text style={s.han}>{res?.char}</Text><Text style={s.dim}> ({res?.label})</Text>
          </View>
        </Section>
      )}
      {!!data.story && <Section title="Санааны түүх"><View style={s.story}><Text style={s.storyText}>{data.story}</Text></View></Section>}
      {!!data.example?.word && (
        <Section title="Жишээ үг">
          <View style={[s.box, { backgroundColor: C.brandWeak }]}>
            <Text><Text style={s.exWord}>{data.example.word}</Text> <Text style={s.pin}>{data.example.pinyin}</Text></Text>
            <Text style={s.dim}>{data.example.translation}</Text>
          </View>
        </Section>
      )}
    </View>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <View><Text style={s.eyebrow}>{title}</Text>{children}</View>;
}

function WriteView({ ch, onComplete }: { ch: string; onComplete: () => void }) {
  const html = buildWriterHtml(ch);
  return (
    <WebView
      originWhitelist={['*']}
      source={{ html }}
      style={{ flex: 1, backgroundColor: C.bg }}
      javaScriptEnabled
      domStorageEnabled
      onMessage={(e) => { try { if (JSON.parse(e.nativeEvent.data)?.type === 'complete') onComplete(); } catch {} }}
    />
  );
}

function buildWriterHtml(ch: string) {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>html,body{margin:0;height:100%;font-family:-apple-system,'Segoe UI',sans-serif;background:#FBF8F4;color:#1C1A17;-webkit-user-select:none;user-select:none}
.col{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px;box-sizing:border-box}
#wrap{position:relative;width:280px;height:280px;border:2px solid #E0D5C5;border-radius:16px;background:#fff}
#grid{position:absolute;inset:0} #t{position:absolute;inset:0}
#status{height:24px;margin:16px 0;font-size:15px;font-weight:600;color:#82828E}
.btns{display:flex;gap:10px} button{font:inherit;font-weight:600;border:none;border-radius:12px;padding:12px 18px;cursor:pointer}
.ghost{background:#fff;border:1px solid #E0D5C5;color:#1C1A17}.pri{background:#F2A007;color:#1C1A17}
.hint{color:#A7A6AF;font-size:12px;margin-top:12px}</style></head><body><div class="col">
<div id="wrap"><svg id="grid" viewBox="0 0 280 280"><g stroke="#E0D5C5" stroke-width="1" stroke-dasharray="6 6"><line x1="140" y1="6" x2="140" y2="274"/><line x1="6" y1="140" x2="274" y2="140"/></g></svg><div id="t"></div></div>
<div id="status"></div>
<div class="btns"><button class="ghost" onclick="anim()">Дараалал үзүүлэх</button><button class="pri" onclick="quiz()">Бичиж дасгалла</button></div>
<div class="hint">Зурлага бүрийг зөв дарааллаар нь зур.</div></div>
<script src="https://cdn.jsdelivr.net/npm/hanzi-writer@3.5/dist/hanzi-writer.min.js"></script>
<script>
var CH=${JSON.stringify(ch)},st=document.getElementById('status'),w;
function post(m){if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify(m));}
function mk(){document.getElementById('t').innerHTML='';w=HanziWriter.create('t',CH,{width:280,height:280,padding:12,showCharacter:false,showOutline:true,showHintAfterMisses:2,strokeColor:'#1C1A17',outlineColor:'#E0D5C5',drawingColor:'#F2A007',strokeAnimationSpeed:1.1,delayBetweenStrokes:160,charDataLoader:function(c,onLoad,onErr){fetch('https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0.1/'+c+'.json').then(function(r){if(!r.ok)throw 0;return r.json();}).then(onLoad).catch(function(){st.textContent='Энэ ханзны зурлага олдсонгүй.';onErr&&onErr();});}});setTimeout(anim,200);}
function anim(){if(w){st.textContent='';w.animateCharacter();}}
function quiz(){if(!w)return;st.textContent='Эхний зурлагаас эхэл…';w.quiz({leniency:1.0,showHintAfterMisses:2,onMistake:function(d){st.innerHTML='<span style="color:#B91C1C">Буруу — зурлага '+(d.strokeNum+1)+'-ийг дахин зур</span>';},onCorrectStroke:function(d){st.innerHTML='<span style="color:#15803C">Зөв! '+d.strokesRemaining+' зурлага үлдлээ</span>';},onComplete:function(d){st.innerHTML='<span style="color:#15803C;font-weight:700">✓ Бүгд зөв! ('+d.totalMistakes+' алдаа)</span>';post({type:'complete'});}});}
mk();
</script></body></html>`;
}

const s = StyleSheet.create({
  tabs: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.divider },
  tab: { paddingHorizontal: 14, height: 36, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  tabOn: { backgroundColor: C.surface2 },
  tabText: { fontSize: 14, fontWeight: '600', color: C.soft },
  tabTextOn: { color: C.text },
  close: { width: 36, height: 36, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  cardImg: { width: '100%', aspectRatio: 4 / 3, borderRadius: radius.lg, backgroundColor: C.surface2 },
  bigHan: { fontFamily: undefined, fontSize: 64, fontWeight: '700', color: C.text, lineHeight: 68 },
  pinyin: { fontSize: 18, fontWeight: '600', color: C.brand },
  meaning: { fontSize: 16, color: C.muted, marginTop: 2 },
  eyebrow: { fontSize: 12, fontWeight: '700', color: C.brandInk, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  box: { backgroundColor: C.surface2, borderRadius: radius.md, padding: 12 },
  han: { fontSize: 18, fontWeight: '700', color: C.text },
  dim: { fontSize: 14, color: C.soft },
  pin: { fontSize: 14, color: C.brand, fontWeight: '600' },
  story: { borderLeftWidth: 3, borderLeftColor: C.primary, backgroundColor: C.primaryWeak, borderRadius: radius.md, padding: 14 },
  storyText: { fontSize: 15, lineHeight: 24, color: C.muted },
  exWord: { fontSize: 20, fontWeight: '700', color: C.text },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.surface },
  known: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46, borderRadius: radius.md },
  knownOn: { backgroundColor: C.brand },
  knownOff: { backgroundColor: C.primary },
  knownText: { fontWeight: '700', fontSize: 15 },
  navBtn: { width: 46, height: 46, borderRadius: radius.md, borderWidth: 1, borderColor: C.borderStrong, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
});
