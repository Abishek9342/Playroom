import { PlayingCard } from './PlayingCard.jsx';
import { ShapeBadge } from '../games/Patches.jsx';
import { Icon } from './Icon.jsx';

// How-to-play guides, one per game. Opened from the game's settings sheet and from the
// help button inside every room.

// card id helper: rank 1..13, suit 0 ♣ 1 ♦ 2 ♥ 3 ♠
const C = (rank, suit) => (rank - 1) * 4 + suit;
const JOKER = 52;

function Cards({ ids }) {
  return <span className="g-cards">{ids.map(c => <PlayingCard key={c} c={c} size="sm" />)}</span>;
}
function Step({ n, title, children }) {
  return (
    <li className="g-step">
      <span className="g-num">{n}</span>
      <div><b>{title}</b>{children && <p className="g-text">{children}</p>}</div>
    </li>
  );
}
function Section({ title, children }) {
  return <section className="g-section"><h3>{title}</h3>{children}</section>;
}
function Leaving({ strict }) {
  return strict
    ? <p className="note"><Icon name="info" size={16} /> Stay on the game screen. Switching apps or tabs for more than 3 seconds takes you out, and the last player standing wins.</p>
    : <p className="note"><Icon name="info" size={16} /> You can switch apps and come back: you’re shown as Away meanwhile. Your turn timer keeps running, so don’t stay away too long.</p>;
}
function MiniBoard({ n, cells }) {
  return (
    <div className="g-xo-board" style={{ '--n': n }} aria-hidden="true">
      {cells.split('').map((v, i) => <span key={i} className={v === 'X' ? 'mark-x' : 'mark-o'}>{v === '.' ? '' : v}</span>)}
    </div>
  );
}

const GUIDES = {
  wordchain: () => (
    <>
      <p className="g-goal">Keep the chain going. Miss your turn and you’re out; the last player standing wins.</p>
      <div className="g-chain" aria-label="Example chain: apple, eagle, elephant, tiger">
        {['apple', 'eagle', 'elephant', 'tiger'].map((w, i) => (
          <span key={w} className="g-word-wrap">
            <span className="g-word">{w.slice(0, -1)}<b>{w.slice(-1)}</b></span>
            {i < 3 && <Icon name="arrow" size={14} />}
          </span>
        ))}
      </div>
      <Section title="On your turn">
        <ol className="g-steps">
          <Step n={1} title="Start with the last letter">Your word begins with the last letter of the word before it. The first player can start with anything.</Step>
          <Step n={2} title="Real words only">At least 2 letters, letters only. Words are checked against a 275,000-word English dictionary.</Step>
          <Step n={3} title="No repeats">A word that’s already been played can’t be used again.</Step>
          <Step n={4} title="Beat the clock">You have 20 seconds. Run out of time and you’re out of the game.</Step>
        </ol>
      </Section>
      <Section title="Tips">
        <ul className="g-tips">
          <li>End on a hard letter like x, z, q or j to squeeze the next player.</li>
          <li>Keep a few words ready for common endings like e, s, t and y.</li>
        </ul>
      </Section>
      <Leaving strict />
    </>
  ),

  xo: () => (
    <>
      <p className="g-goal">Fill a whole line with your marks before your opponent does: a full row, column or diagonal.</p>
      <div className="g-boards">
        <div className="g-board-card"><MiniBoard n={3} cells="X.O.XO..X" /><b>3×3 board</b><span>Three in a row wins</span></div>
        <div className="g-board-card"><MiniBoard n={5} cells="X...OOX...O.X.....XO....X" /><b>5×5 board</b><span>All five in a row wins</span></div>
      </div>
      <Section title="How a match works">
        <ol className="g-steps">
          <Step n={1} title="The host picks the format">Single game, best of 3 or best of 5. That’s the number of rounds, never more.</Step>
          <Step n={2} title="Take turns">The host plays X. Who goes first switches every round, so it stays fair.</Step>
          <Step n={3} title="Draws use up a round">When nobody can complete a line any more, the round ends straight away as a draw: no need to fill the board. Nobody scores, and it still counts towards the 3 or 5. Most round wins at the end takes the match; level is a drawn match. If someone can’t be caught, it ends early.</Step>
          <Step n={4} title="20 seconds per move">In a single game, running out of time puts you out. In a series, you lose that round.</Step>
        </ol>
      </Section>
      <Section title="After the game">
        <p className="g-text">Tap <b>Rematch</b> on the results. When both players agree, a new match starts in the same room with the same settings.</p>
      </Section>
      <Leaving />
    </>
  ),

  patches: () => (
    <>
      <p className="g-goal">Everyone gets the same grid. Cover every square with patches that match their clues. The first correct quilt wins.</p>
      <Section title="The rules">
        <ol className="g-steps">
          <Step n={1} title="One clue per patch">Every patch is a rectangle holding exactly one clue. No gaps, no overlaps.</Step>
          <Step n={2} title="The number is the size">A 6 means the patch covers 6 squares, like 2×3 or 1×6.</Step>
          <Step n={3} title="The badge is the shape">The shape behind the number tells you which way the patch runs.</Step>
        </ol>
      </Section>
      <div className="g-shapes">
        {[
          ['square', 'Square', 'Same width and height: 1×1, 2×2, 3×3', 4, 0],
          ['wide', 'Wide', 'Wider than it is tall: 1×2, 2×3', 6, 1],
          ['tall', 'Tall', 'Taller than it is wide: 2×1, 3×2', 6, 2],
          ['any', 'Any', 'Any rectangle with the right number of squares', 4, 3],
        ].map(([shape, name, text, n, color]) => (
          <div key={shape} className="g-shape">
            <span className="g-badge"><ShapeBadge shape={shape} n={n} color={color} /></span>
            <div><b>{name}</b><span>{text}</span></div>
          </div>
        ))}
      </div>
      <p className="g-text">Some clues show only a shape and no number. That patch can be any size, as long as it has that shape.</p>
      <Section title="Drawing">
        <ul className="g-tips">
          <li>Drag from one corner of a patch to the opposite corner.</li>
          <li>A patch takes its clue’s colour, and its outline turns solid once it matches.</li>
          <li>Tap a patch to remove it. Drawing over a patch replaces it.</li>
          <li>Start with clues that only fit one way: big numbers near corners, and squares.</li>
        </ul>
      </Section>
      <Leaving />
    </>
  ),

  cards: () => (
    <>
      <p className="g-goal">Keep the points in your hand low. Reach the exit point (200 unless the host changes it) and you’re out; the last player left wins.</p>
      <Section title="Card points">
        <div className="g-grid">
          <div><Cards ids={[C(1, 3)]} /><span>Ace = 1</span></div>
          <div><Cards ids={[C(7, 2)]} /><span>2–10 = face value</span></div>
          <div><Cards ids={[C(12, 1)]} /><span>J, Q, K = 10</span></div>
          <div><Cards ids={[JOKER]} /><span>Joker = 0</span></div>
        </div>
      </Section>
      <Section title="Your turn: drop, then pick">
        <ol className="g-steps">
          <Step n={1} title="Drop">Throw away one card, or one set. Only one set per turn, never two at once.</Step>
          <Step n={2} title="Pick">Take the top card of the draw pile, or one card from the previous player’s drop. Everyone sees which card you take from a drop.</Step>
          <Step n={3} title="Or Show instead">Think your hand is the lowest at the table? Tap Show instead of dropping.</Step>
        </ol>
      </Section>
      <Section title="Sets you can drop">
        <div className="g-grid g-grid-sets">
          <div><Cards ids={[C(5, 3), C(5, 2)]} /><span>Pair</span></div>
          <div><Cards ids={[C(9, 0), C(9, 1), C(9, 2)]} /><span>3 or 4 of a kind</span></div>
          <div><Cards ids={[C(4, 3), C(5, 3), C(6, 3)]} /><span>Run: 3+ in a row, one suit</span></div>
          <div><Cards ids={[C(12, 2), C(13, 2), C(1, 2)]} /><span>Q-K-A (Ace high)</span></div>
          <div><Cards ids={[C(1, 1), C(2, 1), C(3, 1)]} /><span>A-2-3 (Ace low)</span></div>
          <div><Cards ids={[C(7, 0), JOKER, C(9, 0)]} /><span>Joker fills one gap</span></div>
        </div>
        <p className="g-text">Runs don’t wrap round, so K-A-2 isn’t a run. A run takes one joker at most.</p>
      </Section>
      <Section title="Show">
        <ul className="g-tips">
          <li><b>Valid show:</b> you have strictly the fewest points. You add 0 and everyone else adds their hand.</li>
          <li><b>Invalid show:</b> someone has the same or fewer. You add 50 and everyone else adds 0.</li>
        </ul>
      </Section>
      <Section title="Good to know">
        <ul className="g-tips">
          <li>30 seconds per turn. If time runs out, your highest card is dropped and you draw.</li>
          <li>On a phone, turn it sideways for the full table.</li>
        </ul>
      </Section>
      <Leaving />
    </>
  ),
};

export function GuideBody({ game }) {
  const G = GUIDES[game];
  return <div className="guide">{G && <G />}</div>;
}
