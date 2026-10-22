# Canlı Sesli Tercüman 3.0

Hemşire ve sağlık personeli için yabancı dildeki hastalarla **gerçek zamanlı, iki yönlü tıbbi sesli tercüman**. Konuşurken anlık anamnez çıkarır, dozları denetler ve cihaz eğitim videolarını gösterir.

> Orijinal sistemin ayrıntılı analizi ve bu sürümün tasarım gerekçeleri: [`docs/ANALIZ.md`](docs/ANALIZ.md)

## Öne çıkanlar

- **Gemini Live** ile sesten sese tercüme. Ses ikili (binary) olarak, düşük gecikmeyle iletilir; dil veya ses değişiminde kesinti olmaz, bağlantı koparsa bağlam korunur.
- **Doğru konuşmacı ayrımı**: Kürtçe, Azerice, Türkmence ve Özbekçe dahil 59 dilde "Türkçe mi, hastanın dili mi?" sınıflandırması.
- **Anlık anamnez**: şikâyetler, ilaçlar (etken maddesi, dozu ve sıklığıyla), alerjiler, kronik hastalıklar, ameliyatlar, alışkanlıklar, aile öyküsü, istekler ve talimatlar. Önce yerel çıkarım yapılır, ardından yapay zekâ tüm görüşmeyi okuyup doğrular. Doğrulanan bilgi sabit kalır: sonraki analizler yalnızca ekler veya ayrıntı katar; bir madde ancak hasta açıkça düzeltirse ya da hemşire silerse kalkar. Her bulgunun konuşmadaki dayanağı gösterilir. Hastanın söylediği ilaç adı ile çeviri farklıysa uyarı verilir; yanlış bir madde sola kaydırılarak silinir ve yapay zekâ onu tekrar eklemez.
- **Hastane sistemiyle bağlantı yoktur**: uygulama HBYS veya başka bir hastane sistemine erişmez, veri göndermez. Kopyala düğmesi yalnızca metni cihazın panosuna alır.
- **Tıbbi bilgi kartları**: anamnezdeki maddeye dokunulduğunda türüne göre bir kart açılır. Alerji kartı çapraz reaksiyon riski olan ilaçları, kaçınılacak yiyecek ve içecekleri ve reaksiyon belirtilerini; ilaç kartı etken madde, grup, kullanım alanları ve önemli yan etkileri; hastalık, şikâyet ve ameliyat kartları tipik bulguları ve acil uyarı belirtilerini gösterir. Bilgi Google aramasıyla doğrulanır (kaynaklar kartta), olmazsa ansiklopedi destekli model bilgisi kullanılır; yapay zekâya ulaşılamazsa yalnızca doğrulanmış temel bilgi gösterilir, asla dolgu metin üretilmez.
- **İlaç adı teyidi**: hastanın söylediği ilaç ile çevirideki ilaç farklıysa kartta uyarı çıkar.
- **Hastaya Göster**: ekranı ikiye bölen, üst yarısı hastaya dönük karşılıklı görünüm. Konuşma başlamadan hasta tarafında, seçilen dilde ne yapacağını anlatan bir açıklama gösterilir.
- **Anında açılış**: ana ekrana eklenen uygulama önbellekten açılır (sunucu uyanmayı beklemez); iPhone'larda siyah ekran yerine açılış görseli gösterilir.
- **Tanıtım filmi ve canlı rehber**: uygulama ilk kez açıldığında tanıtım filmi bir kez gösterilir (`public/videos/intro.mp4` / `.webm`), ardından canlı rehber başlar: ekran kararır, tanıtılan düğme aydınlanır ve yanında ne işe yaradığı yazar (başlat, dil, mikrofon, canlı konuşma, anamnez, hastaya göster, yaz, özet, yeni hasta, geçmiş, ayarlar). İkisi de Ayarlar → Kılavuz'dan yeniden açılabilir.
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
| `ECONOMY_MODE` | Varsayılan açık (ücretsiz API planı için tasarruf modu): Google araması denenmez, anamnez yapay zekâ analizi hasta cevaplarından sonra yapılır, bilgi kartları yalnızca dokunulunca hazırlanır, kotası dolan model daha uzun dinlendirilir. Ücretli anahtarda `ECONOMY_MODE=0` yapın. |
| `FALLBACK_MODELS` | Yoğun veya kotası dolan modelin yerine sırayla denenen modeller (varsayılan: `gemini-3.6-flash,gemini-3.5-flash,gemini-3.5-flash-lite`). |
| `LIVE_VOCABULARY=1` | İlaç adlarını konuşma tanımaya ipucu olarak gönderir. Model desteklemezse kendiliğinden kapanır. |

## Komutlar

| Komut | İş |
|---|---|
| `npm run dev` | Geliştirme sunucusu (Vite + Express + WebSocket) |
| `npm test` | 110 birim testi (Vitest) |
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
