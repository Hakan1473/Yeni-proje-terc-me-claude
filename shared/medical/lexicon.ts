/**
 * Turkish clinical lexicon. Aliases are lowercase Turkish surface forms; the
 * matcher allows Turkish case/possessive suffixes after the last word
 * ("Parol'ü", "penisiline", "astımım").
 */

export interface DrugEntry {
  /** Display name, usually the Turkish brand. */
  name: string;
  /** Active ingredient in Turkish spelling. */
  generic?: string;
  aliases: string[];
}

// [display name, generic, ...extra aliases]
const DRUG_ROWS: [string, string | undefined, ...string[]][] = [
  // Analgesics, antipyretics, NSAIDs
  ['Parol', 'parasetamol', 'parasetamol', 'paracetamol', 'asetaminofen', 'tylol', 'calpol', 'minoset', 'termalgin'],
  ['Novalgin', 'metamizol', 'metamizol', 'novaljin', 'novalgin', 'analjin'],
  ['Arveles', 'deksketoprofen', 'deksketoprofen', 'dexketoprofen'],
  ['Majezik', 'flurbiprofen', 'flurbiprofen', 'maješik'],
  ['Voltaren', 'diklofenak', 'diklofenak', 'diclofenac', 'dikloron', 'diclomec', 'voltaren'],
  ['Apranax', 'naproksen', 'naproksen', 'naproxen', 'apranaks'],
  ['Nurofen', 'ibuprofen', 'ibuprofen', 'brufen', 'advil', 'pedifen', 'dolorex'],
  ['Aferin Forte', 'parasetamol kombinasyonu'],
  ['Tramadol', 'tramadol', 'contramal', 'tramosel'],
  ['Morfin', 'morfin', 'morphine'],
  ['Muscoril', 'tiyokolşikosid', 'tiyokolşikosid', 'muskoril'],
  // Antibiotics
  ['Augmentin', 'amoksisilin-klavulanat', 'amoklavin', 'klamoks', 'croxilex', 'augmentin bid'],
  ['Amoksisilin', 'amoksisilin', 'amoxicillin', 'largopen', 'alfoxil'],
  ['Penisilin', 'penisilin', 'penicillin', 'benzatin penisilin', 'deposilin'],
  ['Cipro', 'siprofloksasin', 'siprofloksasin', 'ciprofloxacin', 'siprosan', 'cipro'],
  ['Tavanic', 'levofloksasin', 'levofloksasin', 'levofloxacin', 'tavanik'],
  ['Klacid', 'klaritromisin', 'klaritromisin', 'clarithromycin', 'klasid'],
  ['Azitromisin', 'azitromisin', 'azithromycin', 'zitromax', 'azitro'],
  ['Zinnat', 'sefuroksim', 'sefuroksim', 'cefuroxime', 'aksef'],
  ['Seftriakson', 'seftriakson', 'ceftriaxone', 'rocephin', 'novosef', 'iesef'],
  ['Sefazolin', 'sefazolin', 'cefazolin', 'sefazol', 'cefazol'],
  ['Flagyl', 'metronidazol', 'metronidazol', 'metronidazole'],
  ['Bactrim', 'trimetoprim-sülfametoksazol', 'baktrim', 'septra'],
  ['Vankomisin', 'vankomisin', 'vancomycin'],
  ['Meropenem', 'meropenem', 'meronem'],
  ['Tazocin', 'piperasilin-tazobaktam', 'tazosin', 'piperasilin'],
  // Cardiovascular / anticoagulants
  ['Aspirin', 'asetilsalisilik asit', 'aspirin', 'asetilsalisilik asit'],
  ['Coraspin', 'asetilsalisilik asit', 'ecopirin', 'coraspın'],
  ['Plavix', 'klopidogrel', 'klopidogrel', 'clopidogrel', 'karum', 'pingel'],
  ['Brilinta', 'tikagrelor', 'tikagrelor', 'ticagrelor'],
  ['Coumadin', 'varfarin', 'varfarin', 'warfarin', 'kumadin'],
  ['Clexane', 'enoksaparin', 'enoksaparin', 'enoxaparin', 'kleksan', 'klexane'],
  ['Fraxiparine', 'nadroparin', 'nadroparin', 'fraksiparin'],
  ['Heparin', 'heparin', 'nevparin'],
  ['Xarelto', 'rivaroksaban', 'rivaroksaban', 'rivaroxaban', 'ksarelto'],
  ['Eliquis', 'apiksaban', 'apiksaban', 'apixaban', 'elikuis'],
  ['Pradaxa', 'dabigatran', 'dabigatran', 'pradaksa'],
  ['Beloc', 'metoprolol', 'metoprolol', 'beloc zok', 'belok'],
  ['Concor', 'bisoprolol', 'bisoprolol', 'konkor', 'concor'],
  ['Dideral', 'propranolol', 'propranolol'],
  ['Norvasc', 'amlodipin', 'amlodipin', 'amlodipine', 'norvask', 'amlovas', 'amlodis', 'amlopin', 'monovas'],
  ['Delix', 'ramipril', 'ramipril', 'deliks'],
  ['Coversyl', 'perindopril', 'perindopril', 'koversil'],
  ['Micardis', 'telmisartan', 'telmisartan', 'mikardis', 'pritor'],
  ['Diovan', 'valsartan', 'valsartan', 'diyovan'],
  ['Atacand', 'kandesartan', 'kandesartan', 'candesartan', 'atakand'],
  ['Lasix', 'furosemid', 'furosemid', 'furosemide', 'laziks', 'desal'],
  ['Aldactone', 'spironolakton', 'spironolakton', 'aldakton'],
  ['Digoxin', 'digoksin', 'digoksin', 'lanoksin'],
  ['Cordarone', 'amiodaron', 'amiodaron', 'kordaron'],
  ['Isordil', 'izosorbid dinitrat', 'isordil', 'izordil'],
  ['Nitroglycerin', 'nitrogliserin', 'nitrogliserin', 'nitrolingual', 'dilaltı hap'],
  ['Lipitor', 'atorvastatin', 'atorvastatin', 'ator', 'kolestor', 'lipitor'],
  ['Crestor', 'rosuvastatin', 'rosuvastatin', 'krestor', 'rosucor'],
  // Diabetes
  ['Glifor', 'metformin', 'metformin', 'glukofaj', 'glucophage', 'matofin', 'gluformin'],
  ['Diamicron', 'gliklazid', 'gliklazid', 'diamikron', 'diamicron mr'],
  ['Amaryl', 'glimepirid', 'glimepirid', 'amaril'],
  ['Januvia', 'sitagliptin', 'sitagliptin', 'janumet'],
  ['Galvus', 'vildagliptin', 'vildagliptin', 'galvusmet'],
  ['Jardiance', 'empagliflozin', 'empagliflozin', 'jardians'],
  ['Forziga', 'dapagliflozin', 'dapagliflozin', 'forxiga'],
  ['İnsülin', 'insülin', 'insülin', 'insulin', 'insilin'],
  ['Lantus', 'insülin glarjin', 'toujeo', 'basaglar'],
  ['Levemir', 'insülin detemir'],
  ['Tresiba', 'insülin degludek'],
  ['NovoRapid', 'insülin aspart', 'novorapid', 'novo rapid', 'novomix'],
  ['Humalog', 'insülin lispro', 'humalog'],
  ['Apidra', 'insülin glulisin'],
  // Gastrointestinal
  ['Lansor', 'lansoprazol', 'lansoprazol', 'lansoprazole'],
  ['Pantpas', 'pantoprazol', 'pantoprazol', 'pantoprazole', 'pulcet', 'controloc'],
  ['Nexium', 'esomeprazol', 'esomeprazol', 'neksium'],
  ['Losec', 'omeprazol', 'omeprazol', 'omeprazole', 'omeprol'],
  ['Gaviscon', undefined, 'gaviskon'],
  ['Metpamid', 'metoklopramid', 'metoklopramid', 'metoclopramide', 'primperan'],
  ['Zofran', 'ondansetron', 'ondansetron', 'zofran', 'zofer'],
  ['Buscopan', 'hiyosin', 'buskopan', 'hiyosin'],
  ['Duphalac', 'laktuloz', 'laktuloz', 'dufalak'],
  ['Ranitidin', 'ranitidin', 'ranitab', 'ulcuran'],
  // Respiratory / allergy
  ['Ventolin', 'salbutamol', 'salbutamol', 'albuterol', 'ventolin nebul'],
  ['Atrovent', 'ipratropium', 'ipratropium', 'combivent'],
  ['Pulmicort', 'budesonid', 'budesonid', 'budesonide', 'pulmikort'],
  ['Seretide', 'salmeterol-flutikazon', 'seretid'],
  ['Symbicort', 'budesonid-formoterol', 'simbikort'],
  ['Foster', 'beklometazon-formoterol'],
  ['Spiriva', 'tiotropium', 'tiotropium', 'spiriva'],
  ['Singulair', 'montelukast', 'montelukast', 'singular'],
  ['Aerius', 'desloratadin', 'desloratadin', 'aerius'],
  ['Zyrtec', 'setirizin', 'setirizin', 'cetirizine', 'zirtek'],
  ['Avil', 'feniramin', 'feniramin'],
  ['Prednol', 'metilprednizolon', 'metilprednizolon', 'methylprednisolone', 'prednol'],
  ['Deltacortril', 'prednizolon', 'prednizolon', 'prednisolone'],
  ['Dekort', 'deksametazon', 'deksametazon', 'dexamethasone'],
  // Neuro / psychiatry
  ['Xanax', 'alprazolam', 'alprazolam', 'ksanaks'],
  ['Diazem', 'diazepam', 'diazepam', 'diazem'],
  ['Ativan', 'lorazepam', 'lorazepam'],
  ['Lustral', 'sertralin', 'sertralin', 'sertraline'],
  ['Cipralex', 'essitalopram', 'essitalopram', 'escitalopram', 'sipraleks'],
  ['Prozac', 'fluoksetin', 'fluoksetin', 'fluoxetine', 'prozak'],
  ['Lyrica', 'pregabalin', 'pregabalin', 'lirika'],
  ['Neurontin', 'gabapentin', 'gabapentin', 'nörontin'],
  ['Depakin', 'valproat', 'valproat', 'valproik asit', 'depakine'],
  ['Tegretol', 'karbamazepin', 'karbamazepin', 'carbamazepine'],
  ['Keppra', 'levetirasetam', 'levetirasetam', 'levetiracetam', 'kepra'],
  ['Madopar', 'levodopa', 'levodopa', 'sinemet'],
  ['Exelon', 'rivastigmin', 'rivastigmin', 'ekselon'],
  // Endocrine / other
  ['Euthyrox', 'levotiroksin', 'levotiroksin', 'levothyroxine', 'levotiron', 'tefor', 'ötiroks'],
  ['Propycil', 'propiltiyourasil', 'propiltiyourasil', 'ptu'],
  ['Allopurinol', 'allopurinol', 'ürikoliz', 'allopurinol'],
  ['Kolşisin', 'kolşisin', 'colchicine', 'kolsisin'],
  ['Folbiol', 'folik asit', 'folik asit'],
  ['Ferro Sanol', 'demir', 'ferrosanol', 'demir hapı', 'demir ilacı'],
  ['B12', 'B12 vitamini', 'b12 vitamini', 'b12'],
  ['Devit', 'D vitamini', 'd vitamini', 'devit'],
  ['Kontrast madde', undefined, 'kontrast madde', 'ilaçlı film ilacı', 'kontrast'],
  ['Kemoterapi', undefined, 'kemoterapi', 'kemo'],
  ['Doğum kontrol hapı', undefined, 'doğum kontrol hapı', 'doğum kontrol hap'],
];

export const DRUGS: DrugEntry[] = DRUG_ROWS.map(([name, generic, ...aliases]) => ({
  name,
  generic,
  aliases: Array.from(new Set([name.toLocaleLowerCase('tr'), ...aliases])),
}));

/** "Parol (parasetamol)". When the patient used another brand, that brand is shown instead. */
export function drugLabel(d: DrugEntry, spokenAlias?: string): string {
  const generic = d.generic?.toLocaleLowerCase('tr');
  let name = d.name;
  if (spokenAlias && spokenAlias !== generic && spokenAlias !== d.name.toLocaleLowerCase('tr') && !spokenAlias.includes(' ')) {
    name = spokenAlias.charAt(0).toLocaleUpperCase('tr') + spokenAlias.slice(1);
  }
  if (!generic || generic === name.toLocaleLowerCase('tr')) return name;
  return `${name} (${d.generic})`;
}

export interface TermEntry {
  label: string;
  aliases: string[];
}

// Chronic conditions. Colloquial forms first: patients rarely say "hipertansiyon".
export const CONDITIONS: TermEntry[] = [
  { label: 'Diyabet (şeker hastalığı)', aliases: ['şeker hastalığı', 'şeker hastasıyım', 'şeker hastası', 'şekerim var', 'diyabet', 'diabet', 'şeker hastalığım'] },
  { label: 'Tip 1 diyabet', aliases: ['tip 1 diyabet', 'tip bir diyabet', 'tip 1 şeker', 'tip bir şeker'] },
  { label: 'Tip 2 diyabet', aliases: ['tip 2 diyabet', 'tip iki diyabet', 'tip 2 şeker', 'tip iki şeker'] },
  { label: 'İnsülin direnci', aliases: ['insülin direnci'] },
  { label: 'Hipertansiyon', aliases: ['hipertansiyon', 'yüksek tansiyon', 'tansiyon hastası', 'tansiyon hastalığı', 'tansiyonum var', 'tansiyon hastasıyım'] },
  { label: 'Astım', aliases: ['astım', 'astim'] },
  { label: 'KOAH', aliases: ['koah', 'kronik obstrüktif', 'amfizem'] },
  { label: 'Kronik bronşit', aliases: ['kronik bronşit'] },
  { label: 'Kalp yetmezliği', aliases: ['kalp yetmezliği', 'kalp yetersizliği'] },
  { label: 'Koroner arter hastalığı', aliases: ['koroner arter', 'kalp damar hastalığı', 'damar tıkanıklığı', 'kalp damarım tıkalı'] },
  { label: 'Kalp hastalığı', aliases: ['kalp hastası', 'kalp hastalığı', 'kalbim hasta', 'kalbimden rahatsızım'] },
  { label: 'Aritmi (ritim bozukluğu)', aliases: ['ritim bozukluğu', 'aritmi', 'atriyal fibrilasyon', 'kalp ritim'] },
  { label: 'Kalp kapak hastalığı', aliases: ['kalp kapağı', 'kapak hastalığı', 'kapak yetmezliği'] },
  { label: 'Hiperlipidemi (yüksek kolesterol)', aliases: ['kolesterolüm var', 'yüksek kolesterol', 'kolesterol hastası', 'hiperlipidemi'] },
  { label: 'Guatr', aliases: ['guatr', 'guatrım'] },
  { label: 'Hipotiroidi', aliases: ['hipotiroidi', 'tiroid tembelliği', 'tiroidim az çalışıyor', 'haşimato', 'hashimoto'] },
  { label: 'Hipertiroidi', aliases: ['hipertiroidi', 'tiroidim fazla çalışıyor', 'zehirli guatr'] },
  { label: 'Tiroid hastalığı', aliases: ['tiroid hastası', 'tiroid hastalığı', 'troid', 'tiroidim var'] },
  { label: 'Kronik böbrek yetmezliği', aliases: ['böbrek yetmezliği', 'böbrek hastası', 'böbreklerim çalışmıyor'] },
  { label: 'Diyaliz hastası', aliases: ['diyaliz', 'diyalize giriyorum'] },
  { label: 'Böbrek taşı', aliases: ['böbrek taşı'] },
  { label: 'Siroz', aliases: ['siroz'] },
  { label: 'Hepatit B', aliases: ['hepatit b', 'hepatit be', 'b hepatiti'] },
  { label: 'Hepatit C', aliases: ['hepatit c', 'hepatit ce', 'c hepatiti'] },
  { label: 'Epilepsi', aliases: ['epilepsi', 'sara hastası', 'sara hastalığı', 'nöbet geçiriyorum'] },
  { label: 'Migren', aliases: ['migren'] },
  { label: 'Geçirilmiş inme', aliases: ['felç geçirdim', 'inme geçirdim', 'beyin kanaması geçirdim', 'beyin pıhtısı'] },
  { label: 'Parkinson hastalığı', aliases: ['parkinson'] },
  { label: 'Alzheimer / demans', aliases: ['alzheimer', 'demans', 'unutkanlık hastalığı'] },
  { label: 'Multipl skleroz (MS)', aliases: ['multipl skleroz', 'ms hastası', 'ms hastalığı'] },
  { label: 'Romatoid artrit', aliases: ['romatoid artrit', 'romatizma', 'romatizmam'] },
  { label: 'Ankilozan spondilit', aliases: ['ankilozan'] },
  { label: 'Gut', aliases: ['gut hastası', 'gut hastalığı'] },
  { label: 'Ailevi Akdeniz ateşi (FMF)', aliases: ['ailevi akdeniz ateşi', 'fmf'] },
  { label: 'Lupus', aliases: ['lupus'] },
  { label: 'Reflü', aliases: ['reflü', 'reflüm'] },
  { label: 'Gastrit', aliases: ['gastrit'] },
  { label: 'Peptik ülser', aliases: ['ülser', 'mide ülseri'] },
  { label: 'Crohn hastalığı', aliases: ['crohn', 'kron hastalığı'] },
  { label: 'Ülseratif kolit', aliases: ['ülseratif kolit', 'kolit'] },
  { label: 'Depresyon', aliases: ['depresyon'] },
  { label: 'Anksiyete bozukluğu', aliases: ['anksiyete', 'panik atak', 'panik bozukluk'] },
  { label: 'Bipolar bozukluk', aliases: ['bipolar'] },
  { label: 'Şizofreni', aliases: ['şizofreni'] },
  { label: 'HIV', aliases: ['hiv', 'aids'] },
  { label: 'Tüberküloz', aliases: ['tüberküloz', 'verem'] },
  { label: 'Anemi', aliases: ['anemi', 'kansızlık', 'kansızlığım'] },
  { label: 'Talasemi', aliases: ['talasemi', 'akdeniz anemisi'] },
  { label: 'Hemofili', aliases: ['hemofili'] },
  { label: 'Osteoporoz', aliases: ['osteoporoz', 'kemik erimesi'] },
  { label: 'Uyku apnesi', aliases: ['uyku apnesi'] },
  { label: 'Prostat büyümesi (BPH)', aliases: ['prostat büyümesi', 'prostatım büyük', 'prostat hastası'] },
  { label: 'Obezite', aliases: ['obezite'] },
  { label: 'Glokom', aliases: ['glokom', 'göz tansiyonu'] },
];

// Cancer is captured with its organ when one is mentioned.
export const CANCER_RE = /(?<!\p{L})(?:(\p{L}+)\s+)?(kanser\p{L}*|tümör\p{L}*|lösemi\p{L}*|lenfoma\p{L}*)/u;

export const SURGERIES: TermEntry[] = [
  { label: 'Apendektomi (apandisit ameliyatı)', aliases: ['apandisit ameliyatı', 'apandisitimi aldırdım', 'apandisit oldum', 'apandektomi', 'apendektomi', 'apandisitten ameliyat'] },
  { label: 'Kolesistektomi (safra kesesi ameliyatı)', aliases: ['safra kesesi ameliyatı', 'safra kesemi aldırdım', 'safra kesem alındı', 'safra kesemi aldılar', 'kolesistektomi', 'safra taşı ameliyatı'] },
  { label: 'Koroner bypass (açık kalp ameliyatı)', aliases: ['bypass', 'baypas', 'açık kalp ameliyatı', 'kalp ameliyatı'] },
  { label: 'Koroner stent', aliases: ['stent taktırdım', 'stent takıldı', 'stent taktılar', 'stentim var', 'stent'] },
  { label: 'Anjiyografi', aliases: ['anjiyo oldum', 'anjiyo yapıldı', 'anjiyografi', 'anjiyo'] },
  { label: 'Sezaryen', aliases: ['sezaryen', 'sezeryan', 'sezaryenle doğum'] },
  { label: 'Fıtık ameliyatı (herni onarımı)', aliases: ['fıtık ameliyatı', 'kasık fıtığı ameliyatı', 'göbek fıtığı ameliyatı'] },
  { label: 'Bel fıtığı ameliyatı', aliases: ['bel fıtığı ameliyatı', 'belimden ameliyat'] },
  { label: 'Boyun fıtığı ameliyatı', aliases: ['boyun fıtığı ameliyatı'] },
  { label: 'Diz protezi', aliases: ['diz protezi', 'dizime protez'] },
  { label: 'Kalça protezi', aliases: ['kalça protezi', 'kalçama protez'] },
  { label: 'Katarakt ameliyatı', aliases: ['katarakt ameliyatı', 'katarakt oldum', 'gözümden ameliyat'] },
  { label: 'Tonsillektomi (bademcik ameliyatı)', aliases: ['bademcik ameliyatı', 'bademciklerimi aldırdım', 'bademciklerim alındı', 'tonsillektomi'] },
  { label: 'Tiroidektomi', aliases: ['tiroid ameliyatı', 'guatr ameliyatı', 'tiroidimi aldırdım', 'tiroidektomi'] },
  { label: 'Histerektomi (rahim ameliyatı)', aliases: ['rahmimi aldırdım', 'rahim ameliyatı', 'histerektomi', 'rahmim alındı'] },
  { label: 'Sleeve gastrektomi (tüp mide)', aliases: ['tüp mide', 'mide küçültme'] },
  { label: 'Böbrek nakli', aliases: ['böbrek nakli', 'böbrek naklim'] },
  { label: 'Karaciğer nakli', aliases: ['karaciğer nakli'] },
  { label: 'Kalp kapak ameliyatı', aliases: ['kapak ameliyatı', 'kalp kapağı ameliyatı', 'kapak değişimi'] },
  { label: 'Pacemaker (kalp pili)', aliases: ['kalp pili', 'pacemaker', 'pil taktırdım'] },
  { label: 'Prostat ameliyatı', aliases: ['prostat ameliyatı'] },
  { label: 'Mastektomi', aliases: ['memem alındı', 'mastektomi', 'meme ameliyatı'] },
  { label: 'Beyin ameliyatı', aliases: ['beyin ameliyatı'] },
];

export const ALLERGENS: TermEntry[] = [
  { label: 'Sefalosporin', aliases: ['sefalosporin', 'sefalosporinler'] },
  { label: 'Sülfonamid', aliases: ['sülfonamid', 'sülfa', 'sulfa'] },
  { label: 'NSAİİ (ağrı kesiciler)', aliases: ['nsaii', 'ağrı kesici', 'ağrı kesiciler', 'romatizma ilacı'] },
  { label: 'Antibiyotik (tür belirtilmedi)', aliases: ['antibiyotik', 'antibiyotikler'] },
  { label: 'İyot', aliases: ['iyot', 'batikon', 'povidon'] },
  { label: 'Lateks', aliases: ['lateks', 'latex', 'eldiven'] },
  { label: 'Flaster / bant', aliases: ['flaster', 'yara bandı', 'bant'] },
  { label: 'Yer fıstığı', aliases: ['yer fıstığı', 'yer fıstığ', 'fıstık', 'fıstığ'] },
  { label: 'Fındık', aliases: ['fındık'] },
  { label: 'Ceviz', aliases: ['ceviz'] },
  { label: 'Süt', aliases: ['süt', 'laktoz'] },
  { label: 'Yumurta', aliases: ['yumurta'] },
  { label: 'Balık', aliases: ['balık', 'balığ'] },
  { label: 'Kabuklu deniz ürünleri', aliases: ['deniz ürünleri', 'karides', 'midye'] },
  { label: 'Buğday / gluten', aliases: ['gluten', 'buğday', 'çölyak'] },
  { label: 'Çilek', aliases: ['çilek'] },
  { label: 'Arı sokması', aliases: ['arı', 'arı sokması', 'arı zehri'] },
  { label: 'Polen', aliases: ['polen', 'çiçek tozu', 'bahar alerjisi'] },
  { label: 'Ev tozu', aliases: ['ev tozu', 'toz akarı', 'toz'] },
  { label: 'Hayvan tüyü', aliases: ['kedi', 'köpek', 'hayvan tüyü', 'tüy'] },
  { label: 'Nikel / metal', aliases: ['nikel', 'metal'] },
];

export interface SymptomEntry {
  label: string;
  /** Regex source over lowercase Turkish text. */
  pattern: string;
}

// Body sites in the forms patients actually use ("başım", "göğsümde", "karnım").
export const PAIN_SITES: [string, string][] = [
  ['Baş', 'baş(?:ım|ımın|ımda|ta)?'],
  ['Göğüs', 'göğ(?:üs|süm|sümde|üste|süme|sümün)'],
  ['Karın', 'karın|karn(?:ım|ımda|ımın)'],
  ['Mide', 'mide(?:m|mde)?'],
  ['Sırt', 'sırt(?:ım|ımda)?'],
  ['Bel', 'bel(?:im|imde)?'],
  ['Boğaz', 'boğaz(?:ım|ımda)?'],
  ['Kulak', 'kula(?:k|ğım|ğımda|klarım)'],
  ['Diş', 'diş(?:im|lerim)?'],
  ['Boyun', 'boyun|boyn(?:um|umda)'],
  ['Omuz', 'omuz|omz(?:um|umda)'],
  ['Kol', 'kol(?:um|umda|larım)'],
  ['Bacak', 'baca(?:k|ğım|ğımda|klarım)'],
  ['Diz', 'diz(?:im|imde|lerim)'],
  ['Eklem', 'eklem(?:lerim|lerimde)?'],
  ['Kas', 'kas(?:larım|larımda)'],
  ['Ayak', 'aya(?:k|ğım|ğımda|klarım)'],
  ['El', 'el(?:im|lerim)'],
  ['Göz', 'göz(?:üm|ümde|lerim)?'],
  ['Kalça', 'kalça(?:m|mda)?'],
  ['Kasık', 'kası(?:k|ğım|ğımda)'],
  ['Böğür', 'böğ(?:ür|rüm|rümde)'],
  ['Yan', 'yan(?:ım|ımda|larım)'],
];
export const PAIN_WORDS = '(?:çok\\s+|biraz\\s+|şiddetli\\s+|hafif\\s+)?(?:ağrı\\p{L}*|sızl\\p{L}*|zonkl\\p{L}*|yanıyor\\p{L}*|yanma\\p{L}*|batıyor\\p{L}*|batma\\p{L}*|sancı\\p{L}*|kıvran\\p{L}*)';

export const SYMPTOMS: SymptomEntry[] = [
  { label: 'Göğüste baskı / sıkışma', pattern: 'göğs\\p{L}*\\s+(?:bir\\s+)?(?:baskı|sıkış|ağırlık)\\p{L}*|göğsüm sıkış\\p{L}*' },
  { label: 'Nefes darlığı', pattern: 'nefes darlığ\\p{L}*|nefes darlık|nefesim daral\\p{L}*|nefes alamıyor\\p{L}*|nefes almakta zorlan\\p{L}*|nefesim kesil\\p{L}*|soluk soluğa|nefessiz kal\\p{L}*' },
  { label: 'Öksürük', pattern: 'öksür\\p{L}*' },
  { label: 'Balgam', pattern: 'balgam\\p{L}*' },
  { label: 'Ateş', pattern: 'ateş(?:im|lendim|i var|im var|im çıktı|im yükseldi)|yüksek ateş' },
  { label: 'Titreme, üşüme', pattern: 'titri\\p{L}*|titreme\\p{L}*|üşü\\p{L}*|soğuk terle\\p{L}*' },
  { label: 'Bulantı', pattern: 'bulantı\\p{L}*|midem bulan\\p{L}*|kusacak gibi' },
  { label: 'Kusma', pattern: 'kus(?:tum|uyorum|ma|mam|acağım|tu)' },
  { label: 'İshal', pattern: 'ishal\\p{L}*' },
  { label: 'Kabızlık', pattern: 'kabız\\p{L}*' },
  { label: 'Baş dönmesi', pattern: 'baş dönme\\p{L}*|başım dön\\p{L}*|sersem\\p{L}*|dengemi kayb\\p{L}*' },
  { label: 'Bayılma', pattern: 'bayıl\\p{L}*|gözüm karar\\p{L}*|bilinç kayb\\p{L}*|kendimden geç\\p{L}*' },
  { label: 'Çarpıntı', pattern: 'çarpıntı\\p{L}*|kalbim (?:çok |hızlı |hızla )?(?:çarp|atıyor)\\p{L}*' },
  { label: 'Halsizlik', pattern: 'halsiz\\p{L}*|yorgun\\p{L}*|bitkin\\p{L}*|güçsüz\\p{L}*|takatsiz\\p{L}*|dermanım yok' },
  { label: 'Uyuşma, karıncalanma', pattern: 'uyuş\\p{L}*|karıncalan\\p{L}*' },
  { label: 'Kaşıntı', pattern: 'kaşın\\p{L}*|kaşıntı\\p{L}*' },
  { label: 'Döküntü, kızarıklık', pattern: 'döküntü\\p{L}*|kızarıklık\\p{L}*|kızardı' },
  { label: 'Şişlik', pattern: 'şiş(?:lik|ti|iyor|kin|me)\\p{L}*' },
  { label: 'Kanama', pattern: 'kanama\\p{L}*|kanadı|kanıyor|kan geliyor|kan geldi|kanlı' },
  { label: 'İdrarda yanma', pattern: 'idrar\\p{L}*\\s+(?:yaparken\\s+)?yan\\p{L}*|yanarak idrar|idrarda yanma' },
  { label: 'Sık idrara çıkma', pattern: 'sık sık idrar\\p{L}*|sık idrar\\p{L}*|sık tuvalete' },
  { label: 'İştahsızlık', pattern: 'iştahsız\\p{L}*|iştahım yok|yemek yiyemiyorum|hiçbir şey yiyemiyorum' },
  { label: 'Uykusuzluk', pattern: 'uyuyamıyor\\p{L}*|uykusuz\\p{L}*|uyku sorun\\p{L}*|uyku problem\\p{L}*' },
  { label: 'Terleme', pattern: 'terliyor\\p{L}*|terleme\\p{L}*|gece terle\\p{L}*' },
  { label: 'Görme bozukluğu', pattern: 'bulanık görü\\p{L}*|görmem bulan\\p{L}*|göremiyor\\p{L}*|çift görü\\p{L}*' },
  { label: 'Konuşma güçlüğü', pattern: 'konuşamıyor\\p{L}*|konuşmakta zorlan\\p{L}*|dilim dolaş\\p{L}*' },
  { label: 'Yutma güçlüğü', pattern: 'yutamıyor\\p{L}*|yutkunamıyor\\p{L}*|yutmakta zorlan\\p{L}*' },
  { label: 'Yürüme güçlüğü', pattern: 'yürüyemiyor\\p{L}*|yürümekte zorlan\\p{L}*' },
  { label: 'Kilo kaybı', pattern: 'kilo kayb\\p{L}*|kilo verdim|çok zayıfladım' },
  { label: 'Kaygı, korku', pattern: 'korkuyor\\p{L}*|endişeli\\p{L}*|kaygılı\\p{L}*|panik oldum|çok gerginim' },
];

export interface NeedEntry {
  label: string;
  pattern: string;
}

export const NEEDS: NeedEntry[] = [
  { label: 'Su istiyor', pattern: 'su (?:istiyor\\p{L}*|ver\\p{L}*|içebilir\\p{L}*|alabilir\\p{L}*|lazım)|susadım|susuz\\p{L}*|bir bardak su' },
  { label: 'Yemek istiyor', pattern: 'acıktım|yemek (?:istiyor\\p{L}*|yiyebilir\\p{L}*|ne zaman|alabilir\\p{L}*)' },
  { label: 'Battaniye istiyor', pattern: 'battaniye\\p{L}*|örtü\\p{L}*' },
  { label: 'Yastık istiyor', pattern: 'yastık\\p{L}*' },
  { label: 'Tuvalet yardımı', pattern: 'tuvalet\\p{L}*|lavabo\\p{L}*|sürgü\\p{L}*|ördek|idrarım geldi|çişim' },
  { label: 'Ağrı kesici istiyor', pattern: 'ağrı kesici\\p{L}*\\s+(?:istiyor\\p{L}*|alabilir\\p{L}*|ver\\p{L}*|lazım|var mı)' },
  { label: 'Doktorla görüşmek istiyor', pattern: 'doktor\\p{L}*\\s+(?:görmek|görüşmek|konuşmak|çağır\\p{L}*|gelecek mi|ne zaman gel\\p{L}*)' },
  { label: 'Oda sıcaklığı (sıcak / soğuk)', pattern: '(?:oda|burası|içerisi)\\s+(?:çok\\s+)?(?:sıcak|soğuk)|klima\\p{L}*|pencere\\p{L}*\\s+aç' },
  { label: 'Yakınına haber verilmesi', pattern: '(?:ailemi|eşimi|yakınımı|oğlumu|kızımı|annemi|babamı)\\s+ara\\p{L}*|telefon\\p{L}*' },
  { label: 'Işık ayarı', pattern: 'ışığ\\p{L}*\\s+(?:kapat|aç|söndür)\\p{L}*' },
  { label: 'Kalkma / yürüme yardımı', pattern: 'kalkmak istiyor\\p{L}*|yürümek istiyor\\p{L}*|kalkmama yardım\\p{L}*' },
  { label: 'Helal beslenme', pattern: 'helal' },
  { label: 'Tercüman / yakınla görüşme', pattern: 'tercüman\\p{L}*' },
];

export const FAMILY_MEMBERS: [string, string][] = [
  ['Anne', 'anne(?:m|mde|min|me|mi)'],
  ['Baba', 'baba(?:m|mda|mın|ma|mı)'],
  ['Kardeş', 'kardeş(?:im|imde|imin|lerim)|abla(?:m|mda)|abi(?:m|mde)|ağabey(?:im)|ağabeyim'],
  ['Büyükanne', 'anneanne(?:m|mde)|babaanne(?:m|mde)|nine(?:m|mde)'],
  ['Büyükbaba', 'dede(?:m|mde)'],
  ['Akraba', 'teyze(?:m|mde)|hala(?:m|mda)|day(?:ım|ımda)|amca(?:m|mda)'],
  ['Çocuk', 'oğl(?:um|umda)|kız(?:ım|ımda)'],
  ['Ailede', 'ailem(?:de|izde)|ailede|sülalemde'],
];

// Events that matter in family history even though they are not chronic labels.
export const FAMILY_EVENTS: TermEntry[] = [
  { label: 'Kalp krizi', aliases: ['kalp krizi'] },
  { label: 'İnme / felç', aliases: ['felç', 'inme', 'beyin kanaması'] },
  { label: 'Erken ani ölüm', aliases: ['ani ölüm', 'genç yaşta öldü'] },
];
