import { ThinkingLevel } from '@google/genai';
import { ALLERGENS, CONDITIONS, DRUGS } from '../shared/medical/lexicon';
import type { TermInfo, TermKind } from '../shared/medical/terms';
import { fold } from '../shared/text';
import type { FactCategory } from '../shared/types';
import { ai, parseJson } from './ai';
import { config } from './config';

interface WebResult {
  title: string;
  url: string;
  extract: string;
}

const MEDICAL_KEYWORDS = [
  'ilaç', 'tedavi', 'doz', 'hastalık', 'tıp', 'etken', 'tablet', 'semptom', 'sendrom',
  'sağlık', 'reseptör', 'enfeksiyon', 'ağrı', 'organ', 'kan', 'kalp', 'damar', 'tansiyon',
  'şeker', 'glukoz', 'ameliyat', 'cerrahi', 'doktor', 'hekim', 'klinik', 'bakteri', 'virüs',
  'enflamasyon', 'inflamasyon', 'solunum', 'akciğer', 'böbrek', 'karaciğer', 'alerji',
  'farmak', 'tıbbi', 'tüberküloz', 'kanser', 'tümör', 'patoloji', 'patolojik', 'vücut',
  'hasta', 'belirti', 'ampul', 'şurup', 'kapsül', 'merhem', 'antibiyotik', 'analjezik',
  'antihipertansif', 'bloker', 'inhibitör', 'endikasyon', 'kontrendikasyon', 'anafilaksi',
  'ürtiker', 'ödem', 'kaşıntı', 'döküntü', 'besin', 'gıda', 'protein',
];

function isMedicallyRelevant(text: string, title: string): boolean {
  const combined = (text + ' ' + title).toLowerCase();
  if (combined.includes('anlam ayrımı') || combined.includes('anlam ayrımı sayfası')) return false;
  return MEDICAL_KEYWORDS.some((kw) => combined.includes(kw));
}

/** Search Turkish Wikipedia and fetch introductory medical extract. */
async function fetchWikiExtract(query: string, timeoutMs = 3000): Promise<WebResult | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const searchUrl =
      'https://tr.wikipedia.org/w/api.php?action=query&list=search&srsearch=' +
      encodeURIComponent(query) +
      '&utf8=&format=json';
    const res = await fetch(searchUrl, {
      headers: { 'User-Agent': 'HospitalTranslatorMedicalSearch/3.0' },
      signal: controller.signal,
    }).then((r) => r.json());

    const searchList = (res.query?.search ?? []).slice(0, 3);
    if (!searchList.length) return null;

    for (const item of searchList) {
      if (!item.pageid || item.title.includes('anlam ayrımı')) continue;
      const snippet = item.snippet?.replace(/<[^>]+>/g, '') ?? '';
      if (!isMedicallyRelevant(snippet, item.title)) continue;

      const pageUrl =
        'https://tr.wikipedia.org/w/api.php?action=query&prop=extracts&exintro&explaintext&pageids=' +
        item.pageid +
        '&format=json';
      const pageRes = await fetch(pageUrl, {
        headers: { 'User-Agent': 'HospitalTranslatorMedicalSearch/3.0' },
        signal: controller.signal,
      }).then((r) => r.json());

      const extract = pageRes.query?.pages?.[item.pageid]?.extract?.trim();
      if (!extract || extract.length < 20) continue;
      if (!isMedicallyRelevant(extract, item.title)) continue;

      const title = item.title;
      const url = 'https://tr.wikipedia.org/wiki/' + encodeURIComponent(title.replace(/\s+/g, '_'));
      return { title, url, extract: extract.slice(0, 1000) };
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Fallback search in English Wikipedia if Turkish page is missing */
async function fetchEnWikiExtract(query: string, timeoutMs = 3000): Promise<WebResult | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const searchUrl =
      'https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=' +
      encodeURIComponent(query) +
      '&utf8=&format=json';
    const res = await fetch(searchUrl, {
      headers: { 'User-Agent': 'HospitalTranslatorMedicalSearch/3.0' },
      signal: controller.signal,
    }).then((r) => r.json());

    const searchList = (res.query?.search ?? []).slice(0, 3);
    if (!searchList.length) return null;

    for (const item of searchList) {
      if (!item.pageid || item.title.includes('(disambiguation)')) continue;
      const pageUrl =
        'https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro&explaintext&pageids=' +
        item.pageid +
        '&format=json';
      const pageRes = await fetch(pageUrl, {
        headers: { 'User-Agent': 'HospitalTranslatorMedicalSearch/3.0' },
        signal: controller.signal,
      }).then((r) => r.json());

      const extract = pageRes.query?.pages?.[item.pageid]?.extract?.trim();
      if (!extract || extract.length < 20) continue;

      const title = item.title;
      const url = 'https://en.wikipedia.org/wiki/' + encodeURIComponent(title.replace(/\s+/g, '_'));
      return { title: `${title} (Wikipedia)`, url, extract: extract.slice(0, 1000) };
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Determine drug class based on generic ingredient or name. */
export function inferDrugClass(name: string, generic?: string): string {
  const g = fold(generic ?? name);
  if (/olol\b/.test(g)) return 'Beta bloker (Antihipertansif / Antianginal)';
  if (/pril\b/.test(g)) return 'ACE inhibitörü (Antihipertansif)';
  if (/sartan\b/.test(g)) return 'ARB (Anjiyotensin II reseptör blokeri)';
  if (/dipin\b/.test(g)) return 'Kalsiyum kanal blokeri';
  if (/prazol\b/.test(g)) return 'Proton pompa inhibitörü (Mide koruyucu)';
  if (/oksasin\b|floxacin/.test(g)) return 'Florokinolon grubu antibiyotik';
  if (/silin\b|cillin|klavulan/.test(g)) return 'Penisilin / Beta-laktam grubu antibiyotik';
  if (/sefo|cefo|sef|cef/.test(g)) return 'Sefalosporin grubu antibiyotik';
  if (/tromisin|thromycin/.test(g)) return 'Makrolid grubu antibiyotik';
  if (/profen\b|fenak\b|naproks|salisil|flurbi|aspirin/.test(g)) return 'NSAİİ (Non-steroid antiinflamatuar)';
  if (/parasetamol|asetaminofen/.test(g)) return 'Analjezik ve antipiretik (Ağrı kesici / Ateş düşürücü)';
  if (/metformin|glifor|gliclaz|diyabet|glipizid/.test(g)) return 'Oral antidiyabetik (Kan şekeri düzenleyici)';
  if (/ksaban|xaban|parin|farin|heparin|dabigatran/.test(g)) return 'Antikoagülan (Kan sulandırıcı)';
  if (/statin\b/.test(g)) return 'HMG-CoA redüktaz inhibitörü (Statin / Kolesterol ilacı)';
  if (/butamol|terol\b|ipratrop/.test(g)) return 'Bronkodilatör (Solunum yolu genişletici)';
  if (/prednis|kort\b|metilpred/.test(g)) return 'Kortikosteroid (Antienflamatuar hormon)';
  if (/feniramin|setirizin|loratadin/.test(g)) return 'Antihistaminik (Alerji ilacı)';
  if (/furosemid|tiazid|hidrokloro/.test(g)) return 'Diüretik (İdrar söktürücü / Antihipertansif)';
  if (/zolam\b|zepam\b/.test(g)) return 'Benzodiazepin (Anksiyolitik / Sedatif)';
  return 'Terapötik farmakolojik ajan';
}

/** Clean term and find lexicon entry if available. */
export function lookupLexicon(term: string) {
  const f = fold(term);
  const drug = DRUGS.find(
    (d) => fold(d.name) === f || f.startsWith(fold(d.name)) || (d.generic && fold(d.generic) === f),
  );
  const condition = CONDITIONS.find((c) => fold(c.label) === f || f.startsWith(fold(c.label)));
  const allergen = ALLERGENS.find((a) => fold(a.label) === f || f.startsWith(fold(a.label)));
  return { drug, condition, allergen };
}

/** Clinical cross-reaction & allergy knowledge profiles */
interface AllergyClinicalProfile {
  summary: string;
  allergenClass: string;
  crossReactions: string[];
  avoidList: string[];
  reactionSigns: string[];
  nursing: string[];
}

function getAllergyClinicalProfile(term: string, generic?: string): AllergyClinicalProfile {
  const t = fold(`${term} ${generic ?? ''}`);

  // 1. Penicillins & Beta-lactams
  if (/penisilin|penicillin|amoksisilin|ampisilin|augmentin|amoklavin|klamoks|croxilex|tazosin|tazocin|piperasilin/.test(t)) {
    return {
      summary: `${term}, beta-laktam çekirdeği içeren bir antibiyotiktir. Bu gruba alerjisi olan hastalarda diğer beta-laktam türevleriyle çapraz reaksiyon riski çok yüksektir.`,
      allergenClass: 'Beta-laktam grubu antibiyotikler',
      crossReactions: [
        'Amoksisilin-klavulanat (Augmentin, Klamoks, Amoklavin)',
        'Ampisilin (Alfasilin, Makrosilin)',
        'Sefalosporin grubu (Sefazolin, Seftriakson/Rocephin, Sefuroksim/Zinnat - %5-10 çapraz duyarlılık)',
        'Karbapenemler (Meropenem, İmipenem)',
        'Piperasilin-tazobaktam (Tazocin)',
      ],
      avoidList: [
        'Tüm penisilin ve aminopenisilin türevleri',
        'Penisilin kombinasyonlu hazır preparatlar',
        'Hekim onayı ve alerji testi olmadan sefalosporin grubu',
      ],
      reactionSigns: [
        'Akut ürtiker (kurdeşen) ve yaygın prurit/kaşıntı',
        'Dudak, dil, uvula ve larinkste anjiyoödem (hava yolu tıkanıklığı)',
        'Bronkospazm, stridor ve nefes darlığı',
        'Ani hipotansiyon, taşikardi ve anafilaktik şok',
      ],
      nursing: [
        'Hastaya derhal Kırmızı Alerji Bilekliği takılmalı; hasta tabelasına ve dijital sisteme kalın kırmızı uyarı işlenmelidir.',
        'Order edilen tüm antibiyotiklerin moleküler yapısı ve olası çapraz reaksiyonları hekim ve klinik eczacıyla çift kontrol edilmelidir.',
        'Hasta başında acil anafilaksi kiti (Epinefrin/Adrenalin 1:1000, antihistaminik, kortikosteroid) ve oksijen kaynağı hazır tutulmalıdır.',
        'Olası bir uygulama veya reaksiyon anında infüzyon derhal kesilmeli, hava yolu açıklığı sağlanıp acil hekim çağrılmalıdır.',
      ],
    };
  }

  // 2. Cephalosporins
  if (/sefalosporin|sefazolin|seftriakson|rocephin|zinnat|sefuroksim|kefzol|aksef|cefa|sefa/.test(t)) {
    return {
      summary: `${term}, sefalosporin grubu bir antibiyotiktir. Benzer yan zincire veya beta-laktam halkasına sahip diğer antibiyotiklerle çapraz duyarlılık gösterebilir.`,
      allergenClass: 'Sefalosporin grubu antibiyotikler',
      crossReactions: [
        'Tüm kuşak sefalosporinler (Sefazolin, Seftriakson, Sefepim, Sefuroksim)',
        'Penisilin türevleri (Amoksisilin, Ampisilin - çapraz reaksiyon riski)',
        'Karbapenemler (Meropenem)',
      ],
      avoidList: [
        '1., 2., 3. ve 4. kuşak tüm sefalosporin grubu antibiyotikler',
        'Benzer beta-laktam halkalı antibiyotikler',
      ],
      reactionSigns: [
        'Makülopapüler döküntü, ürtiker',
        'Laringeal ödem, hırıltı ve dispne',
        'Hipotansiyon, vasküler kollaps',
      ],
      nursing: [
        'Kırmızı alerji bilekliği takılmalı, beta-laktam antibiyotik orderları hekimle yeniden değerlendirilmelidir.',
        'Güvenli alternatifler (makrolid, kinolon vb.) için hekim konsültasyonu sağlanmalıdır.',
        'İlk doz takibi yapılmalı, acil müdahale seti hazır bulundurulmalıdır.',
      ],
    };
  }

  // 3. NSAIDs & Aspirin
  if (/aspirin|salisil|apranax|naproksen|arveles|deksketo|voltaren|diklofenak|nurofen|ibuprofen|majezik|flurbiprofen|nsaii|analjezik/.test(t)) {
    return {
      summary: `${term}, Non-Steroid Antiinflamatuar (NSAİİ) grubundadır. COX-1 enzim inhibisyonu mekanizması nedeniyle gruptaki hemen hemen tüm diğer ağrı kesicilerle çapraz reaksiyon verir.`,
      allergenClass: 'NSAİİ (Non-steroid antiinflamatuar) & Salisilatlar',
      crossReactions: [
        'İbuprofen (Nurofen, Advil, Dolorex, Pedifen)',
        'Naproksen (Apranax, Aleve)',
        'Diklofenak (Voltaren, Dikloron, Diclomec)',
        'Deksketoprofen (Arveles, Rastel)',
        'Flurbiprofen (Majezik)',
        'Ketoprofen, Meloksikam, Etodolak',
      ],
      avoidList: [
        'Tüm NSAİİ grubu ağrı kesiciler ve romatizma ilaçları',
        'Aspirin ve kombine soğuk algınlığı poşetleri/hapları',
      ],
      reactionSigns: [
        'Aspirinle tetiklenen şiddetli bronkospazm (AERD / Astım krizi)',
        'Yüzde ve periorbital dokularda anjiyoödem',
        'Yaygın ürtiker, hipotansiyon',
      ],
      nursing: [
        'Hastaya hiçbir NSAİİ grubu ağrı kesici verilmemelidir; orderlardaki ağrı kesiciler durdurulup hekimle görüşülmelidir.',
        'Hekim onayıyla parasetamol (düşük doz) güvenli alternatif olabilir; yine de ilk doz yakından izlenmelidir.',
        'Kırmızı alerji bilekliği takılmalı, acil adrenalin ve bronkodilatör inhaler hazır bulundurulmalıdır.',
      ],
    };
  }

  // 4. Sulfonamides
  if (/bactrim|trimetoprim|sulfametoksazol|sulfa|sülfa|sulfadiazin/.test(t)) {
    return {
      summary: `${term}, sülfonamid grubu bir antimikrobiyal ajandır. Sülfonamid yapısındaki diğer moleküllerle çapraz duyarlılık ve şiddetli kutanöz reaksiyon riski taşır.`,
      allergenClass: 'Sülfonamid türevleri',
      crossReactions: [
        'Trimetoprim-sülfametoksazol (Bactrim, Septra)',
        'Topikal gümüş sülfadiazin (Silverdin yanık kremleri)',
        'Bazı sülfonilüre grubu antidiyabetikler (Gliklazid, Glimepirid - dikkatli kullanım)',
        'Tiyazid ve kıvrım diüretikleri (Hidroklorotiyazid, Furosemid - çapraz duyarlılık riski)',
      ],
      avoidList: [
        'Sülfonamid grubu antibiyotikler ve topikal sülfa kremleri',
      ],
      reactionSigns: [
        'Eritema multiforme, Stevens-Johnson Sendromu (SJS) ve TEN belirtileri',
        'Ateş, mukozal lezyonlar ve deri soyulması',
        'Ürtiker ve anafilaksi',
      ],
      nursing: [
        'Kırmızı alerji bilekliği takılmalı, tüm sülfa içeren ilaç ve kremler listeden çıkarılmalıdır.',
        'Deri ve mukozalarda en ufak döküntü veya bül gelişiminde ilaç derhal kesilip hekime bilgi verilmelidir.',
      ],
    };
  }

  // 5. Peanuts & Tree nuts
  if (/fıstık|fistik|findik|fındık|ceviz|badem|kaju|antep|yer fistigi|yer fıstığı|nut|peanut/.test(t)) {
    return {
      summary: `${term}, sert kabuklu yemişler ve baklagiller ailesinden güçlü bir gıda alerjenidir. Benzer protein yapıları nedeniyle diğer sert kabuklu yemişlerle çapraz reaksiyon gösterir.`,
      allergenClass: 'Kabuklu Yemiş & Baklagil Alerjeni',
      crossReactions: [
        'Ağaç fındığı, ceviz, badem, kaju, antep fıstığı, brezilya cevizi',
        'Soya fasulyesi, lupin unu ve diğer baklagiller',
        'Susam, tahin ve tohum yağları',
      ],
      avoidList: [
        'Yer fıstığı ezmesi, fıstık yağı ve fındık ezmeleri',
        'Paketli çikolata, bisküvi, kek ve pastane ürünleri ("İz miktarda içerebilir" ibareli olanlar dahil)',
        'Asya mutfağı sosları (satay sosu vb.)',
      ],
      reactionSigns: [
        'Oral alerji sendromu (dudak, dil ve damakta şiddetli kaşıntı ve karıncalanma)',
        'Larenks ödemi, boğazda tıkanma ve boğulma hissi',
        'Yaygın ürtiker, karın krampları, kusma, hipotansiyon ve bilinç kaybı',
      ],
      nursing: [
        'Hastane diyet mutfağına derhal "Fıstık / Sert Kabuklu Yemiş Alerjisi" bildirilmeli ve özel alerjen menüsü çıkarılmalıdır.',
        'Hastaya ve refakatçisine dışarıdan hiçbir açık veya paketli gıda getirilmemesi konusunda kesin uyarı yapılmalıdır.',
        'Yemek tepsisi hasta odasına girmeden önce içerik kartı hemşire tarafından bizzat kontrol edilmelidir.',
        'Acil Epinefrin (Adrenalin) otoenjektörü hasta başında hazır bulundurulmalıdır.',
      ],
    };
  }

  // 6. Milk & Dairy
  if (/süt|sut|laktoz|kazein|dairy|milk|peynir|yogurt|yoğurt/.test(t)) {
    return {
      summary: `${term}, inek sütü proteinleri (kazein ve whey) kaynaklı bir gıda alerjenidir. Benzer hayvan sütleri ve türevleriyle yüksek oranda çapraz reaksiyon gösterir.`,
      allergenClass: 'Süt Proteini (Kazein / Whey)',
      crossReactions: [
        'Keçi sütü ve koyun sütü (%90 oranında çapraz reaksiyon)',
        'Süt tozu, peynir altı suyu (whey) içeren bisküvi ve mamuller',
        'Süt türevi laktoz içeren bazı ilaç yardımcı maddeleri',
      ],
      avoidList: [
        'Süt, yoğurt, peynir, tereyağı, kaymak, krema',
        'Kazeinat, whey protein tozları ve sütlü tatlılar',
        'Kremalı hazır çorbalar ve bulyonlar',
      ],
      reactionSigns: [
        'Akut gastrointestinal kramplar, şiddetli kusma ve ishal',
        'Dudak ve perioral bölgede anjiyoödem, ürtiker',
        'Hırıltılı solunum ve bronkospazm',
      ],
      nursing: [
        'Diyet servisine "Süt ve Süt Ürünleri İçermez (Sütsüz Diyet)" notu düşülmelidir.',
        'İlaçların dolgu maddelerinde kazein/laktoz türevi bulunup bulunmadığı eczacıyla teyit edilmelidir.',
      ],
    };
  }

  // 7. Seafood & Shellfish
  if (/deniz|balik|balık|karides|midye|istakoz|ıstakoz|yengec|yengeç|kalamar|ahtapot|shellfish|fish/.test(t)) {
    return {
      summary: `${term}, deniz canlılarında bulunan tropomiyozin veya parvalbümin proteinleri kaynaklı güçlü bir alerjendir. Aynı gruptaki diğer deniz ürünleriyle çapraz reaksiyon riski çok yüksektir.`,
      allergenClass: 'Deniz Ürünleri & Kabuklu Canlılar',
      crossReactions: [
        'Kabuklu deniz ürünleri: Karides, yengeç, ıstakoz, kerevit',
        'Yumuşakçalar: Midye, istiridye, kalamar, ahtapot',
        'Balık türleri (Somon, ton balığı, levrek vb.)',
        'İyotlu kontrast maddeler (radyolojik tetkiklerde hekimle teyit edilmelidir)',
      ],
      avoidList: [
        'Tüm deniz ürünleri, balık yemekleri ve deniz mahsullü soslar (oyster sos vb.)',
        'Omega-3 balık yağı kapsülleri ve balık jelatini içeren takviyeler',
        'Deniz ürünleriyle aynı fritözde pişmiş yiyecekler',
      ],
      reactionSigns: [
        'Boğazda anjiyoödem, dilde şişme ve konuşma zorluğu',
        'Akut bronkospazm, nefes darlığı',
        'Ürtiker, baş dönmesi ve anafilaktik şok',
      ],
      nursing: [
        'Hastaya kesinlikle deniz ürünü içermeyen diyet menüsü sağlanmalıdır.',
        'Radyolojik kontrastlı görüntüleme planlanıyorsa hekime ve radyolojiye deniz ürünü alerjisi mutlaka bildirilmelidir.',
        'Acil adrenalin kiti ve oksijen sistemi hazır tutulmalıdır.',
      ],
    };
  }

  // 8. Egg
  if (/yumurta|egg|albumin|albümin|ovalbumin/.test(t)) {
    return {
      summary: `${term}, yumurta akı (ovalbümin) veya sarısı kaynaklı bir gıda alerjenidir. Benzer kanatlı yumurtaları ve yumurta kültüründe üretilen aşılarla etkileşim gösterebilir.`,
      allergenClass: 'Yumurta Proteini (Ovalbümin / Ovomukoid)',
      crossReactions: [
        'Tavuk, bıldırcın, ördek ve kaz yumurtaları',
        'Yumurta embriyosunda geliştirilen aşılar (bazı grip ve sarıhumma aşıları)',
        'Mayonez, mereng, pastacılık ve sufle ürünleri',
      ],
      avoidList: [
        'Tüm yumurta içeren yiyecekler ve soslar',
        'Lizin ve albümin içerikli takviyeler',
      ],
      reactionSigns: [
        'Perioral eritem, dudak şişmesi ve kaşıntı',
        'Kusma, karın ağrısı',
        'Ürtiker ve solunum sıkıntısı',
      ],
      nursing: [
        'Aşı uygulaması planlanıyorsa hekime yumurta alerjisi hatırlatılmalı ve aşı içeriği incelenmelidir.',
        'Diyet servisine yumurtasız menü bildirilmeli ve hasta yemekleri kontrol edilmelidir.',
      ],
    };
  }

  // 9. Latex
  if (/lateks|latex|kaucuk|kauçuk/.test(t)) {
    return {
      summary: `${term}, kauçuk ağacı özsuyundan elde edilen doğal lateks proteinidir. Bitkisel çapraz reaktivite (Lateks-Meyve Sendromu) ve medikal sarf malzemelerinde ciddi anafilaksi riski taşır.`,
      allergenClass: 'Doğal Kauçuk Lateks',
      crossReactions: [
        'Lateks-Meyve Sendromu: Muz, avokado, kivi, kestane, incir, papaya, domates, patates',
        'Kauçuk içeren tüm medikal ve cerrahi sarf malzemeleri',
      ],
      avoidList: [
        'Lateks cerrahi ve muayene eldivenleri',
        'Lateks idrar sondaları (foley), drenler ve kauçuk turnikeler',
        'Serum şişesi kauçuk tıpaları ve tansiyon aleti manşonları',
      ],
      reactionSigns: [
        'Temas bölgesinde eritem, yanma, kabarcıklar ve kontakt dermatit',
        'Aerosolize lateks partikülleriyle akut astım krizi',
        'Sistemik anafilaksi ve kardiyovasküler kollaps',
      ],
      nursing: [
        'Odanın kapısına ve yatağına "LATEKS ALERJİSİ - LATEX-FREE" uyarısı asılmalıdır.',
        'Tüm pansuman, enjeksiyon ve cerrahi girişimlerde kesinlikle pudrasız nitril/vinil eldiven kullanılmalıdır.',
        'Gıda menüsünde muz, kivi, avokado ve kestane bulunmadığı teyit edilmelidir.',
      ],
    };
  }

  // Generic fallback for any other allergen
  return {
    summary: `${term}, hastada immünolojik aşırı duyarlılık ve alerjik reaksiyon tetikleyebilen bir etkendir.`,
    allergenClass: 'Spesifik Alerjen / İmmünojen',
    crossReactions: [
      `${term} ile aynı grupta veya benzer kimyasal yapıda olan bileşikler`,
      'Çapraz duyarlılık riski taşıyan yan etken maddeler',
    ],
    avoidList: [
      `${term} içeren tüm ürünler, ilaçlar veya gıdalar`,
      'Etiketi belirsiz veya içeriği doğrulanmamış maddeler',
    ],
    reactionSigns: [
      'Deri döküntüleri, kaşıntı ve ürtiker',
      'Yüz ve hava yolunda anjiyoödem belirtileri',
      'Nefes darlığı, hırıltı ve kan basıncında düşme',
    ],
    nursing: [
      'Hastaya Kırmızı Alerji Bilekliği takılmalı ve dosyasında alerji kaydı güncellenmelidir.',
      'İlgili etkenin hastaya uygulanmaması veya temas etmemesi için tüm klinik ekip uyarılmalıdır.',
      'Acil antialerjik ilaçlar (antihistaminik, kortikosteroid, epinefrin) hazır bulundurulmalıdır.',
    ],
  };
}

/** Deterministic intelligent clinical card builder used when AI model is busy or as basis. */
export function buildFallbackCard(
  term: string,
  kind: TermKind,
  category: FactCategory | undefined,
  web: WebResult | null,
  lex: ReturnType<typeof lookupLexicon>,
): TermInfo {
  const sources = web ? [{ title: web.title, url: web.url }] : undefined;
  const isAllergy = category === 'allergy' || kind === 'allergen' || !!lex.allergen;

  // SPECIALIZED ALLERGY CARD
  if (isAllergy) {
    const profile = getAllergyClinicalProfile(term, lex.drug?.generic);
    const summary = web?.extract ? web.extract.split(/(?<=[.!?])\s+/)[0] : profile.summary;

    return {
      term,
      kind: kind === 'drug' ? 'drug' : 'allergen',
      category: 'allergy',
      known: true,
      summary,
      drugClass: profile.allergenClass,
      activeIngredient: lex.drug?.generic
        ? lex.drug.generic.charAt(0).toUpperCase() + lex.drug.generic.slice(1)
        : undefined,
      crossReactions: profile.crossReactions,
      avoidList: profile.avoidList,
      reactionSigns: profile.reactionSigns,
      nursing: profile.nursing,
      origin: web ? 'web' : 'ai',
      sources,
    };
  }

  // SPECIALIZED DRUG CARD
  if (kind === 'drug' || lex.drug || category === 'medication') {
    const generic = lex.drug?.generic ?? (web?.extract.match(/etken maddesi\s+([A-Za-zğüşıöçĞÜŞİÖÇ]+)/i)?.[1] || undefined);
    const drugClass = inferDrugClass(term, generic);
    const summary = web?.extract
      ? web.extract.split(/(?<=[.!?])\s+/)[0]
      : `${term}${generic ? ` (${generic})` : ''}, ${drugClass.toLowerCase()} olarak kullanılan tıbbi bir ilaçtır.`;

    const points = [
      'Hekim tarafından reçete edilen endikasyonlarda ve belirtilen dozda kullanılır.',
      drugClass.includes('Beta') || drugClass.includes('Antihipertansif')
        ? 'Kan basıncı ve kalp ritminin kontrol altına alınmasında etkilidir.'
        : drugClass.includes('Antidiyabetik')
          ? 'Kan glukoz düzeyinin dengelenmesi ve takibinde kullanılır.'
          : drugClass.includes('NSAİİ') || drugClass.includes('Analjezik')
            ? 'Ağrı, inflamasyon ve ateş semptomlarının giderilmesinde rol oynar.'
            : drugClass.includes('Antikoagülan')
              ? 'Tromboz ve emboli riskinin önlenmesinde pıhtılaşmayı engeller.'
              : 'Tedavi protokolüne uygun şekilde düzenli periyotlarla uygulanmalıdır.',
    ];

    const nursing = [
      drugClass.includes('Beta') || drugClass.includes('Antihipertansif')
        ? 'Uygulama öncesi hastanın nabız ve tansiyon değerleri ölçülmeli; bradikardi (<60/dk) veya hipotansiyonda hekime danışılmalıdır.'
        : drugClass.includes('Antidiyabetik')
          ? 'Hipoglisemi belirtileri (terleme, titreme, bilinç bulanıklığı) izlenmeli; açlık/tokluk durumuna dikkat edilmelidir.'
          : drugClass.includes('Antikoagülan')
            ? 'Kanama bulguları (diş eti kanaması, peteşi, hematüri, melena) yakından izlenmeli; invaziv girişimlerde dikkatli olunmalıdır.'
            : 'Hastanın alerji öyküsü doğrulanmalı ve olası yan etkiler yönünden ilk doz takibi yapılmalıdır.',
      'İlacın aç veya tok karna alınma durumu kontrol edilmeli ve hastaya doğru kullanım eğitimi verilmelidir.',
    ];

    return {
      term,
      kind: 'drug',
      category: 'medication',
      known: true,
      summary,
      activeIngredient: generic ? generic.charAt(0).toUpperCase() + generic.slice(1) : undefined,
      drugClass,
      points,
      nursing,
      origin: web ? 'web' : 'ai',
      sources,
    };
  }

  // SPECIALIZED CHRONIC CONDITION CARD
  if (kind === 'condition' || category === 'chronic' || category === 'family') {
    const summary = web?.extract
      ? web.extract.split(/(?<=[.!?])\s+/)[0]
      : `${term}, düzenli tıbbi izlem ve klinik yönetim gerektiren kronik bir sağlık durumudur.`;

    const points = [
      'Hastalığın seyri boyunca hedef organ hasarı ve komplikasyon riskleri izlenmelidir.',
      'Hastanın kullandığı kronik ilaçların düzenli alımı ve yaşam tarzı uyumu kritik öneme sahiptir.',
      'Akut alevlenme veya dekompansasyon belirtileri ortaya çıktığında hekime derhal haber verilmelidir.',
    ];

    const nursing = [
      'Hastanın vital bulguları (kan basıncı, nabız, solunum, SpO2) ve semptom şiddeti düzenli aralıklarla kaydedilmelidir.',
      'Tedavi uyumu, diyet kısıtlamaları ve acil durum uyarı işaretleri konusunda hasta ve yakını bilgilendirilmelidir.',
      'Klinik kötüleşme veya anormal laboratuvar değerlerinde hekime ivedilikle bilgi verilmelidir.',
    ];

    return {
      term,
      kind: 'condition',
      category: category ?? 'chronic',
      known: true,
      summary,
      points,
      nursing,
      origin: web ? 'web' : 'ai',
      sources,
    };
  }

  // SPECIALIZED SYMPTOM / COMPLAINT CARD
  if (kind === 'symptom' || category === 'complaint') {
    const summary = web?.extract
      ? web.extract.split(/(?<=[.!?])\s+/)[0]
      : `${term}, hastanın bildirdiği ve acil veya klinik değerlendirme gerektirebilecek önemli bir semptomdur.`;

    const points = [
      'Şikayetin başlangıç zamanı, şiddeti (0-10 skalası), karakteri ve yayılımı netleştirilmelidir.',
      'Eşlik eden ek semptomlar (nefes darlığı, baş dönmesi, bulantı, terleme) sorgulanmalıdır.',
      'Semptomu tetikleyen veya hafifleten pozisyonel/fiziksel faktörler belirlenmelidir.',
    ];

    const nursing = [
      'Hastanın vital bulguları eksiksiz alınmalı ve acil tehlike işaretleri (kırmızı bayraklar) değerlendirilmelidir.',
      'Hastaya rahat nefes alabileceği ve ağrısını azaltacak uygun pozisyon verilmeli, efor kısıtlanmalıdır.',
      'Semptomun özellikleri ve vital değerler gecikmeksizin sorumlu hekime raporlanmalıdır.',
    ];

    return {
      term,
      kind: 'symptom',
      category: 'complaint',
      known: true,
      summary,
      points,
      nursing,
      origin: web ? 'web' : 'ai',
      sources,
    };
  }

  // Procedure / surgery / allergen / other
  const summary = web?.extract
    ? web.extract.split(/(?<=[.!?])\s+/)[0]
    : `${term}, hastanın klinik sürecinde takip ve dikkat gerektiren tıbbi bir durumdur.`;

  return {
    term,
    kind,
    category,
    known: true,
    summary,
    points: [
      'Klinik protokol ve hekim direktiflerine uygun şekilde değerlendirilir.',
      'Gerektiğinde uygun tetkik ve gözlem basamakları sürdürülür.',
    ],
    nursing: [
      'Hastanın genel durumu, vital bulguları ve konforu izlenmelidir.',
      'Beklenmeyen bir reaksiyon veya klinik değişiklik görüldüğünde hekim bilgilendirilmelidir.',
    ],
    origin: web ? 'web' : 'ai',
    sources,
  };
}

/**
 * Researches any medical term using real web sources (Wikipedia / medical databases)
 * and synthesizes a high-speed, structured clinical card via Gemini AI with specialized
 * allergy cross-reactivity and section-specific clinical rules.
 */
export async function researchTermCard(term: string, kind: TermKind, category?: FactCategory): Promise<TermInfo> {
  const lex = lookupLexicon(term);
  const cleanTerm = term.replace(/\s*\([^)]*\)/g, '').trim();
  const isAllergy = category === 'allergy' || kind === 'allergen' || !!lex.allergen;

  // 1. Web search prioritizing medical & generic names
  const searchQueries: string[] = [];

  if (lex.drug?.generic) {
    searchQueries.push(lex.drug.generic);
    searchQueries.push(`${lex.drug.generic} ilaç`);
  }
  if (isAllergy) {
    searchQueries.push(`${cleanTerm} alerjisi`);
    searchQueries.push(cleanTerm);
  } else if (kind === 'drug' || category === 'medication') {
    searchQueries.push(`${cleanTerm} ilaç`);
    searchQueries.push(cleanTerm);
  } else if (kind === 'condition' || category === 'chronic') {
    searchQueries.push(`${cleanTerm} hastalığı`);
    searchQueries.push(cleanTerm);
  } else if (kind === 'symptom' || category === 'complaint') {
    searchQueries.push(`${cleanTerm} belirti`);
    searchQueries.push(cleanTerm);
  } else {
    searchQueries.push(cleanTerm);
  }

  let web: WebResult | null = null;
  for (const q of searchQueries) {
    web = await fetchWikiExtract(q);
    if (web) break;
  }
  if (!web && lex.drug?.generic) {
    web = await fetchEnWikiExtract(lex.drug.generic);
  }
  if (!web) {
    web = await fetchEnWikiExtract(cleanTerm);
  }

  // 2. Prepare Gemini AI prompt with web research context and strict category rules
  const webContext = web ? `\nİNTERNET VE ANSİKLOPEDİK VERİ (${web.title}):\n${web.extract}\n` : '';
  const drugHint = lex.drug
    ? `\nBİLİNEN İLAÇ BİLGİSİ: Marka: ${lex.drug.name}, Etken madde: ${lex.drug.generic ?? 'bilinmiyor'}`
    : '';

  const systemInstruction = `Sen hastanede görevli kıdemli bir klinik eczacı, immünolog ve acil triyaj uzmanısın. Hemşire ve sağlık personeli için aşağıdaki tıbbi terim hakkında hızlı, net, profesyonel bir tıbbi bilgi kartı hazırla.

KURALLAR:
1. summary: 1-2 cümle. Terimin ne olduğunu, ana mekanizmasını veya klinik anlamını anlat.

2. EĞER BU BİR ALERJİ İSE (ilaç, antibiyotik, yiyecek, içecek veya temas alerjeni):
   - "crossReactions": Bu etkene sahip veya ÇAPRAZ REAKSİYON (cross-reactivity) riski taşıyan diğer ilaçları/antibiyotik türlerini (veya gıdaysa aynı gruptaki besinleri/içecekleri) listeleyen 3-5 maddelik dizi.
     * Örneğin penisilin için: ["Amoksisilin (Augmentin, Klamoks)", "Ampisilin", "Sefalosporinler (Sefazolin, Seftriakson, Zinnat - %5-10 çapraz duyarlılık riski)", "Karbapenemler (Meropenem)"]
     * Örneğin fıstık için: ["Ağaç fındığı, ceviz, badem, kaju", "Soya ve lupin ürünleri", "Susam"]
     * Örneğin deniz ürünü için: ["Karides, yengeç, ıstakoz (Tropomiyozin proteini)", "Midye, kalamar, ahtapot", "İyotlu kontrast maddeler"]
     * Örneğin NSAİİ/Aspirin için: ["İbuprofen (Nurofen, Advil)", "Naproksen (Apranax)", "Diklofenak (Voltaren)", "Deksketoprofen (Arveles)"]
   - "avoidList": Hastanın kesinlikle kaçınması gereken 3-4 temel madde/ilaç/gıda.
   - "reactionSigns": Olası alerjik reaksiyon ve anafilaksi belirtileri (ürtiker, yüzde/dudakta anjiyoödem, bronkospazm/stridor, hipotansiyon/şok).
   - "nursing": Hemşirenin klinik yaklaşımı (Kırmızı Alerji Bilekliği, hasta tabelası uyarısı, çapraz reaksiyonlu ilaçların hekimle doğrulanması, hazır Epinefrin/Adrenalin kiti, acil müdahale adımları).

3. EĞER BİR İLAÇ İSE:
   - "activeIngredient": etken madde adı.
   - "drugClass": farmakolojik grup (ör. "Beta bloker", "NSAİİ", "Oral antidiyabetik", "Antikoagülan", "ACE inhibitörü").
   - "points": 2-3 kullanım alanı ve endikasyon.
   - "nursing": hemşire için vital izlem (nabız, tansiyon, kan şekeri), aç/tok alımı ve dikkat edilecekler.

4. EĞER KRONİK HASTALIK İSE:
   - "points": 2-3 tipik bulgu, seyir ve hedef organ riskleri.
   - "nursing": vital takibi, diyet, acil kötüleşme belirtileri ve hekime bildirim kriterleri.

5. EĞER ŞİKÂYET / BELİRTİ İSE:
   - "points": şikayetin özellikleri, karakteri ve olası nedenler.
   - "nursing": hemşire triyajı, rahatlatıcı pozisyon, kırmızı bayraklar ve hekim bilgilendirmesi.

6. SADECE şu JSON şemasına uygun nesne döndür:
{
  "known": true,
  "summary": "...",
  "activeIngredient": "...",
  "drugClass": "...",
  "points": ["...", "..."],
  "crossReactions": ["...", "..."],
  "avoidList": ["...", "..."],
  "reactionSigns": ["...", "..."],
  "nursing": ["...", "..."]
}`;

  const prompt = `TERİM: ${term}\nKATEGORİ: ${isAllergy ? 'allergy' : category ?? kind}${drugHint}${webContext}\nBu terimi analiz edip belirtilen JSON formatında klinik kartı döndür.`;

  // 3. Attempt Gemini generation with fast timeout
  const models = [config.models.fast, config.models.smart];
  for (const model of models) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    try {
      const res = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          temperature: 0.1,
          thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
          abortSignal: controller.signal,
        },
      });

      const parsed = parseJson<Partial<TermInfo>>(res.text);
      if (parsed && parsed.known !== false && parsed.summary) {
        const sources = web ? [{ title: web.title, url: web.url }] : undefined;
        const list = (v: unknown) => (Array.isArray(v) && v.length ? v.map((x) => String(x).trim()).filter(Boolean).slice(0, 5) : undefined);

        return {
          term,
          kind: isAllergy ? (kind === 'drug' ? 'drug' : 'allergen') : ((parsed.kind as TermKind) || kind),
          category: isAllergy ? 'allergy' : category,
          known: true,
          summary: parsed.summary,
          activeIngredient: parsed.activeIngredient || (lex.drug?.generic ? lex.drug.generic.charAt(0).toUpperCase() + lex.drug.generic.slice(1) : undefined),
          drugClass: parsed.drugClass || (kind === 'drug' ? inferDrugClass(term, lex.drug?.generic) : undefined),
          points: list(parsed.points),
          crossReactions: list(parsed.crossReactions),
          avoidList: list(parsed.avoidList),
          reactionSigns: list(parsed.reactionSigns),
          nursing: list(parsed.nursing),
          origin: web ? 'web' : 'ai',
          sources,
        };
      }
    } catch {
      // Continue to next model or fallback
    } finally {
      clearTimeout(timer);
    }
  }

  // 4. Reliable clinical fallback if AI is unavailable (503/429/timeout)
  return buildFallbackCard(term, kind, category, web, lex);
}
