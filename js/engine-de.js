// Silnik obliczeń wynagrodzenia netto — Niemcy, stawki na 2026 rok (Brutto → Netto).
// Wszystkie kwoty są w CENTACH (liczby całkowite).
//
// Lohnsteuer, Solidaritätszuschlag i podstawa Kirchensteuer to wierny port
// oficjalnego „Programmablaufplan für die maschinelle Berechnung der vom
// Arbeitslohn einzubehaltenden Lohnsteuer … 2026” (BMF, plik Lohnsteuer2026.xml,
// stan 2025-10-23). Arytmetyka BigDecimal z PAP jest odtworzona na liczbach
// całkowitych (centy, ułamki dziesiętne jako liczniki) — wyniki zgadzają się co
// do centa z kalkulatorem BMF (patrz tests/engine-de.test.mjs).
//
// Składki na ubezpieczenia społeczne: część pracownika, zaokrąglana do centa
// (połówki w górę), od podstawy ograniczonej BBG.

export const PARAMS_DE_2026 = Object.freeze({
  year: 2026,
  country: 'DE',
  updatedAt: 'listopad 2026',
  // --- ubezpieczenia społeczne (stawki w „pcm”: 1% = 1000) ---
  // SV-Rechengrößenverordnung 2026 (BGBl. 2025 I Nr. 290)
  bbgPensionMonthly: 8_450_00, // BBG RV/AV (jednolita dla całych Niemiec), 101 400 € rocznie
  bbgHealthMonthly: 5_812_50, // BBG KV/PV, 69 750 € rocznie
  rates: Object.freeze({
    pension: 18_600, // RV ogółem 18,6% (AN 9,3%)
    unemployment: 2_600, // AV ogółem 2,6% (AN 1,3%)
    health: 14_600, // KV allgemeiner Beitragssatz 14,6% (AN 7,3%)
    care: 3_600, // PV 3,6% (AN 1,8%, w Saksonii AN 2,3%)
    careEmployee: 1_800,
    careEmployeeSaxony: 2_300,
    careChildless: 600, // Kinderlosenzuschlag 0,6 pp (tylko AN, od 23. roku życia)
    careChildReduction: 250, // Abschlag 0,25 pp za 2.–5. dziecko (< 25 lat)
    minijobEmployerPension: 15_000, // pracodawca przy minijobie: 15% RV
  }),
  avgHealthExtraBp: 290, // durchschnittlicher Zusatzbeitragssatz 2026 = 2,9% (BMG, BAnz AT 10.11.2025 B7)
  careChildlessMinAge: 23,
  careMaxChildrenReduced: 5,
  minijobLimit: 603_00, // Geringfügigkeitsgrenze 2026 (Mindestlohn 13,90 €)
  minijobMinPensionBase: 175_00, // minimalna podstawa RV w minijobie
  midijobUpper: 2_000_00, // górna granica Übergangsbereich
  midijobFactorF: 6619, // Faktor F 2026 = 0,6619 (28% / 42,3%), w 1/10000
  // --- podatek (PAP 2026, MPARA / MZTABFB / UPTAB26) ---
  tax: Object.freeze({
    grundfreibetrag: 12_348, // € rocznie
    tariff: Object.freeze({ zone2: 17_800, zone3: 69_879, zone4: 277_826 }),
    werbungskostenPauschbetrag: 1_230, // Arbeitnehmer-Pauschbetrag, €
    sonderausgabenPauschbetrag: 36, // €
    entlastungsbetragAlleinerziehende: 4_260, // klasa II, €
    kinderfreibetrag: 9_756, // € na pełny Kinderfreibetrag (klasy I–III)
    kinderfreibetragClassIV: 4_878,
    w1Stkl5: 14_071,
    w2Stkl5: 34_939,
    w3Stkl5: 222_260,
    vspPensionRate: 93, // RVSATZAN 9,3% (w promilach)
    vspUnemploymentRate: 13, // AVSATZAN 1,3% (w promilach)
    vspCapOther: 1_900, // Höchstbetrag AV+KV+PV w Vorsorgepauschale, €
    bbgPensionYear: 101_400,
    bbgHealthYear: 69_750,
  }),
  soli: Object.freeze({ rate: 55, freigrenze: 20_350, milderung: 119 }), // 5,5%, Freigrenze € (×2 w kl. III), 11,9%
  churchRates: Object.freeze({ BW: 8, BY: 8, default: 9 }), // Kirchensteuer w %
  minijobFlatTaxRate: 2, // Pauschsteuer 2% — płaci pracodawca
});

export const DE_STATES = [
  { code: 'BW', name: 'Badenia-Wirtembergia' },
  { code: 'BY', name: 'Bawaria' },
  { code: 'BE', name: 'Berlin' },
  { code: 'BB', name: 'Brandenburgia' },
  { code: 'HB', name: 'Brema' },
  { code: 'HH', name: 'Hamburg' },
  { code: 'HE', name: 'Hesja' },
  { code: 'MV', name: 'Meklemburgia-Pomorze Przednie' },
  { code: 'NI', name: 'Dolna Saksonia' },
  { code: 'NW', name: 'Nadrenia Północna-Westfalia' },
  { code: 'RP', name: 'Nadrenia-Palatynat' },
  { code: 'SL', name: 'Saara' },
  { code: 'SN', name: 'Saksonia' },
  { code: 'ST', name: 'Saksonia-Anhalt' },
  { code: 'SH', name: 'Szlezwik-Holsztyn' },
  { code: 'TH', name: 'Turyngia' },
].sort((a, b) => a.name.localeCompare(b.name, 'pl'));
Object.freeze(DE_STATES);
DE_STATES.forEach(Object.freeze);

const STATE_CODES = DE_STATES.map((s) => s.code);
export const JOB_TYPES = Object.freeze(['regular', 'minijob', 'student']);

// --- arytmetyka całkowita -----------------------------------------------------

/** Dzielenie całkowite z zaokrągleniem w dół (dokładne, przez BigInt). */
function fdiv(a, b) {
  const A = BigInt(a);
  const B = BigInt(b);
  let q = A / B;
  if ((A % B !== 0n) && ((A < 0n) !== (B < 0n))) q -= 1n;
  return Number(q);
}

/** Dzielenie całkowite z zaokrągleniem w górę (dla liczb nieujemnych). */
function cdiv(a, b) {
  return -fdiv(-a, b);
}

/** Procent w „pcm” (1% = 1000) od kwoty w centach, do centa (połówki w górę). */
export function pcm(amount, rate) {
  if (amount <= 0 || rate <= 0) return 0;
  return fdiv(amount * rate * 2 + 100_000, 200_000);
}

// --- PAP 2026: Lohnsteuer --------------------------------------------------------

/** UPTAB26 — tarif § 32a EStG; X w pełnych euro, wynik w euro. */
function uptab26(X, kztab, T) {
  const GFB = T.grundfreibetrag;
  let st;
  if (X < GFB + 1) {
    st = 0;
  } else if (X < T.tariff.zone2) {
    const d = BigInt(X - GFB); // Y = d / 10000
    st = Number(((d * 91451n + 1_400_000_000n) * d) / 10_000_000_000n);
  } else if (X < T.tariff.zone3) {
    const d = BigInt(X - 17_799);
    st = Number(((d * 1731n + 239_700_000n) * d + 1_034_870_000_000n) / 1_000_000_000n);
  } else if (X < T.tariff.zone4) {
    st = fdiv(X * 42 - 1_113_563, 100);
  } else {
    st = fdiv(X * 45 - 1_947_038, 100);
  }
  return st * kztab;
}

/** UP5_6 */
function up56(ZX, T) {
  const st1 = uptab26(fdiv(ZX * 5, 4), 1, T);
  const st2 = uptab26(fdiv(ZX * 3, 4), 1, T);
  const diff = (st1 - st2) * 2;
  const mist = fdiv(ZX * 14, 100);
  return mist > diff ? mist : diff;
}

/** MST5_6 — Lohnsteuer dla klas V i VI. */
function mst56(ZZX, T) {
  const { w1Stkl5: W1, w2Stkl5: W2, w3Stkl5: W3 } = T;
  if (ZZX > W2) {
    let st = up56(W2, T);
    if (ZZX > W3) {
      st = st + fdiv((W3 - W2) * 42, 100);
      st = st + fdiv((ZZX - W3) * 45, 100);
    } else {
      st = st + fdiv((ZZX - W2) * 42, 100);
    }
    return st;
  }
  let st = up56(ZZX, T);
  if (ZZX > W1) {
    const vergl = st;
    const hoch = up56(W1, T) + fdiv((ZZX - W1) * 42, 100);
    st = hoch < vergl ? hoch : vergl;
  }
  return st;
}

/** UPMLST — podatek roczny od ZVE (w centach). */
function upmlst(zveCents, kztab, stkl, T) {
  const X = zveCents < 100 ? 0 : fdiv(zveCents, 100 * kztab);
  return stkl < 5 ? uptab26(X, kztab, T) : mst56(X, T);
}

/**
 * Vorsorgepauschale 2026 (UPEVP + MVSPKVPV + MVSPHB), w pełnych euro.
 * Od 2026: część RV + KV/PV, a dodatkowo porównanie z wariantem RV +
 * (AV + KV + PV, max 1900 €); Mindestvorsorgepauschale już nie istnieje.
 */
function vorsorgepauschale(zre4vpCents, s, T) {
  const rvBase = Math.min(zre4vpCents, T.bbgPensionYear * 100);
  const vspr = s.krv === 1 ? 0 : fdiv(rvBase * T.vspPensionRate, 1000);
  const kvBase = Math.min(zre4vpCents, T.bbgHealthYear * 100);
  const vspkvpv = fdiv(kvBase * (s.kvSatz + s.pvSatz), 1_000_000); // stawki w 1e-6
  let vsp = cdiv(vspkvpv + vspr, 100);
  if (s.alv !== 1 && s.stkl !== 6) {
    const vspalv = fdiv(rvBase * T.vspUnemploymentRate, 1000);
    const vsphb = Math.min(vspalv + vspkvpv, T.vspCapOther * 100);
    const vspn = cdiv(vspr + vsphb, 100);
    if (vspn > vsp) vsp = vspn;
  }
  return vsp;
}

/** MZTABFB — stałe kwoty wolne (bez Vorsorgepauschale), w euro; plus KFB. */
function mztabfb(zre4Cents, s, T) {
  let anp = 0;
  if (s.stkl < 6 && zre4Cents > 0) {
    anp = zre4Cents < T.werbungskostenPauschbetrag * 100 ? cdiv(zre4Cents, 100) : T.werbungskostenPauschbetrag;
  }
  const sap = s.stkl <= 5 ? T.sonderausgabenPauschbetrag : 0;
  const efa = s.stkl === 2 ? T.entlastungsbetragAlleinerziehende : 0;
  let kfb = 0;
  if (s.stkl <= 3) kfb = fdiv(s.zkf10 * T.kinderfreibetrag, 10);
  else if (s.stkl === 4) kfb = fdiv(s.zkf10 * T.kinderfreibetragClassIV, 10);
  return { ztabfb: efa + anp + sap, kfb, kztab: s.stkl === 3 ? 2 : 1 };
}

/** MLSTJAHR — podatek roczny (euro) i ZVE (centy) dla rocznego przychodu w centach. */
function mlstjahr(zre4Cents, extraFreibetrag, s, T) {
  const { ztabfb, kztab } = mztabfb(zre4Cents, s, T);
  const vsp = vorsorgepauschale(zre4Cents, s, T);
  const zve = zre4Cents - (ztabfb + extraFreibetrag) * 100 - vsp * 100;
  return { st: upmlst(zve, kztab, s.stkl, T), zve };
}

/**
 * Port PAP 2026 dla miesięcznego okresu rozliczeniowego (LZZ = 2), bez
 * świadczeń emerytalnych (Versorgungsbezüge), Altersentlastungsbetrag,
 * indywidualnych Freibeträge i faktora (af = 0 / f = 1).
 *
 * Wejście (nazwy jak w PAP): RE4, STKL, ZKF (np. 1.5), R (0/1), KVZ (w punktach
 * bazowych, 290 = 2,90%), PVS, PVZ, PVA, KRV, ALV, PKV (tylko 0), SONSTB, JRE4.
 * Wyjście w centach: LSTLZZ, SOLZLZZ, BK, STS, SOLZS, BKS.
 */
export function lohnsteuer2026(p, P = PARAMS_DE_2026) {
  const T = P.tax;
  const stkl = Math.min(6, Math.max(1, Math.trunc(p.STKL ?? 1)));
  const pvs = p.PVS === 1 ? 1 : 0;
  const pvz = p.PVZ === 1 ? 1 : 0;
  const pva = Math.max(0, Math.trunc(p.PVA ?? 0));
  const s = {
    stkl,
    krv: p.KRV === 1 ? 1 : 0,
    alv: p.ALV === 1 ? 1 : 0,
    zkf10: Math.round((p.ZKF ?? 0) * 10),
    kvSatz: Math.round(p.KVZ ?? 0) * 50 + 70_000, // KVZ/2/100 + 0,07, w 1e-6
    pvSatz: (pvs ? 23_000 : 18_000) + (pvz ? 6_000 : -2_500 * pva),
  };
  const R = p.R ? 1 : 0;
  const RE4 = Math.max(0, Math.trunc(p.RE4 ?? 0));

  // MRE4JL + MRE4ABZ (bez Versorgungsbezüge, bez Freibeträge)
  const zre4 = RE4 * 12; // centy rocznie

  // MBERECH
  const base = mlstjahr(zre4, 0, s, T);
  const lstjahr = base.st;
  const LSTLZZ = fdiv(lstjahr * 100, 12);
  const { kfb, kztab } = mztabfb(zre4, s, T);
  const jbmg = s.zkf10 > 0 ? mlstjahr(zre4, kfb, s, T).st : lstjahr;

  // MSOLZ
  const solzfrei = P.soli.freigrenze * kztab;
  let SOLZLZZ = 0;
  if (jbmg > solzfrei) {
    const solzj = fdiv(jbmg * P.soli.rate, 10); // centy
    const solzmin = fdiv((jbmg - solzfrei) * P.soli.milderung, 10);
    SOLZLZZ = fdiv(Math.min(solzj, solzmin), 12);
  }
  const BK = R ? fdiv(jbmg * 100, 12) : 0;

  // MSONST — sonstige Bezüge (Jahreslohn-Verfahren)
  let STS = 0;
  let SOLZS = 0;
  let BKS = 0;
  const SONSTB = Math.max(0, Math.trunc(p.SONSTB ?? 0));
  if (SONSTB > 0) {
    const JRE4 = Math.max(0, Math.trunc(p.JRE4 ?? 0));
    const lstoso = mlstjahr(JRE4, 0, s, T).st; // MOSONST
    const withSb = mlstjahr(JRE4 + SONSTB, 0, s, T); // MRE4SONST + MLSTJAHR
    STS = (withSb.st - lstoso) * 100;
    if (STS < 0) {
      STS = 0; // STSMIN (MBV = 0)
    } else {
      // MSOLZSTS
      let solzszve = s.zkf10 > 0 ? withSb.zve - kfb * 100 : withSb.zve;
      const solzsbmg = upmlst(solzszve < 100 ? 0 : solzszve, kztab, stkl, T);
      SOLZS = solzsbmg > solzfrei ? fdiv(STS * P.soli.rate, 1000) : 0;
    }
    BKS = R ? STS : 0;
  }
  return { LSTLZZ, SOLZLZZ, BK, STS, SOLZS, BKS };
}

// --- dane wejściowe -----------------------------------------------------------

const DEFAULT_INPUT = Object.freeze({
  age: 30,
  jobType: 'regular',
  minijobRvExempt: false,
  taxClass: 1,
  church: false,
  state: 'BE',
  children: 0,
  gross: 0,
  bonus: 0,
  healthExtra: PARAMS_DE_2026.avgHealthExtraBp,
  childAllowances: null, // opcjonalnie: własny Kinderfreibetragszähler (ZKF), np. 1.5
});

function toInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : fallback;
}

/**
 * Domyślny ZKF (liczba Kinderfreibeträge) wg zasad ELStAM:
 *  - klasy III i IV: małżonkowie, wspólne dzieci → 1,0 na dziecko
 *    (w kl. IV PAP sam liczy połowę kwoty: 4878 € zamiast 9756 €),
 *  - klasy I i II: drugi rodzic ma drugą połowę → 0,5 na dziecko,
 *  - klasy V i VI: 0 (PAP nie uwzględnia dzieci).
 */
export function defaultZkf(taxClass, children) {
  if (taxClass >= 5 || children <= 0) return 0;
  return taxClass >= 3 ? children : children * 0.5;
}

export function normalizeInputDE(raw = {}, P = PARAMS_DE_2026) {
  const inp = { ...DEFAULT_INPUT, ...raw };
  const taxClass = Math.min(6, Math.max(1, toInt(inp.taxClass, 1) || 1));
  const children = Math.min(20, toInt(inp.children));
  let zkf = defaultZkf(taxClass, children);
  if (inp.childAllowances !== null && inp.childAllowances !== undefined && taxClass <= 4) {
    const z = Number(inp.childAllowances);
    if (Number.isFinite(z) && z >= 0) zkf = Math.round(z * 2) / 2; // krok 0,5
  }
  const healthExtraRaw = Number(inp.healthExtra);
  return {
    age: Math.min(120, toInt(inp.age, DEFAULT_INPUT.age)),
    jobType: JOB_TYPES.includes(inp.jobType) ? inp.jobType : 'regular',
    minijobRvExempt: Boolean(inp.minijobRvExempt),
    taxClass,
    church: Boolean(inp.church),
    state: STATE_CODES.includes(inp.state) ? inp.state : 'BE',
    children,
    zkf,
    gross: toInt(inp.gross),
    bonus: toInt(inp.bonus),
    healthExtra: Number.isFinite(healthExtraRaw)
      ? Math.min(1000, Math.max(0, Math.round(healthExtraRaw)))
      : P.avgHealthExtraBp,
  };
}

// --- składki -----------------------------------------------------------------

/** Stawka PV pracownika w pcm (1% = 1000). */
function careRateEmployee(inp, P) {
  const R = P.rates;
  let rate = inp.state === 'SN' ? R.careEmployeeSaxony : R.careEmployee;
  if (inp.children === 0) {
    if (inp.age >= P.careChildlessMinAge) rate += R.careChildless;
  } else if (inp.children >= 2) {
    rate -= R.careChildReduction * (Math.min(inp.children, P.careMaxChildrenReduced) - 1);
  }
  return rate;
}

/** Midijob: beitragspflichtige Einnahme dla części pracownika (§ 20 ust. 2a SGB IV). */
export function midijobEmployeeBase(ae, P = PARAMS_DE_2026) {
  const G = P.minijobLimit;
  const OG = P.midijobUpper;
  if (ae <= G) return 0;
  if (ae > OG) return ae;
  // OG / (OG − G) × (AE − G), do centa
  return fdiv(OG * (ae - G) * 2 + (OG - G), 2 * (OG - G));
}

/** Midijob: beitragspflichtige Einnahme łącznie (do kosztu pracodawcy). */
export function midijobTotalBase(ae, P = PARAMS_DE_2026) {
  const G = P.minijobLimit;
  const OG = P.midijobUpper;
  const F = P.midijobFactorF; // /10000
  if (ae <= G) return 0;
  if (ae > OG) return ae;
  // F×G + (OG/(OG−G) − G/(OG−G)×F) × (AE − G)
  const den = 10_000 * (OG - G);
  const num = F * G * (OG - G) + (OG * 10_000 - G * F) * (ae - G);
  return fdiv(num * 2 + den, den * 2);
}

const isMidijob = (ae, P) => ae > P.minijobLimit && ae <= P.midijobUpper;

/**
 * Składki pracownika za miesiąc.
 * ae — wynagrodzenie miesiąca (z premią), rvCapBase/kvCapBase — górne granice
 * podstawy w tym miesiącu (BBG, w miesiącu premii: roczna BBG – patrz calculateDE).
 */
function socialContributions(inp, ae, caps, P) {
  const R = P.rates;
  const out = { pension: 0, unemployment: 0, health: 0, care: 0, midijob: false, notes: [] };
  if (ae <= 0) return out;

  if (inp.jobType === 'minijob') {
    if (!inp.minijobRvExempt) {
      const total = pcm(Math.max(ae, P.minijobMinPensionBase), R.pension);
      out.pension = Math.max(0, total - pcm(ae, R.minijobEmployerPension));
      out.notes.push('Minijob: tylko składka emerytalna (3,6%)');
    } else {
      out.notes.push('Minijob: zwolnienie z RV — brak składek');
    }
    return out;
  }

  const midi = isMidijob(ae, P);
  const base = midi ? midijobEmployeeBase(ae, P) : ae;
  out.midijob = midi;
  if (midi) out.notes.push('Midijob: niższe składki');
  const rvBase = Math.min(base, caps.rv);
  out.pension = pcm(rvBase, R.pension / 2);
  if (inp.jobType === 'student') {
    out.notes.push('Werkstudent: tylko składka emerytalna');
    if (ae <= P.minijobLimit) out.notes.push('Do 603 € można rozliczyć jako minijob');
    return out;
  }
  if (ae <= P.minijobLimit) out.notes.push('Do 603 € możliwy minijob (mniej składek)');
  const kvBase = Math.min(base, caps.kv);
  out.unemployment = pcm(rvBase, R.unemployment / 2);
  out.health = pcm(kvBase, R.health / 2 + inp.healthExtra * 5); // bp → pcm: ×10, połowa
  out.care = pcm(kvBase, careRateEmployee(inp, P));
  return out;
}

// --- podatek -------------------------------------------------------------------

function papInput(inp, P) {
  const children = inp.children;
  const childless = children === 0;
  return {
    STKL: inp.taxClass,
    ZKF: inp.zkf,
    R: inp.church ? 1 : 0,
    KVZ: inp.healthExtra,
    PVS: inp.state === 'SN' ? 1 : 0,
    PVZ: childless && inp.age >= P.careChildlessMinAge ? 1 : 0,
    PVA: childless ? 0 : Math.max(0, Math.min(children, P.careMaxChildrenReduced) - 1),
    KRV: 0,
    ALV: inp.jobType === 'student' ? 1 : 0, // Werkstudent nie płaci AV
  };
}

function churchRate(inp, P) {
  return P.churchRates[inp.state] ?? P.churchRates.default;
}

function buildMonth(inp, gross, bonus, P) {
  const notes = [];
  const ae = gross + bonus;
  // Granice podstawy: zwykły miesiąc — miesięczna BBG; w miesiącu premii
  // przyjmujemy wypłatę premii w grudniu: limit = roczna BBG − 11 × podstawa z poprzednich miesięcy.
  const caps = { rv: P.bbgPensionMonthly, kv: P.bbgHealthMonthly };
  if (bonus > 0) {
    caps.rv = 12 * P.bbgPensionMonthly - 11 * Math.min(gross, P.bbgPensionMonthly);
    caps.kv = 12 * P.bbgHealthMonthly - 11 * Math.min(gross, P.bbgHealthMonthly);
  }
  const sv = socialContributions(inp, ae, caps, P);
  notes.push(...sv.notes);

  let incomeTax = 0;
  let soli = 0;
  let churchTax = 0;
  if (inp.jobType === 'minijob') {
    if (ae > 0) notes.push('Podatek ryczałtowy 2% płaci pracodawca');
  } else if (ae > 0) {
    const pap = lohnsteuer2026(
      { ...papInput(inp, P), RE4: gross, SONSTB: bonus, JRE4: bonus > 0 ? gross * 12 : 0 },
      P,
    );
    const rate = churchRate(inp, P);
    incomeTax = pap.LSTLZZ + pap.STS;
    soli = pap.SOLZLZZ + pap.SOLZS;
    if (inp.church) churchTax = fdiv(pap.BK * rate, 100) + fdiv(pap.BKS * rate, 100);
  }

  const social = sv.pension + sv.unemployment + sv.health + sv.care;
  const tax = incomeTax + soli + churchTax;
  return {
    gross: ae,
    pension: sv.pension,
    unemployment: sv.unemployment,
    health: sv.health,
    care: sv.care,
    social,
    incomeTax,
    soli,
    churchTax,
    tax,
    net: ae - social - tax,
    midijob: sv.midijob,
    notes,
  };
}

/** Główne obliczenie: miesiąc bez premii, miesiąc z premią i rok (12 × zwykły miesiąc). */
export function calculateDE(rawInput = {}, P = PARAMS_DE_2026) {
  let input = normalizeInputDE(rawInput, P);
  const extraNotes = [];
  if (input.jobType === 'minijob' && input.gross > P.minijobLimit) {
    extraNotes.push('Przekroczono limit minijobu 603 € — liczone jak zwykła praca');
    input = { ...input, jobType: 'regular' };
  }
  if (input.taxClass === 2 && input.children === 0) {
    extraNotes.push('Klasa II wymaga dziecka (samotny rodzic)');
  }
  const regular = buildMonth(input, input.gross, 0, P);
  regular.notes.unshift(...extraNotes);
  let withBonus = regular;
  let bonus = null;
  if (input.bonus > 0) {
    withBonus = buildMonth(input, input.gross, input.bonus, P);
    withBonus.notes.unshift(...extraNotes);
    if (input.jobType === 'minijob' && input.gross * 12 + input.bonus > P.minijobLimit * 12) {
      withBonus.notes.push('Premia przekracza roczny limit minijobu (7236 €)');
    }
    bonus = { gross: input.bonus, net: withBonus.net - regular.net };
  }
  return {
    input,
    regular,
    withBonus,
    bonus,
    year: { totals: { gross: regular.gross * 12, net: regular.net * 12 } },
  };
}

// --- formatowanie --------------------------------------------------------------

const eurFormatter = new Intl.NumberFormat('pl-PL', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 345678 → "3456,78 €" (format pl-PL, twarda spacja przed €). */
export function formatEUR(cents) {
  const n = Math.round(Number(cents) || 0);
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  const whole = Math.trunc(abs / 100);
  const frac = abs % 100;
  return `${sign}${eurFormatter.format(whole + frac / 100)} €`;
}
