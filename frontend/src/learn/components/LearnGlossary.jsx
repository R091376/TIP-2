/**
 * Glossary on the Learn index — pattern basics + Stats + Research terms.
 * Keep beginner-friendly; formulas match docs/modules/journal.md and research metrics.
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
      'One unit of risk for a setup, usually ATR at detect. Moves, targets, MFE, and MAE are often measured in R so different symbols are comparable. “True stop-R” instead uses the planned stop distance as 1R.',
  },
  {
    term: 'Confirmation modes',
    gloss:
      'volume = busy volume on detect bar; close = later bar still beyond level; both = both (default); close_fallback = volume unusable so close-only.',
  },
]

const STATS_TERMS = [
  {
    term: 'Dashboard vs Research',
    gloss:
      'Dashboard = pre-aggregated buckets on the active watchlist (fast ranking table). Research = ADMIN mode that re-filters raw closed journal rows with stack filters and recomputes rates/means on the fly.',
  },
  {
    term: 'Bucket',
    gloss:
      'One stats row = one symbol × pattern type × timeframe (for example RELIANCE · breakout · 5m). Research can also group by type only, type+TF, or one global summary.',
  },
  {
    term: 'Watchlist scope',
    gloss:
      'Dashboard stats only cover symbols currently on the active watchlist. Empty watchlist → empty table.',
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
      'Performance rate among decided outcomes: Success ÷ (Success + Fail). Expired do not count. Main “Resolved %” column on Stats.',
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
    term: 'Move (ATR) / Avg move (R)',
    gloss:
      'Average signed terminal move in ATR units: (end − entry) ÷ ATR at detect (short sign flipped). This is what Dashboard “Move (ATR)” and Research “Exp ATR” use. It is not the same as profit if you size risk to the stop.',
  },
  {
    term: 'Expectancy ATR (Exp ATR / expectancyR)',
    gloss:
      'Research label for the same idea as avg move in ATR: mean of terminal move_r over eligible samples. Ready-gated like other means. Do not confuse with True stop-R.',
  },
  {
    term: 'True stop-R (expectancyTrueR)',
    gloss:
      'Mean of (terminal move ÷ planned stop distance) = mean(move_r / risk_r). This is expectancy if 1R equals your planned stop. Wide stops can make ATR move look great while true stop-R is modest. Research default sort and the built-in preset list order use this metric.',
  },
  {
    term: 'Win (R) / Loss (R)',
    gloss:
      'Research-only: average ATR move on succeeded outcomes vs failed outcomes (diagnostic split of the move sample). Not the same as true stop-R win/loss.',
  },
  {
    term: 'Planned rails',
    gloss:
      'The frozen trade offer at detect (or after rail rewrites): entry, stop, and target. From these TIP computes risk, reward, and plan R:R. Consolidation is not a classic long/short offer and is excluded from rails averages.',
  },
  {
    term: 'Risk (R) / avgRiskR',
    gloss:
      'Planned stop distance in ATR: |entry − stop| ÷ ATR at detect. “Min risk R” / “Max risk R” filters select setups by this size. Research defaults to max risk ≤ 1.5 ATR (and every built-in preset includes that cap). Very small risk_r can inflate true stop-R when a full ATR target is hit.',
  },
  {
    term: 'Reward (R) / avgRewardR',
    gloss:
      'Planned target distance in ATR in the trade direction: how far entry→target is, ÷ ATR. On many detectors this clusters near a fixed multiple (often ~1.5R ATR).',
  },
  {
    term: 'Plan R:R (avgPlannedRr)',
    gloss:
      'Planned asymmetry = avg(reward R) ÷ avg(risk R) over valid rails (ratio of averages, not the mean of each trade’s RR). Shown as e.g. 1.65×. Min plan R:R filter keeps offers at least that asymmetric.',
  },
  {
    term: 'Valid rails',
    gloss:
      'Setup has a computable entry/stop/target with positive risk and reward (and is not consolidation). Filters like min plan RR or min/max risk R imply valid rails — null-rail rows are dropped.',
  },
  {
    term: 'Avg duration (bars)',
    gloss: 'Average number of candles a setup stayed open before it ended.',
  },
  {
    term: 'MFE / MAE samples',
    gloss:
      'How many outcomes contributed to the average MFE or MAE. Can be smaller than n if some outcomes lack excursion data (e.g. startup recovery skipped).',
  },
  {
    term: 'Ready vs Building',
    gloss:
      'Ready means the bucket has enough history (sample size ≥ minimum, default 20) so rates and averages are shown. Building means too few samples — you still see S/F/E and n, but Resolved %, Move, MFE, MAE, rails, and True stop-R show as “—”.',
  },
  {
    term: 'Minimum sample size',
    gloss:
      'Threshold (default 20) before TIP treats stats as Ready. Below that, the API keeps full counts but withholds performance rates/means so small samples do not look like hard edges.',
  },
  {
    term: 'Ready only filter',
    gloss: 'UI checkbox that hides Building rows so the table only lists Ready buckets.',
  },
  {
    term: 'Highlight (top quartile)',
    gloss:
      'On Stats, among Ready rows on the current page, the top 25% by the active sort metric are highlighted. For MAE, “top” means lowest adverse excursion.',
  },
  {
    term: 'Virtual journal',
    gloss:
      'Pattern Stats and Research measure TIP’s paper-style pattern journal outcomes (succeeded / failed / expired), not brokerage fills or your paper OMS P&amp;L. Always research context, not trade advice.',
  },
]

const RESEARCH_TERMS = [
  {
    term: 'Research mode',
    gloss:
      'Admin-only Stats mode. Applies composable stack filters to closed instance+outcome rows and recomputes S/F/E, rates, path metrics, rails, and true stop-R on the matching set. Needs Postgres journal.',
  },
  {
    term: 'Stack filters',
    gloss:
      'Named combination of predicates (flags, session, rails thresholds, pattern types, etc.). The “stack” is not a fixed grade — it is whatever filters you apply (or load from a preset).',
  },
  {
    term: 'Stack preset',
    gloss:
      'Saved filter pack. Built-in list is ordered by true stop-R expectancy on production journal research (highest profit first). You can also save your own in the browser.',
  },
  {
    term: 'True-R presets',
    gloss:
      'Built-in Research stacks ordered by true stop-R expectancy (highest profit first) from production research. Prefer higher ranks for stop-sized risk; check sample size (n) — thin stacks can rank high by chance.',
  },
  {
    term: 'Matched n',
    gloss:
      'How many closed outcomes matched the current Research filters (summary strip). Can be larger than the table row count when results are grouped.',
  },
  {
    term: 'Ready groups',
    gloss:
      'How many grouped table rows are Ready (n ≥ min sample) under the current Research filters.',
  },
  {
    term: 'Group by',
    gloss:
      'How Research buckets rows: Symbol · type · TF (default), Type · TF, Type only, or Global (one summary line).',
  },
  {
    term: 'Resolved only',
    gloss:
      'Research filter that keeps only succeeded and failed outcomes (drops expired). Useful for pure performance rates.',
  },
  {
    term: 'Confirmed (flag)',
    gloss:
      'Lifecycle flag: setup reached confirmation after detect (volume and/or later close still valid, per pattern). Strong quality filter in True-R stacks.',
  },
  {
    term: 'Retested (flag)',
    gloss:
      'Lifecycle flag: price came back to retest the breakout/breakdown reference within the configured ATR band without invalidating the setup.',
  },
  {
    term: 'Strengthened (flag)',
    gloss:
      'Lifecycle flag: price extended further in the trade direction by about the strengthen multiple of ATR after detect.',
  },
  {
    term: 'Volume OK (at detect)',
    gloss:
      'Detect-bar volume met the volume confirmation rule (e.g. ≥ multiplier × volume SMA). Toggle “Volume OK” in Research quality stack.',
  },
  {
    term: '− Recovery / exclude startup_recovery',
    gloss:
      'Drops outcomes closed as startup recovery (journal reopen after process restart). Those are excluded from path/rails stats so they do not pollute averages.',
  },
  {
    term: 'Detect window (dates)',
    gloss:
      'Research date range on detect day in IST. Empty dates default to the last ~180 days (server cap).',
  },
  {
    term: 'Session times (IST)',
    gloss:
      'Keep only setups whose detect candle time-of-day falls between start and end (Asia/Kolkata). When set, daily (1d) bars are excluded — session filter does not apply cleanly to 1d.',
  },
  {
    term: 'Min plan R:R',
    gloss:
      'Require planned_rr ≥ this value (reward/risk on rails). Implies valid rails. Pairs well with a minimum risk floor so tiny stops do not dominate true stop-R.',
  },
  {
    term: 'Min / Max risk R',
    gloss:
      'Filter by planned stop size in ATR (risk_r). Min risk ≥ 0.5 is a common floor against microscopic stops. Max risk caps very wide stops. Either implies valid rails.',
  },
  {
    term: 'Apply vs draft filters',
    gloss:
      'Research form edits are draft until you click Apply. Chips show the applied set; URL can share the applied stack.',
  },
  {
    term: 'Truncated groups',
    gloss:
      'Research can limit how many group rows return (limitGroups). Summary still reflects the full matched set; the table may show only the first N groups.',
  },
  {
    term: 'Markdown export (Learn)',
    gloss:
      'Static no-JS copies of Learn topics under /learn-export/ (e.g. ALL.md) for AI tools. Separate from Stats numbers — education content only.',
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

      <h3 className="learn-glossary__section">Stats dashboard (S/F/E, Move, MFE, MAE, rails)</h3>
      <p className="learn-glossary__hint">
        Labels on Stats (/patterns/stats) Dashboard. Virtual journal results after each setup ends —
        research metrics, not live P&amp;L or paper OMS fills.
      </p>
      <TermList terms={STATS_TERMS} />

      <h3 className="learn-glossary__section">Research mode (stack filters, True stop-R)</h3>
      <p className="learn-glossary__hint">
        ADMIN Research mode on the same Stats page. Stack filters recompute metrics on the matching
        closed-outcome set. Prefer True stop-R when judging offer quality; ATR move can flatter wide
        stops.
      </p>
      <TermList terms={RESEARCH_TERMS} />
    </details>
  )
}
