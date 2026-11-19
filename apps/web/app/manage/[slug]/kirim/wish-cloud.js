'use client';

const ROTATIONS = ['-5deg', '0deg', '0deg', '4deg', '-3deg', '6deg', '0deg', '-6deg'];
const COLORS = ['var(--accent)', 'var(--ok)', 'var(--warn)', '#8a4b16', 'var(--ink-soft)'];

function fontSize(count, maxCount) {
  if (maxCount <= 1) return 1.2;
  const ratio = count / maxCount;
  return Math.round((0.85 + ratio * 1.9) * 100) / 100;
}

function hashString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * Flex-wrap word cloud: words sorted by frequency, sized by count, rotated
 * and tinted deterministically. No canvas, no deps — accessible & printable.
 */
export default function WishCloud({ words }) {
  if (!words || words.length === 0) {
    return (
      <p className="muted" style={{ margin: 0 }}>
        Belum ada ucapan dari tamu. Saat tamu mengirim ucapan dari halaman undangan, katanya akan
        muncul di sini.
      </p>
    );
  }

  const maxCount = words[0].count;

  return (
    <div className="cloud" role="img" aria-label="Wordcloud ucapan tamu">
      {words.map(({ word, count }) => {
        const h = hashString(word);
        const size = fontSize(count, maxCount);
        return (
          <span
            key={word}
            className="cloud-word"
            title={`${word} — ${count}×`}
            style={{
              fontSize: `${size}rem`,
              color: COLORS[h % COLORS.length],
              transform: `rotate(${ROTATIONS[h % ROTATIONS.length]})`,
              opacity: 0.62 + Math.min(0.38, size / 5.5),
            }}
          >
            {word}
          </span>
        );
      })}
    </div>
  );
}
