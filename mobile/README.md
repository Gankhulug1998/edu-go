# Edu Go — iOS / Android аппликэйшн

Сурагчдад зориулсан нэйтив апп (Expo · React Native · TypeScript). Одоо байгаа Edu Go
backend (`http://84.247.165.220:3100`) болон auth-ыг дахин ашиглана.

## Багц

- **Expo SDK 56** + expo-router (file-based navigation)
- Дэлгэцүүд: Нэвтрэх → Tab (Нүүр · Картууд · Профайл) → Карт дэлгэрэнгүй + **Бичих дасгал**
- Auth: token (expo-secure-store) → `Authorization: Bearer`
- Бичих дасгал: WebView дотор **Hanzi Writer** (makemeahanzi зурлагын сан) — зурлагын
  дараалал + бичих quiz

## Хөгжүүлэлт (Mac хэрэггүй)

```bash
cd mobile
npm install
npx expo start          # QR код гарна
```

iPhone дээрээ **Expo Go** апп суулгаад QR кодыг уншуул → апп шууд ачаална.

## App Store-д build хийх (Mac хэрэггүй — EAS үүлэн build)

```bash
npm i -g eas-cli
eas login               # Expo бүртгэл (үнэгүй)
eas build:configure
eas build --platform ios --profile preview   # туршилтын build (TestFlight)
eas submit --platform ios                     # App Store-д илгээх
```

> **Apple Developer Program ($99/жил)** шаардлагатай (App Store / TestFlight-д тавихад).
> EAS гарын үсэг (certificate / provisioning profile)-ийг автоматаар зохицуулна.

## ⚠️ Production өмнө хийх

- **HTTPS:** iOS App Transport Security нь энгийн `http`-г блоклодог. Одоо `app.json`-д
  `NSAllowsArbitraryLoads: true` тавьсан нь зөвхөн хөгжүүлэлт/туршилтад. App Store-д
  тавихаас өмнө backend-ийг **домэйн + HTTPS** (ж: `https://edugo.mn`) болгож,
  `src/lib/api.ts`-ийн `API_BASE`-ийг шинэчил.
- `app.json`: `ios.bundleIdentifier` (`mn.edugo.app`)-ийг өөрийн нэрээр солих боломжтой.
