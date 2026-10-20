import type { Language } from './types';

// Patient languages, ordered by how often they appear on Turkish hospital wards.
// Turkish is intentionally absent: the staff side is always Turkish.
export const LANGUAGES: Language[] = [
  { code: 'en', name: 'English', nameTr: 'İngilizce', native: 'English', country: 'İngiltere / ABD', flag: 'gb', bcp47: 'en-GB', scripts: ['latin'], register: 'Polite, plain English; avoid jargon or explain it.' },
  { code: 'ar', name: 'Arabic', nameTr: 'Arapça', native: 'العربية', country: 'Suriye / Irak / Körfez', flag: 'sa', bcp47: 'ar-SA', scripts: ['arabic'], rtl: true, register: 'Clear Modern Standard Arabic with everyday words; understand Levantine, Iraqi, Gulf, Egyptian and Maghrebi dialects.' },
  { code: 'ru', name: 'Russian', nameTr: 'Rusça', native: 'Русский', country: 'Rusya / Belarus / Kazakistan', flag: 'ru', bcp47: 'ru-RU', scripts: ['cyrillic'], register: 'Address the patient with «Вы».' },
  { code: 'de', name: 'German', nameTr: 'Almanca', native: 'Deutsch', country: 'Almanya / Avusturya / İsviçre', flag: 'de', bcp47: 'de-DE', scripts: ['latin'], register: 'Address the patient with «Sie».' },
  { code: 'fr', name: 'French', nameTr: 'Fransızca', native: 'Français', country: 'Fransa / Belçika / Kuzey Afrika', flag: 'fr', bcp47: 'fr-FR', scripts: ['latin'], register: 'Address the patient with «vous».' },
  { code: 'ro', name: 'Romanian', nameTr: 'Romence', native: 'Română', country: 'Romanya / Moldova', flag: 'ro', bcp47: 'ro-RO', scripts: ['latin'], register: 'Address the patient with «dumneavoastră».' },
  { code: 'zh', name: 'Mandarin Chinese', nameTr: 'Çince (Mandarin)', native: '中文', country: 'Çin / Tayvan', flag: 'cn', bcp47: 'zh-CN', scripts: ['han'], register: 'Use «您» and Simplified characters.' },
  { code: 'it', name: 'Italian', nameTr: 'İtalyanca', native: 'Italiano', country: 'İtalya / İsviçre', flag: 'it', bcp47: 'it-IT', scripts: ['latin'], register: 'Address the patient with «Lei».' },
  { code: 'es', name: 'Spanish', nameTr: 'İspanyolca', native: 'Español', country: 'İspanya / Latin Amerika', flag: 'es', bcp47: 'es-ES', scripts: ['latin'], register: 'Address the patient with «usted».' },
  { code: 'ja', name: 'Japanese', nameTr: 'Japonca', native: '日本語', country: 'Japonya', flag: 'jp', bcp47: 'ja-JP', scripts: ['han', 'kana'], register: 'Use gentle です・ます teineigo, e.g. 「少しチクッとしますね」.' },
  { code: 'fa', name: 'Persian', nameTr: 'Farsça', native: 'فارسی', country: 'İran / Tacikistan', flag: 'ir', bcp47: 'fa-IR', scripts: ['arabic'], rtl: true, register: 'Address the patient with «شما».' },
  { code: 'ka', name: 'Georgian', nameTr: 'Gürcüce', native: 'ქართული', country: 'Gürcistan', flag: 'ge', bcp47: 'ka-GE', scripts: ['georgian'], register: 'Use the polite plural «თქვენ».' },
  { code: 'az', name: 'Azerbaijani', nameTr: 'Azerice', native: 'Azərbaycanca', country: 'Azerbaycan', flag: 'az', bcp47: 'az-AZ', scripts: ['latin', 'arabic'], register: 'Speak Azerbaijani (not Turkish) and address the patient with «Siz».' },
  { code: 'uz', name: 'Uzbek', nameTr: 'Özbekçe', native: 'Oʻzbekcha', country: 'Özbekistan', flag: 'uz', bcp47: 'uz-UZ', scripts: ['latin', 'cyrillic'], register: 'Address the patient with «Siz».' },
  { code: 'tk', name: 'Turkmen', nameTr: 'Türkmence', native: 'Türkmençe', country: 'Türkmenistan', flag: 'tm', bcp47: 'tk-TM', scripts: ['latin'], register: 'Speak Turkmen (not Turkish) and address the patient with «Siz».' },
  { code: 'kk', name: 'Kazakh', nameTr: 'Kazakça', native: 'Қазақша', country: 'Kazakistan', flag: 'kz', bcp47: 'kk-KZ', scripts: ['cyrillic', 'latin'], register: 'Address the patient with «Сіз».' },
  { code: 'ky', name: 'Kyrgyz', nameTr: 'Kırgızca', native: 'Кыргызча', country: 'Kırgızistan', flag: 'kg', bcp47: 'ky-KG', scripts: ['cyrillic'], register: 'Address the patient with «Сиз».' },
  { code: 'uk', name: 'Ukrainian', nameTr: 'Ukraynaca', native: 'Українська', country: 'Ukrayna', flag: 'ua', bcp47: 'uk-UA', scripts: ['cyrillic'], register: 'Address the patient with «Ви».' },
  { code: 'sr', name: 'Serbian / Montenegrin', nameTr: 'Sırpça / Karadağca', native: 'Српски / Srpski', country: 'Sırbistan / Karadağ', flag: 'rs', bcp47: 'sr-RS', scripts: ['cyrillic', 'latin'], register: 'Address the patient with «Vi».' },
  { code: 'bs', name: 'Bosnian', nameTr: 'Boşnakça', native: 'Bosanski', country: 'Bosna Hersek', flag: 'ba', bcp47: 'bs-BA', scripts: ['latin'], register: 'Address the patient with «Vi».' },
  { code: 'hr', name: 'Croatian', nameTr: 'Hırvatça', native: 'Hrvatski', country: 'Hırvatistan', flag: 'hr', bcp47: 'hr-HR', scripts: ['latin'], register: 'Address the patient with «Vi».' },
  { code: 'bg', name: 'Bulgarian', nameTr: 'Bulgarca', native: 'Български', country: 'Bulgaristan', flag: 'bg', bcp47: 'bg-BG', scripts: ['cyrillic'], register: 'Address the patient with «Вие».' },
  { code: 'el', name: 'Greek', nameTr: 'Yunanca', native: 'Ελληνικά', country: 'Yunanistan / Kıbrıs', flag: 'gr', bcp47: 'el-GR', scripts: ['greek'], register: 'Address the patient with «εσείς».' },
  { code: 'pl', name: 'Polish', nameTr: 'Lehçe', native: 'Polski', country: 'Polonya', flag: 'pl', bcp47: 'pl-PL', scripts: ['latin'], register: 'Address the patient with «Pan / Pani».' },
  { code: 'nl', name: 'Dutch', nameTr: 'Felemenkçe', native: 'Nederlands', country: 'Hollanda / Belçika', flag: 'nl', bcp47: 'nl-NL', scripts: ['latin'], register: 'Address the patient with «u».' },
  { code: 'pt', name: 'Portuguese', nameTr: 'Portekizce', native: 'Português', country: 'Portekiz / Brezilya', flag: 'pt', bcp47: 'pt-PT', scripts: ['latin'], register: 'Address the patient with «o senhor / a senhora».' },
  { code: 'ko', name: 'Korean', nameTr: 'Korece', native: '한국어', country: 'Güney Kore', flag: 'kr', bcp47: 'ko-KR', scripts: ['hangul'], register: 'Use the polite 해요체 / 합니다체.' },
  { code: 'hi', name: 'Hindi', nameTr: 'Hintçe', native: 'हिन्दी', country: 'Hindistan', flag: 'in', bcp47: 'hi-IN', scripts: ['devanagari'], register: 'Address the patient with «आप».' },
  { code: 'ur', name: 'Urdu', nameTr: 'Urduca', native: 'اردو', country: 'Pakistan / Hindistan', flag: 'pk', bcp47: 'ur-PK', scripts: ['arabic'], rtl: true, register: 'Address the patient with «آپ».' },
  { code: 'bn', name: 'Bengali', nameTr: 'Bengalce', native: 'বাংলা', country: 'Bangladeş / Hindistan', flag: 'bd', bcp47: 'bn-BD', scripts: ['bengali'], register: 'Address the patient with «আপনি».' },
  { code: 'ku', name: 'Kurdish', nameTr: 'Kürtçe (Kurmancî / Soranî)', native: 'Kurdî', country: 'Bölgesel / Irak', flag: null, bcp47: 'ku', scripts: ['latin', 'arabic'], register: 'Answer in the dialect the patient uses (Kurmanji in Latin script or Sorani); never answer in Turkish.' },
  { code: 'sq', name: 'Albanian', nameTr: 'Arnavutça', native: 'Shqip', country: 'Arnavutluk / Kosova', flag: 'al', bcp47: 'sq-AL', scripts: ['latin'], register: 'Address the patient with «ju».' },
  { code: 'so', name: 'Somali', nameTr: 'Somalice', native: 'Soomaali', country: 'Somali', flag: 'so', bcp47: 'so-SO', scripts: ['latin'] },
  { code: 'ps', name: 'Pashto / Dari', nameTr: 'Peştuca / Darice', native: 'پښتو / دری', country: 'Afganistan', flag: 'af', bcp47: 'ps-AF', scripts: ['arabic'], rtl: true, register: 'Answer in the language the patient uses (Pashto or Dari).' },
  { code: 'he', name: 'Hebrew', nameTr: 'İbranice', native: 'עברית', country: 'İsrail', flag: 'il', bcp47: 'he-IL', scripts: ['hebrew'], rtl: true },
  { code: 'sv', name: 'Swedish', nameTr: 'İsveççe', native: 'Svenska', country: 'İsveç', flag: 'se', bcp47: 'sv-SE', scripts: ['latin'] },
  { code: 'no', name: 'Norwegian', nameTr: 'Norveççe', native: 'Norsk', country: 'Norveç', flag: 'no', bcp47: 'nb-NO', scripts: ['latin'] },
  { code: 'da', name: 'Danish', nameTr: 'Danimarkaca', native: 'Dansk', country: 'Danimarka', flag: 'dk', bcp47: 'da-DK', scripts: ['latin'] },
  { code: 'fi', name: 'Finnish', nameTr: 'Fince', native: 'Suomi', country: 'Finlandiya', flag: 'fi', bcp47: 'fi-FI', scripts: ['latin'] },
  { code: 'hu', name: 'Hungarian', nameTr: 'Macarca', native: 'Magyar', country: 'Macaristan', flag: 'hu', bcp47: 'hu-HU', scripts: ['latin'], register: 'Use the polite «Ön» form.' },
  { code: 'cs', name: 'Czech', nameTr: 'Çekçe', native: 'Čeština', country: 'Çekya', flag: 'cz', bcp47: 'cs-CZ', scripts: ['latin'], register: 'Address the patient with «Vy».' },
  { code: 'sk', name: 'Slovak', nameTr: 'Slovakça', native: 'Slovenčina', country: 'Slovakya', flag: 'sk', bcp47: 'sk-SK', scripts: ['latin'], register: 'Address the patient with «Vy».' },
  { code: 'sl', name: 'Slovenian', nameTr: 'Slovence', native: 'Slovenščina', country: 'Slovenya', flag: 'si', bcp47: 'sl-SI', scripts: ['latin'], register: 'Address the patient with «Vi».' },
  { code: 'mk', name: 'Macedonian', nameTr: 'Makedonca', native: 'Македонски', country: 'Kuzey Makedonya', flag: 'mk', bcp47: 'mk-MK', scripts: ['cyrillic'], register: 'Address the patient with «Вие».' },
  { code: 'id', name: 'Indonesian', nameTr: 'Endonezce', native: 'Bahasa Indonesia', country: 'Endonezya', flag: 'id', bcp47: 'id-ID', scripts: ['latin'], register: 'Address the patient with «Bapak / Ibu».' },
  { code: 'ms', name: 'Malay', nameTr: 'Malayca', native: 'Bahasa Melayu', country: 'Malezya', flag: 'my', bcp47: 'ms-MY', scripts: ['latin'], register: 'Address the patient with «Encik / Puan».' },
  { code: 'th', name: 'Thai', nameTr: 'Tayca', native: 'ไทย', country: 'Tayland', flag: 'th', bcp47: 'th-TH', scripts: ['thai'], register: 'End sentences politely with ครับ/ค่ะ.' },
  { code: 'vi', name: 'Vietnamese', nameTr: 'Vietnamca', native: 'Tiếng Việt', country: 'Vietnam', flag: 'vn', bcp47: 'vi-VN', scripts: ['latin'] },
  { code: 'tl', name: 'Filipino / Tagalog', nameTr: 'Filipince (Tagalog)', native: 'Filipino', country: 'Filipinler', flag: 'ph', bcp47: 'fil-PH', scripts: ['latin'], register: 'Use «po» and «opo» for politeness.' },
  { code: 'sw', name: 'Swahili', nameTr: 'Svahili', native: 'Kiswahili', country: 'Tanzanya / Kenya', flag: 'tz', bcp47: 'sw-TZ', scripts: ['latin'] },
  { code: 'hy', name: 'Armenian', nameTr: 'Ermenice', native: 'Հայերեն', country: 'Ermenistan', flag: 'am', bcp47: 'hy-AM', scripts: ['armenian'], register: 'Address the patient with «Դուք».' },
  { code: 'lt', name: 'Lithuanian', nameTr: 'Litvanca', native: 'Lietuvių', country: 'Litvanya', flag: 'lt', bcp47: 'lt-LT', scripts: ['latin'], register: 'Address the patient with «Jūs».' },
  { code: 'lv', name: 'Latvian', nameTr: 'Letonca', native: 'Latviešu', country: 'Letonya', flag: 'lv', bcp47: 'lv-LV', scripts: ['latin'], register: 'Address the patient with «Jūs».' },
  { code: 'et', name: 'Estonian', nameTr: 'Estonca', native: 'Eesti', country: 'Estonya', flag: 'ee', bcp47: 'et-EE', scripts: ['latin'], register: 'Address the patient with «Teie».' },
  { code: 'am', name: 'Amharic', nameTr: 'Amharca', native: 'አማርኛ', country: 'Etiyopya', flag: 'et', bcp47: 'am-ET', scripts: ['ethiopic'] },
  { code: 'mn', name: 'Mongolian', nameTr: 'Moğolca', native: 'Монгол', country: 'Moğolistan', flag: 'mn', bcp47: 'mn-MN', scripts: ['cyrillic'], register: 'Address the patient with «Та».' },
  { code: 'ne', name: 'Nepali', nameTr: 'Nepalce', native: 'नेपाली', country: 'Nepal', flag: 'np', bcp47: 'ne-NP', scripts: ['devanagari'], register: 'Address the patient with «तपाईं».' },
  { code: 'pa', name: 'Punjabi', nameTr: 'Pencapça', native: 'ਪੰਜਾਬੀ', country: 'Hindistan / Pakistan', flag: 'in', bcp47: 'pa-IN', scripts: ['gurmukhi', 'arabic'], register: 'Address the patient with «ਤੁਸੀਂ».' },
  { code: 'ta', name: 'Tamil', nameTr: 'Tamilce', native: 'தமிழ்', country: 'Hindistan / Sri Lanka', flag: 'lk', bcp47: 'ta-IN', scripts: ['tamil'], register: 'Address the patient with «நீங்கள்».' },
];

export const DEFAULT_LANGUAGE = LANGUAGES[0];

const BY_CODE = new Map(LANGUAGES.map((l) => [l.code, l]));

export function getLanguage(code: string | undefined | null): Language {
  return (code && BY_CODE.get(code)) || DEFAULT_LANGUAGE;
}

export const TURKISH_BCP47 = 'tr-TR';
