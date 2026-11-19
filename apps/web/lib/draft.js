// Draft content: the JSONB shape stored in `weddings.content`.
//
// Every value that comes from a form passes through here before it reaches
// Postgres. The database enforces the outer shape (object, <= 256 KB); this
// module enforces the inner shape, lengths and date validity.

import { DEFAULT_DESIGN, isDesignId } from './designs.js';

// Keep in sync with database/0002_saas.sql.
export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*-[A-Z2-7]{6}$/;

export const LOCALES = ['id', 'en'];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function text(value) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function stringList(value) {
  if (!Array.isArray(value)) return [];
  return value.map(text).map((s) => s.trim()).filter(Boolean);
}

/** One-line field: collapse whitespace, drop control characters, cap length. */
export function cleanLine(value, max) {
  return text(value)
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/** Multi-line field: keep paragraph breaks, drop everything unprintable. */
export function cleanMultiline(value, max) {
  return text(value)
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max);
}

/** A textarea where each line is a separate story beat. */
export function cleanLines(value, maxLines = 20, maxLine = 400) {
  return cleanMultiline(value, 12000)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, maxLines)
    .map((line) => line.slice(0, maxLine));
}

export function cleanTime(value) {
  const s = cleanLine(value, 5);
  return TIME_RE.test(s) ? s : '';
}

/** Only absolute http(s) URLs survive; anything else becomes ''. */
export function cleanUrl(value) {
  const s = cleanLine(value, 500);
  if (!s) return '';
  try {
    const url = new URL(s);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

/**
 * Combine the two form fields exactly the way the studio does:
 * `{date}T{time || '10:00'}:00` with no timezone suffix.
 */
export function buildDateISO(date, time = '10:00') {
  const d = cleanLine(date, 10);
  if (!DATE_RE.test(d)) return '';
  const t = cleanTime(time) || '10:00';
  const iso = `${d}T${t}:00`;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '';
  // Date silently rolls 2027-02-31 into March, so verify the parts.
  if (
    parsed.getFullYear() !== Number(d.slice(0, 4)) ||
    parsed.getMonth() + 1 !== Number(d.slice(5, 7)) ||
    parsed.getDate() !== Number(d.slice(8, 10))
  ) {
    return '';
  }
  return iso;
}

/** Split a stored dateISO into the two inputs the form uses. */
export function splitDateISO(iso) {
  const match = text(iso).match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  return match ? { date: match[1], time: match[2] } : { date: '', time: '10:00' };
}

export function formatDateISO(iso) {
  const { date, time } = splitDateISO(iso);
  if (!date) return '';
  const [year, month, day] = date.split('-').map(Number);
  const label = `${day} ${MONTHS[month - 1] || ''} ${year}`.trim();
  return time ? `${label} · ${time}` : label;
}

/** Fill in every missing key so the UI never has to defend against a sparse draft. */
export function normalizeContent(raw) {
  const c = object(raw);
  const names = Array.isArray(c.names) ? c.names : [];
  const venue = object(c.venue);
  const schedule = object(c.schedule);
  const dress = object(c.dress);
  const story = object(c.story);
  const captions = object(c.captions);
  const video = object(c.video);
  const music = object(c.music);
  const photos = object(c.photos);
  const txt = object(c.text);
  const cpl = object(c.couple);
  const heroEn = object(object(txt.hero).en);
  const heroId = object(object(txt.hero).id);
  const introEn = object(object(txt.intro).en);
  const introId = object(object(txt.intro).id);
  const gm = object(txt.giftMessage);
  const giftMsgEn = cleanMultiline(gm.en, 600);
  const giftMsgId = cleanMultiline(gm.id, 600);
  const manEn = object(object(cpl.man).en);
  const manId = object(object(cpl.man).id);
  const womanEn = object(object(cpl.woman).en);
  const womanId = object(object(cpl.woman).id);
  const storyEn = stringList(story.en);
  const storyId = stringList(story.id);
  const capsEn = stringList(captions.en);
  const capsId = stringList(captions.id);
  const dressEn = cleanMultiline(dress.en, 600);
  const dressId = cleanMultiline(dress.id, 600);

  // Indonesian-only product: an empty half inherits the other half so old
  // drafts filled in either language still render as Indonesian.
  const mirror = (a, b) => (a.length ? a : b);
  const mirrorText = (a, b) => a || b;

  return {
    version: 1,
    names: [cleanLine(names[0], 60), cleanLine(names[1], 60)],
    dateISO: text(c.dateISO),
    venue: {
      name: cleanLine(venue.name, 120),
      address: cleanMultiline(venue.address, 240),
      mapsUrl: cleanUrl(venue.mapsUrl),
    },
    schedule: {
      ceremony: cleanTime(schedule.ceremony),
      reception: cleanTime(schedule.reception),
    },
    dress: {
      en: mirrorText(dressEn, dressId),
      id: mirrorText(dressId, dressEn),
    },
    story: {
      en: mirror(storyEn, storyId),
      id: mirror(storyId, storyEn),
    },
    captions: {
      en: mirror(capsEn, capsId),
      id: mirror(capsId, capsEn),
    },
    gifts: Array.isArray(c.gifts)
      ? c.gifts
          .map((gift) => object(gift))
          .map((gift) => ({
            bank: cleanLine(gift.bank, 60),
            name: cleanLine(gift.name, 80),
            no: cleanLine(gift.no, 40),
          }))
          .filter((gift) => gift.bank && gift.no)
      : [],
    video: { link: cleanUrl(video.link), src: cleanUrl(video.src) },
    music: { url: cleanUrl(music.url) },
    host: cleanLine(c.host, 80),
    locale: c.locale === 'en' ? 'en' : 'id',
    text: {
      hero: {
        en: {
          h: mirrorText(cleanMultiline(heroEn.h, 200), cleanMultiline(heroId.h, 200)),
          hp: mirrorText(cleanMultiline(heroEn.hp, 400), cleanMultiline(heroId.hp, 400)),
        },
        id: {
          h: mirrorText(cleanMultiline(heroId.h, 200), cleanMultiline(heroEn.h, 200)),
          hp: mirrorText(cleanMultiline(heroId.hp, 400), cleanMultiline(heroEn.hp, 400)),
        },
      },
      intro: {
        en: {
          h: mirrorText(cleanMultiline(introEn.h, 120), cleanMultiline(introId.h, 120)),
          p: mirrorText(cleanMultiline(introEn.p, 600), cleanMultiline(introId.p, 600)),
        },
        id: {
          h: mirrorText(cleanMultiline(introId.h, 120), cleanMultiline(introEn.h, 120)),
          p: mirrorText(cleanMultiline(introId.p, 600), cleanMultiline(introEn.p, 600)),
        },
      },
      giftMessage: {
        en: mirrorText(giftMsgEn, giftMsgId),
        id: mirrorText(giftMsgId, giftMsgEn),
      },
    },
    couple: {
      man: {
        en: {
          p: mirrorText(cleanMultiline(manEn.p, 600), cleanMultiline(manId.p, 600)),
          parents: mirrorText(cleanMultiline(manEn.parents, 200), cleanMultiline(manId.parents, 200)),
        },
        id: {
          p: mirrorText(cleanMultiline(manId.p, 600), cleanMultiline(manEn.p, 600)),
          parents: mirrorText(cleanMultiline(manId.parents, 200), cleanMultiline(manEn.parents, 200)),
        },
      },
      woman: {
        en: {
          p: mirrorText(cleanMultiline(womanEn.p, 600), cleanMultiline(womanId.p, 600)),
          parents: mirrorText(cleanMultiline(womanEn.parents, 200), cleanMultiline(womanId.parents, 200)),
        },
        id: {
          p: mirrorText(cleanMultiline(womanId.p, 600), cleanMultiline(womanEn.p, 600)),
          parents: mirrorText(cleanMultiline(womanId.parents, 200), cleanMultiline(womanEn.parents, 200)),
        },
      },
    },
    // Phase 2 replaces these with object-storage paths; the shape is stable.
    photos: {
      cover: text(photos.cover),
      man: text(photos.man),
      woman: text(photos.woman),
      hero: text(photos.hero),
      story: stringList(photos.story),
      album: stringList(photos.album),
    },
  };
}

/**
 * Read a draft form into `{ ok, content, design, errors }`.
 * `errors` is keyed by form field so the UI can render messages inline.
 */
export function draftFromForm(formData) {
  const errors = {};

  const bride = cleanLine(formData.get('bride'), 60);
  const groom = cleanLine(formData.get('groom'), 60);
  if (!bride) errors.bride = 'Enter the first partner’s name.';
  if (!groom) errors.groom = 'Enter the second partner’s name.';

  const date = cleanLine(formData.get('date'), 10);
  const time = cleanLine(formData.get('time'), 5) || '10:00';
  // Drafts may be incomplete: an empty date is allowed, a wrong one is not.
  const dateISO = date ? buildDateISO(date, time) : '';
  if (date && !dateISO) errors.date = 'Choose a real wedding date.';

  const designRaw = cleanLine(formData.get('design'), 60);
  const design = isDesignId(designRaw) ? designRaw : DEFAULT_DESIGN;
  const locale = String(formData.get('locale') || 'id') === 'en' ? 'en' : 'id';

  if (Object.keys(errors).length > 0) {
    return { ok: false, content: null, design, errors };
  }

  const content = {
    version: 1,
    names: [bride, groom],
    dateISO,
    venue: {
      name: cleanLine(formData.get('venueName'), 120),
      address: cleanMultiline(formData.get('venueAddress'), 240),
      mapsUrl: cleanUrl(formData.get('venueMaps')),
    },
    schedule: {
      ceremony: cleanTime(formData.get('ceremony')),
      reception: cleanTime(formData.get('reception')),
    },
    dress: (() => {
      const en = cleanMultiline(formData.get('dressEn'), 600);
      const id = cleanMultiline(formData.get('dressId'), 600);
      return { en: en || id, id: id || en };
    })(),
    story: (() => {
      const en = cleanLines(formData.get('storyEn'));
      const id = cleanLines(formData.get('storyId'));
      return { en: en.length ? en : id, id: id.length ? id : en };
    })(),
    captions: (() => {
      const en = cleanLines(formData.get('capsEn'), 6);
      const id = cleanLines(formData.get('capsId'), 6);
      return { en: en.length ? en : id, id: id.length ? id : en };
    })(),
    gifts: [1, 2, 3]
      .map((n) => ({
        bank: cleanLine(formData.get(`gift${n}Bank`), 60),
        name: cleanLine(formData.get(`gift${n}Name`), 80),
        no: cleanLine(formData.get(`gift${n}No`), 40),
      }))
      .filter((gift) => gift.bank && gift.no),
    video: { link: cleanUrl(formData.get('videoLink')), src: '' },
    music: { url: cleanUrl(formData.get('musicUrl')) },
    host: cleanLine(formData.get('host'), 80),
    locale,
    text: (() => {
      const text = (enKey, idKey, max) => {
        const en = cleanMultiline(formData.get(enKey), max);
        const id = cleanMultiline(formData.get(idKey), max);
        return { en: en || id, id: id || en };
      };
      return {
        hero: { h: text('heroHEn', 'heroHId', 200), hp: text('heroHPEn', 'heroHPId', 400) },
        intro: { h: text('introHEn', 'introHId', 120), p: text('introPEn', 'introPId', 600) },
        giftMessage: text('giftMessageEn', 'giftMessageId', 600),
      };
    })(),
    couple: (() => {
      const partner = (pEn, pId, fEn, fId) => {
        const pEnVal = cleanMultiline(formData.get(pEn), 600);
        const pIdVal = cleanMultiline(formData.get(pId), 600);
        const fEnVal = cleanMultiline(formData.get(fEn), 200);
        const fIdVal = cleanMultiline(formData.get(fId), 200);
        return {
          en: { p: pEnVal || pIdVal, parents: fEnVal || fIdVal },
          id: { p: pIdVal || pEnVal, parents: fIdVal || fEnVal },
        };
      };
      return {
        man: partner('manPEn', 'manPId', 'manFEn', 'manFId'),
        woman: partner('womanPEn', 'womanPId', 'womanFEn', 'womanFId'),
      };
    })(),
    photos: { cover: '', man: '', woman: '', story: [], album: [] },
  };

  return { ok: true, content, design, errors: {} };
}

export function draftTitle(content) {
  const { names } = normalizeContent(content);
  if (names[0] && names[1]) return `${names[0]} & ${names[1]}`;
  return names[0] || names[1] || 'Untitled invitation';
}
