// Testy silnika: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate, parseMoney, parseMoneyInput, pct, roundToZloty, PARAMS_2026 } from '../js/engine.js';

const zl = (value) => Math.round(value * 100);

test('zaokrąglenia', () => {
  assert.equal(pct(480600, 976), 46907); // 469,0656 → 469,07
  assert.equal(pct(480600, 245), 11775); // 117,747 → 117,75
  assert.equal(roundToZloty(389709), 389700); // 3897,09 → 3897
  assert.equal(roundToZloty(16764), 16800); // 167,64 → 168
  assert.equal(roundToZloty(16749), 16700);
  assert.equal(roundToZloty(16750), 16800);
});

test('umowa o pracę — płaca minimalna 2026: 3605,85 zł netto', () => {
  const r = calculate({ age: 30, contract: 'employment', gross: zl(4806), pit2: true });
  const m = r.regular;
  assert.equal(m.pension, zl(469.07));
  assert.equal(m.disability, zl(72.09));
  assert.equal(m.sickness, zl(117.75));
  assert.equal(m.social, zl(658.91));
  assert.equal(m.health, zl(373.24));
  assert.equal(m.taxBase, zl(3897));
  assert.equal(m.tax, zl(168));
  assert.equal(m.net, zl(3605.85));
  assert.equal(r.year.varies, false);
  assert.equal(r.year.totals.net, zl(3605.85) * 12);
});

test('umowa o pracę bez PIT-2: zaliczka bez odliczenia 300 zł', () => {
  const m = calculate({ age: 30, contract: 'employment', gross: zl(4806), pit2: false }).regular;
  assert.equal(m.tax, zl(468)); // 467,64 → 468
  assert.equal(m.net, zl(3305.85));
});

test('umowa o pracę — koszty podwyższone 300 zł', () => {
  const m = calculate({ age: 30, contract: 'employment', gross: zl(4806), increasedCosts: true }).regular;
  assert.equal(m.taxBase, zl(3847)); // 4806 − 658,91 − 300 = 3847,09
  assert.equal(m.tax, zl(162)); // 461,64 − 300 = 161,64 → 162
});

test('umowa o pracę — PPK: 2% z pensji, 1,5% pracodawcy doliczone do przychodu', () => {
  const m = calculate({ age: 30, contract: 'employment', gross: zl(4806), ppk: true }).regular;
  assert.equal(m.ppkEmployee, zl(96.12));
  assert.equal(m.ppkEmployer, zl(72.09));
  assert.equal(m.taxBase, zl(3969)); // 4878,09 − 658,91 − 250 = 3969,18
  assert.equal(m.tax, zl(176)); // 476,28 − 300 = 176,28
  assert.equal(m.net, zl(3501.73));
});

test('umowa o pracę — ulga dla młodych (24 lata): 0 zł PIT', () => {
  const m = calculate({ age: 24, contract: 'employment', gross: zl(4806) }).regular;
  assert.equal(m.tax, 0);
  assert.equal(m.taxMode, 'exempt');
  assert.equal(m.net, zl(3773.85));
});

test('ulga dla młodych nie przysługuje od 26 lat', () => {
  const m = calculate({ age: 26, contract: 'employment', gross: zl(4806) }).regular;
  assert.equal(m.tax, zl(168));
});

test('ulga dla młodych — przekroczenie limitu 85 528 zł we wrześniu', () => {
  const r = calculate({ age: 24, contract: 'employment', gross: zl(10000) });
  const sep = r.year.months[8];
  assert.equal(r.year.months[7].tax, 0);
  assert.equal(sep.exempt, zl(5528));
  assert.equal(sep.socialDeducted, zl(613.11)); // 1371 × 4472/10000
  assert.equal(sep.taxBase, zl(3609)); // 4472 − 613,11 − 250 = 3608,89
  assert.equal(sep.tax, zl(133)); // 433,08 − 300 = 133,08
  assert.ok(r.year.notes.some((n) => n.kind === 'relief' && n.month === 8));
  assert.equal(r.year.varies, true);
});

test('umowa o pracę 30 000 zł — próg 32% w maju i limit ZUS w październiku', () => {
  const r = calculate({ age: 35, contract: 'employment', gross: zl(30000) });
  const [jan] = r.year.months;
  assert.equal(jan.social, zl(4113));
  assert.equal(jan.taxBase, zl(25637));
  const may = r.year.months[4];
  assert.equal(may.taxBaseHigh, zl(8185));
  assert.equal(may.tax, zl(4413)); // 12%·17452 + 32%·8185 − 300 = 4413,44
  const oct = r.year.months[9];
  assert.equal(oct.zusCapped, true);
  assert.equal(oct.pension, pct(zl(12600), 976));
  const nov = r.year.months[10];
  assert.equal(nov.pension, 0);
  assert.equal(nov.disability, 0);
  assert.equal(nov.sickness, zl(735));
  assert.ok(r.year.notes.some((n) => n.kind === 'threshold' && n.month === 4));
  assert.ok(r.year.notes.some((n) => n.kind === 'zus' && n.month === 9));
});

test('zlecenie 4806 zł, 30 lat, bez chorobowego i bez PIT-2', () => {
  const m = calculate({ age: 30, contract: 'mandate', gross: zl(4806), pit2: false }).regular;
  assert.equal(m.social, zl(541.16));
  assert.equal(m.health, zl(383.84));
  assert.equal(m.costs, zl(852.97));
  assert.equal(m.taxBase, zl(3412));
  assert.equal(m.tax, zl(409));
  assert.equal(m.net, zl(3472));
});

test('zlecenie z PIT-2 i dobrowolnym chorobowym', () => {
  const m = calculate({
    age: 30, contract: 'mandate', gross: zl(4806), pit2: true, voluntarySickness: true,
  }).regular;
  assert.equal(m.social, zl(658.91));
  assert.equal(m.health, zl(373.24));
  // (4806 − 658,91) · 80% = 3317,672 → koszty 829,42; podstawa 3317,67 → 3318
  assert.equal(m.costs, zl(829.42));
  assert.equal(m.taxBase, zl(3318));
  assert.equal(m.tax, zl(98)); // 398,16 − 300 = 98,16
  assert.equal(m.net, zl(3675.85));
});

test('zlecenie — student do 26 lat: brutto = netto', () => {
  const m = calculate({ age: 22, contract: 'mandate', gross: zl(4000), student: true }).regular;
  assert.equal(m.social, 0);
  assert.equal(m.health, 0);
  assert.equal(m.tax, 0);
  assert.equal(m.net, zl(4000));
});

test('zlecenie — student powyżej 26 lat płaci normalnie', () => {
  const m = calculate({ age: 27, contract: 'mandate', gross: zl(4000), student: true }).regular;
  assert.ok(m.social > 0);
  assert.ok(m.tax > 0);
});

test('zlecenie do 200 zł — podatek zryczałtowany 12% od przychodu', () => {
  const m = calculate({ age: 30, contract: 'mandate', gross: zl(150) }).regular;
  assert.equal(m.social, zl(16.89));
  assert.equal(m.health, zl(11.98));
  assert.equal(m.taxMode, 'flat');
  assert.equal(m.tax, zl(18));
  assert.equal(m.net, zl(103.13));
});

test('umowa o dzieło 1000 zł — koszty 20%, podatek 12%', () => {
  const m = calculate({ age: 30, contract: 'work', gross: zl(1000), pit2: false }).regular;
  assert.equal(m.social, 0);
  assert.equal(m.health, 0);
  assert.equal(m.costs, zl(200));
  assert.equal(m.tax, zl(96));
  assert.equal(m.net, zl(904));
});

test('umowa o dzieło do 200 zł — ryczałt', () => {
  const m = calculate({ age: 30, contract: 'work', gross: zl(150) }).regular;
  assert.equal(m.tax, zl(18));
  assert.equal(m.net, zl(132));
});

test('umowa o dzieło nie korzysta z ulgi dla młodych', () => {
  const m = calculate({ age: 20, contract: 'work', gross: zl(1000), pit2: false }).regular;
  assert.equal(m.tax, zl(96));
});

test('umowa o dzieło — prawa autorskie: limit kosztów 120 000 zł', () => {
  const r = calculate({ age: 40, contract: 'work', gross: zl(50000), copyright: true, pit2: false });
  assert.equal(r.year.months[0].costs, zl(25000));
  assert.equal(r.year.months[4].costs, zl(20000));
  assert.equal(r.year.months[5].costs, 0);
  assert.ok(r.year.notes.some((n) => n.kind === 'copyright' && n.month === 4));
  assert.ok(r.year.notes.some((n) => n.kind === 'annual'));
});

// --- poprawki po audycie przepisów -------------------------------------------------

test('art. 83: składka zdrowotna przy niskiej pensji obniżona do zaliczki z 2021 r.', () => {
  // przykład z Gazety Podatkowej: 1100 zł → 75,07 zł
  const a = calculate({ age: 30, contract: 'employment', gross: zl(1100), pit2: true }).regular;
  assert.equal(a.healthFull, zl(85.43));
  assert.equal(a.health, zl(75.07));
  assert.equal(a.healthCapped, true);
  assert.equal(a.net, zl(874.12));

  const b = calculate({ age: 30, contract: 'employment', gross: zl(1000), pit2: true }).regular;
  assert.equal(b.health, zl(60.45));
  assert.equal(b.net, zl(802.45));

  const c = calculate({ age: 30, contract: 'employment', gross: zl(500), pit2: true }).regular;
  assert.equal(c.health, 0);
  assert.equal(c.net, zl(431.45));

  // Comarch Optima: 1200 zł, koszty 300 zł → 81,19 zł, netto 954,29 zł
  const d = calculate({ age: 30, contract: 'employment', gross: zl(1200), pit2: true, increasedCosts: true }).regular;
  assert.equal(d.health, zl(81.19));
  assert.equal(d.net, zl(954.29));

  // 1/4 płacy minimalnej
  const e = calculate({ age: 30, contract: 'employment', gross: 120150, pit2: true }).regular;
  assert.equal(e.health, zl(90.03));
  assert.equal(e.net, zl(946.74));

  // ulga dla młodych: porównanie z zaliczką tak, jakby przychód nie był zwolniony
  const f = calculate({ age: 24, contract: 'employment', gross: zl(1000), pit2: true }).regular;
  assert.equal(f.health, zl(60.45));

  // bez PIT-2 zaliczka z 2021 r. jest wyższa — brak obniżenia
  const g = calculate({ age: 30, contract: 'employment', gross: zl(1100), pit2: false }).regular;
  assert.equal(g.health, zl(85.43));
  assert.equal(g.healthCapped, false);

  // płaca minimalna — bez zmian
  const h = calculate({ age: 30, contract: 'employment', gross: zl(4806), pit2: true }).regular;
  assert.equal(h.healthCapped, false);
  assert.equal(h.net, zl(3605.85));
});

test('ryczałt do 200 zł: podstawa zaokrąglana do pełnych złotych', () => {
  const a = calculate({ age: 30, contract: 'mandate', gross: 10420, pit2: true }).regular;
  assert.equal(a.tax, zl(12)); // 104 zł × 12% = 12,48 → 12
  assert.equal(a.net, 7215);
  const b = calculate({ age: 30, contract: 'work', gross: 12050 }).regular;
  assert.equal(b.tax, zl(15)); // 121 zł × 12% = 14,52 → 15
  assert.equal(b.net, 10550);
  const c = calculate({ age: 30, contract: 'work', gross: 413 }).regular;
  assert.equal(c.tax, 0);
});

test('rata większej umowy (do 200 zł miesięcznie) — podatek według zwykłych zasad', () => {
  const on = calculate({ age: 30, contract: 'mandate', gross: zl(150), pit2: true, smallContract: false }).regular;
  assert.equal(on.taxMode, 'scale');
  assert.equal(on.costs, zl(26.62));
  assert.equal(on.taxBase, zl(106));
  assert.equal(on.tax, 0);
  assert.equal(on.net, zl(121.13));
  const off = calculate({ age: 30, contract: 'mandate', gross: zl(150), pit2: false, smallContract: false }).regular;
  assert.equal(off.tax, zl(13));
  assert.equal(off.net, zl(108.13));
  const work = calculate({ age: 30, contract: 'work', gross: zl(150), pit2: false, smallContract: false }).regular;
  assert.equal(work.tax, zl(14)); // 12% × (150 − 30) = 14,40
});

test('dzieło z prawami autorskimi do 200 zł — bez ryczałtu, koszty 50%', () => {
  const a = calculate({ age: 30, contract: 'work', gross: zl(150), copyright: true, pit2: false }).regular;
  assert.equal(a.taxMode, 'scale');
  assert.equal(a.costs, zl(75));
  assert.equal(a.tax, zl(9));
  assert.equal(a.net, zl(141));
  const b = calculate({ age: 30, contract: 'work', gross: zl(150), copyright: true, pit2: true }).regular;
  assert.equal(b.tax, 0);
});

test('rozliczenie roczne: zlecenie ponad próg, z PIT-2 i bez', () => {
  const noPit2 = calculate({ age: 30, contract: 'mandate', gross: zl(30000), pit2: false }).year.settlement;
  assert.ok(Math.abs(noPit2.diff - zl(24907)) <= zl(2), `diff ${noPit2.diff}`);
  const withPit2 = calculate({ age: 30, contract: 'mandate', gross: zl(30000), pit2: true }).year.settlement;
  assert.ok(Math.abs(withPit2.diff - zl(28507)) <= zl(2), `diff ${withPit2.diff}`);
});

test('rozliczenie roczne: dzieło z prawami autorskimi bez PIT-2 → dopłata 68 400 zł', () => {
  const r = calculate({ age: 30, contract: 'work', gross: zl(50000), copyright: true, pit2: false });
  assert.equal(r.year.settlement.advances, zl(57600));
  assert.equal(r.year.settlement.tax, zl(126000));
  assert.equal(r.year.settlement.diff, zl(68400));
  assert.ok(r.year.notes.some((n) => n.kind === 'annual' && n.text.includes('68')));
});

test('rozliczenie roczne: etat bez PIT-2 → zwrot kwoty wolnej', () => {
  const r = calculate({ age: 30, contract: 'employment', gross: zl(4806), pit2: false });
  // zaliczki 12 × 468 = 5616 zł; podatek roczny 12% × 46 765 − 3600 = 2011,80 → 2012 zł
  assert.equal(r.year.settlement.advances, zl(5616));
  assert.equal(r.year.settlement.tax, zl(2012));
  assert.equal(r.year.settlement.diff, zl(-3604));
  assert.ok(r.year.notes.some((n) => n.kind === 'refund'));
});

test('rozliczenie roczne: etat z PIT-2 — bez dopłaty i zwrotu', () => {
  const r = calculate({ age: 30, contract: 'employment', gross: zl(8000), pit2: true });
  assert.ok(Math.abs(r.year.settlement.diff) < zl(10));
  assert.ok(!r.year.notes.some((n) => n.kind === 'annual' || n.kind === 'refund'));
});

test('premia jednorazowa: ile zostaje liczymy dla całego roku', () => {
  // wysoka premia przyspiesza próg 32% — z premii zostaje mniej niż różnica w styczniu
  const big = calculate({ age: 35, contract: 'employment', gross: zl(10000), bonus: zl(50000), bonusMode: 'once' });
  assert.equal(big.bonus.net, big.year.totals.net - big.year.regularTotals.net);
  assert.ok(big.bonus.net < big.bonus.monthDelta);
  assert.equal(big.year.varies, false); // bez premii każdy miesiąc taki sam
  assert.equal(big.monthly.average, big.regular.net);
});

test('premia jednorazowa liczona osobno', () => {
  const r = calculate({ age: 30, contract: 'employment', gross: zl(6000), bonus: zl(1000), bonusMode: 'once' });
  assert.ok(r.bonus);
  assert.equal(r.bonus.gross, zl(1000));
  assert.equal(r.bonus.net, r.withBonus.net - r.regular.net); // bez progów: to samo co różnica w styczniu
  assert.equal(r.withBonus.gross, zl(7000));
  assert.equal(r.regular.gross, zl(6000));
  assert.equal(r.year.totals.gross, zl(6000) * 12 + zl(1000));
});

test('premia co miesiąc wchodzi do każdej wypłaty', () => {
  const r = calculate({ age: 30, contract: 'employment', gross: zl(6000), bonus: zl(500), bonusMode: 'monthly' });
  assert.equal(r.bonus, null);
  assert.equal(r.regular.gross, zl(6500));
});

test('ulga dla seniorów tylko na wniosek i od 60 lat', () => {
  const off = calculate({ age: 66, contract: 'employment', gross: zl(6000) }).regular;
  const on = calculate({ age: 66, contract: 'employment', gross: zl(6000), seniorRelief: true }).regular;
  const tooYoung = calculate({ age: 50, contract: 'employment', gross: zl(6000), seniorRelief: true }).regular;
  assert.ok(off.tax > 0);
  assert.equal(on.tax, 0);
  assert.ok(tooYoung.tax > 0);
});

test('zero brutto nie psuje obliczeń', () => {
  const r = calculate({ age: 30, contract: 'employment', gross: 0 });
  assert.equal(r.regular.net, 0);
  assert.equal(r.year.totals.net, 0);
});

test('parseMoney', () => {
  assert.equal(parseMoney('4 806,50'), 480650);
  assert.equal(parseMoney('4806.5'), 480650);
  assert.equal(parseMoney('4 806 zł'), 480600);
  assert.equal(parseMoney('4.806,50'), 480650);
  assert.equal(parseMoney(' 4806 PLN '), 480600);
  assert.equal(parseMoney('4,806,50'), 0);
  assert.equal(parseMoney('10.000 zł'), 1000000);
  assert.equal(parseMoney('1.000.000'), 100000000);
  assert.equal(parseMoney('4,806.50'), 480650);
  assert.equal(parseMoney('4806 zl'), 480600);
  assert.equal(parseMoney('1e5'), 0);
  assert.equal(parseMoney('999999999999'), 0);
  assert.deepEqual(parseMoneyInput(''), { grosze: 0, empty: true, valid: true });
  assert.equal(parseMoneyInput('12k').valid, false);
  assert.equal(parseMoney(''), 0);
  assert.equal(parseMoney('abc'), 0);
  assert.equal(parseMoney('-100'), 0);
});

test('parametry 2026', () => {
  assert.equal(PARAMS_2026.minimumWage, zl(4806));
  assert.equal(PARAMS_2026.zusAnnualLimit, zl(282600));
  assert.equal(PARAMS_2026.reliefAnnualLimit, zl(85528));
});
