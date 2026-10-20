# Hastane Canlı Sesli Tercüman — Analiz ve Yeniden Tasarım Raporu

Bu belge, Google AI Studio'da geliştirilen `hastane-tercuman-premium-v3` sisteminin satır satır incelenmesini ve bu depodaki sıfırdan yazılmış sürüm 3.0'ın neden ve nasıl farklı kurulduğunu anlatır. Orijinal koda yapılan atıflar `dosya:satır` biçimindedir.

---

## 1. Kısa özet

Orijinal sistem iyi bir ürün fikrine ve özenli bir arayüze sahip. Ancak dört alanda ciddi sorunları var:

| Alan | En kritik bulgu | Etkisi |
|---|---|---|
| Çeviri yönü | Kürtçe, Azerice ve Türkmence konuşan hasta **%99 güvenle "hemşire"** olarak etiketleniyor. Yedek çeviri yolu bu kararı modelin kararının üstüne yazıyor. | Türkiye'de en sık görülen hasta dillerinde çeviri ters yöne gidebiliyor. |
| Anamnez | Türkçe harfle başlayan veya biten kalıplar (`\b` hatası) hiç eşleşmiyor. "Aspirin kullanıyorum" alerji olarak kaydediliyor. Yapay zekâ çağrısı başarısız olunca panel tamamen boşalıyor. | Yanlış pozitif alerji ve kaybolan bulgular hasta güvenliği riski taşıyor. |
| Hız | Ses ana iş parçacığında 128 ms'lik parçalarla, base64+JSON ile iletiliyor. Başlatma adımları sıralı. Dil veya ses değişiminde oturum önce kapatılıp sonra açılıyor. | Gereksiz gecikme ve dil değişiminde kesinti oluşuyor. |
| Güvenlik | Kimlik doğrulama ve oran sınırı yok. Sağlık verisi `localStorage`'da süresiz duruyor. Bayraklar üçüncü taraf CDN'den yükleniyor. | Adresi bilen herkes API kotasını tüketebilir. Hasta verisi de korunmuyor. |

Yeni sürüm aynı özellik setini birebir koruyor. Bu sorunların her birini ölçülebilir biçimde çözüyor ve 102 birim testi ile tarayıcıda uçtan uca testlerle doğrulanıyor.

---

## 2. Orijinal sistemin mimarisi

```
Tarayıcı (React 19)                         Sunucu (Express + ws)                 Google
──────────────────                          ─────────────────────                 ──────
getUserMedia → ScriptProcessor(2048)  ─┐
  ana iş parçacığında 16 kHz'e indir   │ JSON {type:'audio', audio:<base64>}
                                       ├──────────────────────────────▶ /live ──▶ Gemini Live
RealtimeAudioPlayer (24 kHz) ◀─────────┤ JSON {type:'audio', base64}             (gemini-3.8-live)
GeminiLiveProvider: transkript birleştirme + 2,4 sn yedek çeviri zamanlayıcısı
TranslationSupervisor: 500 ms döngü, 2,8 sn sonra yine yedek çeviri
App.tsx: her mesaj değişiminde /api/live-anamnesis (tüm konuşma)
         + yerel regex anamnezi
         + localStorage arşivi
                                         /api/translate  ─▶ flash-lite → flash-latest → flash
                                         /api/tts        ─▶ flash-lite-tts → flash-tts → Live
                                         /api/live-anamnesis, /api/summarize-conversation
                                         /api/companion/* (arayüzde kullanılmıyor)
```

### Güçlü yönler (yeni sürümde korundu)
- Apple HIG'e yakın renk belirteçleri, materyaller, segment kontrol ve sayfa (sheet) bileşenleri.
- `start/stop` için sıralı yaşam döngüsü kilidi (`interpreterSession.ts:55`): art arda başlat/durdur yarışlarını önlüyor.
- Bağlantı kurulurken ilk kelimeleri kaybetmemek için ses tamponlama.
- "Türkçe konuşan = personel" kuralının net tanımı.
- Eğitim videolarının yalnızca **öğretme** niyetinde gösterilmesi fikri (soru cümlelerini ayıklama).
- Hem anlık (yerel) hem yapay zekâ destekli anamnez yaklaşımı.

---

## 3. Bulgular (ayrıntılı)

Önem: 🔴 kritik · 🟠 yüksek · 🟡 orta · ⚪ düşük

### A. Hız ve gecikme

| # | Bulgu | Kanıt | Yeni sürümde |
|---|---|---|---|
| A1 🟠 | Mikrofon ses işleme ana iş parçacığında, eski `ScriptProcessorNode` ile ve 128 ms'lik parçalarla yapılıyor. Her parça base64 + JSON ile gidiyor (%33 fazla veri). Sunucu modele giden sesi ve gelen sesi yine base64 JSON ile aktarıyor. | `interpreterSession.ts:197`, `:244-256`; `server.ts:310` | `AudioWorklet` (ses iş parçacığı) ve pencereli-sinc alçak geçiren filtre kullanılıyor. 40 ms'lik çerçeveler **ikili WebSocket** ile gidiyor. Model sesi de istemciye ikili PCM olarak iletiliyor. |
| A2 🟡 | Başlatma sıralı: önce mikrofon izni, sonra bağlantı ve "hazır" bekleme, en son ses grafiği kuruluyor. | `interpreterSession.ts:134`, `:171` | Mikrofon ve canlı bağlantı **paralel** kuruluyor. Hazır olmadan önceki ses sunucuda 3 sn tamponlanıyor. |
| A3 🟠 | Dil veya ses değişiminde Gemini oturumu önce kapatılıyor, sonra yenisi açılıyor. Arada çeviri yapılmıyor. | `server.ts:259-266` | **Önce aç, sonra kapat** (make-before-break): yeni oturum hazır olana kadar eskisi çalışıyor. |
| A4 🟠 | Gemini oturumu kapanınca bağlam kayboluyor. Oturum devamı (session resumption), `goAway` işleme ve bağlam penceresi sıkıştırması yok. Uzun görüşmeler ses oturumu süre sınırına takılıyor. | `server.ts:417-435` | `sessionResumption` tutamacı saklanıyor. Kopma ve `goAway` durumunda bağlam korunarak yeniden bağlanılıyor. `contextWindowCompression: slidingWindow` açık. |
| A5 🟡 | Sessizlik eşiği sabit 650 ms: akıcı konuşanlar için yavaş, ağrılı veya yaşlı hastalar için erken kesiyor. | `server.ts:293` | Ayarlarda **Yanıt hızı**: Hızlı 450 ms / Dengeli 700 ms / Sabırlı 1100 ms. |
| A6 🟡 | Her ses parçası ayrı ayrı tepe değerine göre 2,8 kata kadar yükseltiliyor; parçalar arasında ses seviyesi dalgalanıyor. | `pcmHelper.ts:154` | Sabit kazanç ve yumuşak kompresör kullanılıyor; dalgalanma yok. Akışın başında 60 ms'lik titreşim (jitter) tamponu var. |
| A7 🟠 | iOS'ta çıkış `AudioContext`'i ilk ses parçası geldiğinde, yani kullanıcı dokunuşu dışında oluşturuluyor. iPhone'da ilk çeviri sessiz kalabiliyor. | `pcmHelper.ts:90-106` | Ses bağlamı **başlat dokunuşunda** açılıyor (`speaker.unlock()`). |
| A8 🟡 | Mikrofon seviyesi saniyede yaklaşık 12 kez bütün `App` bileşenini yeniden çizdiriyor. Her çizimde her mesaj için yaklaşık 100 regex çalışıyor (video tespiti). | `App.tsx:383`; `TranscriptView.tsx:372` | Seviye ayrı bir "sinyal" üzerinden yalnızca mikrofon düğmesini çizdiriyor. Konuşma kartları `memo` ile korunuyor. Video tespiti tur bitince **bir kez** yapılıyor. |

### B. Çeviri doğruluğu ve yönü

| # | Bulgu | Kanıt | Yeni sürümde |
|---|---|---|---|
| B1 🔴 | Konuşmacı tespiti `ş`, `ç`, `ğ` gibi harfleri "kesin Türkçe" sayıyor. Kürtçe, Azerice ve Türkmence konuşan hasta **0,99 güvenle "hemşire"** çıkıyor; Özbekçe 0,50. `/api/translate` güven 0,85'in üstündeyse modelin kararını eziyor, dolayısıyla çeviri **ters yöne** gidiyor. | `speakerDetection.ts:31`; `server.ts:772`. Doğrulama: orijinal fonksiyon bu cümlelerle çalıştırıldı. | **Çift dil sınıflandırıcı**: yalnızca "Türkçe mi, seçili hasta dili mi?" sorusunu soruyor. İki dilin ortak harf ve kelimeleri kanıt sayılmıyor. Türkçeye özgü `-(I)yor` eki, Azericenin `ə/x/q` harfleri, Türkmencenin `ä/ň/ý/ž` harfleri ve Kürtçenin `ê/î/û` harfleri ayırt edici. Çevirinin hangi dilde olduğu da ikinci kanıt olarak birleştiriliyor (çeviri Türkçeyse konuşan hastadır). |
| B2 🔴 | İki ayrı yedek mekanizma (2,4 sn ve 2,8 sn) aynı cümle için ayrı ayrı REST çevirisi isteyebiliyor. Yedek seslendirme ile canlı ses **farklı oynatıcılarda** çalıyor; ikisi üst üste konuşabiliyor. | `geminiLiveProvider.ts:453`; `translationSupervisor.ts:167`; `pcmHelper.ts:294` | Her konuşma için **tek bir tur durum makinesi** var. Yedek çeviri yalnızca canlı çıktı hiç gelmezse çalışıyor; canlı ses gelirse yedek iptal ediliyor. Tüm sesler **tek bir kuyruktan** çıkıyor. |
| B3 🟠 | Denetleyici dil veya ses değişiminde baştan oluşturuluyor; izlenen turlar kayboluyor. Geçmişten yüklenen çevrilmemiş mesajlar oturum açıkken kendiliğinden çevrilip **seslendirilebiliyor**. | `App.tsx:230-251` | Denetleyici yok; tur durumu motorun içinde. Geri yüklenen konuşmalar seslendirilmiyor. |
| B4 🟠 | İstemde modelin soruyu **cevaplamasını** yasaklayan bir kural yok (hasta "Tuvalet nerede?" diye sorduğunda tercüme etmek yerine cevap verebilir). Saygılı hitap kuralları yalnızca 7 dil için var. Türk ilaç markalarının etken maddesi söylenmiyor. Ses çıkışında anlamı olmayan yazım ve boşluk kuralları istemi şişiriyor. | `server.ts:40-152` | Yeni istem: "asla cevap verme, yalnızca tercüme et", birinci tekil şahıs, sayı, doz ve olumsuzluk sadakati. **59 dilin hepsi** için hitap kuralı var (Sie, vous, usted, Вы, です・ます …). Türk ilaç markaları etken maddesiyle söyleniyor ("Parol, yani parasetamol"). Türkçeye yakın dillerde karıştırma uyarısı ekli. |
| B5 🟠 | Sayı ve doz doğrulaması yok. "500 mg" çeviride "50 mg"ye dönüşürse kimse fark etmiyor. | — | **Sayı Tutarlılık Denetimi**: rakamlar, Türkçe ve İngilizce sayı sözcükleri ("beş yüz miligram", "iki buçuk"), tansiyon, saat ve ondalıklar karşılaştırılıyor. Fark varsa kartta turuncu uyarı çıkıyor. "Yemek **yedi**" gibi sayı sanılabilecek kelimeler bağlama göre eleniyor. |
| B6 🟡 | Kullanıcı metni istemin içine tırnakla gömülüyor (prompt injection'a açık). | `server.ts:723` | Talimat `systemInstruction` içinde. Kullanıcı metni ayrı bir JSON parçası olarak gidiyor ve şemalı (`responseSchema`) yanıt isteniyor. |
| B7 ⚪ | Model adları kodun içine gömülü; `gemini-flash-latest` gibi değişken takma adlar kullanılıyor. | `server.ts:742` | Tüm modeller ortam değişkeniyle değiştirilebiliyor (`server/config.ts`). |

### C. Anamnez (klinik öykü) doğruluğu

| # | Bulgu | Kanıt | Yeni sürümde |
|---|---|---|---|
| C1 🔴 | JavaScript'te `\b`, `ç ğ ı ö ş ü` harflerini kelime harfi saymıyor. Bu yüzden `\b(göğüs ağrısı\|bulantı\|…)\b` kalıbı **hiç eşleşmiyor**. | `medicalEntityExtractor.ts:416`. Doğrulama: "Göğüs ağrısı var" → `null` | Tüm sınırlar Unicode duyarlı (`(?<!\p{L})`). Testlerle doğrulanıyor. |
| C2 🔴 | Alerji kalıbında "alerji" kelimesi isteğe bağlı. "Her gün aspirin kullanıyorum" ve "Kahvaltıda yumurta yedim" **alerji** olarak kaydediliyor. | `medicalEntityExtractor.ts:242`. Doğrulama: iki cümle de eşleşti. | Alerji için açık bir alerji ipucu ("alerjim var", "dokunuyor", "reaksiyon") ya da hemşirenin alerji sorusuna verilmiş kısa bir cevap gerekiyor. |
| C3 🟠 | Olumsuzluk **mesajın tamamına** uygulanıyor. "Alerjim yok ama Parol kullanıyorum" cümlesinde Parol da siliniyor. "Ağrım geçmiyor" olumsuz sayılıyor. | `medicalEntityExtractor.ts:379` | Cümle önce yan cümlelere bölünüyor ("ama", virgül grupları). Olumsuzluk her yan cümlede ayrı ve varlığın kendi kelimeleri hariç tutularak aranıyor. Süreklilik fiilleri ("geçmiyor", "düşmüyor", "durmuyor") olumsuz sayılmıyor. "Nefes **alamıyorum**" şikâyet olarak tanınıyor. |
| C4 🔴 | Yapay zekâ anamnezi başarısız olursa sunucu boş dizilerle 200 döndürüyor. İstemci bunu yerel sonuçların yerine koyduğu için **panel boşalıyor**. | `server.ts:1217-1229` + `App.tsx:186` | İki katmanlı birleştirme: yapay zekâ başarısız olursa önceki katmanlar aynen kalıyor. |
| C5 🟠 | Her mesaj değişiminde konuşmanın tamamı (120 mesaja kadar) yeniden gönderiliyor; maliyet karesel artıyor. Konuşma akarken her parça önceki isteği iptal ediyor. | `App.tsx:162-197` | **Artımlı** gönderim: yalnızca yapay zekânın görmediği turlar, 4 turluk bağlam ve bilinen bulgu listesi gidiyor. Maliyet doğrusal büyüyor. |
| C6 🟠 | Yapay zekâ çıktısı doğrulanmıyor (uydurma bulgu riski). | — | **Kanıt doğrulama**: her yeni bulgu konuşmadan birebir bir alıntı içermek zorunda. Sunucu alıntıyı konuşmada bulamazsa bulguyu atıyor. Arayüzde satıra dokununca alıntı görünüyor. |
| C7 🟠 | Soru-cevap bağlamı yok. "Alerjiniz var mı?" sorusuna "Evet, penisilin" cevabı yerelde yakalanmıyor. "Hayır" cevabındaki "bilinen alerji yok" bilgisi kayboluyor. | — | **Diyalog durumu**: hemşirenin son sorusunun konusu (alerji, ilaç, ameliyat, kronik hastalık, sigara, alkol, aile öyküsü, ağrı puanı) hastanın kısa cevabını yorumlamak için kullanılıyor. Klinik açıdan önemli olumsuz cevaplar ayrı ve soluk gösteriliyor. |
| C8 🟡 | Hesaplanan ilaç ve doz vurguları arayüzde hiç gösterilmiyor. | `TranscriptView.tsx` (alan kullanılmıyor) | Konuşma kartlarında doz ve sayılar turuncu, ilaç adları altı çizili gösteriliyor. |
| C9 🟡 | İlaçlar yalnızca marka adıyla görünüyor; hemşirenin "vereceğim" dediği ilaç da hastanın kullandığı ilaç sanılabiliyor. | `server.ts:1157-1196` | 116 ilaç ve 376 takma addan oluşan bir sözlük var (ayrıca 54 kronik hastalık, 23 ameliyat, 21 alerjen, 30 belirti); ilaçlar etken maddesiyle gösteriliyor ("Beloc (metoprolol) 50 mg · sabahları"). Doz ve sıklık doğru ilaca bağlanıyor. Yanlış duyulan markalar fonetik eşleşmeyle yakalanıyor ("Ogmentin" → Augmentin). Hemşirenin gelecek zamanlı cümleleri talimat olarak kaydediliyor. |
| C10 🟡 | Alerji gibi kritik bir bilgi sonraki yapay zekâ geçişinde sessizce kaybolabiliyor. | — | Hasta beyanıyla kesinleşen alerjiler "sabitlenmiş" sayılıyor; yalnızca konuşmada açıkça düzeltilirse kaldırılıyor. |

### D. Güvenlik, gizlilik, erişilebilirlik

| # | Bulgu | Kanıt | Yeni sürümde |
|---|---|---|---|
| D1 🔴 | `/live` ve tüm `/api` uçlarında kimlik doğrulama, oran sınırı ve eşzamanlı oturum sınırı yok. Adresi bilen herkes API anahtarının kotasını harcayabilir. | `server.ts:157-179` | İsteğe bağlı **erişim kodu** (`APP_ACCESS_CODE`), IP başına oran sınırı ve canlı oturum sınırı (IP başına 4, toplam 40) var. |
| D2 🟠 | Sağlık verisi `localStorage`'da süresiz duruyor. 5 MB sınırı aşılınca kayıt sessizce yapılamıyor. | `historyStorage.ts:45` | IndexedDB kullanılıyor ve **otomatik silme** seçeneği var (1 / 7 / 30 gün / asla). |
| D3 🟡 | Bayraklar `flagcdn.com` ve `twemoji` CDN'lerinden yükleniyor. Hastane ağında engellenebiliyor ve hastanın dili üçüncü tarafa sızıyor. | `CountryFlag.tsx:103` | Bayraklar uygulamayla birlikte paketleniyor (`public/flags`). Sürekli dalgalanma animasyonu kaldırıldı. |
| D4 🟡 | `maximum-scale=1, user-scalable=no` yakınlaştırmayı engelliyor (WCAG 1.4.4 ihlali). | `index.html:5` | Yakınlaştırma serbest; giriş kutuları 16 px olduğu için iOS otomatik yakınlaştırma yapmıyor. |
| D5 ⚪ | JSON gövde sınırı 20 MB. | `server.ts:24` | 256 KB; ses WebSocket mesajı 256 KB ile sınırlı. |
| D6 ⚪ | Güvenlik başlıkları yok. | — | `nosniff`, `no-referrer` ve `Permissions-Policy` başlıkları ekli. |

### E. Bakım ve kod sağlığı

| # | Bulgu | Yeni sürümde |
|---|---|---|
| E1 | Yaklaşık **63 KB ölü kod**: `FallbackTranslationProvider`, `OpenAIRealtimeStub`, tüm `companion` bileşenleri ve servisi, 6 `companion` uç noktası, `/api/detect-language`. Hiçbiri arayüzden çağrılmıyor. | Yalnızca kullanılan kod yazıldı. Toplam 11.868 satır yerine 7.440 satır ve 401 satır test. |
| E2 | Aynı videolar üçer kopya (yaklaşık 15 MB fazlalık). 1 MB'lık logo 32 px'te gösteriliyor. Ses örnekleri 2,2 MB WAV. | Videolar `faststart` ile yeniden kodlandı. 7,6 MB'tan 1,9 MB'a indi, WebM yedeği eklendi. Logo 60 KB, ses örnekleri 64 kbps AAC. Toplam medya 28 MB'tan 4 MB'a indi. |
| E3 | Aynı metin normalleştirmesi üç kez uygulanıyor ve idempotent değil. | Tek ve **idempotent** normalleştirici var, testle doğrulanıyor. |
| E4 | Hiç test yok. | 102 birim testi, simülasyon modunda uçtan uca tarayıcı testi ve gerçek API'ye protokol denemesi. |
| E5 | `ai.live.connect()`, sunucu kurulumu reddederse `setupComplete`'i **sonsuza kadar bekliyor**. | Kurulum sırasında kapanma ve 10 sn zaman aşımı yakalanıyor. Gerçek API'ye geçersiz anahtarla yapılan denemede bağlantı 139 ms'de reddedildi. |

---

## 4. Yeni mimari

```
Tarayıcı                                        Sunucu (server/)                        Gemini
────────                                        ────────────────                        ──────
Microphone (AudioWorklet, 16 kHz, 40 ms) ─bin──▶ live.ts ClientSession ─base64──────────▶ Live API
   yarım çift yönlü: hoparlör çalarken            · make-before-break geçiş
   mikrofon kapalı (yankı döngüsü yok)            · sessionResumption + goAway
                                                  · contextWindowCompression
Speaker (tek kuyruk, kompresör) ◀──bin PCM───────  · bağlantı zaman aşımı / erken red
                                                  · simülasyon modu (API anahtarsız)
engine.ts (tur durum makinesi)
   ├ fuseSpeaker (girdi + çıktı dili)            routes.ts
   ├ yedek çeviri (3,5 sn, canlı gelirse iptal) ─▶ /api/translate  (şemalı, model zinciri)
   ├ checkNumbers (sayı denetimi)                 /api/tts        (önbellekli)
   ├ detectTutorial (öğretme niyeti)              /api/anamnesis  (artımlı + kanıt doğrulama)
   └ AnamnesisSync ──────────────────────────────▶ /api/summary    (yapay zekâ çalışmazsa
        yerel katman (anlık) + YZ katmanı (filigranlı)               yerel bulgulardan özet)
IndexedDB arşiv · Wake Lock · çevrimdışı uyarısı

shared/  (istemci ve sunucu aynı kodu kullanır, tamamı birim testli)
   speaker.ts  normalize.ts  numbers.ts  tutorials.ts  languages.ts
   medical/lexicon.ts  medical/extract.ts  medical/anamnesis.ts
```

## 5. Algoritmalar

### 5.1 Çift dil konuşmacı sınıflandırıcı (`shared/speaker.ts`)
1. **Yazı sistemi**: harflerin %30'undan fazlası Latin dışıysa (Kiril, Arap, Han, Devanagari …) konuşan hastadır.
2. **Harf kanıtı**: Türkçe harfler, ancak hedef dilin alfabesinde yoksa Türkçe kanıtı sayılır. Hedef dile özgü harfler (Azerice `ə`, Almanca `ß`, Vietnamca `ơ` …) hasta kanıtıdır.
3. **Kelime kanıtı**: Latin alfabesiyle yazılan 35 dil için sık kelime listeleri var. İki dilde de geçen kelimeler (ör. "ne", "de", "hasta") **nötr** sayılır.
4. **Türkçeye özgü biçimbilim**: `-(I)yor` şimdiki zaman eki başka hiçbir hedef dilde yok. Bunun yanında `mısınız` ve `-acak` gibi ekler de kanıt.
5. Toplam bir lojistik fonksiyonla güvene çevrilir. Tur bitince **çevirinin dili** ikinci kanıt olarak eklenir (ağırlık 1,3): çeviri Türkçeyse konuşan hastadır. Güven 0,7'nin altındaysa kartta "?" işareti gösterilir.

### 5.2 Tur durum makinesi ve yedek çeviri (`src/live/engine.ts`)
- Tur yaşam döngüsü: `capturing` → `translating` → `done`, ya da başarısızsa `failed`. Girdi transkripti modelin cevabından sonra da gelebilir. Mikrofon çeviri seslendirilirken kapalı olduğu için, bu sırada gelen girdi her zaman önceki tura aittir. Bu kural turların bölünmesini engeller.
- Yedek çeviri, son girdi parçasından 3,5 sn sonra hiç canlı çıktı yoksa veya model sessiz kalıp turu kapattıysa çalışır. Canlı ses veya metin gelirse yedek istek `AbortController` ile iptal edilir. Böylece aynı cümle asla iki kez seslendirilmez.

### 5.3 Sayı tutarlılık denetimi (`shared/numbers.ts`)
Rakamlar her dilde okunur (ondalık virgül/nokta, binlik ayırıcı, `120/80`, `08:00` → 8). Türkçe ve İngilizce sayı sözcükleri birleşik olarak çözülür ("iki bin beş yüz", "two and a half"). Sayı sözcüğü ancak bir birimin (mg, tablet, gün, saat, derece …) veya başka bir sayının yanında kabul edilir. Tek başına "bir/one" artikel sayıldığı için yok sayılır. İki tarafın sayı çoklu kümeleri karşılaştırılır. Okunamayan bir dil varsa (ör. Rusça sayı sözcükleri) uyarı verilmez; yanlış alarm, uyarı vermemekten daha zararlı kabul edildi.

### 5.4 Klinik çıkarım hattı (`shared/medical/extract.ts`)
1. Yan cümlelere bölme: cümle sonu, ardından "ama, fakat, ancak", ardından virgül grupları. Kendi yüklemi olmayan virgül grubu bir sonrakiyle birleşir ("Parol, Beloc kullanmıyorum" → ikisi de olumsuz).
2. Her yan cümle için soru, gelecek zaman ve olumsuzluk ayrı belirlenir; olumsuzluk aranırken varlığın kendi kelimeleri dışarıda tutulur.
3. Sözlük eşleme Türkçe eklere toleranslıdır ("penisiline", "Parol'ü", "astımım"). Kısa ilaç adları yalnızca tam eşleşmeyle kabul edilir. Ekli eşleşmeler ilaç bağlamı ister ("parola" bir şifredir).
4. Kategori yönlendirme: alerji ipucu olan yan cümlede ilaç alerjiye gider. Aile üyesi varsa en yakın üyeye aile öyküsü olarak yazılır ("Babamda kalp krizi, annemde diyabet" → Baba: kalp krizi, Anne: diyabet). Gelecek zamanlı cümleler öykü değildir.
5. Ayrıntılar: doz ve sıklık yalnızca ait olduğu ilaca bağlanır. Şikâyet süresi ("üç gündür"), ameliyat yılı ("2018"), sigara miktarı ve yılı da çıkarılır.
6. Soru-cevap: hemşirenin son sorusunun konusu, hastanın kısa cevabını yorumlar (bkz. C7).

### 5.5 İki katmanlı anamnez (`shared/medical/anamnesis.ts`, `src/live/anamnesis.ts`)
- **Yerel katman** her tur bitiminde anında çalışır. Aynı bilgi için son söylenen geçerlidir; ancak daha ayrıntılı ilaç metni (doz) korunur.
- **Yapay zekâ katmanı** 1,4 sn bekleyip tetiklenir. Yalnızca yeni turları, 4 turluk bağlamı ve bilinen bulguları gönderir; düzeltilmiş tam listeyi ve "geri çekilenler" listesini alır.
- **Filigranlı birleştirme**: yapay zekânın listesi esas alınır. Yapay zekânın görmediği daha yeni yerel bulgular eklenir. Yapay zekânın görüp çıkardığı eski yerel bulgular silinir; sabitlenmiş alerjiler ise yalnızca açıkça geri çekilirse silinir. Başarısız istek hiçbir şeyi silmez.

### 5.6 Normalleştirme (`shared/normalize.ts`)
Bitişik yazılmış soru eklerini ayırır ("ağrınızvarmı" → "Ağrınız var mı?"). Bunu yaparken gerçek kelimelere dokunmaz ("yardımı", "yirmi", "duvar" testlerle korunuyor). Bitişik tıbbi bileşik kelimeleri ayırır, ASCII ile yazılmış Türkçeyi düzeltir ("agrim" → "ağrım"). Yalnızca 34–43 aralığındaki "derece"yi °C'ye çevirir ("90 derece açı" olduğu gibi kalır). Fransızcanın boşluk kurallarını korur, Çince ve Japoncaya boşluk eklemez.

---

## 6. Tasarım kararları (Apple İnsan Arayüzü Yönergeleri)

- **Ana eylem başparmak bölgesinde**: mikrofon, Sesli Notlar ve Çeviri uygulamalarındaki gibi alttaki araç çubuğunda. Orijinalde ekranın üst yarısındaydı. Araç çubuğu beş simetrik yuvadan oluşuyor: Yaz · Sessiz · ● · Hastaya · Özet.
- **Mikrofon düğmesi durumları**: boşta mavi; bağlanırken turuncu dönen gösterge; dinlerken Apple Intelligence tarzı çok renkli ışık, mikrofon seviyesine göre büyüyüp küçülüyor; seslendirirken dalga ikonu ve çıkış seviyesi gösteriliyor, dokunmak sesi geçiyor (oturum açık kalıyor); durdurma için Sesli Notlar'daki kırmızı kare.
- **Konuşma balonları**: hemşire sağda (beyaz), hasta solda (camgöbeği tonlu), her balonda bayrak, rol ve saat var. Çeviri kalın; hastaya giden çeviri vurgu renginde. RTL diller için `dir="auto"` kullanılıyor.
- **Karşılıklı ekran ("Hastaya")**: Apple Çeviri'nin "Karşılıklı" modu gibi. Ekran ikiye bölünüyor; üst yarı 180° dönerek karşıdaki hastaya bakıyor ve onun dilinde büyük yazı gösteriyor, alt yarı Türkçe.
- **Anamnez kartları**: Sağlık uygulaması düzeni. Kategori ikonları renkli kutucuklarda; pozitif alerji varsa kart kırmızı tonda. Yapay zekâ onaylı satırlarda mavi rozet var; satıra dokununca dayandığı alıntı açılıyor.
- **Görünüm**: Otomatik (sistem), Açık ve Koyu. Belirteçler iOS sistem renklerinden. Hareket azaltma tercihine uyuluyor. Ekran oturum boyunca açık kalıyor (Wake Lock).
- Açılış ekranı 1,1 sn ve dokununca geçiliyor (orijinalde 2,5 sn). Geniş ekranda iki panel yan yana; telefonda segment kontrol ve kaydırma ile geçiş.

## 7. Özellik eşleme (orijinal → yeni)

| Orijinal özellik | Yeni sürüm |
|---|---|
| Gemini Live ile iki yönlü sesli tercüme | ✅ ikili ses, oturum devamı, kesintisiz geçiş |
| 60 dil, hızlı dil çubuğu, kullanım sıklığı, arama | ✅ 59 hasta dili (Türkçe personel tarafı) ve özgün adlar; çubuk sırası oturum içinde sabit |
| 6 Gemini sesi ve önizleme | ✅ ses önizlemeleri AAC'ye dönüştürüldü |
| Mikrofonu sessize alma | ✅ ayrıca Gemini'ye `audioStreamEnd` gönderiliyor |
| Canlı transkript, akan çeviri | ✅ |
| Kart başına dinleme, kopyalama, çevirme | ✅ dinleme, kopyalama, yeniden çevirme |
| Yedek REST çeviri ve TTS, tarayıcı sesi | ✅ tek tur durum makinesiyle |
| Anlık anamnez (9 kategori) ve HBYS'ye kopyalama | ✅ ek olarak olumsuz cevaplar, kanıt alıntısı ve yapay zekâ onayı |
| Konuşma özeti (6 başlık) ve kopyalama | ✅ yapay zekâ çalışmazsa yerel bulgulardan özet |
| Çağrı butonu ve Triflow eğitim videoları (3 kez oynatma) | ✅ öğretme niyeti cümle bazında değerlendiriliyor |
| Konuşma geçmişi: arama, ekrana yükleme, silme, kopyalama | ✅ IndexedDB ve otomatik silme |
| Açık / koyu tema | ✅ ek olarak Otomatik |
| 7 adımlı tanıtım rehberi | ✅ 6 adım |
| Açılış ekranı, çevrimdışı ve izin uyarıları | ✅ |
| Geniş ekranda yan yana, telefonda kaydırmalı iki panel | ✅ |
| İmza satırı "Hakan Karaarslan tarafından oluşturulmuştur" | ✅ |
| — | 🆕 Sayı tutarlılık denetimi |
| — | 🆕 Hastaya göster (karşılıklı ekran) |
| — | 🆕 Yazarak çeviri |
| — | 🆕 Yanıt hızı ayarı |
| — | 🆕 Erişim kodu, oran sınırı |
| — | 🆕 Simülasyon modu (API anahtarı olmadan tam demo) |

## 8. Doğrulama

- **Birim testleri (102)**: konuşmacı sınıflandırma (Kürtçe, Azerice, Türkmence, Özbekçe dahil 28 durum), normalleştirme ve idempotentlik, sayı denetimi, klinik çıkarım (soru-cevap, olumsuzluk kapsamı, aile öyküsü, ilaç dozları, fonetik eşleşme), anamnez birleştirme, eğitim videosu niyeti. Komut: `npm test`.
- **Uçtan uca tarayıcı testi**: Chromium, sahte mikrofon ve simülasyon modunda 10 turluk örnek görüşme oynatıldı. Akan transkript, sayı uyarısı (500 → 50), iki eğitim videosu, anamnez paneli, özet, karşılıklı ekran, dil arama, ayarlar, karanlık mod, tablet yatay görünüm, yazarak çeviri ve IndexedDB geçmişi kontrol edildi. Konsolda hata yok.
- **Gerçek API protokol denemesi**: yeni canlı yapılandırma (`sessionResumption`, `contextWindowCompression`, ses algılama ayarları) Google'ın Live uç noktasına gönderildi. SDK yapılandırmayı kabul etti; sunucu yalnızca geçersiz anahtarı reddetti ve red 139 ms'de yakalandı.

### Doğrulanamayanlar (gerçek anahtar ve cihaz gerektiriyor)
- Gerçek Gemini Live ses kalitesi ve gecikmesi. Model adları (`gemini-3.8-live` vb.) orijinal projeden alındı ve `.env` ile değiştirilebiliyor.
- `LIVE_VOCABULARY=1` (ilaç adlarını konuşma tanımaya ipucu olarak gönderme): alan SDK'da var, Gemini Developer API'de desteklenip desteklenmediği doğrulanamadı. Desteklenmezse sistem kendiliğinden sözlüksüz bağlanır. Varsayılan olarak kapalı.
- iPhone Safari ve Android cihazda fiziksel test.

## 9. Bilinen sınırlamalar ve öneriler
- Konuşma **yarım çift yönlü**: tercüme seslendirilirken mikrofon kapalı. Bu, hoparlörde yankı döngüsünü önlüyor. Söz kesmek için mikrofon düğmesine dokunup sesi geçmek gerekiyor.
- Klinik çıkarım Türkçe metin üzerinde çalışıyor; hastanın sözleri için Türkçe çeviri kullanılıyor. Çeviri hatalıysa çıkarım da etkilenir; kanıt alıntısı bu yüzden gösteriliyor.
- Hasta verisi Google'a gönderiliyor. KVKK kapsamında özel nitelikli kişisel veri olduğu için kurumsal kullanımda veri işleme sözleşmesi ve aydınlatma metni gerekir.
- Öneri: kurum içi kullanımda `APP_ACCESS_CODE` tanımlayın ve paylaşılan cihazlarda otomatik silmeyi "1 gün" yapın.
