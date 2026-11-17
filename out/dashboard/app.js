// Token Launch Radar dashboard (model radar-2).
//
// Reads window.RADAR from ../data.js (written by main.ts beside dashboard/) and renders three
// views: the ranked board with filters and a per-protocol detail panel, the live-token peer set
// the model learns its multiples from, and a model view that states the formula and the category
// table computed from this snapshot. The sandbox re-prices the board in the page with the same
// arithmetic as lib/model.ts, so a reader can test every constant the model ships with.
// No network: every byte shown here arrived in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var MODEL = DATA.model;

  // ---------- formatting ----------
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return n.toFixed(2) + 'x';
  }

  // ---------- tiny DOM helper ----------
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else node.setAttribute(k, attrs[k]);
      });
    }
    (children || []).forEach(function (c) {
      if (c === null || c === undefined) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }
  function byId(id) { return document.getElementById(id); }

  // ---------- the model, mirrored for the sandbox ----------
  // The same arithmetic as lib/model.ts priceProtocol + categoryMultiples, fed by the figures
  // data.js carries, so the page can re-price every row under different constants.
  var catByName = {};
  DATA.categories.forEach(function (c) { catByName[c.category] = c; });

  function usedMultiple(category, shrinkK) {
    if (category === null || !catByName[category]) return DATA.global_multiple;
    var c = catByName[category];
    var shrunk = (c.live_count * c.median_multiple + shrinkK * DATA.global_multiple) / (c.live_count + shrinkK);
    return Math.min(3, Math.max(0.05, shrunk));
  }
  function sandboxImplied(row, s) {
    var mult = usedMultiple(row.category, s.shrink);
    var change = row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d;
    var momentum = 1 + s.momentum * Math.tanh(change / MODEL.momentum_scale);
    var age = Math.max(1, row.age_days === null || row.age_days === undefined ? MODEL.unknown_age_days : row.age_days);
    var z = Math.log(age / s.peak) / MODEL.maturity_sigma;
    var maturity = MODEL.maturity_floor + (1 - MODEL.maturity_floor) * Math.exp(-(z * z) / 2);
    var chain = 1 + s.chain * Math.min(Math.max(row.chains.length - 1, 0), 4);
    return Math.max(1, Math.round(row.tvl_usd * mult * momentum * maturity * chain));
  }

  // ---------- state ----------
  var state = {
    view: 'board',
    q: '', category: 'all', chain: 'all', set: 'all', minTvl: 0, sort: 'implied',
    selected: null,
    sandbox: { momentum: MODEL.momentum_weight, peak: MODEL.maturity_peak_days, shrink: MODEL.shrink_k, chain: MODEL.chain_bonus },
  };
  function sandboxIsDefault() {
    var s = state.sandbox;
    return s.momentum === MODEL.momentum_weight && s.peak === MODEL.maturity_peak_days && s.shrink === MODEL.shrink_k && s.chain === MODEL.chain_bonus;
  }
  // Sandbox ranks for every row, recomputed whenever a slider moves; null at the shipped constants.
  var sandboxRank = null;
  function recomputeSandbox() {
    if (sandboxIsDefault()) { sandboxRank = null; return; }
    var priced = DATA.rows.map(function (r) { return { slug: r.slug, v: sandboxImplied(r, state.sandbox) }; });
    priced.sort(function (a, b) { return b.v - a.v || (a.slug < b.slug ? -1 : 1); });
    sandboxRank = {};
    priced.forEach(function (p, i) { sandboxRank[p.slug] = i + 1; });
  }

  // ---------- header ----------
  function renderHead() {
    byId('model-version').textContent = DATA.model_version;
    var stats = [
      ['Board rows', String(DATA.board_size)],
      ['Watchlist covered', DATA.watchlist_size + ' / ' + DATA.watchlist_size],
      ['Early finds', String(DATA.early_size)],
      ['Global multiple', fmtMult(DATA.global_multiple)],
      ['Snapshot', DATA.as_of],
    ];
    var dl = byId('head-stats');
    dl.textContent = '';
    stats.forEach(function (s) {
      dl.appendChild(el('div', null, [el('dt', { text: s[0] }), el('dd', { text: s[1] })]));
    });
    byId('foot-note').textContent =
      'Source: ' + DATA.source + ', snapshot of ' + DATA.as_of + ', watchlist floor ' + fmtUsd(DATA.floor_usd) + '. ' +
      'Implied value is a model estimate of what a token launch could be worth, not a price quote and not financial advice. ' +
      'Farm plans are checklists for your own research; protocols change their terms, so always follow the protocol\u2019s own pages. ' +
      'This page runs entirely offline from data.js.';
  }

  // ---------- board ----------
  function fillSelect(select, values, allLabel) {
    select.textContent = '';
    select.appendChild(el('option', { value: 'all', text: allLabel }));
    values.forEach(function (v) { select.appendChild(el('option', { value: v, text: v })); });
  }
  function boardCategories() {
    var seen = {};
    DATA.rows.forEach(function (r) { if (r.category) seen[r.category] = true; });
    return Object.keys(seen).sort();
  }
  function boardChains() {
    var seen = {};
    DATA.rows.forEach(function (r) { r.chains.forEach(function (c) { seen[c] = true; }); });
    return Object.keys(seen).sort();
  }
  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    var rows = DATA.rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && r.chains.indexOf(state.chain) === -1) return false;
      if (state.set === 'watchlist' && !r.watchlist) return false;
      if (state.set === 'early' && r.watchlist) return false;
      if (r.tvl_usd < state.minTvl) return false;
      if (q) {
        var hay = (r.name + ' ' + r.slug + ' ' + (r.category || '') + ' ' + r.chains.join(' ')).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
    var sort = state.sort;
    function val(r) {
      if (sort === 'tvl') return r.tvl_usd;
      if (sort === 'change') return r.change_7d === null ? -Infinity : r.change_7d;
      if (sort === 'ratio') return r.tvl_usd > 0 ? r.implied_value_usd / r.tvl_usd : 0;
      if (sort === 'age') return r.age_days === null ? -1 : r.age_days;
      return r.implied_value_usd;
    }
    rows.sort(function (a, b) { return val(b) - val(a) || a.rank - b.rank; });
    return rows;
  }

  function renderBoard() {
    var rows = filteredRows();
    byId('result-line').textContent =
      'Showing ' + rows.length + ' of ' + DATA.board_size + ' rows \u00B7 ' +
      DATA.watchlist_size + ' watchlist \u00B7 ' + DATA.early_size + ' early \u00B7 sorted by ' +
      byId('f-sort').selectedOptions[0].textContent.toLowerCase() +
      (sandboxRank ? ' \u00B7 sandbox ranks on' : '');
    var tbody = byId('board-body');
    tbody.textContent = '';
    rows.forEach(function (r) {
      var tr = el('tr', state.selected === r.slug ? { class: 'is-selected' } : null);
      var rankCell = el('td', { class: 'num rank', text: String(r.rank) });
      if (sandboxRank && sandboxRank[r.slug] !== r.rank) {
        var d = r.rank - sandboxRank[r.slug];
        var span = el('span', { class: 'delta ' + (d > 0 ? 'up' : 'down'), text: (d > 0 ? '\u25B2' : '\u25BC') + Math.abs(d) });
        span.title = 'Sandbox rank ' + sandboxRank[r.slug];
        rankCell.appendChild(span);
      }
      tr.appendChild(rankCell);
      tr.appendChild(el('td', { class: 'name' }, [r.name, el('span', { class: 'sub', text: r.slug })]));
      tr.appendChild(el('td', { class: 'cat', text: r.category || '\u2014' }));
      tr.appendChild(el('td', { class: 'chains', text: r.chains.slice(0, 3).join(', ') + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') }));
      tr.appendChild(el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }));
      var chg = el('td', { class: 'num ' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) });
      tr.appendChild(chg);
      tr.appendChild(el('td', { class: 'num', text: fmtUsd(r.implied_value_usd) }));
      tr.appendChild(el('td', { class: 'num', text: r.tvl_usd > 0 ? fmtMult(r.implied_value_usd / r.tvl_usd) : 'n/a' }));
      tr.appendChild(el('td', { class: 'num', text: fmtAge(r.age_days) }));
      tr.appendChild(el('td', null, [el('span', { class: 'badge ' + (r.watchlist ? 'watch' : 'early'), text: r.watchlist ? 'Watchlist' : 'Early' })]));
      tr.addEventListener('click', function () {
        state.selected = state.selected === r.slug ? null : r.slug;
        renderBoard();
        renderDetail();
      });
      tbody.appendChild(tr);
    });
    if (rows.length === 0) {
      tbody.appendChild(el('tr', null, [el('td', { colspan: '10', text: 'No protocol matches these filters.' })]));
    }
  }

  // ---------- detail ----------
  function factorRow(label, value, max, note) {
    var pct = Math.max(0, Math.min(100, (value / max) * 100));
    var fill = el('div', { class: 'fill' + (value < 0.85 ? ' warn' : '') });
    fill.style.width = pct.toFixed(1) + '%';
    return el('div', { class: 'factor' }, [
      el('span', { class: 'fname', text: label }),
      el('div', { class: 'track' }, [fill]),
      el('span', { class: 'fval', text: fmtMult(value) + (note ? ' ' + note : '') }),
    ]);
  }
  function renderDetail() {
    var panel = byId('detail');
    var row = null;
    DATA.rows.forEach(function (r) { if (r.slug === state.selected) row = r; });
    if (!row) { panel.hidden = true; panel.textContent = ''; return; }
    panel.hidden = false;
    panel.textContent = '';
    var close = el('button', { type: 'button', class: 'detail-close', text: 'Close' });
    close.addEventListener('click', function () { state.selected = null; renderBoard(); renderDetail(); });
    panel.appendChild(close);
    panel.appendChild(el('div', { class: 'detail-head' }, [
      el('h2', { text: row.name }),
      el('div', { class: 'implied' }, [fmtUsd(row.implied_value_usd), el('small', { text: 'implied value \u00B7 rank #' + row.rank })]),
    ]));
    var cat = row.category ? catByName[row.category] : null;
    var facts = [
      ['Category', row.category || 'uncategorised'],
      ['TVL', fmtUsd(row.tvl_usd)],
      ['7d change', fmtPct(row.change_7d)],
      ['Age', fmtAge(row.age_days) + (row.listed_at ? ' (listed ' + row.listed_at + ')' : '')],
      ['Chains', row.chains.join(', ') || 'none recorded'],
      ['Set', row.watchlist ? 'Watchlist' : 'Early radar'],
      ['Category peers', cat ? cat.live_count + ' live' : 'no live peers'],
      ['Implied / TVL', row.tvl_usd > 0 ? fmtMult(row.implied_value_usd / row.tvl_usd) : 'n/a'],
    ];
    var grid = el('dl', { class: 'fact-grid' });
    facts.forEach(function (f) { grid.appendChild(el('div', null, [el('dt', { text: f[0] }), el('dd', { text: f[1] })])); });
    panel.appendChild(grid);

    panel.appendChild(el('h3', { text: 'How the model priced it' }));
    var factors = el('div', { class: 'factors' });
    factors.appendChild(factorRow('Category multiple', row.category_multiple, 3, ''));
    factors.appendChild(factorRow('Momentum (7d TVL)', row.momentum_multiplier, 1.45, ''));
    factors.appendChild(factorRow('Maturity (launch window)', row.maturity_multiplier, 1, ''));
    factors.appendChild(factorRow('Chain breadth', row.chain_multiplier, 1.1, ''));
    panel.appendChild(factors);
    panel.appendChild(el('p', { class: 'view-note', text:
      'Implied value = TVL \u00D7 category multiple \u00D7 momentum \u00D7 maturity \u00D7 chain breadth. ' +
      'The category multiple is the median market-cap-to-TVL of this category\u2019s live-token peers in the same snapshot' +
      (cat ? ' (' + cat.live_count + ' peers, median ' + fmtMult(cat.median_multiple) + ')' : '') +
      ', shrunk toward the global median of ' + fmtMult(DATA.global_multiple) + '.' }));

    panel.appendChild(el('h3', { text: 'Farm plan' }));
    var list = el('ol', { class: 'farm' });
    row.farm_steps.forEach(function (s) { list.appendChild(el('li', { text: s })); });
    panel.appendChild(list);
    panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  // ---------- live view ----------
  function renderLive() {
    var tbody = byId('live-body');
    tbody.textContent = '';
    DATA.live.forEach(function (r) {
      var tr = el('tr');
      tr.appendChild(el('td', { class: 'name' }, [r.name, el('span', { class: 'sub', text: r.slug })]));
      tr.appendChild(el('td', { class: 'cat', text: r.category || '\u2014' }));
      tr.appendChild(el('td', { class: 'chains', text: r.chains.slice(0, 3).join(', ') }));
      tr.appendChild(el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }));
      tr.appendChild(el('td', { class: 'num ' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }));
      tr.appendChild(el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }));
      tr.appendChild(el('td', { class: 'num', text: fmtMult(r.market_multiple) }));
      tbody.appendChild(tr);
    });
  }

  // ---------- model view ----------
  function renderModel() {
    var box = byId('model-explain');
    box.textContent = '';
    var formula = el('div', { class: 'formula' });
    formula.innerHTML = 'implied = TVL &times; <span class="hl">category multiple</span> &times; <span class="hl">momentum</span> &times; <span class="hl">maturity</span> &times; <span class="hl">chain breadth</span>';
    box.appendChild(formula);
    var cards = [
      ['Category multiple', 'The snapshot\u2019s live-token protocols are the market\u2019s own answer to \u201Cwhat is a dollar of TVL worth here?\u201D For each category the model takes the median market-cap-to-TVL of its live peers, then shrinks it toward the global median (' + fmtMult(DATA.global_multiple) + ') by the peer count, so a category with two peers cannot set a wild price. Capped between 0.05x and 3x.'],
      ['Momentum', 'One week of TVL growth, passed through a saturating curve: 1 + ' + MODEL.momentum_weight + ' \u00D7 tanh(change / ' + MODEL.momentum_scale + '). A protocol doubling in a week earns most of the +' + Math.round(MODEL.momentum_weight * 100) + '% swing; a protocol up 400% earns barely more, so a single freak week cannot buy the top of the board.'],
      ['Maturity', 'A log-normal bump peaking at ' + MODEL.maturity_peak_days + ' days. Younger protocols are unproven; much older ones have had years to launch and have not, which is itself information. The floor is ' + MODEL.maturity_floor + 'x, so age alone never zeroes a row. Unknown listing dates are priced at ' + MODEL.unknown_age_days + ' days.'],
      ['Chain breadth', '+' + Math.round(MODEL.chain_bonus * 100) + '% per additional chain, up to four. Multi-chain traction is a weak but real signal that a protocol is winning distribution, priced small enough that it breaks ties rather than making them.'],
    ];
    var grid = el('div', { class: 'explain-grid' });
    cards.forEach(function (c) {
      grid.appendChild(el('div', { class: 'explain-card' }, [el('h3', { text: c[0] }), el('p', { text: c[1] })]));
    });
    box.appendChild(grid);

    var tbody = byId('cat-body');
    tbody.textContent = '';
    var cats = DATA.categories.slice().sort(function (a, b) { return b.used_multiple - a.used_multiple; });
    cats.forEach(function (c) {
      var tr = el('tr');
      tr.appendChild(el('td', { class: 'name', text: c.category }));
      tr.appendChild(el('td', { class: 'num', text: String(c.live_count) }));
      tr.appendChild(el('td', { class: 'num', text: fmtMult(c.median_multiple) }));
      tr.appendChild(el('td', { class: 'num', text: fmtMult(c.used_multiple) }));
      tbody.appendChild(tr);
    });
  }

  // ---------- wiring ----------
  function switchView(name) {
    state.view = name;
    document.querySelectorAll('.tab').forEach(function (t) { t.classList.toggle('is-active', t.getAttribute('data-view') === name); });
    document.querySelectorAll('.view').forEach(function (v) { v.classList.toggle('is-active', v.id === 'view-' + name); });
  }
  document.querySelectorAll('.tab').forEach(function (t) {
    t.addEventListener('click', function () { switchView(t.getAttribute('data-view')); });
  });

  fillSelect(byId('f-category'), boardCategories(), 'All categories');
  fillSelect(byId('f-chain'), boardChains(), 'All chains');
  byId('q').addEventListener('input', function (e) { state.q = e.target.value; renderBoard(); });
  byId('f-category').addEventListener('change', function (e) { state.category = e.target.value; renderBoard(); });
  byId('f-chain').addEventListener('change', function (e) { state.chain = e.target.value; renderBoard(); });
  byId('f-set').addEventListener('change', function (e) { state.set = e.target.value; renderBoard(); });
  byId('f-tvl').addEventListener('change', function (e) { state.minTvl = Number(e.target.value); renderBoard(); });
  byId('f-sort').addEventListener('change', function (e) { state.sort = e.target.value; renderBoard(); });
  byId('controls').addEventListener('submit', function (e) { e.preventDefault(); });

  function syncSliders() {
    byId('s-momentum').value = String(state.sandbox.momentum);
    byId('s-peak').value = String(state.sandbox.peak);
    byId('s-shrink').value = String(state.sandbox.shrink);
    byId('s-chain').value = String(state.sandbox.chain);
    byId('o-momentum').textContent = state.sandbox.momentum.toFixed(2);
    byId('o-peak').textContent = state.sandbox.peak + 'd';
    byId('o-shrink').textContent = state.sandbox.shrink + ' peers';
    byId('o-chain').textContent = '+' + (state.sandbox.chain * 100).toFixed(1) + '%';
  }
  function onSlider() {
    state.sandbox = {
      momentum: Number(byId('s-momentum').value),
      peak: Number(byId('s-peak').value),
      shrink: Number(byId('s-shrink').value),
      chain: Number(byId('s-chain').value),
    };
    syncSliders();
    recomputeSandbox();
    renderBoard();
  }
  ['s-momentum', 's-peak', 's-shrink', 's-chain'].forEach(function (id) { byId(id).addEventListener('input', onSlider); });
  byId('sandbox-reset').addEventListener('click', function () {
    state.sandbox = { momentum: MODEL.momentum_weight, peak: MODEL.maturity_peak_days, shrink: MODEL.shrink_k, chain: MODEL.chain_bonus };
    syncSliders();
    recomputeSandbox();
    renderBoard();
  });

  renderHead();
  syncSliders();
  renderBoard();
  renderLive();
  renderModel();
})();
