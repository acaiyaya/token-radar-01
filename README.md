# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/acaiyaya/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/acaiyaya/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A dynamic token launch radar that ranks pre-token protocols by an implied value derived from TVL, growth and time without a token, with a concrete farm plan for every row.

## The model (radar-3)

Where a flat model multiplies every protocol's TVL by one constant, radar-3 prices each pre-token
protocol the way the snapshot's own market prices its peers:

```
implied = TVL x category multiple x momentum x maturity x chain breadth
```

- **Category multiple** — the median market-cap-to-TVL of the category's live-token protocols in the
  same snapshot, shrunk toward the snapshot-wide median with a strength of 8 phantom peers, capped
  to [0.05, 3]. radar-3 shrinks harder than radar-2 did: a category priced by a single live peer is
  a rumour, not a market, so thin categories are pulled much closer to the global median — and
  every row states its peer count and a confidence word (thin / fair / solid) instead of hiding it.
- **Momentum** — `1 + 0.45 x tanh(change_7d / 60)`: a saturating read of the week's TVL growth, so
  one freak week cannot buy the top of the board.
- **Maturity** — a log-normal bump peaking at 540 days: proven enough to be real, young enough that
  a token is still plausibly ahead. Protocols that have run for years with no token score lower,
  not higher.
- **Chain breadth** — +2% per additional chain, up to four.

New in radar-3: every row explains itself. The board carries a **"why it ranks here"** paragraph
per protocol, written from its own four factors and its category's peer count, and every farm plan
carries **totals** — the capital the plan puts to work, the fees its transactions are expected to
burn, and the hours it takes — so neither a rank nor a plan has to be taken on faith.

On the sealed snapshot the top of the board is:

| # | Protocol | Category | TVL | Implied value |
|---|----------|----------|-----|---------------|
| 1 | Steakhouse Financial | Risk Curators | $2.75B | $1.61B |
| 2 | Gauntlet | Risk Curators | $1.58B | $975.2M |
| 3 | Veda | Onchain Capital Allocator | $1.56B | $313.3M |
| 4 | USDD | CDP | $1.06B | $240.6M |
| 5 | Nonce Capital | Risk Curators | $513.8M | $148.5M |

Note what the harder shrinkage did: Steakhouse still leads — its TVL is real — but at 0.58x of TVL
rather than radar-2's 0.84x, because its category's 2.97x median rests on exactly one live peer.

The board covers the full 40-protocol watchlist and adds a 160-row early radar chosen by implied
value from below the watchlist floor. Every row carries an eight-step farm plan (wallet setup,
funding, the category-specific core position, a second action, a weekly cadence, a risk guard,
points verification, logging and exit) with a cost and a time on every step. The dashboard is a
static page — sortable, filterable, with a per-protocol detail view and a model sandbox that
re-prices the whole board in the page when you move a constant.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input snapshot.json
# Node 22, standard library only. The grader mounts the sealed snapshot at /input and reads /output;
# locally, --input takes any snapshot in the kit's format and MAKEFUN_OUTPUT_DIR stands in for /output.
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=5ttpknjz&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
