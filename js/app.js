/* =============================================
   SNOWBALL WEEKLY SUMMARY — DASHBOARD APP
   ============================================= */

const DB_KEY = 'snowball_db';

const PORTFOLIO_NAMES = [
  'Rollover IRA', 'Roth IRA', 'Investment', 'Traditional IRA', 'Income Strategy Test'
];

const MARKET_DEFS = [
  { name: 'S&P 500',                      ticker: 'SPX'  },
  { name: 'NASDAQ Composite',             ticker: 'COMP' },
  { name: 'Dow Jones Industrial Average', ticker: 'DJIA' },
  { name: 'Bitcoin',                      ticker: 'BTC'  }
];

function slugify(s) {
  return s.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

// ── Helpers ─────────────────────────────────

const fmt = {
  currency: v => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(v),
  pct:      v => (v >= 0 ? '+' : '') + v.toFixed(2) + '%',
  pctAbs:   v => Math.abs(v).toFixed(2) + '%',
  sign:     v => v >= 0 ? '+' : '',
  dirTag:   v => v >= 0 ? '▲' : '▼',
};

// ── Database Layer ───────────────────────────

class ReportsDB {
  constructor() {
    this.data = this._load();
  }

  _load() {
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return { reports: [] };
  }

  _save() {
    localStorage.setItem(DB_KEY, JSON.stringify(this.data));
  }

  async init(jsonPath) {
    /* Always merge bundled data/db.json — file entries overwrite localStorage copies */
    try {
      const resp = await fetch(jsonPath + '?v=' + Date.now()); // bust cache
      if (!resp.ok) throw new Error('fetch failed');
      const bundled = await resp.json();
      for (const r of bundled.reports) {
        const idx = this.data.reports.findIndex(x => x.id === r.id);
        if (idx >= 0) this.data.reports.splice(idx, 1, r); // overwrite
        else this.data.reports.push(r);                    // new entry
      }
      this._save();
    } catch (e) {
      console.warn('Could not load db.json, using localStorage only.', e);
    }
    this.data.reports.sort((a, b) => b.id.localeCompare(a.id));
  }

  all()          { return this.data.reports; }
  latest()       { return this.data.reports[0] || null; }
  get(id)        { return this.data.reports.find(r => r.id === id) || null; }

  add(report) {
    const idx = this.data.reports.findIndex(r => r.id === report.id);
    if (idx >= 0) this.data.reports.splice(idx, 1, report);
    else this.data.reports.unshift(report);
    this.data.reports.sort((a, b) => b.id.localeCompare(a.id));
    this._save();
  }

  delete(id) {
    this.data.reports = this.data.reports.filter(r => r.id !== id);
    this._save();
  }
}

// ── Chart: Donut (pure SVG) ──────────────────

function buildDonut(portfolios, containerId) {
  const total = portfolios.reduce((s, p) => s + p.value, 0);
  const colors = ['#388bfd', '#3fb950', '#a371f7', '#f0c040', '#3ddbd9'];
  const size = 130, cx = size / 2, cy = size / 2, r = 48, stroke = 22;
  const circ = 2 * Math.PI * r;

  let offset = 0;
  const slices = portfolios.map((p, i) => {
    const pct = p.value / total;
    const dash = pct * circ;
    const s = { pct, dash, offset, color: colors[i % colors.length], name: p.name, value: p.value };
    offset += dash;
    return s;
  });

  const svgSlices = slices.map(s =>
    `<circle cx="${cx}" cy="${cy}" r="${r}"
       fill="none" stroke="${s.color}" stroke-width="${stroke}"
       stroke-dasharray="${s.dash} ${circ - s.dash}"
       stroke-dashoffset="${-s.offset + circ * 0.25}"
       style="transition:stroke-dasharray 0.6s ease"/>`
  ).join('\n');

  const svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="flex-shrink:0">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#1c2333" stroke-width="${stroke}"/>
    ${svgSlices}
    <text x="${cx}" y="${cy - 5}" text-anchor="middle" fill="#8b949e" font-size="9" font-family="Inter,sans-serif">TOTAL</text>
    <text x="${cx}" y="${cy + 9}" text-anchor="middle" fill="#e6edf3" font-size="10" font-weight="bold" font-family="Inter,sans-serif">${fmt.currency(total / 1000).replace('$','$').split('.')[0]}K</text>
  </svg>`;

  const legend = slices.map((s, i) =>
    `<div class="legend-item">
      <div class="legend-dot" style="background:${s.color}"></div>
      <span class="legend-name">${s.name.replace(' IRA','').replace(' Strategy Test',' Test')}</span>
      <span class="legend-pct">${(s.pct * 100).toFixed(1)}%</span>
    </div>`
  ).join('');

  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = `<div class="donut-container">${svg}<div class="donut-legend">${legend}</div></div>`;
}

// ── Chart: P&L Bars ──────────────────────────

function buildPnlBars(portfolios, containerId) {
  const maxPnl = Math.max(...portfolios.map(p => Math.abs(p.pnl_amount)));

  const bars = portfolios.map(p => {
    const height = Math.max(6, (Math.abs(p.pnl_amount) / maxPnl) * 120);
    const cls = p.pnl_direction === 'up' ? 'gain' : 'loss';
    const ticker = p.name.replace(' IRA','').replace(' Investment','Invest.').replace(' Strategy Test',' Test');
    return `<div class="bar-item">
      <span class="bar-value">${fmt.currency(p.pnl_amount)}</span>
      <div class="bar ${cls}" style="height:${height}px"></div>
      <span class="bar-label">${ticker}</span>
    </div>`;
  }).join('');

  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = `<div class="bar-chart-container">${bars}</div>`;
}

// ── Render: Markets ──────────────────────────

function renderMarkets(markets) {
  return markets.map(m => {
    const cls = m.direction === 'down' ? 'down' : 'up';
    const sign = m.direction === 'up' ? '▲' : '▼';
    return `<div class="market-card ${cls} fade-in">
      <div class="market-name">${m.name}</div>
      <div class="market-change ${cls}">${sign}${Math.abs(m.change).toFixed(2)}%</div>
      <div class="market-ticker">${m.ticker}</div>
    </div>`;
  }).join('');
}

// ── Render: Summary Bar ──────────────────────

const BASELINE_DATE        = 'Nov 29, 2025';
const BASELINE_TOTAL_VALUE = 1309110.37;

function renderSummary(portfolios) {
  const totalValue   = portfolios.reduce((s, p) => s + p.value, 0);
  const totalPnl     = portfolios.reduce((s, p) => s + p.pnl_amount, 0);
  const totalDiv     = portfolios.reduce((s, p) => s + p.dividends_next_week, 0);
  const pnlCls       = totalPnl >= 0 ? 'green' : 'red';
  const pnlSign      = totalPnl >= 0 ? '▲' : '▼';

  const sinceGainLoss    = totalValue - BASELINE_TOTAL_VALUE;
  const sinceGainLossCls = sinceGainLoss >= 0 ? 'green' : 'red';
  const sinceArrow       = sinceGainLoss >= 0 ? '▲' : '▼';
  const sincePct         = (sinceGainLoss / BASELINE_TOTAL_VALUE) * 100;

  const cards = [
    { label: 'Total Portfolio Value', value: fmt.currency(totalValue), sub: `${portfolios.length} accounts`, subCls: '' },
    { label: 'Weekly P&L', value: `${fmt.sign(totalPnl)}${fmt.currency(Math.abs(totalPnl))}`, sub: `${pnlSign} overall gain`, subCls: pnlCls },
    { label: 'Dividends Next Week', value: fmt.currency(totalDiv), sub: 'across all accounts', subCls: 'green' },
    { label: 'Total Gain/Loss', value: `${sinceGainLoss >= 0 ? '+' : '-'}${fmt.currency(Math.abs(sinceGainLoss))}`, sub: `${sinceArrow}${Math.abs(sincePct).toFixed(2)}% since ${BASELINE_DATE}`, subCls: sinceGainLossCls },
  ];

  return cards.map(c =>
    `<div class="summary-card total fade-in">
      <div class="summary-label">${c.label}</div>
      <div class="summary-value">${c.value}</div>
      <div class="summary-sub ${c.subCls}">${c.sub}</div>
    </div>`
  ).join('') + portfolios.map(p => {
    const pnlCls = p.pnl_direction === 'up' ? 'green' : 'red';
    const arrow  = p.pnl_direction === 'up' ? '▲' : '▼';
    return `<div class="summary-card fade-in">
      <div class="summary-label">${p.name}</div>
      <div class="summary-value">${fmt.currency(p.value)}</div>
      <div class="summary-sub ${pnlCls}">${arrow}${p.pnl_percent.toFixed(2)}%  ${fmt.sign(p.pnl_amount)}${fmt.currency(Math.abs(p.pnl_amount))}</div>
    </div>`;
  }).join('');
}

// ── Render: Portfolio Card ───────────────────

function renderPortfolioCard(p) {
  const pnlCls   = p.pnl_direction === 'up' ? 'up' : 'down';
  const arrow    = p.pnl_direction === 'up' ? '▲' : '▼';

  const gainerRows = p.top_gainers.map(g =>
    `<div class="holding-row gain fade-in">
      <div class="holding-info">
        <div class="holding-ticker">${g.ticker}</div>
        <div class="holding-name" title="${g.name}">${g.name}</div>
      </div>
      <div class="holding-change gain">
        +${fmt.currency(g.change_amount)}
        <span class="pct">▲${g.change_percent.toFixed(2)}%</span>
      </div>
    </div>`
  ).join('');

  const loserRows = p.top_losers.length
    ? p.top_losers.map(l =>
        `<div class="holding-row loss fade-in">
          <div class="holding-info">
            <div class="holding-ticker">${l.ticker}</div>
            <div class="holding-name" title="${l.name}">${l.name}</div>
          </div>
          <div class="holding-change loss">
            ${fmt.currency(l.change_amount)}
            <span class="pct">▼${Math.abs(l.change_percent).toFixed(2)}%</span>
          </div>
        </div>`
      ).join('')
    : `<div class="no-losers">🎉 No losers this week!</div>`;

  return `<div class="portfolio-card fade-in">
    <div class="portfolio-header">
      <div>
        <div class="portfolio-name">${p.name}</div>
        <div class="portfolio-value">${fmt.currency(p.value)}</div>
        <div class="portfolio-pnl ${pnlCls}">
          P&L: ${fmt.sign(p.pnl_amount)}${fmt.currency(Math.abs(p.pnl_amount))} &nbsp;
          <span class="tag tag-${p.pnl_direction === 'up' ? 'green' : 'red'}">${arrow}${p.pnl_percent.toFixed(2)}%</span>
        </div>
      </div>
      <div class="dividend-badge">
        <div class="dividend-badge-label">Dividends</div>
        <div class="dividend-badge-value">${fmt.currency(p.dividends_next_week)}</div>
      </div>
    </div>

    <div class="holdings-section">
      <div class="holdings-title gainers">🥇 Top Gainers</div>
      ${gainerRows}
    </div>

    <div class="divider"></div>

    <div class="holdings-section">
      <div class="holdings-title losers">📉 Top Losers</div>
      ${loserRows}
    </div>
  </div>`;
}

// ── Render: Dividend Calendar ────────────────

function renderCalendar(divs) {
  const rows = divs.map(d => {
    const evtCls = d.event_type.includes('Ex-') ? 'ex-div' : 'payment';
    return `<tr>
      <td class="cal-date">${d.display_date}</td>
      <td class="cal-ticker">${d.ticker}</td>
      <td class="cal-name">${d.name}</td>
      <td><span class="cal-event ${evtCls}">${d.event_type}</span></td>
      <td class="cal-amount">${fmt.currency(d.amount_per_share)}<span class="muted">/share</span></td>
    </tr>`;
  }).join('');

  return `<table class="calendar-table">
    <thead><tr>
      <th>Date</th><th>Ticker</th><th>Name</th><th>Event</th><th style="text-align:right">Amount</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

// ── Render: History ──────────────────────────

function renderHistory(reports, activeId) {
  if (!reports.length) return '<div style="padding:20px;color:var(--text-muted);text-align:center">No historical reports.</div>';
  return reports.map(r => {
    const total  = r.portfolios.reduce((s, p) => s + p.value, 0);
    const pnl    = r.portfolios.reduce((s, p) => s + p.pnl_amount, 0);
    const pnlCls = pnl >= 0 ? 'up' : 'down';
    const arrow  = pnl >= 0 ? '▲' : '▼';
    const active = r.id === activeId ? 'active' : '';
    const badges = r.portfolios.map(p => `<span class="hist-badge">${p.name.replace(' IRA','').replace(' Strategy Test',' Test')}</span>`).join('');

    return `<div class="history-item ${active}" data-id="${r.id}">
      <div class="history-date">${r.week_ending}</div>
      <div class="history-total">${fmt.currency(total)}</div>
      <div class="history-pnl ${pnlCls}">${arrow}${fmt.currency(Math.abs(pnl))}</div>
      <div class="history-portfolios">${badges}</div>
      <button class="btn-delete-report" data-id="${r.id}" title="Delete this report"
        style="margin-left:8px;flex-shrink:0;background:none;border:1px solid rgba(248,81,73,0.3);border-radius:4px;color:var(--red);cursor:pointer;font-size:11px;padding:2px 8px">✕ Delete</button>
    </div>`;
  }).join('');
}

// ── Main App ─────────────────────────────────

class App {
  constructor() {
    this.db = new ReportsDB();
    this.currentId = null;
    this.modal = null;
  }

  async boot() {
    // Load bundled data then render
    await this.db.init('./data/db.json');

    const latest = this.db.latest();
    if (!latest) {
      document.getElementById('loading').innerHTML = '<div style="color:var(--red);font-size:16px">No data found. Add a report to get started.</div>';
      return;
    }

    this.currentId = latest.id;
    this._render(latest);
    this._hideLoader();
    this._attachEvents();
  }

  _render(report) {
    // Markets
    document.getElementById('markets-grid').innerHTML = renderMarkets(report.markets);

    // Summary
    document.getElementById('summary-bar').innerHTML = renderSummary(report.portfolios);

    // Charts
    buildDonut(report.portfolios, 'donut-chart');
    buildPnlBars(report.portfolios, 'pnl-chart');

    // Portfolio cards
    document.getElementById('portfolios-grid').innerHTML =
      report.portfolios.map(renderPortfolioCard).join('');

    // Dividend calendar
    document.getElementById('calendar-body').innerHTML = renderCalendar(report.upcoming_dividends);
    document.getElementById('div-total-badge').textContent =
      fmt.currency(report.portfolios.reduce((s, p) => s + p.dividends_next_week, 0));

    // Week label
    document.getElementById('week-label-text').textContent = report.week_ending;

    // History
    this._renderHistory();
  }

  _renderHistory() {
    document.getElementById('history-list').innerHTML =
      renderHistory(this.db.all(), this.currentId);

    // Load report on row click
    document.querySelectorAll('.history-item').forEach(el => {
      el.addEventListener('click', e => {
        if (e.target.closest('.btn-delete-report')) return;
        const id = el.dataset.id;
        const report = this.db.get(id);
        if (report) {
          this.currentId = id;
          this._render(report);
          document.querySelector('.history-item.active')?.classList.remove('active');
          el.classList.add('active');
          window.scrollTo({ top: 0, behavior: 'smooth' });
          this._toast('Loaded report: ' + report.week_ending, 'info');
        }
      });
    });

    // Delete report buttons
    document.querySelectorAll('.btn-delete-report').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const report = this.db.get(id);
        if (!report) return;
        if (!confirm(`Delete report "${report.week_ending}"?\nThis cannot be undone.`)) return;
        this.db.delete(id);
        if (id === this.currentId) {
          const latest = this.db.latest();
          if (latest) { this.currentId = latest.id; this._render(latest); }
        }
        this._renderHistory();
        this._toast('Report deleted.', 'info');
      });
    });
  }

  _hideLoader() {
    const el = document.getElementById('loading');
    if (el) {
      el.style.transition = 'opacity 0.4s ease';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 450);
    }
  }

  _toast(msg, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
  }

  _openModal() {
    this._buildModalContent();
    document.getElementById('modal-overlay').classList.add('open');
  }

  _closeModal() {
    document.getElementById('modal-overlay').classList.remove('open');
  }

  _attachEvents() {
    document.getElementById('btn-add-report').addEventListener('click', () => this._openModal());
    document.getElementById('modal-overlay').addEventListener('click', e => {
      if (e.target === e.currentTarget) this._closeModal();
    });
    document.getElementById('btn-export').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify({ reports: this.db.all() }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `snowball_reports_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      this._toast('Reports exported!', 'success');
    });
  }

  // ── Modal Form Builder ────────────────────

  _buildModalContent() {
    const F = `style="width:100%;padding:7px 10px;background:var(--bg-primary);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text-primary);font-size:12px;outline:none;"`;
    const S = `style="padding:7px 10px;background:var(--bg-primary);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text-primary);font-size:12px;outline:none;cursor:pointer;width:100%"`;

    const marketRows = MARKET_DEFS.map(m => `
      <div style="display:grid;grid-template-columns:1fr 110px 90px;gap:8px;align-items:center;margin-bottom:8px">
        <span style="font-size:13px;color:var(--text-secondary)">${m.name}</span>
        <input type="number" step="0.01" min="0" name="mkt_${m.ticker}_change" placeholder="e.g. 0.44" ${F} />
        <select name="mkt_${m.ticker}_dir" ${S}>
          <option value="down">▼ Down</option>
          <option value="up">▲ Up</option>
        </select>
      </div>`).join('');

    const portfolioSections = PORTFOLIO_NAMES.map(name => {
      const s = slugify(name);
      return `
        <div style="margin-bottom:10px">
          <div class="pf-form-header" data-slug="${s}"
            style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;
                   background:var(--bg-secondary);border:1px solid var(--border);border-radius:var(--radius-sm);
                   cursor:pointer;user-select:none">
            <span style="font-size:13px;font-weight:600">${name}</span>
            <span class="pf-toggle" style="font-size:11px;color:var(--text-muted)">▼ expand</span>
          </div>
          <div class="pf-form-body" id="pfbody_${s}"
            style="display:none;padding:14px;border:1px solid var(--border);border-top:none;
                   border-radius:0 0 var(--radius-sm) var(--radius-sm);background:var(--bg-card)">
            <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:14px">
              <div><div class="modal-field-label">Value ($)</div><input type="number" step="0.01" name="p_${s}_value" placeholder="231970.87" ${F}/></div>
              <div><div class="modal-field-label">P&amp;L ($)</div><input type="number" step="0.01" name="p_${s}_pnl_amount" placeholder="176.38" ${F}/></div>
              <div><div class="modal-field-label">P&amp;L (%)</div><input type="number" step="0.001" name="p_${s}_pnl_percent" placeholder="0.08" ${F}/></div>
              <div><div class="modal-field-label">Direction</div><select name="p_${s}_pnl_dir" ${S}><option value="up">▲ Up</option><option value="down">▼ Down</option></select></div>
              <div><div class="modal-field-label">Dividends ($)</div><input type="number" step="0.01" name="p_${s}_dividends" placeholder="61.81" ${F}/></div>
            </div>
            <div style="margin-bottom:12px">
              <div style="font-size:11px;font-weight:700;color:var(--green);text-transform:uppercase;letter-spacing:.7px;margin-bottom:6px">🥇 Top Gainers</div>
              <div style="display:grid;grid-template-columns:75px 1fr 85px 75px;gap:5px;margin-bottom:4px">
                <span style="font-size:10px;color:var(--text-muted);font-weight:600">TICKER</span>
                <span style="font-size:10px;color:var(--text-muted);font-weight:600">Name</span>
                <span style="font-size:10px;color:var(--text-muted);font-weight:600">$ Change</span>
                <span style="font-size:10px;color:var(--text-muted);font-weight:600">% Change</span>
              </div>
              <div id="gainers_${s}"></div>
              <button type="button" class="btn-add-holding btn btn-ghost" data-target="gainers_${s}" style="font-size:11px;padding:4px 10px;margin-top:6px">＋ Add Gainer</button>
            </div>
            <div>
              <div style="font-size:11px;font-weight:700;color:var(--red);text-transform:uppercase;letter-spacing:.7px;margin-bottom:6px">📉 Top Losers</div>
              <div style="display:grid;grid-template-columns:75px 1fr 85px 75px;gap:5px;margin-bottom:4px">
                <span style="font-size:10px;color:var(--text-muted);font-weight:600">TICKER</span>
                <span style="font-size:10px;color:var(--text-muted);font-weight:600">Name</span>
                <span style="font-size:10px;color:var(--text-muted);font-weight:600">$ Change</span>
                <span style="font-size:10px;color:var(--text-muted);font-weight:600">% Change</span>
              </div>
              <div id="losers_${s}"></div>
              <button type="button" class="btn-add-holding btn btn-ghost" data-target="losers_${s}" style="font-size:11px;padding:4px 10px;margin-top:6px">＋ Add Loser</button>
            </div>
          </div>
        </div>`;
    }).join('');

    document.getElementById('modal-form-container').innerHTML = `
      <div class="modal-title">
        📥 Add Weekly Report
        <button type="button" id="modal-close" class="modal-close" aria-label="Close">&times;</button>
      </div>
      <form id="form-add-report" autocomplete="off">

        <div class="modal-section">
          <div class="modal-section-title">📋 Report Info</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div>
              <div class="modal-field-label">Week Ending Date <span style="color:var(--red)">*</span></div>
              <input type="date" name="report-date" required ${F} />
            </div>
            <div>
              <div class="modal-field-label">Display Label <span style="color:var(--red)">*</span></div>
              <input type="text" name="report-label" placeholder="e.g. March 7, 2026" required ${F} />
            </div>
          </div>
        </div>

        <div class="modal-section">
          <div class="modal-section-title">📈 Markets Overview</div>
          <div style="background:var(--bg-secondary);padding:12px;border-radius:var(--radius-sm);border:1px solid var(--border)">
            <div style="display:grid;grid-template-columns:1fr 110px 90px;gap:8px;margin-bottom:6px">
              <span style="font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase">Market</span>
              <span style="font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase">Change %</span>
              <span style="font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase">Dir.</span>
            </div>
            ${marketRows}
          </div>
        </div>

        <div class="modal-section">
          <div class="modal-section-title">💼 Portfolios <span style="font-size:11px;color:var(--text-muted);font-weight:400">(click each to expand)</span></div>
          ${portfolioSections}
        </div>

        <div class="modal-section">
          <div class="modal-section-title">📅 Upcoming Dividends</div>
          <div style="display:grid;grid-template-columns:105px 65px 1fr 130px 80px 28px;gap:6px;margin-bottom:5px">
            <span style="font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase">Date</span>
            <span style="font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase">Ticker</span>
            <span style="font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase">Fund Name</span>
            <span style="font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase">Event Type</span>
            <span style="font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase">$/Share</span>
            <span></span>
          </div>
          <div id="dividends-rows"></div>
          <button type="button" class="btn-add-dividend btn btn-ghost" style="font-size:11px;padding:4px 10px;margin-top:6px">＋ Add Dividend Event</button>
        </div>

        <div style="display:flex;gap:10px;justify-content:flex-end;padding-top:16px;border-top:1px solid var(--border);margin-top:4px">
          <button type="button" id="modal-cancel-btn" class="btn btn-ghost">Cancel</button>
          <button type="submit" class="btn btn-primary">💾 Save Report</button>
        </div>
      </form>`;

    this._attachModalFormEvents();
  }

  _attachModalFormEvents() {
    document.getElementById('modal-close')?.addEventListener('click', () => this._closeModal());
    document.getElementById('modal-cancel-btn')?.addEventListener('click', () => this._closeModal());
    document.getElementById('form-add-report')?.addEventListener('submit', e => {
      e.preventDefault();
      this._submitReport();
    });

    // Portfolio section expand/collapse
    document.querySelectorAll('.pf-form-header').forEach(header => {
      header.addEventListener('click', () => {
        const s    = header.dataset.slug;
        const body = document.getElementById(`pfbody_${s}`);
        const lbl  = header.querySelector('.pf-toggle');
        const open = body.style.display === 'none';
        body.style.display = open ? 'block' : 'none';
        lbl.textContent    = open ? '▲ collapse' : '▼ expand';
      });
    });

    // Add holding row
    document.querySelectorAll('.btn-add-holding').forEach(btn => {
      btn.addEventListener('click', () => this._addHoldingRow(btn.dataset.target));
    });

    // Add dividend row
    document.querySelector('.btn-add-dividend')?.addEventListener('click', () => this._addDividendRow());
  }

  _addHoldingRow(containerId) {
    const c = document.getElementById(containerId);
    if (!c) return;
    const iS = 'style="padding:6px 8px;background:var(--bg-primary);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text-primary);font-size:12px;outline:none;width:100%"';
    const row = document.createElement('div');
    row.className = 'holding-input-row';
    row.style.cssText = 'display:grid;grid-template-columns:75px 1fr 85px 75px 26px;gap:5px;align-items:center;margin-bottom:5px';
    row.innerHTML = `
      <input type="text" class="h-ticker" placeholder="TICKER" ${iS} />
      <input type="text" class="h-name"   placeholder="Fund / Holding Name" ${iS} />
      <input type="number" step="0.01" class="h-amount" placeholder="123.45" ${iS} />
      <input type="number" step="0.01" class="h-pct"    placeholder="1.23" ${iS} />
      <button type="button" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:18px;padding:0;line-height:1">×</button>`;
    row.querySelector('button').addEventListener('click', () => row.remove());
    c.appendChild(row);
  }

  _addDividendRow() {
    const c = document.getElementById('dividends-rows');
    if (!c) return;
    const iS = 'style="padding:6px 8px;background:var(--bg-primary);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text-primary);font-size:12px;outline:none;width:100%"';
    const row = document.createElement('div');
    row.className = 'dividend-input-row';
    row.style.cssText = 'display:grid;grid-template-columns:105px 65px 1fr 130px 80px 28px;gap:6px;align-items:center;margin-bottom:5px';
    row.innerHTML = `
      <input type="date" class="div-date" ${iS} />
      <input type="text" class="div-ticker" placeholder="SGOV" ${iS} />
      <input type="text" class="div-name"   placeholder="Fund Name" ${iS} />
      <select class="div-type" ${iS} style="cursor:pointer">
        <option value="Ex-dividend date">Ex-dividend date</option>
        <option value="Payment date">Payment date</option>
      </select>
      <input type="number" step="0.00001" class="div-amount" placeholder="0.30924" ${iS} />
      <button type="button" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:18px;padding:0;line-height:1">×</button>`;
    row.querySelector('button').addEventListener('click', () => row.remove());
    c.appendChild(row);
  }

  _submitReport() {
    const form = document.getElementById('form-add-report');
    if (!form) return;

    const date  = form.elements['report-date']?.value;
    const label = form.elements['report-label']?.value?.trim();
    if (!date || !label) { this._toast('Date and label are required.', 'error'); return; }

    // Markets
    const markets = MARKET_DEFS.map(m => {
      const change = parseFloat(form.elements[`mkt_${m.ticker}_change`]?.value) || 0;
      const dir    = form.elements[`mkt_${m.ticker}_dir`]?.value || 'down';
      return { name: m.name, ticker: m.ticker, change: dir === 'down' ? -change : change, direction: dir };
    });

    // Portfolios
    const portfolios = PORTFOLIO_NAMES.map(name => {
      const s         = slugify(name);
      const value     = parseFloat(form.elements[`p_${s}_value`]?.value)       || 0;
      const pnl_amt   = parseFloat(form.elements[`p_${s}_pnl_amount`]?.value)  || 0;
      const pnl_pct   = parseFloat(form.elements[`p_${s}_pnl_percent`]?.value) || 0;
      const pnl_dir   = form.elements[`p_${s}_pnl_dir`]?.value || 'up';
      const dividends = parseFloat(form.elements[`p_${s}_dividends`]?.value)   || 0;

      const parseHoldings = (containerId, isLoss) =>
        [...(document.getElementById(containerId)?.querySelectorAll('.holding-input-row') || [])].map(row => {
          const ticker = row.querySelector('.h-ticker')?.value?.trim();
          if (!ticker) return null;
          const amt = parseFloat(row.querySelector('.h-amount')?.value) || 0;
          const pct = parseFloat(row.querySelector('.h-pct')?.value)    || 0;
          return {
            ticker,
            name:           row.querySelector('.h-name')?.value?.trim() || ticker,
            change_amount:  isLoss ? -Math.abs(amt) : Math.abs(amt),
            change_percent: isLoss ? -Math.abs(pct) : Math.abs(pct)
          };
        }).filter(Boolean);

      return {
        name, value,
        pnl_amount:       pnl_amt,
        pnl_percent:      pnl_pct,
        pnl_direction:    pnl_dir,
        dividends_next_week: dividends,
        top_gainers: parseHoldings(`gainers_${s}`, false),
        top_losers:  parseHoldings(`losers_${s}`,  true)
      };
    });

    // Upcoming dividends
    const upcoming_dividends = [...document.querySelectorAll('.dividend-input-row')].map(row => {
      const dateVal = row.querySelector('.div-date')?.value;
      const ticker  = row.querySelector('.div-ticker')?.value?.trim();
      if (!dateVal || !ticker) return null;
      const d = new Date(dateVal + 'T00:00:00');
      const display_date = d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
      return {
        date: dateVal, display_date, ticker,
        name:             row.querySelector('.div-name')?.value?.trim() || ticker,
        event_type:       row.querySelector('.div-type')?.value || 'Ex-dividend date',
        frequency:        'monthly',
        amount_per_share: parseFloat(row.querySelector('.div-amount')?.value) || 0
      };
    }).filter(Boolean);

    const report = { id: date, week_ending: label, created_at: date, markets, portfolios, upcoming_dividends };
    this.db.add(report);
    this.currentId = report.id;
    this._render(report);
    this._closeModal();
    this._toast(`Report "${label}" saved!`, 'success');
  }
}

// ── Bootstrap ────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.boot().catch(err => {
    console.error(err);
    document.getElementById('loading').innerHTML =
      `<div style="color:var(--red)">Error loading data: ${err.message}</div>`;
  });
});
