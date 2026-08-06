/**
 * Glossary on the Learn index — pattern basics + Stats (/patterns/stats) terms.
 * Keep beginner-friendly; formulas match docs/modules/journal.md statistics.
 */

const PATTERN_TERMS = [
  {
    term: 'Closed candle',
    gloss:
      'A bar that has finished; TIP only decides after the bar closes (no mid-bar repaint).',
  },
  {
    term: 'Non-repainting',
    gloss: 'Once a bar is closed, the detect decision for that bar does not flip later.',
  },
  {
    term: 'Prior window',
    gloss:
      'For breakouts, the high/low lookback excludes the signal bar so it cannot raise its own ceiling.',
  },
  {
    term: 'ATR',
    gloss:
      'Average True Range — “how big is a normal bar move?” Used for retest bands, targets, and sizing risk.',
  },
  {
    term: 'R-unit (R)',
    gloss:
      'One unit of risk for a setup, usually ATR at detect. Moves, targets, MFE, and MAE are often measured in R so different symbols are comparable.',
  },
  {
    term: 'Confirmation modes',
    gloss:
      'volume = busy volume on detect bar; close = later bar still beyond level; both = both (default); close_fallback = volume unusable so close-only.',
  },
]

const STATS_TERMS = [
  {
    term: 'Bucket',
    gloss:
      'One stats row = one symbol × pattern type × timeframe (for example RELIANCE · breakout · 5m).',
  },
  {
    term: 'S / F / E',
    gloss:
      'Counts of virtual trades that ended as Success, Fail, or Expired. Shown as three numbers on the Stats table.',
  },
  {
    term: 'Sample size (n)',
    gloss:
      'How many finished setups are in the bucket: n = Success + Fail + Expired. Includes expired so it is the full inventory count.',
  },
  {
    term: 'Resolved n',
    gloss:
      'Setups that finished with a clear win or loss only: resolved n = Success + Fail (expired are left out).',
  },
  {
    term: 'Resolved success % (Resolved %)',
    gloss:
      'Performance rate among decided outcomes: Success ÷ (Success + Fail). Expired do not count. This is the main “Resolved %” column and default sort on Stats.',
  },
  {
    term: 'Inventory success %',
    gloss:
      'Success ÷ sample size (n). Includes expired in the denominator, so it is usually lower than Resolved %. Shown in the row detail panel.',
  },
  {
    term: 'Expired share',
    gloss:
      'Expired ÷ sample size — how often setups timed out without success or fail (session end, max bars, etc.).',
  },
  {
    term: 'MFE (Maximum Favorable Excursion)',
    gloss:
      'Best favorable move the virtual trade saw before it ended — “how good did it get in your direction?” Updated every open bar from price extremes; recorded on both wins and losses. Stats average is MFE (R). Walk a full numbers story on Learn → Breakout.',
  },
  {
    term: 'MAE (Maximum Adverse Excursion)',
    gloss:
      'Worst move against the virtual trade before it ended — “how much pain before exit?” Also updated every open bar and kept on success and fail. Lower average MAE (R) is usually better. Stats sorts MAE ascending when you pick that sort.',
  },
  {
    term: 'MFE (R) / MAE (R)',
    gloss:
      'MFE or MAE divided by the setup’s R-unit (typically ATR at detect). Using R makes a ₹2 stock comparable to a ₹2000 stock. Not the same as target/stop — those end the trade; MFE/MAE score the path.',
  },
  {
    term: 'Target vs stop vs MFE/MAE',
    gloss:
      'Target and stop are decision rules (when to mark Succeeded or Failed). MFE and MAE are measurements of the best/worst path while the setup was open. Hitting target does not erase MAE; failing does not erase MFE.',
  },
  {
    term: 'Avg move (R)',
    gloss:
      'Average signed result of finished setups in R units (how much the virtual trade moved on average).',
  },
  {
    term: 'Avg duration (bars)',
    gloss: 'Average number of candles a setup stayed open before it ended.',
  },
  {
    term: 'MFE / MAE samples',
    gloss:
      'How many outcomes contributed to the average MFE or MAE. Can be smaller than n if some outcomes lack excursion data.',
  },
  {
    term: 'Ready vs Building',
    gloss:
      'Ready means the bucket has enough history (sample size ≥ minimum, default 20) so rates and averages are shown. Building means too few samples — you still see S/F/E and n, but Resolved %, MFE, and MAE show as “—”.',
  },
  {
    term: 'Minimum sample size',
    gloss:
      'Threshold (default 20) before TIP treats stats as Ready. Below that, the API keeps full counts but withholds performance rates/means so small samples do not look like hard edges.',
  },
  {
    term: 'Highlight (top quartile)',
    gloss:
      'On Stats, among Ready rows in the current filter, the top 25% by the active sort metric are highlighted. For MAE, “top” means lowest adverse excursion.',
  },
]

function TermList({ terms }) {
  return (
    <dl className="learn-glossary__list">
      {terms.map((t) => (
        <div key={t.term} className="learn-glossary__item">
          <dt>{t.term}</dt>
          <dd>{t.gloss}</dd>
        </div>
      ))}
    </dl>
  )
}

export default function LearnGlossary() {
  return (
    <details className="admin-card learn-glossary" open>
      <summary className="learn-glossary__summary">Glossary</summary>

      <h3 className="learn-glossary__section">Pattern basics</h3>
      <TermList terms={PATTERN_TERMS} />

      <h3 className="learn-glossary__section">Stats (S/F/E, MFE, MAE, Resolved %)</h3>
      <p className="learn-glossary__hint">
        These match labels on Stats (/patterns/stats). Virtual trade results are journalled
        after each setup ends; they are research metrics, not live P&amp;L.
      </p>
      <TermList terms={STATS_TERMS} />
    </details>
  )
}
