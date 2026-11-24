// Widok dla Niemiec: wszystkie nazwy po polsku, z niemieckim odpowiednikiem w nawiasie.
import { calculateDE, formatEUR, DE_STATES } from './engine-de.js';

const $ = (id) => document.getElementById(id);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const pct1 = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 1 });
const share = (part, whole) => (whole ? `${pct1.format((part / whole) * 100)}%` : '0%');

const JOB_HINTS = {
  regular: 'Zwykła praca na umowę (Arbeitsvertrag). Przy niskich zarobkach (Midijob) składki są automatycznie niższe.',
  minijob: 'Praca do limitu Minijob. Podatek zwykle płaci za Ciebie pracodawca, a Ty najwyżej małą składkę emerytalną.',
  student: 'Student pracujący w trakcie semestru do 20 godzin tygodniowo. Płacisz tylko składkę emerytalną, bez zdrowotnej i od bezrobocia.',
};

// domyślna dodatkowa składka kasy chorych = średnia na 2026 r. z silnika
const DEFAULT_HEALTH_EXTRA_BP = calculateDE({}).input.healthExtra;

export const DE_DEFAULTS = {
  deJob: 'regular',
  deTaxClass: 1,
  deState: 'BE',
  deChildren: 0,
  deChurch: false,
  deRvExempt: false,
  deHealthExtra: String(DEFAULT_HEALTH_EXTRA_BP / 100).replace('.', ','),
};

function parsePercentToBp(text) {
  const n = Number(String(text).replace(',', '.').replace('%', '').trim());
  if (!Number.isFinite(n) || n < 0 || n > 10) return DEFAULT_HEALTH_EXTRA_BP;
  return Math.round(n * 100);
}

export function setupDE({ state, update, setupSegmented }) {
  Object.entries(DE_DEFAULTS).forEach(([k, v]) => {
    if (state[k] === undefined) state[k] = v;
  });

  const stateSelect = $('deState');
  for (const s of DE_STATES) {
    const opt = el('option', '', s.name);
    opt.value = s.code;
    stateSelect.append(opt);
  }
  stateSelect.value = state.deState;
  stateSelect.addEventListener('change', () => {
    state.deState = stateSelect.value;
    update();
  });

  const cls = $('deTaxClass');
  cls.value = String(state.deTaxClass);
  cls.addEventListener('change', () => {
    state.deTaxClass = Number(cls.value);
    update();
  });

  setupSegmented($('deJob'), () => state.deJob, (v) => {
    state.deJob = v;
  });

  const kids = $('deChildren');
  kids.value = String(state.deChildren);
  const setKids = (n) => {
    state.deChildren = Math.min(10, Math.max(0, Number.isFinite(n) ? Math.round(n) : 0));
    kids.value = String(state.deChildren);
    update();
  };
  kids.addEventListener('change', () => setKids(Number(kids.value)));
  document.querySelectorAll('[data-kid-step]').forEach((b) => {
    b.addEventListener('click', () => setKids(state.deChildren + Number(b.dataset.kidStep)));
  });

  for (const [id, key] of [['deChurch', 'deChurch'], ['deRvExempt', 'deRvExempt']]) {
    const box = $(id);
    box.checked = Boolean(state[key]);
    const h = () => {
      state[key] = box.checked;
      update();
    };
    box.addEventListener('input', h);
    box.addEventListener('change', h);
  }

  const extra = $('deHealthExtra');
  extra.value = state.deHealthExtra;
  extra.addEventListener('input', () => {
    state.deHealthExtra = extra.value;
    update();
  });
}

function breakdownItems(m, inp) {
  const items = [
    {
      color: 'var(--c-zus)', title: 'Składka emerytalna', de: 'Rentenversicherung', amount: m.pension,
      desc: 'Odkładasz na niemiecką emeryturę.',
    },
  ];
  if (inp.jobType === 'regular') {
    items.push(
      {
        color: 'var(--c-zus)', title: 'Ubezpieczenie od bezrobocia', de: 'Arbeitslosenversicherung', amount: m.unemployment,
        desc: 'Daje prawo do zasiłku, gdy stracisz pracę.',
      },
      {
        color: 'var(--c-health)', title: 'Ubezpieczenie zdrowotne', de: 'Krankenversicherung', amount: m.health,
        desc: 'Kasa chorych: lekarz, szpital, leki i płatne zwolnienie lekarskie.',
      },
      {
        color: 'var(--c-health)', title: 'Ubezpieczenie pielęgnacyjne', de: 'Pflegeversicherung', amount: m.care,
        desc: 'Opieka, gdy nie możesz sam się sobą zająć. Bez dzieci od 23 lat stawka jest wyższa.',
      },
    );
  }
  if (inp.jobType !== 'minijob') {
    items.push(
      {
        color: 'var(--c-tax)', title: 'Podatek dochodowy', de: 'Lohnsteuer', amount: m.incomeTax,
        desc: 'Zależy od klasy podatkowej. Kwota wolna od podatku jest już w nim uwzględniona.',
      },
      {
        color: 'var(--c-tax)', title: 'Dodatek solidarnościowy', de: 'Solidaritätszuschlag', amount: m.soli,
        desc: 'Dopłata do podatku, płacona dopiero przy wyższych zarobkach.',
      },
    );
    if (inp.church) {
      items.push({
        color: 'var(--c-tax)', title: 'Podatek kościelny', de: 'Kirchensteuer', amount: m.churchTax,
        desc: 'Procent od podatku dochodowego, zależny od kraju związkowego.',
      });
    }
  } else {
    items.push({
      color: 'var(--c-tax)', title: 'Podatek', de: 'Pauschalsteuer', amount: 0,
      desc: 'Na Minijobie podatek (2%) zwykle płaci pracodawca, nie Ty.',
    });
  }
  return items;
}

function renderBreakdown(m, inp) {
  $('breakdownTitle').textContent = 'Co schodzi z wypłaty';
  $('breakdownHint').hidden = true;
  const list = $('breakdown');
  list.replaceChildren();
  for (const item of breakdownItems(m, inp)) {
    const li = el('li');
    const dot = el('span', 'dot');
    dot.style.background = item.color;
    const text = el('span', 'b-text');
    const title = el('span', 'b-title', `${item.title} `);
    title.append(el('span', 'de-name', `(${item.de})`));
    text.append(title, el('span', 'b-desc', item.desc));
    const amount = el('span', 'b-amount');
    amount.append(
      el('span', 'b-value', item.amount > 0 ? `−${formatEUR(item.amount)}` : formatEUR(0)),
      el('span', 'b-pct', share(item.amount, m.gross)),
    );
    li.append(dot, text, amount);
    list.append(li);
  }
  const total = el('li', 'total');
  const dot = el('span', 'dot');
  dot.style.background = 'var(--c-net)';
  const text = el('span', 'b-text');
  const t = el('span', 'b-title', 'Na rękę ');
  t.append(el('span', 'de-name', '(Netto)'));
  text.append(t, el('span', 'b-desc', 'Tyle wpływa na Twoje konto.'));
  const amount = el('span', 'b-amount');
  amount.append(el('span', 'b-value', formatEUR(m.net)), el('span', 'b-pct', share(m.net, m.gross)));
  total.append(dot, text, amount);
  list.append(total);

  const bar = $('bar');
  bar.replaceChildren();
  for (const [color, value] of [
    ['var(--c-net)', m.net],
    ['var(--c-zus)', m.pension + m.unemployment],
    ['var(--c-health)', m.health + m.care],
    ['var(--c-tax)', m.tax],
  ]) {
    if (value <= 0 || m.gross <= 0) continue;
    const s = el('span');
    s.style.background = color;
    s.style.width = `${(value / m.gross) * 100}%`;
    bar.append(s);
  }
}

export function renderDE({ state, grossInput, bonusInput, age }) {
  const r = calculateDE({
    age,
    jobType: state.deJob,
    minijobRvExempt: state.deRvExempt,
    taxClass: state.deTaxClass,
    church: state.deChurch,
    state: state.deState,
    children: state.deChildren,
    gross: grossInput.grosze,
    bonus: bonusInput.grosze,
    healthExtra: parsePercentToBp(state.deHealthExtra),
  });
  const inp = r.input;
  const m = r.regular;

  // widoczność pól zależnych od rodzaju pracy
  document.querySelectorAll('.de-only [data-de-job]').forEach((node) => {
    node.hidden = !node.dataset.deJob.split(' ').includes(inp.jobType);
  });
  $('deJobHint').textContent = JOB_HINTS[inp.jobType];

  // duża kwota: ostateczna wypłata (z premią, jeśli jest)
  const shown = r.bonus ? r.withBonus.net : m.net;
  $('netAmount').textContent = formatEUR(shown);
  $('miniAmount').textContent = formatEUR(shown);
  if (m.gross === 0) {
    $('heroLabel').textContent = 'Dostaniesz na rękę co miesiąc';
    $('netSub').textContent = grossInput.valid
      ? 'Wpisz wynagrodzenie brutto'
      : 'Nie rozpoznaję tej kwoty. Wpisz np. 3500 albo 3500,50';
  } else if (r.bonus) {
    $('heroLabel').textContent = 'Dostaniesz na rękę (z premią)';
    $('netSub').textContent = `z ${formatEUR(r.withBonus.gross)} brutto (w tym premia ${formatEUR(r.bonus.gross)}) · bez premii ${formatEUR(m.net)}`;
  } else {
    $('heroLabel').textContent = 'Dostaniesz na rękę co miesiąc';
    $('netSub').textContent = `z ${formatEUR(m.gross)} brutto · zostaje Ci ${share(m.net, m.gross)}`;
  }

  const hasGross = m.gross > 0;
  $('breakdownCard').hidden = !hasGross;
  if (hasGross) renderBreakdown(m, inp);

  const bonusCard = $('bonusCard');
  bonusCard.hidden = !r.bonus;
  if (r.bonus) {
    $('bonusLine').replaceChildren(
      'Z premii ',
      el('strong', '', formatEUR(r.bonus.gross)),
      ' brutto zostanie Ci ',
      el('strong', '', formatEUR(r.bonus.net)),
      ` na rękę (${share(r.bonus.net, r.bonus.gross)}).`,
    );
  }

  $('yearCard').hidden = !hasGross;
  if (hasGross) {
    $('yearGross').textContent = formatEUR(r.year.totals.gross);
    $('yearNet').textContent = formatEUR(r.year.totals.net);
    $('yearAfter').hidden = true;
    const notes = $('yearNotes');
    notes.replaceChildren();
    for (const n of m.notes || []) notes.append(el('div', 'note', n));
  }
}
