// Silnik obliczeń wynagrodzenia netto — Polska, stawki na 2026 rok.
// Wszystkie kwoty są w GROSZACH (liczby całkowite), żeby zaokrąglenia
// zgadzały się co do grosza z listą płac.
//
// Zasady zaokrągleń:
//  - składki ZUS i zdrowotna: do pełnego grosza (połówki w górę),
//  - podstawa opodatkowania i zaliczka na PIT: do pełnego złotego
//    (art. 63 Ordynacji podatkowej: < 50 gr w dół, >= 50 gr w górę).

export const PARAMS_2026 = Object.freeze({
  year: 2026,
  country: 'PL',
  updatedAt: 'listopad 2026',
  minimumWage: 4_806_00, // płaca minimalna od 1.01.2026
  zusAnnualLimit: 282_600_00, // roczna podstawa emerytalna i rentowa (30-krotność)
  voluntarySicknessMonthlyCap: 23_550_00, // 250% prognozowanego przeciętnego wynagrodzenia
  rates: Object.freeze({
    // w punktach bazowych: 1% = 100
    pension: 976, // emerytalna — część pracownika
    disability: 150, // rentowa — część pracownika
    sickness: 245, // chorobowa
    health: 900, // zdrowotna
    ppkEmployee: 200,
    ppkEmployer: 150,
    taxLow: 1200, // I próg skali
    taxHigh: 3200, // II próg skali
    mandateCosts: 2000, // koszty 20% (zlecenie, dzieło)
    copyrightCosts: 5000, // koszty 50% (prawa autorskie)
    flatSmallContract: 1200, // ryczałt od umów do 200 zł
  }),
  taxThreshold: 120_000_00, // próg skali podatkowej
  monthlyTaxReduction: 300_00, // 1/12 kwoty zmniejszającej (3600 zł rocznie)
  employmentCosts: 250_00, // koszty uzyskania przychodu — etat
  employmentCostsIncreased: 300_00, // koszty podwyższone (dojazd z innej miejscowości)
  copyrightCostsAnnualLimit: 120_000_00, // limit kosztów 50% w roku
  reliefAnnualLimit: 85_528_00, // ulga dla młodych / dla seniorów
  smallContractLimit: 200_00, // umowy do 200 zł — podatek zryczałtowany
  youthAgeLimit: 26, // ulga dla młodych i zwolnienie studentów: poniżej 26 lat
  seniorMinAge: 60, // ulga dla seniorów: kobiety od 60, mężczyźni od 65 lat
  // Art. 83 ustawy o świadczeniach opieki zdrowotnej: składka zdrowotna pracownika
  // nie może być wyższa niż zaliczka na PIT liczona według przepisów z 31.12.2021
  // (17% podstawy, minus 43,76 zł przy PIT-2). Dotyczy niskich pensji.
  health2021: Object.freeze({ rate: 1700, monthlyReduction: 43_76 }),
});

export const CONTRACTS = Object.freeze(['employment', 'mandate', 'work']);

export const MONTH_NAMES = [
  'styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec',
  'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień',
];

// "od maja", "w maju" / "we wrześniu"
const MONTH_GEN = [
  'stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca',
  'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia',
];
const MONTH_IN = [
  'w styczniu', 'w lutym', 'w marcu', 'w kwietniu', 'w maju', 'w czerwcu',
  'w lipcu', 'w sierpniu', 'we wrześniu', 'w październiku', 'w listopadzie', 'w grudniu',
];

const cap = (text) => text.charAt(0).toUpperCase() + text.slice(1);

// --- zaokrąglenia -----------------------------------------------------------

/** Procent (w punktach bazowych) od kwoty w groszach, zaokrąglony do grosza. */
export function pct(amount, bp) {
  if (amount <= 0 || bp <= 0) return 0;
  return Math.floor((amount * bp + 5000) / 10000);
}

/** Zaokrąglenie kwoty w groszach do pełnych złotych (połówki w górę). */
export function roundToZloty(amount) {
  if (amount <= 0) return 0;
  return Math.floor((amount + 50) / 100) * 100;
}

// --- dane wejściowe -----------------------------------------------------------

const DEFAULT_INPUT = Object.freeze({
  age: 30,
  contract: 'employment',
  gross: 0, // brutto miesięcznie, w groszach
  bonus: 0, // premia brutto, w groszach
  bonusMode: 'once', // 'once' — jednorazowo, 'monthly' — co miesiąc
  pit2: true, // płatnik odlicza 300 zł kwoty zmniejszającej
  increasedCosts: false, // etat: koszty 300 zł zamiast 250 zł
  ppk: false, // etat: uczestnictwo w PPK
  student: false, // zlecenie: uczeń/student poniżej 26 lat
  voluntarySickness: false, // zlecenie: dobrowolne chorobowe
  copyright: false, // dzieło: przeniesienie praw autorskich (koszty 50%)
  seniorRelief: false, // ulga dla pracujących seniorów
  // zlecenie/dzieło do 200 zł: cała umowa jest na taką kwotę (ryczałt 12%);
  // false — to rata większej umowy, więc podatek liczy się normalnie
  smallContract: true,
});

function toInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : fallback;
}

/** Ujednolica dane wejściowe i wylicza, które ulgi faktycznie przysługują. */
export function normalizeInput(raw = {}, P = PARAMS_2026) {
  const inp = { ...DEFAULT_INPUT, ...raw };
  const age = Math.min(120, toInt(inp.age, DEFAULT_INPUT.age));
  const contract = CONTRACTS.includes(inp.contract) ? inp.contract : 'employment';
  const youth = age < P.youthAgeLimit;

  const youthRelief = youth && contract !== 'work';
  const studentExempt = contract === 'mandate' && youth && Boolean(inp.student);
  const seniorRelief =
    !youthRelief && contract !== 'work' && age >= P.seniorMinAge && Boolean(inp.seniorRelief);

  return {
    age,
    contract,
    gross: toInt(inp.gross),
    bonus: toInt(inp.bonus),
    bonusMode: inp.bonusMode === 'monthly' ? 'monthly' : 'once',
    pit2: Boolean(inp.pit2),
    increasedCosts: contract === 'employment' && Boolean(inp.increasedCosts),
    ppk: contract === 'employment' && Boolean(inp.ppk),
    studentExempt,
    voluntarySickness: contract === 'mandate' && !studentExempt && Boolean(inp.voluntarySickness),
    copyright: contract === 'work' && Boolean(inp.copyright),
    smallContract: inp.smallContract !== false,
    youthRelief,
    seniorRelief,
    reliefActive: youthRelief || seniorRelief,
  };
}

// --- obliczenia jednego miesiąca ---------------------------------------------

function emptyMonth(gross = 0) {
  return {
    gross,
    pension: 0,
    disability: 0,
    sickness: 0,
    social: 0,
    health: 0,
    healthFull: 0, // 9% przed ewentualnym obniżeniem (art. 83)
    healthCapped: false,
    ppkEmployee: 0,
    ppkEmployer: 0,
    revenue: gross, // przychód podatkowy (brutto + wpłata pracodawcy do PPK)
    exempt: 0, // przychód zwolniony z PIT (ulga dla młodych / seniorów)
    socialDeducted: 0, // składki ZUS odliczone przy liczeniu podatku
    costs: 0, // koszty uzyskania przychodu
    income: 0, // dochód do opodatkowania wg skali (przed zaokrągleniem) — do rozliczenia rocznego
    taxBase: 0, // podstawa opodatkowania (pełne złote)
    taxBaseHigh: 0, // część podstawy opodatkowana stawką 32%
    taxBeforeReduction: 0,
    taxReduction: 0,
    tax: 0,
    taxMode: 'none', // 'scale' | 'flat' | 'exempt' | 'none'
    zusCapped: false, // osiągnięto roczny limit składek emerytalnej i rentowej
    net: gross,
  };
}

/** Składki emerytalna i rentowa z uwzględnieniem rocznego limitu podstawy. */
function pensionAndDisability(gross, st, P) {
  const room = Math.max(0, P.zusAnnualLimit - st.zusBase);
  const base = Math.min(gross, room);
  st.zusBase += gross;
  return {
    pension: pct(base, P.rates.pension),
    disability: pct(base, P.rates.disability),
    zusCapped: base < gross,
  };
}

/**
 * Zaliczka na PIT według skali (etat i zlecenie).
 * progressive = true — płatnik stosuje 32% po przekroczeniu 120 000 zł (tylko etat);
 * przy zleceniu zaliczka zawsze wynosi 12% (art. 41 ust. 1 ustawy o PIT).
 */
function scaleTax(m, inp, st, P, { costsOf, progressive }) {
  let exempt = 0;
  if (inp.reliefActive) {
    const room = Math.max(0, P.reliefAnnualLimit - st.relief);
    exempt = Math.min(m.revenue, room);
    st.relief += exempt;
  }
  m.exempt = exempt;
  const taxed = m.revenue - exempt;
  if (taxed <= 0) {
    m.taxMode = 'exempt';
    return;
  }

  // W miesiącu przekroczenia limitu ulgi składki odliczamy proporcjonalnie
  // do części przychodu, która podlega opodatkowaniu.
  const socialDeducted = exempt > 0 ? Math.round((m.social * taxed) / m.revenue) : m.social;
  const afterSocial = Math.max(0, taxed - socialDeducted);
  const costs = Math.min(afterSocial, costsOf(afterSocial));
  const base = roundToZloty(afterSocial - costs);

  let low = base;
  let high = 0;
  if (progressive) {
    const room = Math.max(0, P.taxThreshold - st.taxBase);
    low = Math.min(base, room);
    high = base - low;
  }
  st.taxBase += base;

  const before = pct(low, P.rates.taxLow) + pct(high, P.rates.taxHigh);
  const reduction = inp.pit2 ? Math.min(P.monthlyTaxReduction, before) : 0;

  m.socialDeducted = socialDeducted;
  m.costs = costs;
  m.income = afterSocial - costs;
  m.taxBase = base;
  m.taxBaseHigh = high;
  m.taxBeforeReduction = before;
  m.taxReduction = reduction;
  m.tax = roundToZloty(before - reduction);
  m.taxMode = 'scale';
}

/**
 * Podatek zryczałtowany 12% (art. 30 ust. 1 pkt 5a): umowa zlecenia lub o dzieło,
 * w której cała kwota należności nie przekracza 200 zł. Nie dotyczy przeniesienia
 * praw autorskich — to przychód z praw majątkowych (art. 18), liczony normalnie.
 */
function isFlatContract(gross, inp, P) {
  return gross <= P.smallContractLimit && inp.smallContract && !inp.copyright;
}

function flatTax(m, P) {
  // podstawę i podatek zaokrąglamy do pełnych złotych (art. 63 § 1 Ordynacji)
  m.taxBase = roundToZloty(m.gross);
  m.taxBeforeReduction = pct(m.taxBase, P.rates.flatSmallContract);
  m.tax = roundToZloty(m.taxBeforeReduction);
  m.taxMode = 'flat';
}

/** Składka zdrowotna pracownika z ograniczeniem z art. 83 (niskie pensje). */
function employeeHealth(m, inp, monthlyCosts, P) {
  const full = pct(m.gross - m.social, P.rates.health);
  // zaliczka "po staremu": (przychód − składki ZUS − koszty) do pełnych zł × 17% − 43,76 zł (PIT-2);
  // przy ulgach liczona tak, jakby przychód nie był zwolniony (art. 83 ust. 2a)
  const base2021 = roundToZloty(Math.max(0, m.revenue - m.social - monthlyCosts));
  const reduction = inp.pit2 ? P.health2021.monthlyReduction : 0;
  const advance2021 = Math.max(0, pct(base2021, P.health2021.rate) - reduction);
  m.healthFull = full;
  m.health = Math.min(full, advance2021);
  m.healthCapped = m.health < full;
}

function employmentMonth(gross, inp, st, P) {
  const m = emptyMonth(gross);
  const pd = pensionAndDisability(gross, st, P);
  m.pension = pd.pension;
  m.disability = pd.disability;
  m.zusCapped = pd.zusCapped;
  m.sickness = pct(gross, P.rates.sickness);
  m.social = m.pension + m.disability + m.sickness;
  if (inp.ppk) {
    m.ppkEmployee = pct(gross, P.rates.ppkEmployee);
    m.ppkEmployer = pct(gross, P.rates.ppkEmployer);
  }
  m.revenue = gross + m.ppkEmployer;
  const monthlyCosts = inp.increasedCosts ? P.employmentCostsIncreased : P.employmentCosts;
  employeeHealth(m, inp, monthlyCosts, P);
  scaleTax(m, inp, st, P, { costsOf: () => monthlyCosts, progressive: true });
  m.net = gross - m.social - m.health - m.tax - m.ppkEmployee;
  return m;
}

function mandateMonth(gross, inp, st, P) {
  const m = emptyMonth(gross);
  if (!inp.studentExempt) {
    const pd = pensionAndDisability(gross, st, P);
    m.pension = pd.pension;
    m.disability = pd.disability;
    m.zusCapped = pd.zusCapped;
    if (inp.voluntarySickness) {
      m.sickness = pct(Math.min(gross, P.voluntarySicknessMonthlyCap), P.rates.sickness);
    }
    m.social = m.pension + m.disability + m.sickness;
    // Przy zleceniu ograniczenie z art. 83 praktycznie nie działa: zaliczka z 2021 r.
    // (17% po kosztach 20%) jest zawsze wyższa niż 9%, a umowy z ryczałtem są wyłączone.
    m.health = pct(gross - m.social, P.rates.health);
    m.healthFull = m.health;
  }
  if (isFlatContract(gross, inp, P)) {
    flatTax(m, P);
  } else {
    scaleTax(m, inp, st, P, {
      costsOf: (income) => pct(income, P.rates.mandateCosts),
      progressive: false,
    });
  }
  m.net = gross - m.social - m.health - m.tax;
  return m;
}

function workMonth(gross, inp, st, P) {
  const m = emptyMonth(gross);
  if (isFlatContract(gross, inp, P)) {
    flatTax(m, P);
  } else {
    let costs;
    if (inp.copyright) {
      const room = Math.max(0, P.copyrightCostsAnnualLimit - st.copyrightCosts);
      costs = Math.min(pct(gross, P.rates.copyrightCosts), room);
      st.copyrightCosts += costs;
    } else {
      costs = pct(gross, P.rates.mandateCosts);
    }
    const base = roundToZloty(gross - costs);
    st.taxBase += base;
    const before = pct(base, P.rates.taxLow);
    const reduction = inp.pit2 ? Math.min(P.monthlyTaxReduction, before) : 0;
    m.costs = costs;
    m.income = gross - costs;
    m.taxBase = base;
    m.taxBeforeReduction = before;
    m.taxReduction = reduction;
    m.tax = roundToZloty(before - reduction);
    m.taxMode = 'scale';
  }
  m.net = gross - m.tax;
  return m;
}

const MONTH_FN = { employment: employmentMonth, mandate: mandateMonth, work: workMonth };

// --- symulacja całego roku ----------------------------------------------------

const SUM_FIELDS = [
  'gross', 'pension', 'disability', 'sickness', 'social', 'health',
  'ppkEmployee', 'ppkEmployer', 'exempt', 'costs', 'income', 'taxBase', 'tax', 'net',
];

/**
 * Szacunek rozliczenia rocznego (PIT-37) dla dochodów opodatkowanych według skali:
 * podatek za cały rok (12% / 32%, minus pełna kwota zmniejszająca 3600 zł)
 * minus zaliczki pobrane w ciągu roku. Dodatni wynik — dopłata, ujemny — zwrot.
 * Umowy z ryczałtem (do 200 zł) nie wchodzą do zeznania.
 */
function annualSettlement(sim, P) {
  const scaleMonths = sim.months.filter((m) => m.taxMode === 'scale');
  if (scaleMonths.length === 0) return null;
  const income = scaleMonths.reduce((s, m) => s + m.income, 0);
  const base = roundToZloty(income);
  const yearlyReduction = P.monthlyTaxReduction * 12;
  const low = Math.min(base, P.taxThreshold);
  const high = base - low;
  const tax = roundToZloty(
    Math.max(0, pct(low, P.rates.taxLow) + pct(high, P.rates.taxHigh) - yearlyReduction),
  );
  const advances = scaleMonths.reduce((s, m) => s + m.tax, 0);
  return { base, tax, advances, diff: tax - advances };
}

function simulateYear(inp, P, includeOnceBonus) {
  const st = { zusBase: 0, taxBase: 0, relief: 0, copyrightCosts: 0 };
  const months = [];
  for (let i = 0; i < 12; i += 1) {
    let gross = inp.gross;
    if (inp.bonusMode === 'monthly') gross += inp.bonus;
    else if (includeOnceBonus && i === 0) gross += inp.bonus;
    const m = gross > 0 ? MONTH_FN[inp.contract](gross, inp, st, P) : emptyMonth(0);
    m.index = i;
    months.push(m);
  }
  const totals = Object.fromEntries(SUM_FIELDS.map((f) => [f, months.reduce((s, m) => s + m[f], 0)]));
  const sim = { months, totals, state: st };
  sim.settlement = annualSettlement(sim, P);
  return sim;
}

function firstMonth(months, predicate) {
  const m = months.find(predicate);
  return m ? m.index : -1;
}

function yearNotes(inp, sim, P) {
  const notes = [];
  const { months } = sim;

  const zusIdx = firstMonth(months, (m) => m.zusCapped);
  if (zusIdx >= 0) {
    notes.push({
      kind: 'zus',
      month: zusIdx,
      text: `${cap(MONTH_IN[zusIdx])} Twoje zarobki od początku roku przekroczą ${formatPLN(
        P.zusAnnualLimit,
      )}. Do końca roku nie płacisz już składki emerytalnej i rentowej, więc na rękę dostajesz więcej.`,
    });
  }

  const highIdx = firstMonth(months, (m) => m.taxBaseHigh > 0);
  if (highIdx >= 0) {
    notes.push({
      kind: 'threshold',
      month: highIdx,
      text: `Od ${MONTH_GEN[highIdx]} dochód od początku roku przekroczy ${formatPLN(
        P.taxThreshold,
      )}. Nadwyżka jest opodatkowana stawką 32% zamiast 12%, więc wypłata spada.`,
    });
  }

  if (inp.reliefActive) {
    const reliefIdx = firstMonth(months, (m) => m.exempt > 0 && m.exempt < m.revenue);
    const lastExempt = firstMonth(months, (m) => m.revenue > 0 && m.exempt === 0);
    const idx = reliefIdx >= 0 ? reliefIdx : lastExempt;
    const name = inp.youthRelief ? 'ulgi dla młodych' : 'ulgi dla seniorów';
    if (idx >= 0 && sim.state.relief >= P.reliefAnnualLimit) {
      notes.push({
        kind: 'relief',
        month: idx,
        text: `${cap(MONTH_IN[idx])} wyczerpiesz roczny limit ${name} (${formatPLN(
          P.reliefAnnualLimit,
        )} przychodu). Od tego momentu płacisz podatek.`,
      });
    }
  }

  if (inp.copyright && sim.state.copyrightCosts >= P.copyrightCostsAnnualLimit) {
    const idx = firstMonth(months, (m) => m.gross > P.smallContractLimit && m.costs < pct(m.gross, P.rates.copyrightCosts));
    if (idx >= 0) {
      notes.push({
        kind: 'copyright',
        month: idx,
        text: `${cap(MONTH_IN[idx])} wyczerpiesz roczny limit kosztów autorskich (${formatPLN(
          P.copyrightCostsAnnualLimit,
        )}). Dalsze kwoty są opodatkowane bez kosztów.`,
      });
    }
  }

  // Rozliczenie roczne: pokazujemy, gdy różnica przekracza 10 zł.
  const s = sim.settlement;
  if (s && Math.abs(s.diff) >= 10_00) {
    const reasons = [];
    if (s.diff > 0) {
      if (inp.contract !== 'employment' && s.base > P.taxThreshold) {
        reasons.push(
          `Płatnik przy ${inp.contract === 'mandate' ? 'zleceniu' : 'umowie o dzieło'} pobiera zawsze 12%, a dochód ponad ${formatPLN(P.taxThreshold)} w roku jest opodatkowany stawką 32%.`,
        );
      }
      notes.push({
        kind: 'annual',
        month: 12,
        text: `W zeznaniu rocznym (PIT-37) dopłacisz około ${formatPLN(s.diff)}. ${reasons.join(' ')}`.trim(),
      });
    } else {
      if (!inp.pit2) {
        reasons.push('Bez PIT-2 płatnik nie odejmował co miesiąc 300 zł kwoty wolnej, więc odzyskasz ją w zeznaniu.');
      }
      if (inp.reliefActive && sim.state.relief > 0) {
        reasons.push('Część roku była zwolniona z podatku, a kwota wolna (3600 zł) przysługuje za cały rok.');
      }
      notes.push({
        kind: 'refund',
        month: 12,
        text: `W zeznaniu rocznym (PIT-37) dostaniesz zwrot około ${formatPLN(-s.diff)}. ${reasons.join(' ')}`.trim(),
      });
    }
  }

  return notes.sort((a, b) => a.month - b.month);
}

/**
 * Główna funkcja: liczy wynagrodzenie netto.
 * Zwraca typowy miesiąc (bez premii jednorazowej), miesiąc z premią,
 * cały rok miesiąc po miesiącu oraz uwagi o progach i limitach.
 */
export function calculate(rawInput, P = PARAMS_2026) {
  const inp = normalizeInput(rawInput, P);
  const year = simulateYear(inp, P, true);
  const hasOnceBonus = inp.bonusMode === 'once' && inp.bonus > 0;
  const regularYear = hasOnceBonus ? simulateYear(inp, P, false) : year;
  const regular = regularYear.months[0];
  const withBonus = year.months[0];

  const regularNets = regularYear.months.map((m) => m.net);
  const varies = new Set(regularNets).size > 1;

  return {
    params: P,
    input: inp,
    regular,
    withBonus,
    // Premię jednorazową zakładamy w styczniu. Ile z niej zostaje, liczymy dla
    // całego roku: premia może wcześniej przesunąć Cię przez próg 32% albo
    // wyczerpać limit ulgi, przez co kolejne wypłaty są niższe.
    bonus: hasOnceBonus
      ? {
          gross: inp.bonus,
          net: year.totals.net - regularYear.totals.net,
          monthNet: withBonus.net,
          monthDelta: withBonus.net - regular.net,
        }
      : null,
    monthly: {
      average: Math.round(regularYear.totals.net / 12),
      min: Math.min(...regularNets),
      max: Math.max(...regularNets),
    },
    year: {
      months: year.months,
      totals: year.totals,
      regularMonths: regularYear.months,
      regularTotals: regularYear.totals,
      settlement: regularYear.settlement, // rok bez premii jednorazowej
      varies,
      notes: yearNotes(inp, regularYear, P),
    },
  };
}

// --- formatowanie -------------------------------------------------------------

const plnFormatter = new Intl.NumberFormat('pl-PL', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 480600 → "4806,00 zł" (w polskim zapisie). */
export function formatPLN(grosze) {
  return `${plnFormatter.format(grosze / 100)} zł`;
}

export const MAX_AMOUNT = 100_000_000_00; // 100 mln zł — powyżej traktujemy wpis jako błędny

/**
 * Odczytuje kwotę wpisaną przez użytkownika: "4 806,50", "4806,5", "4.806,50",
 * "10.000 zł", "4,806.50", "4806 PLN". Zwraca { grosze, empty, valid }.
 */
export function parseMoneyInput(text) {
  if (typeof text === 'number') {
    const ok = Number.isFinite(text) && text >= 0 && text * 100 <= MAX_AMOUNT;
    return { grosze: ok ? Math.round(text * 100) : 0, empty: false, valid: ok };
  }
  let s = String(text ?? '').replace(/[\s  ']|zł|zl|pln/gi, '');
  if (s === '') return { grosze: 0, empty: true, valid: true };

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    // oba znaki: ostatni z nich oddziela grosze
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    s = s.replace(',', '.');
  } else if (lastDot >= 0) {
    // same kropki: "10.000" albo "1.000.000" to separatory tysięcy
    const groups = s.split('.');
    const grouping = groups.length > 2 || /^\d{1,3}\.\d{3}$/.test(s);
    if (grouping && groups.slice(1).every((g) => g.length === 3)) s = groups.join('');
  }

  if (!/^\d+(\.\d{1,2})?$|^\.\d{1,2}$|^\d+\.$/.test(s)) return { grosze: 0, empty: false, valid: false };
  const grosze = Math.round(Number.parseFloat(s) * 100);
  if (!Number.isFinite(grosze) || grosze > MAX_AMOUNT) return { grosze: 0, empty: false, valid: false };
  return { grosze, empty: false, valid: true };
}

/** Kwota w groszach (0, gdy wpisu nie da się odczytać). */
export function parseMoney(text) {
  return parseMoneyInput(text).grosze;
}
