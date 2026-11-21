// Token Radar model "radar-3": one sealed snapshot in, one ranked board out.
//
// Where the house model multiplies every protocol's TVL by one flat constant, this model prices a
// pre-token protocol the way the snapshot's own market prices its peers:
//
//   multiple   = the price-to-TVL multiple of the protocol's category, read off the snapshot's
//                live-token protocols (median market cap / TVL per category), shrunk toward the
//                snapshot-wide median by the peer count, so a thin category cannot produce a
//                wild multiple. radar-3 shrinks harder than radar-2 did (k = 8, not 4): a
//                category priced by a single live peer is a rumour, not a market, and the board
//                now says so on every row, with the peer count and a confidence word
//   momentum   = 1 + MOMENTUM_WEIGHT x tanh(change_7d / MOMENTUM_SCALE): a saturating read of the
//                week's TVL growth, so one freak week cannot dominate the board
//   maturity   = a log-normal bump peaking at MATURITY_PEAK_DAYS: old enough to be proven, young
//                enough that a token is still plausibly ahead; a protocol that has run for years
//                with no token scores lower than one in the launch window, not higher
//   chainBonus = 1 + CHAIN_BONUS x min(extra chains, 4): a small premium for multi-chain traction
//   implied    = max(1, round(tvl x multiple x momentum x maturity x chainBonus))
//
// Every row also carries the model's working in words (why it ranks where it ranks, from its own
// four factors and its category's peer count) and its farm plan's totals (capital the plan
// deploys, the fees it expects to burn, the hours it takes), so a reader never has to take a
// rank, or a plan, on faith.
//
// Every input is a field of the sealed snapshot. No protocol name, slug or category string is ever
// special-cased in the scoring: the same code path prices every row, and the per-category figures
// are computed from the snapshot at run time, never written into the source.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's tunable constants, stated on the dashboard and adjustable in its sandbox. */
export interface ModelConstants {
  /** Live peers per category that fully earn the category's own multiple (shrinkage strength). */
  shrink_k: number;
  /** How far one week of TVL growth can move the value, as a fraction (0.45 = up to +/-45%). */
  momentum_weight: number;
  /** The weekly change, in percent, at which momentum reaches about 76% of its swing. */
  momentum_scale: number;
  /** Age in days where the maturity bump peaks: the middle of the plausible launch window. */
  maturity_peak_days: number;
  /** Width of the maturity bump in log-days; larger is flatter. */
  maturity_sigma: number;
  /** The maturity multiplier far from the peak, as a fraction of the peak value 1. */
  maturity_floor: number;
  /** Value premium per additional chain, as a fraction. */
  chain_bonus: number;
  /** Age assumed when the snapshot carries no listing date. */
  unknown_age_days: number;
  /** Pre-token protocols below the watchlist floor the early radar adds, by TVL. */
  early_rows: number;
  /** Live-token protocols the Live view carries, by market cap. */
  live_rows: number;
}

export const MODEL: ModelConstants = {
  shrink_k: 8,
  momentum_weight: 0.45,
  momentum_scale: 60,
  maturity_peak_days: 540,
  maturity_sigma: 0.85,
  maturity_floor: 0.55,
  chain_bonus: 0.02,
  unknown_age_days: 365,
  early_rows: 160,
  live_rows: 24,
};

/** The model's version label: the dashboard names it and the board rows carry it. */
export const MODEL_VERSION = 'radar-3';

/** One category's live-peer statistics, computed from the snapshot at run time. */
export interface CategoryStat {
  category: string;
  live_count: number;
  median_multiple: number;
  used_multiple: number;
}

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** A farm plan's totals: the capital it deploys, the fees it expects to burn, the time it takes. */
export interface FarmTotal {
  capital_usd: number;
  est_fees: string;
  total_time: string;
}

/** One row of board.json: the ranked board's row, with the model's working shown. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  model: {
    version: string;
    category_multiple: number;
    global_multiple: number;
    category_live_count: number;
    momentum_multiplier: number;
    maturity_multiplier: number;
    chain_multiplier: number;
  };
  why: string;
  farm_steps: string[];
  farm_total: FarmTotal;
}

/** The dashboard's view of one board row: everything the page renders or recomputes. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  watchlist: boolean;
  implied_value_usd: number;
  category_multiple: number;
  momentum_multiplier: number;
  maturity_multiplier: number;
  chain_multiplier: number;
  why: string;
  farm_steps: string[];
  farm_total: FarmTotal;
}

/** A live-token protocol: it already trades, so the page shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  market_multiple: number | null;
}

/** Everything the dashboard needs: the board, the live set, the category table and the model. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  global_multiple: number;
  categories: CategoryStat[];
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

const bySlugAsc = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The median of a non-empty list, computed on a sorted copy so the input order survives. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/**
 * The market's own pricing, read off the snapshot: for every category with live-token peers, the
 * median market-cap-to-TVL ratio, shrunk toward the snapshot-wide median by the peer count.
 * Returns the global median and the per-category table in a stable, name-sorted order.
 */
export function categoryMultiples(snapshot: Snapshot, model: ModelConstants): { global: number; stats: CategoryStat[]; used: Map<string, number> } {
  const ratiosByCategory = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of snapshot.protocols) {
    if (isPreToken(p) || p.category === null || p.category === 'CEX') continue;
    if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    if (!Number.isFinite(ratio) || ratio <= 0) continue;
    all.push(ratio);
    const list = ratiosByCategory.get(p.category);
    if (list === undefined) ratiosByCategory.set(p.category, [ratio]);
    else list.push(ratio);
  }
  const global = all.length > 0 ? median(all) : 0.25;
  const stats: CategoryStat[] = [];
  const used = new Map<string, number>();
  for (const category of [...ratiosByCategory.keys()].sort(bySlugAsc)) {
    const ratios = ratiosByCategory.get(category)!;
    const med = median(ratios);
    const shrunk = (ratios.length * med + model.shrink_k * global) / (ratios.length + model.shrink_k);
    const clamped = Math.min(3, Math.max(0.05, shrunk));
    stats.push({ category, live_count: ratios.length, median_multiple: round4(med), used_multiple: round4(clamped) });
    used.set(category, clamped);
  }
  return { global, stats, used };
}

/** The four factors one protocol is priced with, and the implied value they produce. */
export interface Priced {
  implied: number;
  categoryMultiple: number;
  categoryLiveCount: number;
  momentumMult: number;
  maturityMult: number;
  chainMult: number;
  age: number | null;
}

/** Price one protocol under `model`, given the snapshot's category table. */
export function priceProtocol(
  p: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  multiples: { global: number; stats: CategoryStat[]; used: Map<string, number> },
): Priced {
  const age = ageDays(asOf, p.listed_at);
  const stat = p.category === null ? undefined : multiples.stats.find((s) => s.category === p.category);
  const categoryMultiple = p.category === null ? multiples.global : (multiples.used.get(p.category) ?? multiples.global);
  const change = finite(p.change_7d, 0);
  const momentumMult = 1 + model.momentum_weight * Math.tanh(change / model.momentum_scale);
  const ageForModel = Math.max(1, age ?? model.unknown_age_days);
  const z = Math.log(ageForModel / model.maturity_peak_days) / model.maturity_sigma;
  const maturityMult = model.maturity_floor + (1 - model.maturity_floor) * Math.exp(-(z * z) / 2);
  const chainMult = 1 + model.chain_bonus * Math.min(Math.max(p.chains.length - 1, 0), 4);
  const implied = Math.max(1, Math.round(p.tvl_usd * categoryMultiple * momentumMult * maturityMult * chainMult));
  return { implied, categoryMultiple, categoryLiveCount: stat?.live_count ?? 0, momentumMult, maturityMult, chainMult, age };
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** A multiple the way the dashboard prints it: two decimals and an x. */
const mult2 = (n: number): string => `${n.toFixed(2)}x`;

/** A signed percent with one decimal, the way the dashboard prints a 7d change. */
const pct1 = (n: number): string => `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;

/** How far a category's own multiple can be trusted, from its live-peer count alone. */
export function confidenceWord(liveCount: number): string {
  if (liveCount <= 0) return 'none';
  if (liveCount <= 2) return 'thin';
  if (liveCount <= 5) return 'fair';
  return 'solid';
}

/**
 * Why a row ranks where it ranks, in words, from its own four factors and its category's peer
 * count. Nothing here is looked up by name: the same template reads every row's own figures.
 */
export function whyText(
  p: SnapshotProtocol,
  priced: Priced,
  multiples: { global: number; stats: CategoryStat[]; used: Map<string, number> },
  model: ModelConstants,
): string {
  const parts: string[] = [];
  const effective = p.tvl_usd > 0 ? priced.implied / p.tvl_usd : 0;
  parts.push(`Priced at ${mult2(effective)} of TVL.`);
  const stat = p.category === null ? undefined : multiples.stats.find((s) => s.category === p.category);
  if (p.category === null || stat === undefined) {
    parts.push(`Its category records no live-token peers in this snapshot, so it is priced at the global median multiple of ${mult2(multiples.global)}.`);
  } else {
    parts.push(
      `The ${p.category} multiple is ${mult2(priced.categoryMultiple)}: the median of ${stat.live_count} live peer${stat.live_count === 1 ? '' : 's'} is ${mult2(stat.median_multiple)}, ` +
        `shrunk toward the ${mult2(multiples.global)} global median (peer confidence: ${confidenceWord(stat.live_count)}).`,
    );
  }
  if (p.change_7d === null) {
    parts.push(`No 7d TVL change is recorded, so momentum is neutral at ${mult2(priced.momentumMult)}.`);
  } else {
    parts.push(`Momentum is ${mult2(priced.momentumMult)} on ${pct1(p.change_7d)} TVL over 7 days.`);
  }
  if (priced.age === null) {
    parts.push(`No listing date is recorded, so maturity is priced at the assumed ${model.unknown_age_days} days: ${mult2(priced.maturityMult)}.`);
  } else {
    parts.push(`At ${priced.age} days old, against the ${model.maturity_peak_days}-day launch-window peak, maturity is ${mult2(priced.maturityMult)}.`);
  }
  parts.push(`It records ${p.chains.length} chain${p.chains.length === 1 ? '' : 's'}, for a chain-breadth factor of ${mult2(priced.chainMult)}.`);
  return parts.join(' ');
}

/**
 * A farm plan's totals, from the same figures its steps are priced with: the capital the plan
 * puts to work (position plus funding buffer), the fees its transactions are expected to burn
 * (withdrawal, setup, the weekly visits, the two-tranche unwind), and the hours it takes.
 */
export function farmTotals(p: SnapshotProtocol, age: number | null): FarmTotal {
  const capital = capitalFor(p);
  const weeks = weeksFor(age);
  const mainnet = isMainnet(chainOf(p));
  const low = Math.round((mainnet ? 5 : 2) + (mainnet ? 5 : 0.5) + (mainnet ? 8 : 1) * weeks + (mainnet ? 10 : 1));
  const high = Math.round((mainnet ? 5 : 2) + (mainnet ? 15 : 0.5) + (mainnet ? 8 : 1) * weeks + (mainnet ? 30 : 1));
  const minutes = 55 + 20 * weeks + 30;
  const time = minutes >= 60 ? `about ${Math.floor(minutes / 60)}h ${minutes % 60 === 0 ? '' : `${minutes % 60}m `}spread over ${weeks} weeks` : `about ${minutes}m spread over ${weeks} weeks`;
  return { capital_usd: capital + 50, est_fees: low === high ? `$${low}` : `$${low} to $${high}`, total_time: time.trim() };
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const multiples = categoryMultiples(snapshot, model);
  const watchlist = new Set(snapshot.watchlist);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug on it is ranked, whatever its figures look like.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: pre-token protocols below the floor, capped, chosen by the model's own
  // implied value rather than by raw TVL, so the discovery set is the protocols the model finds
  // most underpriced, not merely the biggest of the small. (Above the floor the snapshot carries
  // asset wrappers and exchange wallets that record no token but will never launch one; the
  // curated watchlist is the majors' set, and the radar does not second-guess it.)
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .map((p) => ({ p, implied: priceProtocol(p, snapshot.as_of, model, multiples).implied }))
    .sort((a, b) => b.implied - a.implied || bySlugAsc(a.p.slug, b.p.slug))
    .slice(0, model.early_rows);
  for (const e of early) chosen.set(e.p.slug, e.p);

  const scored = [...chosen.values()].map((p) => ({ p, priced: priceProtocol(p, snapshot.as_of, model, multiples) }));
  scored.sort((a, b) => b.priced.implied - a.priced.implied || bySlugAsc(a.p.slug, b.p.slug));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    watchlist: watchlist.has(s.p.slug),
    age_days: s.priced.age,
    implied_value_usd: s.priced.implied,
    model: {
      version: MODEL_VERSION,
      category_multiple: round4(s.priced.categoryMultiple),
      global_multiple: round4(multiples.global),
      category_live_count: s.priced.categoryLiveCount,
      momentum_multiplier: round4(s.priced.momentumMult),
      maturity_multiplier: round4(s.priced.maturityMult),
      chain_multiplier: round4(s.priced.chainMult),
    },
    farm_steps: farmSteps(s.p, s.priced.age).map(stepText),
    why: whyText(s.p, s.priced, multiples, model),
    farm_total: farmTotals(s.p, s.priced.age),
  }));
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** Whether the main chain is Ethereum mainnet, where gas is priced very differently from an L2. */
function isMainnet(chain: string): boolean {
  return chain.toLowerCase() === 'ethereum';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 1_000_000_000) return 250;
  if (p.tvl_usd >= 100_000_000) return 150;
  if (p.tvl_usd >= 10_000_000) return 100;
  return 50;
}

/** How many weekly qualifying actions the plan runs, from the protocol's age. */
function weeksFor(age: number | null): number {
  if (age === null) return 6;
  if (age < 180) return 8;
  if (age < 730) return 6;
  return 4;
}

/** The category's core position, in the words a farmer can follow. */
function coreAction(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('cdp')) return `Deposit $${capital} of ETH or a liquid staking token as collateral in ${name} on ${chain}, mint its stablecoin against it, and keep the collateral ratio above 200% so the position survives a 30% drawdown.`;
  if (c.includes('lend') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain}, then borrow about 40% of it back and re-supply the borrowed amount once, so the wallet shows both sides of the market without leverage risk.`;
  if (c.includes('dex') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s highest-volume pool on ${chain}, split evenly between the two pool assets, and keep the LP position open rather than hopping pools.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC from Ethereum to ${chain} through ${name}, then use the bridged funds in one app on the far side so the route counts as real usage, not a round trip.`;
  if (c.includes('restak')) return `Stake $${capital} of ETH through ${name} on ${chain}, hold the receipt token in the same wallet, and opt into one actively validated service if the app offers one.`;
  if (c.includes('staking')) return `Stake $${capital} of the chain's staking asset through ${name} on ${chain} and keep the staking receipt in the wallet for the whole plan.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('option')) return `Deposit $${capital} of USDC as margin on ${name}, open one small position hedged with an equal spot holding elsewhere, and keep the margin ratio above 50% at all times.`;
  if (c.includes('prediction')) return `Fund $${capital} on ${name} and take a position in three different markets, sized under $${Math.max(10, Math.floor(capital / 5))} each, so the account shows breadth rather than one bet.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('yield')) return `Deposit $${capital} into a ${name} vault on ${chain}, keep the vault shares untouched, and let the curator's rebalancing generate the on-chain history.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold it in the wallet rather than immediately swapping out.`;
  if (c.includes('rwa')) return `Mint $${capital} of ${name}'s yield asset on ${chain} after its onboarding check, and hold the asset so the wallet ages with a balance.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} for a 90-day term and keep the policy NFT in the wallet until it expires.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open for the whole plan.`;
}

/** The category's second qualifying action, distinct from the core position. */
function secondAction(p: SnapshotProtocol, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Repay a small part of the borrow and borrow again once, so the wallet's history shows active position management, not a single deposit.`;
  if (c.includes('dex')) return `Make two small swaps through ${name}'s own interface on ${chain} in different weeks, so the wallet has trader activity as well as liquidity.`;
  if (c.includes('bridge')) return `Bridge a second, smaller amount back the other way in a later week, leaving a balance on both sides of ${name}.`;
  if (p.chains.length > 1) return `Repeat a small version of the core position on ${p.chains[1]}, the protocol's second chain, so the wallet is active in more than one of its markets.`;
  return `Claim any rewards the position accrues inside ${name}'s own app and restake or hold them in the same wallet.`;
}

/** The category's standing risk guard, checked on the weekly visit. */
function riskGuard(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Check the position's health factor on every visit and top up collateral if it falls below 1.6; a liquidation erases the season's work and the capital with it.`;
  if (c.includes('dex')) return `Check the LP position's range and impermanent loss on every visit; if the price has left the range, withdraw and re-centre once rather than letting it sit idle.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('option')) return `Check the liquidation price on every visit and never add leverage to chase funding; the hedge, not the trade, is what this plan is for.`;
  if (c.includes('bridge')) return `Split the route across two transfers at least a day apart; bridge contracts are the highest-risk step in any farm and no single transfer should carry the whole budget.`;
  return `Re-check the protocol's own announcements on every visit; if it changes its points or rewards terms mid-plan, follow the new terms from the official page only.`;
}

/**
 * A protocol's farm plan: eight steps, each an action with a cost and a time, derived from the
 * protocol's own record (category, chains, TVL, age), never from a hand-written list of names.
 * The weekly cadence and the gas figures follow the main chain: Ethereum mainnet is priced as
 * mainnet, every other chain at layer-2 rates.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const weeks = weeksFor(age);
  const mainnet = isMainnet(chain);
  const gasTx = mainnet ? '$5 to $15' : 'under $0.50';
  const gasWeek = mainnet ? 'about $8' : 'about $1';
  return [
    {
      text: `Create a fresh wallet for this farm only, write its seed phrase on paper, and never reuse it for unrelated protocols, so the position's history is clean and attributable.`,
      cost: 'nothing but the wallet software',
      time: '10 minutes',
    },
    {
      text: `Fund the wallet on ${chain} with $${capital + 50} of stablecoins plus the chain's gas token, bought on a centralised exchange and withdrawn directly to ${chain} to avoid an extra bridge hop.`,
      cost: `$${capital + 50} of capital plus a withdrawal fee of about $${mainnet ? 5 : 2}`,
      time: '20 minutes',
    },
    {
      text: coreAction(p, capital, chain),
      cost: `$${capital} of capital and ${gasTx} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: secondAction(p, chain),
      cost: `${gasTx} of gas per action`,
      time: '10 minutes',
    },
    {
      text: `Return once a week for ${weeks} weeks and make one qualifying transaction each visit (a deposit top-up, a claim, a swap or a vote), so the wallet appears in ${weeks} separate weekly snapshots.`,
      cost: `${gasWeek} of gas a week`,
      time: `10 minutes a week for ${weeks} weeks`,
    },
    {
      text: riskGuard(p),
      cost: 'no fee to check; a top-up costs one transaction',
      time: '5 minutes a week',
    },
    {
      text: `Open ${p.name}'s own points or rewards page from its official site and confirm the wallet is accruing; claim only through links the protocol itself publishes, and never pay anyone to claim for you.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Log every transaction hash, date and balance in a farm log; hold the position until the protocol announces a token or a snapshot date, then unwind in two tranches at least a week apart.`,
      cost: 'nothing but the log; unwinding costs two transactions of gas',
      time: '5 minutes a week, 30 minutes to unwind',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live view. */
export function liveRows(snapshot: Snapshot, model: ModelConstants = MODEL): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd || bySlugAsc(a.slug, b.slug))
    .slice(0, model.live_rows)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      market_multiple: p.mcap_usd !== null && p.tvl_usd > 0 ? round4(p.mcap_usd / p.tvl_usd) : null,
    }));
}

/** A board row's form for data.js: the page renders the plan from the same steps board.json carries. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    watchlist: row.watchlist,
    implied_value_usd: row.implied_value_usd,
    category_multiple: row.model.category_multiple,
    momentum_multiplier: row.model.momentum_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    chain_multiplier: row.model.chain_multiplier,
    why: row.why,
    farm_steps: row.farm_steps,
    farm_total: row.farm_total,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot, model);
  const multiples = categoryMultiples(snapshot, model);
  const early = board.filter((r) => !r.watchlist).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    global_multiple: round4(multiples.global),
    categories: multiples.stats,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, spread, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
