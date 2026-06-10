#!/usr/bin/env python3
"""Системтэйгээр үгийн санг өсгөнө:
  1) одоо байгаа картуудад level/category/tags нэмнэ
  2) шинэ нийлмэл ханзнуудыг (зөв задаргаа, пиньин, монгол утга) нэмнэ
Дахин ажиллуулж болохоор idempotent — character-аар upsert хийнэ.
"""
import json, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
DRAFTS = ROOT / "public" / "drafts.json"

cards = json.loads(DRAFTS.read_text(encoding="utf-8"))
by_char = {c["character"]: c for c in cards}

# ── 1. Одоо байгаа 30 картын level / category / tags ───────────────────────
# (character: (level, category, [tags]))
META = {
    "林": (1, "baigal", ["radical:木"]),
    "森": (2, "baigal", ["triple", "radical:木"]),
    "明": (1, "baigal", ["radical:日"]),
    "休": (1, "uil",    ["radical:亻"]),
    "好": (1, "chanar", ["radical:女"]),
    "安": (1, "chanar", ["radical:宀"]),
    "家": (1, "xun",    ["radical:宀"]),
    "男": (1, "xun",    ["radical:田"]),
    "从": (2, "uil",    ["radical:人"]),
    "众": (2, "xun",    ["triple", "radical:人"]),
    "炎": (2, "chanar", ["triple", "radical:火"]),
    "出": (1, "uil",    []),
    "本": (1, "zuils",  ["radical:木"]),
    "末": (2, "zuils",  ["radical:木"]),
    "早": (1, "baigal", ["radical:日"]),
    "旦": (1, "baigal", ["radical:日"]),
    "字": (1, "zuils",  ["radical:宀"]),
    "信": (2, "setgel", ["radical:亻"]),
    "鸣": (2, "biye",   ["radical:口"]),
    "看": (1, "biye",   ["radical:目"]),
    "想": (2, "setgel", ["radical:心"]),
    "思": (2, "setgel", ["radical:心"]),
    "跑": (2, "uil",    ["radical:足"]),
    "跳": (2, "uil",    ["radical:足"]),
    "笑": (2, "uil",    ["radical:竹"]),
    "江": (2, "baigal", ["radical:水"]),
    "河": (2, "baigal", ["radical:水"]),
    "海": (2, "baigal", ["radical:水"]),
    "美": (1, "chanar", ["radical:羊"]),
    "鲜": (2, "chanar", ["radical:鱼"]),
}
for ch, (lvl, cat, tags) in META.items():
    if ch in by_char:
        by_char[ch]["level"] = lvl
        by_char[ch]["category"] = cat
        by_char[ch]["tags"] = tags

# ── 2. Шинэ ханзнууд ───────────────────────────────────────────────────────
def card(character, pinyin, meaning, parts, result_label, story, ex, mn_parts,
         level, category, tags, icon_emoji, formula=None):
    """parts = [(char,label),...]; ex=(word,pinyin,translation)"""
    c = {
        "character": character,
        "pinyin": pinyin,
        "meaning": meaning,
        "structure": {
            "parts": [{"char": p, "label": l} for p, l in parts],
            "result": {"char": character, "label": result_label},
        },
        "story": story,
        "example": {"word": ex[0], "pinyin": ex[1], "translation": ex[2]},
        "mnemonic": {"parts": mn_parts, "result": character, "meaning": meaning},
        "level": level,
        "category": category,
        "tags": tags,
        "images": {"icon": {"kind": "emoji", "emoji": icon_emoji}},
    }
    if formula:
        c["storyFormula"] = formula
    return c

NEW = [
    # ── Хүн ба гэр бүл (亻 / 女 гэр бүл) ──
    card("朋","péng","найз",[("月","сар"),("月","сар")],"найз",
         "Хоёр сар (月) зэрэгцэн = байнга хамт байх хань, найз нөхөр.",
         ("朋友","péngyou","найз нөхөд"),["月","月"],1,"xun",["radical:月"],"🤝","🌙 + 🌙 = 🤝"),
    card("名","míng","нэр",[("夕","үдэш"),("口","ам")],"нэр",
         "Үдэш (夕) харанхуйд хүнийг амаар (口) дуудах = нэр.",
         ("名字","míngzi","нэр"),["夕","口"],1,"xun",[],"🏷️","🌆 + 👄 = 🏷️"),
    card("你","nǐ","чи",[("亻","хүн"),("尔","чи")],"чи",
         "Хүн (亻) хэмээх радикал + 尔 = ярьж буй нөгөө хүн: чи.",
         ("你好","nǐhǎo","сайн байна уу"),["亻","尔"],1,"xun",["radical:亻"],"🫵"),
    card("他","tā","тэр",[("亻","хүн"),("也","бас")],"тэр (эр)",
         "Хүн (亻) + 也 = яриан дахь гуравдагч хүн: тэр.",
         ("他们","tāmen","тэд"),["亻","也"],1,"xun",["radical:亻"],"🧍"),
    card("们","men","-ууд (олон тоо)",[("亻","хүн"),("门","хаалга")],"олон тоо",
         "Хүн (亻) + хаалга (门) = хүмүүсийг олон тоонд оруулах нөхцөл.",
         ("我们","wǒmen","бид"),["亻","门"],1,"xun",["radical:亻"],"👥"),
    card("妈","mā","ээж",[("女","эмэгтэй"),("马","морь")],"ээж",
         "Эмэгтэй (女) + 马 (дуудлага) = ээж.",
         ("妈妈","māma","ээж"),["女","马"],1,"xun",["radical:女"],"👩","👩 + 🐴 = ❤️"),
    # ── Бие ба эрхтэн ──
    card("体","tǐ","бие",[("亻","хүн"),("本","үндэс")],"бие",
         "Хүн (亻) + үндэс (本) = хүний үндэс болсон бие махбод.",
         ("身体","shēntǐ","бие"),["亻","本"],1,"biye",["radical:亻"],"💪","🧍 + 🌳 = 💪"),
    card("泪","lèi","нулимс",[("氵","ус"),("目","нүд")],"нулимс",
         "Нүд (目) -нээс ус (氵) гоожих = нулимс.",
         ("眼泪","yǎnlèi","нулимс"),["氵","目"],2,"biye",["radical:水"],"😢","💧 + 👁️ = 😢"),
    # ── Үйл хөдлөл (口 гэр бүл) ──
    card("吃","chī","идэх",[("口","ам"),("乞","гуйх")],"идэх",
         "Ам (口) -аар хооллох үйл = идэх.",
         ("吃饭","chīfàn","хоол идэх"),["口","乞"],1,"uil",["radical:口"],"🍚","👄 + 🍚"),
    card("唱","chàng","дуулах",[("口","ам"),("昌","тод")],"дуулах",
         "Ам (口) нээж тод (昌) дуу гаргах = дуулах.",
         ("唱歌","chànggē","дуу дуулах"),["口","昌"],2,"uil",["radical:口"],"🎤","👄 + 🎶 = 🎤"),
    # ── Байгаль ба ургамал (艹 / 日 гэр бүл) ──
    card("花","huā","цэцэг",[("艹","өвс"),("化","хувирах")],"цэцэг",
         "Ургамал (艹) хувирч (化) дэлбээлэх = цэцэг.",
         ("鲜花","xiānhuā","шинэ цэцэг"),["艹","化"],1,"baigal",["radical:艹"],"🌸","🌱 + ✨ = 🌸"),
    card("草","cǎo","өвс",[("艹","өвс"),("早","эрт")],"өвс",
         "Өглөө эрт (早) ургах ногоон (艹) = өвс.",
         ("草地","cǎodì","зүлэг"),["艹","早"],1,"baigal",["radical:艹"],"🌿","🌱 + 🌅 = 🌿"),
    card("苗","miáo","соёо",[("艹","өвс"),("田","талбай")],"соёо",
         "Тариалангийн талбайд (田) ургах ногоон (艹) = соёо, нахиа.",
         ("树苗","shùmiáo","модны суулгац"),["艹","田"],2,"baigal",["radical:艹"],"🌱","🌱 + 🟫 = 🌾"),
    card("时","shí","цаг (хугацаа)",[("日","нар"),("寸","хэмжүүр")],"цаг хугацаа",
         "Нар (日) -аар цагийг хэмжих (寸) = цаг хугацаа.",
         ("时间","shíjiān","цаг хугацаа"),["日","寸"],2,"baigal",["radical:日"],"⏰","☀️ + 📏 = ⏰"),
    # ── Сэтгэл ба бодол (心 / 忄 гэр бүл) ──
    card("忘","wàng","мартах",[("亡","алга болох"),("心","сэтгэл")],"мартах",
         "Сэтгэлээс (心) алга болох (亡) = мартах.",
         ("忘记","wàngjì","мартах"),["亡","心"],2,"setgel",["radical:心"],"💭","❤️ + ❌ = 💨"),
    card("怕","pà","айх",[("忄","сэтгэл"),("白","цагаан")],"айх",
         "Сэтгэл (忄) цайх (白) = айх, эмээх.",
         ("害怕","hàipà","айх"),["忄","白"],2,"setgel",["radical:心"],"😨","❤️ + ⬜ = 😨"),
    # ── Шинж чанар ──
    card("尖","jiān","хурц үзүүр",[("小","жижиг"),("大","том")],"хурц үзүүр",
         "Дээр нь жижиг (小), доор нь том (大) = дээшээ нарийссан хурц үзүүр.",
         ("笔尖","bǐjiān","үзэгний үзүүр"),["小","大"],2,"chanar",[],"🔺","🔼"),
    # ── Гурвалсан ханз (X+X+X) ──
    card("晶","jīng","болор",[("日","нар"),("日","нар"),("日","нар")],"болор",
         "Гурван нар (日) гялалзах = болор шиг тунгалаг гэрэлтэх.",
         ("水晶","shuǐjīng","болор"),["日","日","日"],2,"chanar",["triple","radical:日"],"💎","☀️ + ☀️ + ☀️ = 💎"),
    card("品","pǐn","бараа, чанар",[("口","ам"),("口","ам"),("口","ам")],"бараа",
         "Гурван ам (口) амтлах = бараа, бүтээгдэхүүний чанар.",
         ("产品","chǎnpǐn","бүтээгдэхүүн"),["口","口","口"],2,"zuils",["triple","radical:口"],"📦","👄 + 👄 + 👄 = 📦"),
]

for c in NEW:
    by_char[c["character"]] = c  # upsert

# ── Бичих: position-оо хадгалж, шинийг ард нь ─────────────────────────────
ordered = list(cards)  # анхны эрэмбэ
seen = {c["character"] for c in ordered}
for c in NEW:
    if c["character"] not in seen:
        ordered.append(c)
        seen.add(c["character"])
# одоо байгаа объектуудыг by_char-аас шинэчилсэн хувилбараар солих
final = [by_char[c["character"]] for c in ordered]

DRAFTS.write_text(json.dumps(final, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"✓ Нийт {len(final)} карт ({len(NEW)} шинэ нэмэгдсэн)")
# тоологдол
from collections import Counter
print("Түвшин:", dict(Counter(c.get("level") for c in final)))
print("Ангилал:", dict(Counter(c.get("category") for c in final)))
