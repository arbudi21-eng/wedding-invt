// Default WhatsApp messages for the "Kirim undangan" screen. The owner can
// replace these in the UI; {nama}, {undangan} and {link} are substituted per
// guest when the wa.me link is built. No message is sent by the app itself.

export const DEFAULT_TEMPLATES = {
  id: 'Halo {nama}, Anda diundang ke pernikahan {undangan}! Buka undangan Anda di sini: {link}',
  en: "Hi {nama}, you're invited to {undangan}'s wedding! Open your invitation here: {link}",
};

// Function replacements keep "$" inside guest names literal.
export function renderTemplate(template, { name, couple, link }) {
  return String(template || '')
    .replace(/\{\{?(nama|nama_tamu|guest)\}?\}/gi, () => name)
    .replace(/\{\{?(undangan|nama_undangan|couple)\}?\}/gi, () => couple)
    .replace(/\{\{?(link|tautan|url)\}?\}/gi, () => link);
}

export function buildShareUrl(siteUrl, slug, code, name, couple, lang, phone, templates) {
  const link = `${siteUrl}/${slug}?c=${code}`;
  const template = templates?.[lang] || templates?.id || DEFAULT_TEMPLATES.id;
  const text = renderTemplate(template, { name, couple, link });
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}
