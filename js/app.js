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
const NO_AGE = 30; // wiek, przy którym nie działa żadna ulga zależna od wieku
const FIRST_STEP_AGE = 18;
const AGE_MAX = 99;

const DEFAULTS = {
  age: 0, // 0 = wiek niewpisany
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

// Przy każdym uruchomieniu formularz startuje od zera — niczego nie zapamiętujemy.
try {
  localStorage.removeItem('na-reke:v1');
  localStorage.removeItem(STORAGE_KEY);
} catch {
  // brak dostępu do pamięci — bez znaczenia
}
const state = { ...DEFAULTS, pit2: { ...DEFAULTS.pit2 } };

function rawInput(gross, bonus) {
  return {
    // bez wpisanego wieku liczymy bez ulg zależnych od wieku
    age: state.age >= AGE_MIN ? state.age : NO_AGE,
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

  // Gdy ulga zwalnia całą wypłatę z podatku, PIT-2 i koszty dojazdu nic nie zmieniają.
  const exemptNow = r.regular.taxMode === 'exempt';
  const reliefName = inp.youthRelief ? 'uldze dla młodych' : 'uldze dla seniorów';
  for (const id of ['pit2', 'increasedCosts']) {
    const row = $(id).closest('.toggle');
    let note = row.querySelector('.toggle-note');
    if (!note) {
      note = el('span', 'toggle-note');
      row.querySelector('.toggle-text').append(note);
    }
    note.textContent = `Teraz nie zmienia kwoty: dzięki ${reliefName} podatek wynosi 0 zł.`;
    note.hidden = !exemptNow;
  }
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
        `nie płacisz podatku od przychodu do ${formatPLN(P.reliefAnnualLimit)} w roku.`,
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
    if (age.value.trim() === '' || !Number.isFinite(n) || n <= 0) state.age = 0;
    else state.age = Math.min(AGE_MAX, Math.max(AGE_MIN, n));
    age.value = String(state.age);
    update();
  });
  document.querySelectorAll('.step').forEach((btn) => {
    btn.addEventListener('click', () => {
      const step = Number(btn.dataset.step);
      if (state.age < AGE_MIN) state.age = step > 0 ? FIRST_STEP_AGE : 0;
      else state.age = Math.min(AGE_MAX, Math.max(AGE_MIN, state.age + step));
      age.value = String(state.age);
      update();
    });
  });
}

// Aplikacja z ekranu początkowego iPhone'a często nie uruchamia się od nowa,
// tylko wraca z tła. Jeśli była w tle dłużej niż minutę, przeładowujemy ją:
// formularz startuje od zera i wczytuje się najnowsza wersja.
const RESET_AFTER_HIDDEN_MS = 60 * 1000;

function setupFreshStart() {
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
    } else if (hiddenAt && Date.now() - hiddenAt >= RESET_AFTER_HIDDEN_MS) {
      window.location.reload();
    }
  });
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) window.location.reload();
  });
}

function setupServiceWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;

  // Gdy pobierze się nowa wersja, przeładuj stronę — ale nie w trakcie pisania.
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
      .then((reg) => reg.update().catch(() => {}))
      .catch(() => {});
  });
}

function init() {
  $('yearLabel').textContent = String(P.year);
  setupAge();

  setupSegmented($('contract'), () => state.contract, (v) => {
    state.contract = v;
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

  // 'input' i 'change' — na iPhonie przełącznik zawsze od razu przelicza wynik
  const onToggle = (box, apply) => {
    const handler = () => {
      apply(box.checked);
      update();
    };
    box.addEventListener('input', handler);
    box.addEventListener('change', handler);
  };
  onToggle($('pit2'), (on) => {
    state.pit2[state.contract] = on;
  });
  TOGGLES.forEach((key) => {
    const box = $(key);
    box.checked = Boolean(state[key]);
    onToggle(box, (on) => {
      state[key] = on;
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
  setupFreshStart();
}

init();
