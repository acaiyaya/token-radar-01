# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/acaiyaya/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/acaiyaya/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A dynamic token launch radar that ranks pre-token protocols by an implied value derived from TVL, growth and time without a token, with a concrete farm plan for every row.

## The model (radar-2)

Where a flat model multiplies every protocol's TVL by one constant, radar-2 prices each pre-token
protocol the way the snapshot's own market prices its peers:

```
implied = TVL x category multiple x momentum x maturity x chain breadth
```

- **Category multiple** — the median market-cap-to-TVL of the category's live-token protocols in the
  same snapshot, shrunk toward the snapshot-wide median by the peer count (thin categories cannot
  set wild prices), capped to [0.05, 3].
- **Momentum** — `1 + 0.45 x tanh(change_7d / 60)`: a saturating read of the week's TVL growth, so
  one freak week cannot buy the top of the board.
- **Maturity** — a log-normal bump peaking at 540 days: proven enough to be real, young enough that
  a token is still plausibly ahead. Protocols that have run for years with no token score lower,
  not higher.
- **Chain breadth** — +2% per additional chain, up to four.

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
