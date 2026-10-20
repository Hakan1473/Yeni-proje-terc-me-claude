import { fold } from './text';
import type { TutorialKind } from './types';

/**
 * Teaching-intent detection for the two bedside tutorial videos.
 *
 * A video is shown only when staff are teaching ("Ağrınız olursa bu butona
 * basın"), never for questions about the device ("Butona siz mi bastınız?",
 * "Triflow'u kullandınız mı?"). Each sentence is judged on its own, so a
 * sentence that teaches still counts when another sentence asks a question.
 */

export const TUTORIAL_VIDEOS: Record<TutorialKind, { url: string; webm: string; title: string }> = {
  nurse_call: { url: '/videos/nurse-call.mp4', webm: '/videos/nurse-call.webm', title: 'Hemşire Çağrı Butonu Kullanımı' },
  triflow: { url: '/videos/triflow.mp4', webm: '/videos/triflow.webm', title: 'Triflow Solunum Egzersizi' },
};

const any = (patterns: RegExp[], text: string) => patterns.some((p) => p.test(text));

// Text is folded (lowercase, no diacritics) before matching.
const NURSE_CALL_TOPIC = [
  /hemsire\s*cagir/, /cagri\s*(buton|zil|dugme|kordon|ip)/, /cagirma\s*buton/, /hasta\s*cagri/, /kirmizi\s*buton/,
  /(hemsireyi|beni|bizi)\s*cagir/, /buton\w*\s.*(cagir|haber\s*ver|yardim|ihtiyac|sikayet|agri|bas\s*donme|yatak)/,
  /(cagir|haber\s*ver|yardim|ihtiyac|sikayet|agri|bas\s*donme).*buton/, /zil\w*\s*bas/, /nurse\s*call/, /call\s*(bell|button)/,
  /bouton\s*d.?appel/, /sonnette/, /schwesternruf|ruftaste/, /boton\s*de\s*llamada/, /кнопк\w*\s*вызов/, /زر\s*استدعاء/,
  /ナースコール/, /呼叫铃/,
];

const NURSE_CALL_INQUIRY = [
  /siz\s*mi\s*(cagirdiniz|bastiniz|aktif)/, /(yanlislikla|kazara)\s*mi/, /kim\s*basti/, /(cagirdiniz|bastiniz)\s*mi/,
  /neden\s*(bastiniz|cagirdiniz)/, /basmadiniz\s*degil\s*mi/, /(bozuldu|calismiyor|arizali|bozuk)\s*m[iu]/,
  /did\s*you\s*(call|press|push)/, /pressed\s*(it\s*)?by\s*mistake|accidentally/, /(is\s*the\s*button\s*broken|not\s*working)/,
];

const NURSE_CALL_TEACHING = [
  /istedi?giniz\s*zaman/, /her\s*zaman\s*(cagir|bas)/, /(ihtiyac|sikayet|agri|bas\s*donme)\w*\s*ol(ursa|dugunda|dugu\s*zaman)/,
  /bir\s*sey\s*olursa/, /(kalk|ayaga\s*kalk|yataktan\s*kalk)\w*\s*once/, /yardim\s*icin/, /bu\s*sekilde|su\s*sekilde/,
  /nasil\s*kullan/, /kullan(maniz\s*gerek|acaksiniz|malisiniz|abilirsiniz|in)/, /goster(eyim|ecegim)/, /ogret(eyim|ecegim)/,
  /anlat(ayim|acagim)/, /butonu\s*kullanarak/, /(buton\w*|zile|dugmeye)\s*bas(in|iniz|abilirsiniz|arak)?/,
  /cagir(abilirsiniz|in|iniz)/, /haber\s*ver(in|iniz|ebilirsiniz)/, /(basucunuzdaki|yataginizin\s*yanindaki|buradaki)\s*buton/,
  /press\s*(this|the)?\s*button/, /whenever\s*you\s*need/, /if\s*you\s*(need|have)/, /to\s*call\s*(the\s*)?nurse/,
  /appuyez/, /drucken\s*sie/, /pulse\s*el/, /нажмите/,
];

const TRIFLOW_TOPIC = [
  /tri-?flo/, /traflov/, /(solunum|nefes|akciger)\s*egzersiz/, /spirometre/, /toplu\s*(solunum|nefes)/,
  /solunum\s*cihaz.*(egzersiz|top|cek|derin\s*nefes|ufle|agiz)/, /incentive\s*spirometer/, /(breathing|respiratory)\s*exerciser/,
  /atemtrainer/, /spirometre/, /ejercitador\s*respiratorio/,
];

const TRIFLOW_INQUIRY = [
  /kullan(iyor\s*musunuz|diniz\s*mi|madiniz\s*mi)/, /en\s*son\s*ne\s*zaman/, /ne\s*zaman\s*(kullandiniz|yaptiniz|cektiniz)/,
  /(yaptiniz|cektiniz|aldiniz|getirdiniz)\s*mi/, /kac\s*(kere|defa)\s*(yaptiniz|cektiniz)/, /nerede/, /yaninizda\s*mi/,
  /(temizlendi|yikandi|bozuldu|kirildi)\s*mi/, /(zorlandiniz|yapabildiniz)\s*mi/, /are\s*you\s*using|have\s*you\s*used|when\s*did\s*you/,
  /where\s*is/,
];

const TRIFLOW_TEACHING = [
  /bu\s*sekilde|su\s*sekilde/, /nasil\s*kullan/, /kullan(maniz\s*gerek|acaksiniz|malisiniz|in)/, /goster(eyim|ecegim)/,
  /ogret(eyim|ecegim)/, /anlat(ayim|acagim)/, /agziniza\s*(al|yerlestir)/, /agizlig\w*\s*(kavra|al)/, /derin\s*nefes\s*(al|cek)/,
  /icinize\s*cek/, /nefes\w*\s*cek(in|iniz|eceksiniz|erek)/, /kuvvetli\w*\s*(bir\s*sekilde\s*)?cek/, /top\w*\s*(kaldir|havada|yukari)/,
  /(uc|3)\s*topu/, /saatte\s*bir/, /her\s*saat/, /gunde\s*\d+\s*(kez|defa)/, /\d+\s*(defa|kez|kere)\s*(cek|yap|tekrar)/,
  /duzenli\s*(olarak\s*)?(cek|kullan|yap)/, /tekrar(la|\s*edin)/, /akciger\w*\s*(acmak|acilmasi)/, /ameliyat\s*sonrasi/,
  /inhale\s*deeply|breathe\s*in\s*deeply/, /mouthpiece/, /raise\s*the\s*balls|balls\s*up/, /every\s*hour/, /expand\s*your\s*lungs/,
  /inspirez/, /tief\s*einatmen/, /inhale\s*profundamente/,
];

function sentences(text: string): { text: string; question: boolean }[] {
  return Array.from(text.matchAll(/([^.!?]+)([.!?]*)/g))
    .map((m) => ({ text: m[1].trim(), question: m[2].includes('?') }))
    .filter((s) => s.text.length > 3);
}

function teaches(text: string, topic: RegExp[], inquiry: RegExp[], teaching: RegExp[]): boolean {
  const folded = fold(text);
  // The topic may be named in one sentence and the teaching given in the next
  if (!any(topic, folded)) return false;
  return sentences(folded).some((s) => !s.question && !any(inquiry, s.text) && any(teaching, s.text));
}

/** Detect a staff teaching moment in the nurse's words or their translation. */
export function detectTutorial(source: string, translation?: string): TutorialKind | undefined {
  for (const text of [source, translation ?? '']) {
    if (!text) continue;
    if (teaches(text, TRIFLOW_TOPIC, TRIFLOW_INQUIRY, TRIFLOW_TEACHING)) return 'triflow';
    if (teaches(text, NURSE_CALL_TOPIC, NURSE_CALL_INQUIRY, NURSE_CALL_TEACHING)) return 'nurse_call';
  }
  return undefined;
}
