import {
  calculate,
  formatPLN,
  parseMoneyInput,
  PARAMS_2026 as P,
  CONTRACTS,
} from './engine.js';

// v2: od tej wersji pole brutto startuje puste (wcześniej płaca minimalna)
const STORAGE_KEY = 'na-reke:v2';
const AGE_MIN = 15;
const AGE_MAX = 99;
const UPDATE_CHECK_EVERY_MS = 60 * 60 * 1000;

const DEFAULTS = {
  age: 30,
  contract: 'employment',
  gross: '',
  bonus: '',
  bonusMode: 'once',
  pit2: { employment: true, mandate: false, work: false },
  increasedCosts: false,
  ppk: false,
  student: false,
  voluntarySickness: false,
  copyright: false,
  seniorRelief: false,
  smallContract: true,
};

const TOGGLES = ['increasedCosts', 'ppk', 'student', 'voluntarySickness', 'copyright', 'seniorRelief', 'smallContract'];

const CONTRACT_HINTS = {
  employment: 'Etat: płacisz pełny ZUS i składkę zdrowotną, a w zamian masz płatny urlop i L4.',
  mandate: 'Zlecenie: ZUS i składka zdrowotna jak na etacie (chorobowe dobrowolne), koszty 20% obniżają podatek.',
  work: 'Umowa o dzieło: bez ZUS i bez składki zdrowotnej, płacisz tylko podatek. Z tej umowy nie masz emerytury ani L4.',
};

const GROSS_LABELS = {
  employment: 'Brutto miesięcznie',
  mandate: 'Brutto ze zlecenia (miesięcznie)',
  work: 'Brutto z umowy o dzieło (miesięcznie)',
};

const PIT2_DESC = {
  employment: 'Pracodawca co miesiąc odejmuje 300 zł od podatku. Wystarczy złożyć PIT-2 u jednego płatnika, zwykle u głównego pracodawcy.',
  mandate: 'Gdy złożysz zleceniodawcy PIT-2, odejmie 300 zł od podatku. Składasz go tylko u jednego płatnika.',
  work: 'Gdy złożysz zamawiającemu PIT-2, odejmie 300 zł od podatku. Składasz go tylko u jednego płatnika.',
};

const $ = (id) => document.getElementById(id);

// --- stan ---------------------------------------------------------------------

function validAge(n) {
  return Number.isInteger(n) && n >= AGE_MIN && n <= AGE_MAX;
}

function loadState() {
  const fresh = { ...DEFAULTS, pit2: { ...DEFAULTS.pit2 } };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!saved || typeof saved !== 'object') return fresh;
    const s = { ...fresh, ...saved, pit2: { ...fresh.pit2, ...(saved.pit2 || {}) } };
    if (!CONTRACTS.includes(s.contract)) s.contract = DEFAULTS.contract;
    if (s.bonusMode !== 'once' && s.bonusMode !== 'monthly') s.bonusMode = DEFAULTS.bonusMode;
    s.age = validAge(Number(s.age)) ? Number(s.age) : DEFAULTS.age;
    if (typeof s.gross !== 'string') s.gross = DEFAULTS.gross;
    if (typeof s.bonus !== 'string') s.bonus = '';
    for (const c of CONTRACTS) s.pit2[c] = Boolean(s.pit2[c]);
    for (const k of TOGGLES) s[k] = Boolean(s[k]);
    return s;
  } catch {
    return fresh; // brak dostępu do pamięci — wartości domyślne
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // np. tryb prywatny — kalkulator działa dalej, tylko nie zapamięta danych
  }
}

const state = loadState();

function rawInput(gross, bonus) {
  return {
    age: state.age,
    contract: state.contract,
    gross: gross.grosze,
    bonus: bonus.grosze,
    bonusMode: state.bonusMode,
    pit2: state.pit2[state.contract],
    increasedCosts: state.increasedCosts,
    ppk: state.ppk,
    student: state.student,
    voluntarySickness: state.voluntarySickness,
    copyright: state.copyright,
    seniorRelief: state.seniorRelief,
    smallContract: state.smallContract,
  };
}

// --- formatowanie -------------------------------------------------------------

const pctFormatter = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 2 });
const pct1Formatter = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 1 });

function share(part, whole) {
  if (!whole) return '0%';
  return `${pct1Formatter.format((part / whole) * 100)}%`;
}

function rate(bp) {
  return `${pctFormatter.format(bp / 100)}%`;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}


// --- opcje i komunikaty o uldze --------------------------------------------------------

function syncOptions(r) {
  const inp = r.input;
  const age = inp.age;
  document.querySelectorAll('.toggle').forEach((row) => {
    const forList = (row.dataset.for || '').split(' ');
    let visible = forList.includes(inp.contract);
    if (row.hasAttribute('data-young')) visible = visible && age < P.youthAgeLimit;
    if (row.hasAttribute('data-not-student')) visible = visible && !inp.studentExempt;
    if (row.hasAttribute('data-senior')) visible = visible && age >= P.seniorMinAge;
    if (row.hasAttribute('data-small')) {
      visible = visible && inp.gross > 0 && inp.gross <= P.smallContractLimit && !inp.copyright;
    }
    row.hidden = !visible;
  });

  $('pit2').checked = Boolean(state.pit2[inp.contract]);
  $('pit2Desc').textContent = PIT2_DESC[inp.contract];
  $('contractHint').textContent = CONTRACT_HINTS[inp.contract];
  $('grossLabel').textContent = GROSS_LABELS[inp.contract];

  const badge = $('reliefBadge');
  badge.replaceChildren();
  badge.classList.remove('muted');
  badge.hidden = true;
  const young = age < P.youthAgeLimit;
  const flat = r.regular.taxMode === 'flat';

  if (young && inp.contract !== 'work') {
    badge.hidden = false;
    if (flat) {
      badge.classList.add('muted');
      badge.textContent = `Ulga dla młodych nie obejmuje umów do ${formatPLN(P.smallContractLimit)}: od nich płatnik pobiera stały podatek 12%.`;
      if (inp.studentExempt) badge.textContent += ' ZUS i składki zdrowotnej jako osoba ucząca się nie płacisz.';
    } else {
      badge.append(
        el('strong', '', 'Ulga dla młodych: '),
        `nie płacisz podatku od przychodu do ${formatPLN(P.reliefAnnualLimit)} w roku. Działa automatycznie do dnia 26. urodzin.`,
      );
      if (inp.studentExempt) {
        badge.append(' Ucząc się lub studiując, nie płacisz też ZUS ani składki zdrowotnej, więc brutto = netto.');
      }
    }
  } else if (young && inp.contract === 'work') {
    badge.hidden = false;
    badge.classList.add('muted');
    badge.textContent = 'Ulga dla młodych nie obejmuje umowy o dzieło, więc podatek płacisz normalnie.';
  } else if (age >= P.seniorMinAge && inp.contract === 'work' && state.seniorRelief) {
    badge.hidden = false;
    badge.classList.add('muted');
    badge.textContent = 'Ulga dla pracujących seniorów nie obejmuje umowy o dzieło, więc podatek płacisz normalnie.';
  }
}

// --- wynik ------------------------------------------------------------------------

function heroView(r, grossInput) {
  const m = r.regular;
  const amount = $('netAmount');
  const sub = $('netSub');
  const label = $('heroLabel');
  let shown = r.year.varies ? r.monthly.average : m.net;
  if (r.bonus) shown = r.withBonus.net; // ostateczna kwota: pensja + premia
  amount.textContent = formatPLN(shown);
  $('miniAmount').textContent = formatPLN(shown);

  if (m.gross === 0) {
    label.textContent = 'Dostaniesz na rękę co miesiąc';
    sub.textContent = grossInput.valid
      ? 'Wpisz wynagrodzenie brutto'
      : 'Nie rozpoznaję tej kwoty. Wpisz np. 4806 albo 4806,50';
    return;
  }

  if (r.bonus) {
    label.textContent = 'Dostaniesz na rękę (z premią)';
    sub.textContent = `z ${formatPLN(r.withBonus.gross)} brutto (w tym premia ${formatPLN(r.bonus.gross)}) · bez premii ${formatPLN(m.net)}`;
    return;
  }

  let grossText = `z ${formatPLN(m.gross)} brutto`;
  if (r.input.bonusMode === 'monthly' && r.input.bonus > 0) grossText += ' (z premią)';

  if (r.year.varies) {
    label.textContent = 'Średnio na rękę co miesiąc';
    sub.textContent = `${grossText} · od ${formatPLN(r.monthly.min)} do ${formatPLN(r.monthly.max)}, zależnie od miesiąca`;
  } else {
    label.textContent = 'Dostaniesz na rękę co miesiąc';
    sub.textContent = `${grossText} · zostaje Ci ${share(m.net, m.gross)}`;
  }
}

function breakdownItems(r) {
  const m = r.regular;
  const inp = r.input;
  const items = [];
  const reliefName = inp.youthRelief ? 'uldze dla młodych' : 'uldze dla seniorów';

  if (inp.contract === 'work') {
    items.push({
      color: 'var(--c-zus)', title: 'Składki ZUS i zdrowotna', amount: 0,
      desc: 'Przy umowie o dzieło nie płacisz składek.',
    });
  } else if (inp.studentExempt) {
    items.push({
      color: 'var(--c-zus)', title: 'Składki ZUS i zdrowotna', amount: 0,
      desc: 'Uczysz się lub studiujesz i masz mniej niż 26 lat, więc na zleceniu nie płacisz składek.',
    });
  } else {
    const capped = m.zusCapped ? ' Część kwoty jest już ponad rocznym limitem.' : '';
    items.push({
      color: 'var(--c-zus)', title: 'Składka emerytalna', amount: m.pension,
      desc: `${rate(P.rates.pension)} brutto. Odkładasz na swoją przyszłą emeryturę w ZUS.${capped}`,
    });
    items.push({
      color: 'var(--c-zus)', title: 'Składka rentowa', amount: m.disability,
      desc: `${rate(P.rates.disability)} brutto. Zabezpieczenie na wypadek utraty zdolności do pracy.`,
    });
    if (inp.contract === 'employment' || inp.voluntarySickness) {
      const capNote = inp.contract === 'mandate' && m.gross > P.voluntarySicknessMonthlyCap
        ? ` (liczona najwyżej od ${formatPLN(P.voluntarySicknessMonthlyCap)})`
        : '';
      items.push({
        color: 'var(--c-zus)', title: 'Składka chorobowa', amount: m.sickness,
        desc: `${rate(P.rates.sickness)} brutto${capNote}. Dzięki niej masz płatne zwolnienie lekarskie (L4).`,
      });
    }
    items.push({
      color: 'var(--c-health)', title: 'Składka zdrowotna', amount: m.health,
      desc: m.healthCapped
        ? `Obniżona z ${formatPLN(m.healthFull)}: przy niskiej pensji składka nie może przekroczyć zaliczki na podatek liczonej po zasadach z 2021 r. NFZ: lekarz, szpital, leki.`
        : '9% od wynagrodzenia po odjęciu składek ZUS. NFZ: lekarz, szpital, refundowane leki.',
    });
  }

  const reduction = m.taxReduction > 0 ? `, minus ${formatPLN(m.taxReduction)} kwoty wolnej` : '';
  let taxDesc;
  if (m.taxMode === 'exempt') {
    taxDesc = `0 zł dzięki ${reliefName}.`;
  } else if (m.taxMode === 'flat') {
    taxDesc = `Umowa do ${formatPLN(P.smallContractLimit)}: stałe 12% od całej kwoty, bez kosztów i bez ulg.`;
  } else if (inp.contract === 'employment') {
    const scale = m.taxBaseHigh > 0 ? '12% i 32% od nadwyżki ponad 120 000 zł' : '12% od dochodu';
    taxDesc = `${scale}${reduction || ', bez kwoty wolnej'}.`;
  } else {
    const costs = inp.copyright ? 'kosztach 50%' : 'kosztach 20%';
    taxDesc = `12% od dochodu po ${costs}${reduction}.`;
  }
  if (m.exempt > 0 && m.taxMode === 'scale') {
    taxDesc = `Część przychodu zwolniona dzięki ${reliefName}. Od reszty: ${taxDesc}`;
  }
  items.push({ color: 'var(--c-tax)', title: 'Zaliczka na podatek (PIT)', amount: m.tax, desc: taxDesc });

  if (m.ppkEmployee > 0) {
    items.push({
      color: 'var(--c-ppk)', title: 'Wpłata do PPK', amount: m.ppkEmployee,
      desc: `${rate(P.rates.ppkEmployee)} brutto. To nadal Twoje pieniądze: trafiają na Twoje konto PPK.`,
    });
  }
  return items;
}

function breakdownView(r) {
  const m = r.regular;
  $('breakdownTitle').textContent = r.year.varies ? 'Co schodzi z wypłaty w styczniu' : 'Co schodzi z wypłaty';
  $('breakdownHint').hidden = !r.year.varies;

  const list = $('breakdown');
  list.replaceChildren();
  for (const item of breakdownItems(r)) {
    const li = el('li');
    const dot = el('span', 'dot');
    dot.style.background = item.color;
    const text = el('span', 'b-text');
    text.append(el('span', 'b-title', item.title), el('span', 'b-desc', item.desc));
    const amount = el('span', 'b-amount');
    amount.append(
      el('span', 'b-value', item.amount > 0 ? `−${formatPLN(item.amount)}` : formatPLN(0)),
      el('span', 'b-pct', share(item.amount, m.gross)),
    );
    li.append(dot, text, amount);
    list.append(li);
  }

  const total = el('li', 'total');
  const dot = el('span', 'dot');
  dot.style.background = 'var(--c-net)';
  const text = el('span', 'b-text');
  text.append(el('span', 'b-title', 'Na rękę'), el('span', 'b-desc', 'Tyle wpływa na Twoje konto.'));
  const amount = el('span', 'b-amount');
  amount.append(el('span', 'b-value', formatPLN(m.net)), el('span', 'b-pct', share(m.net, m.gross)));
  total.append(dot, text, amount);
  list.append(total);

  // pasek proporcji
  const bar = $('bar');
  bar.replaceChildren();
  const segments = [
    ['var(--c-net)', m.net, 'na rękę'],
    ['var(--c-zus)', m.social, 'ZUS'],
    ['var(--c-health)', m.health, 'zdrowotna'],
    ['var(--c-tax)', m.tax, 'podatek'],
    ['var(--c-ppk)', m.ppkEmployee, 'PPK'],
  ];
  for (const [color, value] of segments) {
    if (value <= 0 || m.gross <= 0) continue;
    const s = el('span');
    s.style.background = color;
    s.style.width = `${(value / m.gross) * 100}%`;
    bar.append(s);
  }
  bar.setAttribute(
    'aria-label',
    segments
      .filter(([, v]) => v > 0)
      .map(([, v, name]) => `${name} ${share(v, m.gross)}`)
      .join(', '),
  );

  taxStepsView(r);
}

function calcRow(op, label, value, cls) {
  const tr = el('tr', cls);
  tr.append(el('td', 'op', op), el('td', '', label), el('td', '', value));
  return tr;
}

function taxStepsView(r) {
  const m = r.regular;
  const inp = r.input;
  const body = $('taxStepsBody');
  body.replaceChildren();

  if (m.taxMode === 'exempt') {
    const name = inp.youthRelief ? 'ulga dla młodych' : 'ulga dla pracujących seniorów';
    body.append(
      el('p', '', `Cały przychód jest zwolniony z podatku (${name}, do ${formatPLN(P.reliefAnnualLimit)} w roku). Zaliczka na PIT wynosi 0 zł.`),
    );
  } else if (m.taxMode === 'flat') {
    const t = el('table', 'calc');
    t.append(
      calcRow('', 'Kwota z umowy', formatPLN(m.gross)),
      calcRow('×', '12% podatku zryczałtowanego', formatPLN(m.taxBeforeReduction)),
      calcRow('=', 'Podatek (do pełnych złotych)', formatPLN(m.tax), 'sum'),
    );
    body.append(t, el('p', '', `Przy umowach do ${formatPLN(P.smallContractLimit)} płatnik pobiera stały podatek 12% od całej kwoty, bez kosztów i bez ulg.`));
  } else if (m.taxMode === 'scale') {
    const t = el('table', 'calc');
    t.append(calcRow('', 'Wynagrodzenie brutto', formatPLN(m.gross)));
    if (m.ppkEmployer > 0) t.append(calcRow('+', 'Wpłata pracodawcy do PPK (to też Twój przychód)', formatPLN(m.ppkEmployer)));
    if (m.exempt > 0) t.append(calcRow('−', 'Przychód zwolniony z podatku (ulga)', formatPLN(m.exempt)));
    if (m.socialDeducted > 0) t.append(calcRow('−', 'Składki ZUS', formatPLN(m.socialDeducted)));
    t.append(calcRow('−', 'Koszty uzyskania przychodu', formatPLN(m.costs)));
    t.append(calcRow('=', 'Podstawa opodatkowania (do pełnych złotych)', formatPLN(m.taxBase), 'sum'));
    const rateLabel = m.taxBaseHigh > 0 ? '12% i 32% od nadwyżki ponad 120 000 zł' : '× 12%';
    t.append(calcRow('', rateLabel, formatPLN(m.taxBeforeReduction)));
    if (m.taxReduction > 0) t.append(calcRow('−', 'Kwota zmniejszająca podatek (PIT-2)', formatPLN(m.taxReduction)));
    t.append(calcRow('=', 'Zaliczka na PIT (do pełnych złotych)', formatPLN(m.tax), 'sum'));
    body.append(t);
  } else {
    body.append(el('p', '', 'Wpisz kwotę brutto, żeby zobaczyć wyliczenie.'));
  }

  if (m.healthCapped) {
    body.append(
      el(
        'p',
        '',
        `Składka zdrowotna: 9% × (${formatPLN(m.gross)} − ${formatPLN(m.social)} ZUS) = ${formatPLN(m.healthFull)}. ` +
          `Przy niskiej pensji nie może być wyższa niż zaliczka na podatek liczona po zasadach z 2021 r. ` +
          `(17% podstawy${r.input.pit2 ? ' minus 43,76 zł' : ''}), więc wynosi ${formatPLN(m.health)} (art. 83 ustawy o świadczeniach opieki zdrowotnej). Nie obniża podatku.`,
      ),
    );
  } else if (m.health > 0) {
    body.append(
      el(
        'p',
        '',
        `Składka zdrowotna: 9% × (${formatPLN(m.gross)} − ${formatPLN(m.social)} ZUS) = ${formatPLN(m.health)}. Nie obniża podatku.`,
      ),
    );
  }
}

function bonusView(r) {
  const card = $('bonusCard');
  if (!r.bonus) {
    card.hidden = true;
    return;
  }
  card.hidden = false;
  const b = r.bonus;
  $('bonusLine').replaceChildren(
    'Z premii ',
    el('strong', '', formatPLN(b.gross)),
    ' brutto zostanie Ci ',
    el('strong', '', formatPLN(b.net)),
    ` na rękę (${share(b.net, b.gross)}).`,
  );

  const inp = r.input;
  let how;
  if (inp.contract === 'work') how = 'Premia jest opodatkowana tak samo jak reszta wynagrodzenia z umowy o dzieło.';
  else if (inp.studentExempt) how = 'Premia jest liczona tak samo jak reszta wynagrodzenia ze zlecenia.';
  else how = 'Premia jest oskładkowana i opodatkowana tak samo jak reszta wynagrodzenia.';

  const parts = [`Zakładamy, że premia przyjdzie w styczniu: wypłata wyniesie wtedy ${formatPLN(b.monthNet)}.`, how];
  if (Math.abs(b.monthDelta - b.net) >= 100) {
    parts.push(
      `Na samym pasku styczniowym premia daje ${formatPLN(b.monthDelta)}, ale przez nią szybciej dojdziesz do progu lub limitu, więc kolejne wypłaty będą trochę niższe.`,
    );
  }
  $('bonusHint').textContent = parts.join(' ');
}

function yearView(r) {
  // bez premii jednorazowej
  const totals = r.year.regularTotals;
  $('yearGross').textContent = formatPLN(totals.gross);
  $('yearNet').textContent = formatPLN(totals.net);

  const s = r.year.settlement;
  const after = $('yearAfter');
  if (s && Math.abs(s.diff) >= 10_00) {
    after.hidden = false;
    after.replaceChildren(
      'Po rozliczeniu rocznym zostanie Ci około ',
      el('strong', '', formatPLN(totals.net - s.diff)),
      s.diff > 0 ? ' (po dopłacie podatku).' : ' (ze zwrotem podatku).',
    );
  } else {
    after.hidden = true;
  }

  const notes = $('yearNotes');
  notes.replaceChildren();
  for (const n of r.year.notes) {
    const warn = ['threshold', 'relief', 'annual', 'copyright'].includes(n.kind);
    const good = n.kind === 'refund';
    notes.append(el('div', `note${warn ? ' warn' : ''}${good ? ' good' : ''}`, n.text));
  }

  const inp = r.input;
  if (inp.age === P.youthAgeLimit - 1 && (inp.youthRelief || inp.studentExempt)) {
    notes.append(
      el(
        'div',
        'note warn',
        'Masz 25 lat: ulga dla młodych kończy się w dniu 26. urodzin. Od kolejnej wypłaty płacisz podatek' +
          (inp.studentExempt ? ', a na zleceniu także ZUS i składkę zdrowotną' : '') +
          '. Wynik roczny zakłada ulgę przez cały rok, więc realnie będzie niższy.',
      ),
    );
  }

  if (!r.year.varies && r.regular.gross > 0) {
    notes.append(el('div', 'note', `Każdy miesiąc wygląda tak samo: ${formatPLN(r.regular.net)} na rękę.`));
  }

}

// --- aktualizacja -------------------------------------------------------------------

function update() {
  const grossInput = parseMoneyInput(state.gross);
  const bonusInput = parseMoneyInput(state.bonus);
  const r = calculate(rawInput(grossInput, bonusInput));
  syncOptions(r);
  heroView(r, grossInput);

  const hasGross = r.regular.gross > 0;
  $('breakdownCard').hidden = !hasGross;
  $('yearCard').hidden = !hasGross && !r.bonus;
  if (hasGross) breakdownView(r);
  bonusView(r);
  if (hasGross || r.bonus) yearView(r);

  $('bonusError').hidden = bonusInput.valid;
  saveState();
}

// --- obsługa formularza ---------------------------------------------------------------

function setupSegmented(container, getValue, setValue) {
  const buttons = [...container.querySelectorAll('button')];
  const paint = () => {
    const current = getValue();
    buttons.forEach((b) => {
      const on = b.dataset.value === current;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
    });
  };
  buttons.forEach((b, i) => {
    b.addEventListener('click', () => {
      setValue(b.dataset.value);
      paint();
      update();
    });
    b.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      const next = buttons[(i + (e.key === 'ArrowRight' ? 1 : buttons.length - 1)) % buttons.length];
      next.focus();
      next.click();
    });
  });
  paint();
}

function setupAge() {
  const age = $('age');
  age.value = String(state.age);

  // Liczymy na nowo dopiero przy pełnym, poprawnym wieku — wpisując "35",
  // po drodze pojawia się "3" i nie chcemy wtedy na chwilę włączać ulgi dla młodych.
  age.addEventListener('input', () => {
    const n = Number(age.value);
    if (validAge(n)) {
      state.age = n;
      update();
    }
  });
  age.addEventListener('change', () => {
    const n = Math.round(Number(age.value));
    if (age.value.trim() !== '' && Number.isFinite(n)) {
      state.age = Math.min(AGE_MAX, Math.max(AGE_MIN, n));
    }
    age.value = String(state.age); // puste pole: wracamy do ostatniego poprawnego wieku
    update();
  });
  document.querySelectorAll('.step').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.age = Math.min(AGE_MAX, Math.max(AGE_MIN, state.age + Number(btn.dataset.step)));
      age.value = String(state.age);
      update();
    });
  });
}

function setupServiceWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;

  // Gdy pobierze się nowa wersja, przeładuj stronę — ale nie w trakcie pisania.
  // Wpisane dane są zapamiętane, więc nic nie ginie.
  const hadController = Boolean(navigator.serviceWorker.controller);
  let pending = false;
  const reloadWhenIdle = () => {
    const active = document.activeElement;
    if (active && active.matches('input, select')) {
      active.addEventListener('blur', () => window.location.reload(), { once: true });
    } else {
      window.location.reload();
    }
  };
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || pending) return;
    pending = true;
    reloadWhenIdle();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js', { updateViaCache: 'none' })
      .then((reg) => {
        // Aplikacja z ekranu początkowego często wraca z tła bez przeładowania,
        // więc przy powrocie sami sprawdzamy, czy jest nowa wersja (najwyżej raz na godzinę).
        let lastCheck = Date.now();
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState !== 'visible') return;
          if (Date.now() - lastCheck < UPDATE_CHECK_EVERY_MS) return;
          lastCheck = Date.now();
          reg.update().catch(() => {});
        });
      })
      .catch(() => {});
  });
}

function init() {
  $('yearLabel').textContent = String(P.year);
  setupAge();

  setupSegmented($('contract'), () => state.contract, (v) => {
    state.contract = v;
  });
  setupSegmented($('bonusMode'), () => state.bonusMode, (v) => {
    state.bonusMode = v;
  });

  const gross = $('gross');
  gross.value = state.gross;
  gross.addEventListener('input', () => {
    state.gross = gross.value;
    update();
  });

  const bonus = $('bonus');
  bonus.value = state.bonus;
  bonus.addEventListener('input', () => {
    state.bonus = bonus.value;
    update();
  });

  [gross, bonus, $('age')].forEach((input) => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') input.blur();
    });
  });

  $('minWageChip').textContent = `Płaca minimalna ${formatPLN(P.minimumWage).replace(',00', '')}`;
  $('minWageChip').addEventListener('click', () => {
    state.gross = String(P.minimumWage / 100);
    gross.value = state.gross;
    update();
  });

  $('pit2').addEventListener('change', (e) => {
    state.pit2[state.contract] = e.target.checked;
    update();
  });
  TOGGLES.forEach((key) => {
    const box = $(key);
    box.checked = Boolean(state[key]);
    box.addEventListener('change', () => {
      state[key] = box.checked;
      update();
    });
  });

  update();

  // pasek z kwotą, gdy duża karta zniknie z ekranu
  const mini = $('mini');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      const last = entries[entries.length - 1];
      mini.classList.toggle('show', !last.isIntersecting);
    });
    io.observe($('hero'));
  }

  setupServiceWorker();
}

init();
