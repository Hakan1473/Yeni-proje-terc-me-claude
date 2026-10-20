import { getLanguage } from './languages';
import { lowerNeutral, words } from './text';
import type { Script, Speaker } from './types';

/**
 * Speaker classification for a two-party interpreter.
 *
 * We never need general language identification: the session has exactly two
 * languages, Turkish (staff) and one known patient language. So each utterance
 * is scored as "Turkish vs. <target>" using evidence that is specific to that
 * pair. Characters that both languages share (ç, ş, ö, ü for Azerbaijani,
 * Kurdish, Turkmen...) are ignored instead of being counted as Turkish.
 */

export interface SpeakerGuess {
  speaker: Speaker;
  /** Probability of the chosen speaker, 0.5 – 0.99. */
  confidence: number;
  /** Log-odds that the text is Turkish (positive = nurse). */
  logit: number;
}

const SCRIPT_RE: Record<Exclude<Script, 'latin'>, RegExp> = {
  cyrillic: /\p{Script=Cyrillic}/u,
  arabic: /\p{Script=Arabic}/u,
  han: /\p{Script=Han}/u,
  kana: /[\p{Script=Hiragana}\p{Script=Katakana}]/u,
  hangul: /\p{Script=Hangul}/u,
  devanagari: /\p{Script=Devanagari}/u,
  bengali: /\p{Script=Bengali}/u,
  gurmukhi: /\p{Script=Gurmukhi}/u,
  tamil: /\p{Script=Tamil}/u,
  thai: /\p{Script=Thai}/u,
  georgian: /\p{Script=Georgian}/u,
  armenian: /\p{Script=Armenian}/u,
  greek: /\p{Script=Greek}/u,
  hebrew: /\p{Script=Hebrew}/u,
  ethiopic: /\p{Script=Ethiopic}/u,
};
const LATIN_RE = /\p{Script=Latin}/u;
const LETTER_RE = /\p{L}/u;

// Letters of the Turkish alphabet that English-style keyboards lack.
const TURKISH_LETTERS = ['ç', 'ğ', 'ı', 'ö', 'ş', 'ü'];

// Distinctive Turkish words. Kept to words that are frequent in ward talk.
const TURKISH_WORDS = `
ve bir bu şu için ile çok daha ne nasıl neden nerede nereniz var yok değil mı mi mu mü evet hayır tamam
lütfen teşekkür teşekkürler şimdi sonra önce biraz hemen sizin size sizi siz ben benim bana beni hasta
hemşire doktor ağrı ağrınız ağrım ağrısı ilaç ilacınızı ilaçlarınızı kolunuzu nefes derin alın verin edin olur oldu
geçmiş olsun kadar gibi ama fakat çünkü eğer hiç her şey iyi kötü merhaba günaydın akşamlar yarın bugün dün
saat gün gece sabah akşam tansiyon ateş şeker kan serum damar iğne hap şurup yemek su tuvalet yatak oda
ameliyat alerji alerjiniz şikayet şikayetiniz misiniz musunuz mısınız müsünüz efendim buyurun bakalım bakın
söyleyin anlatın gösterin lazım gerek gerekiyor olacak yapacağız ölçeceğim takacağım kalkmayın merak etmeyin
rahat olun bekleyin dinlenin mısın misin musun müsün yani peki tabii aynen hadi şöyle böyle onu bunu şunu
en de da o ya ki can sen
`;

// Turkish-only morphology: the -(I)yor progressive does not exist in
// Azerbaijani, Turkmen, Uzbek or any other target language.
const TURKISH_MORPHOLOGY: [RegExp, number][] = [
  [/[ıiuü]yor(?:um|sun|uz|sunuz|lar|du|dum|muş|sa)?$/u, 2.5],
  [/^(?:m[ıiuü])(?:s[ıiuü]n[ıiuü]z|s[ıiuü]n|y[ıiuü]m|y[ıiuü]z)$/u, 2],
  [/(?:acak|ecek|acağ|eceğ)(?:s[ıi]n[ıi]z|[ıi]m|[ıi]z|lar|ler)?$/u, 1.2],
  [/(?:[ıiuü]n[ıiuü]z|l[ae]r[ıi]n[ıi]z)$/u, 1],
  [/(?:d[ıiuü]m|t[ıiuü]m|d[ıiuü]n[ıiuü]z)$/u, 0.6],
];

interface Markers {
  /** Letters that belong to the target alphabet but not to Turkish. */
  letters: string;
  /** Frequent function words / ward words of the target language. */
  words: string;
}

// Only Latin-script targets need word evidence; other scripts are decided by
// the script itself. Lists favour words that cannot be Turkish.
const MARKERS: Record<string, Markers> = {
  en: { letters: 'qwx', words: "the is are am was were i i'm you you're my your it it's this that have has had do does did not no yes please thank thanks pain hurts hurt feel feeling can can't cannot what where when how why with and but because of to in me he she we they very much doctor nurse water help need want sick bad good chest head stomach back take medicine pills allergic allergy breath breathe dizzy since days hours" },
  de: { letters: 'äßqwx', words: 'ich du er sie es wir ihr und nicht ja nein bitte danke ist sind habe haben hat mein meine mir mich der die das ein eine mit auf für schmerzen schmerz weh tut kopf bauch brust wasser arzt sehr gut kann auch aber wie was wo wann seit tagen' },
  fr: { letters: 'éèêëàùœÿqwx', words: "je tu il elle nous vous et est suis ai j'ai oui non merci s'il plaît mal douleur tête ventre le la les un une des de du avec pour dans pas très mon ma mes médecin infirmière eau c'est depuis jours" },
  es: { letters: 'ñáéíóú¿¡qwx', words: 'hasta yo tú usted él ella y es está estoy tengo sí no gracias por favor dolor duele me mi cabeza estómago pecho el la los las un una de del con para en que qué muy médico agua necesito desde días' },
  it: { letters: 'àèéìòùqwx', words: 'io tu lei lui e è sono ho sì no grazie per favore dolore male mi fa testa pancia petto il la lo gli un una di con che molto medico acqua non da giorni' },
  pt: { letters: 'ãõáàéêíóôúqwx', words: 'eu você ele ela e é estou tenho sim não obrigado obrigada por favor dor dói minha meu cabeça barriga peito o os as um uma de com para que muito médico água desde dias' },
  ro: { letters: 'ăâîșțţqwx', words: 'eu tu el ea și este sunt am da nu mulțumesc vă rog durere doare mă cap burtă piept un o de cu pentru că foarte medic apă în la' },
  nl: { letters: 'ëqwx', words: 'ik jij hij zij wij en is ben heb ja nee dank alstublieft pijn hoofd buik borst de het een van met voor niet heel dokter water mijn' },
  pl: { letters: 'ąćęłńóśźżqwx', words: 'ja ty pan pani on ona i jest jestem mam tak nie dziękuję proszę ból boli mnie mi głowa brzuch w z na do że bardzo lekarz woda mój moja' },
  cs: { letters: 'áčďéěíňóřšťúůýžqwx', words: 'já ty je jsem mám ano ne děkuji prosím bolest bolí mě hlava břicho a v s na že velmi lékař voda' },
  sk: { letters: 'áäčďéíĺľňóôŕšťúýžqwx', words: 'ja je som mám áno nie ďakujem prosím bolesť bolí ma hlava brucho a v s na že veľmi lekár voda' },
  sl: { letters: 'čšžqwx', words: 'jaz ti je sem imam da ne hvala prosim bolečina boli me glava trebuh in v z na zelo zdravnik voda' },
  hr: { letters: 'čćđšžqwx', words: 'ja ti je sam imam da ne hvala molim bol boli me glava trbuh i u s sa na jako vrlo doktor liječnik voda mi' },
  bs: { letters: 'čćđšžqwx', words: 'ja ti je sam imam da ne hvala molim bol boli me glava stomak i u s sa na jako vrlo doktor ljekar voda mi' },
  sr: { letters: 'čćđšžqwx', words: 'ja ti je sam imam da ne hvala molim bol boli me glava stomak i u s sa na jako vrlo doktor lekar voda mi' },
  sq: { letters: 'ëqwx', words: 'unë ti ai ajo dhe është jam kam po jo faleminderit ju lutem dhimbje më dhemb koka barku gjoks një me në për shumë mjek ujë' },
  hu: { letters: 'áéíóőúűqwx', words: 'én te ő és van vagyok igen nem köszönöm kérem fáj fájdalom fejem hasam a az egy meg nagyon orvos víz' },
  fi: { letters: 'äåqwx', words: 'minä sinä hän ja on olen kyllä ei kiitos ole hyvä kipu sattuu pää vatsa rinta se että hyvin lääkäri vesi' },
  et: { letters: 'äõšžqwx', words: 'mina ma sina ta ja on olen jah ei aitäh palun valu valutab pea kõht rind see et väga arst vesi' },
  lv: { letters: 'āčēģīķļņšūžqwx', words: 'es tu viņš viņa un ir esmu jā nē paldies lūdzu sāpes sāp galva vēders krūtis ar uz ka ļoti ārsts ūdens' },
  lt: { letters: 'ąčęėįšųūžqwx', words: 'aš tu jis ji ir yra esu taip ne ačiū prašau skausmas skauda galva pilvas krūtinė su į kad labai gydytojas vanduo' },
  sv: { letters: 'åäqwx', words: 'jag du han hon och är har ja nej tack snälla smärta ont huvud mage bröst en ett med för inte mycket läkare vatten min' },
  no: { letters: 'åæøqwx', words: 'jeg du han hun og er har ja nei takk vær snill smerte vondt hode mage bryst en et med for ikke veldig lege vann min' },
  da: { letters: 'åæøqwx', words: 'jeg du han hun og er har ja nej tak smerte ondt hoved mave bryst en et med for ikke meget læge vand min' },
  id: { letters: 'qwx', words: 'saya anda dia kami dan ini itu ada tidak ya terima kasih tolong kepala perut dada yang di ke dengan untuk sangat dokter air sudah belum' },
  ms: { letters: 'qwx', words: 'saya awak anda dia dan ini itu ada tidak ya terima kasih tolong kepala perut dada yang di ke dengan untuk sangat doktor air sudah belum' },
  tl: { letters: 'qwx', words: 'ako ikaw siya kami at ang ng sa mga oo hindi salamat po masakit ulo tiyan dibdib ko mo niya napaka doktor tubig' },
  sw: { letters: 'qwx', words: 'mimi wewe yeye sisi na ni ndiyo hapana asante tafadhali maumivu kichwa tumbo kifua ya wa kwa sana daktari maji nina ninaumwa' },
  so: { letters: 'qwx', words: 'aniga adiga isaga iyada iyo waa haa maya mahadsanid fadlan xanuun madax calool laab ka ku la aad dhakhtar biyo waxaan' },
  vi: { letters: 'ạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹđơưăêôqwx', words: 'tôi bạn anh chị em và là có không vâng dạ cảm ơn xin đau đầu bụng ngực của với rất bác sĩ nước' },
  az: { letters: 'əxq', words: 'mən sən biz onlar və nə necə harada yox deyil bəli xeyr çox də üçün ilə ağrıyır başım ürəyim həkim xəstə dərman təzyiq şəkər edirəm edir mənim sənin hə var' },
  tk: { letters: 'äňýž', words: 'men sen ol olar we näme nähili nirede bar ýok däl hawa gaty bilen üçin agyrýar başym lukman keselhana derman gan basyş' },
  uz: { letters: 'ʻxq', words: "men sen u ular va nima qanday qayerda bor yoʻq yo'q emas ha juda bilan uchun ogʻriyapti og'riyapti boshim shifokor dori qon bosim kasalxona rahmat iltimos" },
  ku: { letters: 'êîûxqw', words: 'ez tu ew em hûn û ev çi çawa li ku heye tune na erê gelek bi ji bo min te wî wê serê diêşe êş derman xwîn nexweşxane doktor spas zikê dilê nikarim dikim' },
  kk: { letters: 'äñqū', words: 'men sen ol biz siz jäne bar joq ia rahmet' },
};

const TURKISH_SET = new Set(words(TURKISH_WORDS));
const markerCache = new Map<string, { words: Set<string>; shared: Set<string>; letters: Set<string> }>();

function markersFor(code: string) {
  let cached = markerCache.get(code);
  if (!cached) {
    const m = MARKERS[code];
    const all = m ? words(lowerNeutral(m.words)) : [];
    cached = {
      words: new Set(all.filter((w) => !TURKISH_SET.has(w))),
      // Words both languages use carry no evidence either way
      shared: new Set(all.filter((w) => TURKISH_SET.has(w))),
      letters: new Set(m ? Array.from(m.letters) : []),
    };
    markerCache.set(code, cached);
  }
  return cached;
}

function targetAlphabetHas(code: string, letter: string): boolean {
  const m = MARKERS[code];
  if (!m) return false;
  if (m.letters.includes(letter)) return true;
  // Letters a target shares with Turkish (ç, ş, ö, ü...) must not count as Turkish evidence
  const shared: Record<string, string> = {
    az: 'çğıöşü',
    tk: 'çöşü',
    ku: 'çş',
    uz: '',
    kk: 'ğıöü',
    de: 'öü',
    hu: 'öü',
    et: 'öü',
    fi: 'ö',
    sv: 'ö',
    fr: 'ç',
    pt: 'ç',
    sq: 'ç',
    ro: 'ş',
  };
  return (shared[code] ?? '').includes(letter);
}

function logistic(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function guessFromLogit(logit: number): SpeakerGuess {
  const p = logistic(logit);
  const speaker: Speaker = logit >= 0 ? 'nurse' : 'patient';
  const confidence = Math.min(0.99, Math.max(0.5, speaker === 'nurse' ? p : 1 - p));
  return { speaker, confidence, logit };
}

/** Log-odds that `text` is Turkish rather than the patient's language. */
export function turkishLogit(text: string, targetCode: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;

  // 1. Script evidence: any substantial non-Latin script means the patient side
  let letters = 0;
  let latin = 0;
  let foreignScript = 0;
  for (const ch of trimmed) {
    if (!LETTER_RE.test(ch)) continue;
    letters++;
    if (LATIN_RE.test(ch)) {
      latin++;
      continue;
    }
    for (const re of Object.values(SCRIPT_RE)) {
      if (re.test(ch)) {
        foreignScript++;
        break;
      }
    }
  }
  if (letters === 0) return 0;
  const foreignShare = foreignScript / letters;
  if (foreignShare >= 0.3) return -4 - 4 * foreignShare;

  const language = getLanguage(targetCode);
  const targetIsLatin = language.scripts.includes('latin');
  const lower = lowerNeutral(trimmed);
  const tokens = words(lower);
  const { words: targetWords, shared, letters: targetLetters } = markersFor(targetCode);

  let tr = 0;
  let tg = 0;

  // 2. Letters
  let trLetterHits = 0;
  let tgLetterHits = 0;
  for (const ch of lower) {
    if (TURKISH_LETTERS.includes(ch) && !targetAlphabetHas(targetCode, ch)) trLetterHits++;
    else if (targetLetters.has(ch)) tgLetterHits++;
  }
  tr += Math.min(3, trLetterHits * 0.6);
  tg += Math.min(4, tgLetterHits * 0.9);

  // 3. Words and Turkish-only morphology
  for (const token of tokens) {
    if (shared.has(token)) continue;
    if (TURKISH_SET.has(token)) {
      tr += 1.6;
    } else if (targetWords.has(token)) {
      tg += 1.6;
    } else if (token.length > 3) {
      for (const [re, weight] of TURKISH_MORPHOLOGY) {
        if (re.test(token)) {
          tr += weight;
          break;
        }
      }
    }
  }

  // A Latin-script text when the patient's language is written in another
  // script is far more likely to be Turkish staff speech.
  if (!targetIsLatin && latin > 0 && foreignScript === 0) tr += 1.5;

  return (tr - tg) * 0.9;
}

/** Who said this? Based on the utterance text alone. */
export function classifySpeaker(text: string, targetCode: string): SpeakerGuess {
  return guessFromLogit(turkishLogit(text, targetCode));
}

/**
 * Who said this? Based on the interpreter's output: if the translation is
 * Turkish, the patient was speaking, and vice versa. Model output is clean
 * text, so this evidence is weighted more than raw speech transcripts.
 */
export function classifyFromTranslation(translation: string, targetCode: string): SpeakerGuess {
  return guessFromLogit(-turkishLogit(translation, targetCode));
}

/** Combine source and translation evidence. Either may be empty. */
export function fuseSpeaker(source: string, translation: string | undefined, targetCode: string): SpeakerGuess {
  const inLogit = turkishLogit(source, targetCode);
  const outLogit = translation ? -turkishLogit(translation, targetCode) : 0;
  return guessFromLogit(inLogit + 1.3 * outLogit);
}
