# Canlı Sesli Tercüman 3.0

Hemşire ve sağlık personeli için yabancı dildeki hastalarla **gerçek zamanlı, iki yönlü tıbbi sesli tercüman**. Konuşurken anlık anamnez çıkarır, dozları denetler ve cihaz eğitim videolarını gösterir.

> Orijinal sistemin ayrıntılı analizi ve bu sürümün tasarım gerekçeleri: [`docs/ANALIZ.md`](docs/ANALIZ.md)

## Öne çıkanlar

- **Gemini Live** ile sesten sese tercüme. Ses ikili (binary) olarak, düşük gecikmeyle iletilir; dil veya ses değişiminde kesinti olmaz, bağlantı koparsa bağlam korunur.
- **Doğru konuşmacı ayrımı**: Kürtçe, Azerice, Türkmence ve Özbekçe dahil 59 dilde "Türkçe mi, hastanın dili mi?" sınıflandırması.
- **Anlık anamnez**: şikâyetler, ilaçlar (etken maddesi, dozu ve sıklığıyla), alerjiler, kronik hastalıklar, ameliyatlar, alışkanlıklar, aile öyküsü, istekler ve talimatlar. Önce yerel çıkarım yapılır, ardından yapay zekâ doğrular. Her bulgunun konuşmadaki dayanağı gösterilir; tek dokunuşla HBYS'ye kopyalanır.
- **Tıbbi bilgi kartı**: anamnezdeki ilaca, hastalığa veya belirtiye dokunulduğunda kısa bir kart açılır: ne olduğu, etken madde, ilaç grubu ve hemşirenin dikkat etmesi gerekenler. Kartlar arka planda önceden hazırlanır ve cihazda saklanır, bu yüzden anında açılır.
- **Sayı tutarlılık denetimi**: "500 mg" çeviride "50 mg" olursa uyarır.
- **Hastaya Göster**: ekranı ikiye bölen, üst yarısı hastaya dönük karşılıklı görünüm.
- Çağrı butonu ve Triflow **eğitim videoları**, konuşma özeti, geçmiş (yalnızca cihazda), yazarak çeviri, açık/koyu/otomatik görünüm.

## Çalıştırma

**Gereksinim:** Node.js 22 (veya 20.19+)

```bash
npm install
cp .env.example .env.local   # GEMINI_API_KEY değerini girin
npm run dev                  # http://localhost:3000
```

API anahtarı yoksa uygulama kendiliğinden **simülasyon modunda** açılır: mikrofonu başlattığınızda örnek bir hemşire-hasta görüşmesi oynatılır. Bunu açıkça istemek için `npm run dev:mock` kullanın.

### Üretim

```bash
npm run build
npm start        # NODE_ENV=production, dist/ klasörünü sunar
```

### Google AI Studio

Proje AI Studio şablonuyla uyumludur: `server.ts` giriş dosyası, `metadata.json` mikrofon izni ve `GEMINI_API_KEY` sırrı. Klasörü AI Studio'ya yükleyin; anahtar Secrets panelinden otomatik verilir.

## Ortam değişkenleri

| Değişken | Açıklama |
|---|---|
| `GEMINI_API_KEY` | Zorunlu (simülasyon modu hariç). |
| `APP_ACCESS_CODE` | İsteğe bağlı. Tanımlanırsa uygulama açılışta bu kodu ister. Herkese açık adreste kotanızı korur. |
| `MOCK_AI=1` | Simülasyon modu. |
| `LIVE_MODEL`, `FAST_MODEL`, `SMART_MODEL`, `TTS_MODEL`, `TTS_FALLBACK_MODEL` | Model adlarını değiştirir (varsayılanlar `server/config.ts` içinde). |
| `LIVE_VOCABULARY=1` | İlaç adlarını konuşma tanımaya ipucu olarak gönderir. Model desteklemezse kendiliğinden kapanır. |

## Komutlar

| Komut | İş |
|---|---|
| `npm run dev` | Geliştirme sunucusu (Vite + Express + WebSocket) |
| `npm test` | 107 birim testi (Vitest) |
| `npm run lint` | TypeScript tip denetimi |
| `npm run build` | Üretim derlemesi |

## Proje yapısı

```
server.ts               AI Studio uyumlu giriş
server/
  live.ts               Tarayıcı ⇄ Gemini Live köprüsü (ikili ses, oturum devamı, kesintisiz geçiş)
  routes.ts             /api/translate · /api/anamnesis · /api/summary · /api/tts
  prompts.ts            Tercüman, anamnez ve özet talimatları
  mock.ts               Simülasyon modu
  security.ts           Erişim kodu, oran sınırı, başlıklar
shared/                 İstemci ve sunucunun ortak, test edilen mantığı
  speaker.ts            Çift dil konuşmacı sınıflandırıcı
  normalize.ts          Türkçe duyarlı transkript düzeltme
  numbers.ts            Sayı tutarlılık denetimi
  tutorials.ts          Eğitim videosu niyet tespiti
  medical/              Tıbbi sözlük, klinik çıkarım, anamnez birleştirme
src/
  audio/                AudioWorklet mikrofon, tek kuyruklu hoparlör
  live/                 Tur durum makinesi (engine), anamnez senkronu, WebSocket istemcisi
  components/           Arayüz (Apple İnsan Arayüzü Yönergeleri)
public/worklets/        Ses iş parçacığı kodu
tests/                  Birim testleri
```

## Gizlilik

Konuşmalar yalnızca bu cihazda (IndexedDB) saklanır; Ayarlar → Gizlilik bölümünden otomatik silme süresi seçilebilir. Ses ve metin yalnızca çeviri için Gemini API'ye gönderilir; sunucu kayıt tutmaz. Hasta verisi KVKK kapsamında özel nitelikli kişisel veridir. Kurumsal kullanımda veri işleme sözleşmesi ve aydınlatma metni gerekir.

---

Demo · Hakan Karaarslan tarafından oluşturulmuştur
