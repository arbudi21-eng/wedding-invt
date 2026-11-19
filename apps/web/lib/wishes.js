// Tokenise Indonesian/English guest wishes and count the meaningful words,
// feeding the word cloud on /manage/{slug}/kirim.

// Indonesian + English function words / fillers that carry no meaning in a
// cloud. Content words of a wedding (semoga, bahagia, love, …) stay in.
const STOPWORDS = new Set([
  // id — kata tugas & pengisi
  'yang', 'dan', 'di', 'ke', 'dari', 'untuk', 'dengan', 'pada', 'dalam',
  'itu', 'ini', 'kamu', 'kami', 'kita', 'aku', 'saya', 'anda',
  'nya', 'ada', 'juga', 'akan', 'sudah', 'telah', 'atau', 'karena',
  'seperti', 'pun', 'lah', 'kok', 'sih', 'mu', 'ku', 'mau',
  'ga', 'gak', 'enggak', 'kan', 'adalah', 'merupakan',
  'bismillah', 'amiin', 'amin', 'minal', 'aidin', 'walfaizin',
  // en — function words & fillers
  'the', 'and', 'to', 'of', 'a', 'an', 'in', 'on', 'for', 'with', 'is',
  'are', 'be', 'was', 'were', 'you', 'your', 'i', 'we', 'our',
  'it', 'its', 'at', 'by', 'this', 'that', 'from', 'as', 'have',
  'has', 'will', 'can', 'very', 'much', 'so', 'too', 'just', 'my', 'may',
]);

/**
 * Lower-case, strip everything that is not a letter/number, drop stopwords
 * and very short tokens. Returns tokens in reading order.
 */
export function tokenize(text) {
  if (!text) return [];
  return String(text)
    .toLowerCase()
    // keep unicode letters & digits, drop the rest
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
}

export function wordFrequencies(messages, { limit = 50 } = {}) {
  const counts = new Map();
  for (const message of messages || []) {
    for (const token of tokenize(message)) {
      counts.set(token, (counts.get(token) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word))
    .slice(0, limit);
}
