// Flat illustrations for each game's thumbnail (160 × 96 viewBox).
const Tile = ({ x, y, ch, hot }) => (
  <g transform={`translate(${x} ${y})`}>
    <rect width="22" height="26" rx="4" fill={hot ? 'var(--brand)' : '#FBF7EE'} stroke="rgba(0,0,0,.12)" />
    <rect y="22" width="22" height="4" rx="2" fill="rgba(0,0,0,.08)" />
    <text x="11" y="18" textAnchor="middle" fontSize="13" fontWeight="700" fill={hot ? '#fff' : '#1D2433'}>{ch}</text>
  </g>
);

function WordArt() {
  return (
    <>
      {['C', 'A', 'T'].map((c, i) => <Tile key={i} x={14 + i * 24} y={22} ch={c} hot={i === 2} />)}
      {['T', 'E', 'A'].map((c, i) => <Tile key={'b' + i} x={76 + i * 24} y={48} ch={c} hot={i === 0} />)}
      <path d="M77 46 C 70 40, 68 40, 62 36" fill="none" stroke="var(--brand)" strokeWidth="2" strokeDasharray="3 3" />
    </>
  );
}

function XOArt() {
  const X = (cx, cy) => <path d={`M${cx - 7} ${cy - 7}l14 14M${cx + 7} ${cy - 7}L${cx - 7} ${cy + 7}`} stroke="var(--brand)" strokeWidth="3.5" strokeLinecap="round" />;
  const O = (cx, cy) => <circle cx={cx} cy={cy} r="7.5" fill="none" stroke="var(--accent)" strokeWidth="3.5" />;
  return (
    <g transform="translate(40 8)">
      <path d="M27 4v72M53 4v72M4 27h72M4 53h72" stroke="var(--art-line)" strokeWidth="2.5" strokeLinecap="round" />
      {X(14, 14)}{O(40, 14)}{O(66, 14)}{X(40, 40)}{O(14, 66)}{X(66, 66)}
      <path d="M6 6L74 74" stroke="var(--danger)" strokeWidth="2.5" strokeLinecap="round" opacity=".9" />
    </g>
  );
}

function PatchArt() {
  const P = [
    [0, 0, 2, 2, '#9CC9B4', 4], [2, 0, 3, 1, '#E9C77B', 3], [5, 0, 1, 3, '#A9BDE8', 3],
    [2, 1, 3, 2, '#E8A6A1', 6], [0, 2, 2, 1, '#C7B3E6', 2],
  ];
  const u = 13;
  return (
    <g transform="translate(41 9)">
      <rect width={6 * u} height={3 * u + 39} fill="none" />
      {P.map(([x, y, w, h, c, n], i) => (
        <g key={i}>
          <rect x={x * u + 1.5} y={y * u * 2 + 1.5} width={w * u - 3} height={h * u * 2 - 3} rx="4" fill={c} />
          <rect x={x * u + 4} y={y * u * 2 + 4} width={w * u - 8} height={h * u * 2 - 8} rx="2.5" fill="none" stroke="rgba(0,0,0,.25)" strokeDasharray="2.5 2" />
          <text x={x * u + (w * u) / 2} y={y * u * 2 + h * u + 4} textAnchor="middle" fontSize="10" fontWeight="700" fill="#1D2433">{n}</text>
        </g>
      ))}
    </g>
  );
}

function CardsArt() {
  const card = (rot, x, rank, suit, red) => (
    <g transform={`translate(${x} 14) rotate(${rot} 22 64)`}>
      <rect width="44" height="62" rx="5" fill="#fff" stroke="rgba(0,0,0,.15)" />
      <text x="6" y="14" fontSize="11" fontWeight="700" fill={red ? '#C62828' : '#1D2433'}>{rank}</text>
      <text x="22" y="40" textAnchor="middle" fontSize="20" fill={red ? '#C62828' : '#1D2433'}>{suit}</text>
    </g>
  );
  return (
    <>
      {card(-14, 42, 'A', '♠')}
      {card(0, 58, '7', '♥', true)}
      {card(14, 74, 'K', '♦', true)}
    </>
  );
}

const ARTS = { wordchain: WordArt, xo: XOArt, patches: PatchArt, cards: CardsArt };

export function GameArt({ kind }) {
  const A = ARTS[kind];
  return (
    <svg className="game-art" viewBox="0 0 160 96" aria-hidden="true">
      <A />
    </svg>
  );
}
