// Testy silnika niemieckiego: node --test tests/engine-de.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateDE, formatEUR, lohnsteuer2026, midijobEmployeeBase, midijobTotalBase,
  PARAMS_DE_2026, DE_STATES,
} from '../js/engine-de.js';

const eur = (value) => Math.round(value * 100);

// Wartości oczekiwane pobrane 2026-11-24 z zewnętrznego interfejsu BMF:
// https://www.bmf-steuerrechner.de/interface/2026Version1.xhtml?code=LSt2026ext&LZZ=2
//   &KRV=0&PKV=0&ALTER1=0&af=0&f=1 + parametry z kolumny „pap” (KVZ w %).
// Kolumny: nazwa, wejście calculateDE, parametry PAP wysłane do BMF, wynik BMF (centy).
const BMF_CASES = [
  ["I 603", {taxClass: 1,gross: 60300}, {RE4: 60300,STKL: 1,ZKF: 0,R: 0,KVZ: "2.90",PVS: 0,PVZ: 1,PVA: 0,ALV: 0}, {LSTLZZ: 0,SOLZLZZ: 0,BK: 0,STS: 0,SOLZS: 0,BKS: 0}],
  ["I 1500 midijob", {taxClass: 1,gross: 150000}, {RE4: 150000,STKL: 1,ZKF: 0,R: 0,KVZ: "2.90",PVS: 0,PVZ: 1,PVA: 0,ALV: 0}, {LSTLZZ: 925,SOLZLZZ: 0,BK: 0,STS: 0,SOLZS: 0,BKS: 0}],
  ["I 2500", {taxClass: 1,gross: 250000}, {RE4: 250000,STKL: 1,ZKF: 0,R: 0,KVZ: "2.90",PVS: 0,PVZ: 1,PVA: 0,ALV: 0}, {LSTLZZ: 18733,SOLZLZZ: 0,BK: 0,STS: 0,SOLZS: 0,BKS: 0}],
  ["I 3500 KiSt", {taxClass: 1,gross: 350000,church: true}, {RE4: 350000,STKL: 1,ZKF: 0,R: 1,KVZ: "2.90",PVS: 0,PVZ: 1,PVA: 0,ALV: 0}, {LSTLZZ: 40550,SOLZLZZ: 0,BK: 40550,STS: 0,SOLZS: 0,BKS: 0}],
  ["I 4500", {taxClass: 1,gross: 450000}, {RE4: 450000,STKL: 1,ZKF: 0,R: 0,KVZ: "2.90",PVS: 0,PVZ: 1,PVA: 0,ALV: 0}, {LSTLZZ: 65016,SOLZLZZ: 0,BK: 0,STS: 0,SOLZS: 0,BKS: 0}],
  ["I 6000 KiSt BY", {taxClass: 1,gross: 600000,church: true,state: "BY"}, {RE4: 600000,STKL: 1,ZKF: 0,R: 1,KVZ: "2.90",PVS: 0,PVZ: 1,PVA: 0,ALV: 0}, {LSTLZZ: 107433,SOLZLZZ: 0,BK: 107433,STS: 0,SOLZS: 0,BKS: 0}],
  ["I 9000", {taxClass: 1,gross: 900000}, {RE4: 900000,STKL: 1,ZKF: 0,R: 0,KVZ: "2.90",PVS: 0,PVZ: 1,PVA: 0,ALV: 0}, {LSTLZZ: 221275,SOLZLZZ: 6151,BK: 0,STS: 0,SOLZS: 0,BKS: 0}],
  ["I 12000 KiSt", {taxClass: 1,gross: 1200000,church: true}, {RE4: 1200000,STKL: 1,ZKF: 0,R: 1,KVZ: "2.90",PVS: 0,PVZ: 1,PVA: 0,ALV: 0}, {LSTLZZ: 347275,SOLZLZZ: 19100,BK: 347275,STS: 0,SOLZS: 0,BKS: 0}],
  ["I 4500 1 Kind KiSt", {taxClass: 1,gross: 450000,children: 1,church: true}, {RE4: 450000,STKL: 1,ZKF: 0.5,R: 1,KVZ: "2.90",PVS: 0,PVZ: 0,PVA: 0,ALV: 0}, {LSTLZZ: 65883,SOLZLZZ: 0,BK: 53058,STS: 0,SOLZS: 0,BKS: 0}],
  ["I 3500 Sachsen", {taxClass: 1,gross: 350000,state: "SN"}, {RE4: 350000,STKL: 1,ZKF: 0,R: 0,KVZ: "2.90",PVS: 1,PVZ: 1,PVA: 0,ALV: 0}, {LSTLZZ: 40041,SOLZLZZ: 0,BK: 0,STS: 0,SOLZS: 0,BKS: 0}],
  ["I 3500 age 22", {taxClass: 1,gross: 350000,age: 22}, {RE4: 350000,STKL: 1,ZKF: 0,R: 0,KVZ: "2.90",PVS: 0,PVZ: 0,PVA: 0,ALV: 0}, {LSTLZZ: 41158,SOLZLZZ: 0,BK: 0,STS: 0,SOLZS: 0,BKS: 0}],
  ["I 3500 KVZ 3.5", {taxClass: 1,gross: 350000,healthExtra: 350}, {RE4: 350000,STKL: 1,ZKF: 0,R: 0,KVZ: "3.50",PVS: 0,PVZ: 1,PVA: 0,ALV: 0}, {LSTLZZ: 40241,SOLZLZZ: 0,BK: 0,STS: 0,SOLZS: 0,BKS: 0}],
  ["II 2500 1 Kind", {taxClass: 2,gross: 250000,children: 1}, {RE4: 250000,STKL: 2,ZKF: 0.5,R: 0,KVZ: "2.90",PVS: 0,PVZ: 0,PVA: 0,ALV: 0}, {LSTLZZ: 10250,SOLZLZZ: 0,BK: 0,STS: 0,SOLZS: 0,BKS: 0}],
  ["II 4500 2 Kinder KiSt", {taxClass: 2,gross: 450000,children: 2,church: true}, {RE4: 450000,STKL: 2,ZKF: 1,R: 1,KVZ: "2.90",PVS: 0,PVZ: 0,PVA: 1,ALV: 0}, {LSTLZZ: 54991,SOLZLZZ: 0,BK: 31175,STS: 0,SOLZS: 0,BKS: 0}],
  ["III 3500", {taxClass: 3,gross: 350000}, {RE4: 350000,STKL: 3,ZKF: 0,R: 0,KVZ: "2.90",PVS: 0,PVZ: 1,PVA: 0,ALV: 0}, {LSTLZZ: 11016,SOLZLZZ: 0,BK: 0,STS: 0,SOLZS: 0,BKS: 0}],
  ["III 6000 2 Kinder KiSt", {taxClass: 3,gross: 600000,children: 2,church: true}, {RE4: 600000,STKL: 3,ZKF: 2,R: 1,KVZ: "2.90",PVS: 0,PVZ: 0,PVA: 1,ALV: 0}, {LSTLZZ: 63433,SOLZLZZ: 0,BK: 21166,STS: 0,SOLZS: 0,BKS: 0}],
  ["III 12000 3 Kinder SN", {taxClass: 3,gross: 1200000,children: 3,state: "SN"}, {RE4: 1200000,STKL: 3,ZKF: 3,R: 0,KVZ: "2.90",PVS: 1,PVZ: 0,PVA: 2,ALV: 0}, {LSTLZZ: 257266,SOLZLZZ: 0,BK: 0,STS: 0,SOLZS: 0,BKS: 0}],
  ["IV 4500", {taxClass: 4,gross: 450000}, {RE4: 450000,STKL: 4,ZKF: 0,R: 0,KVZ: "2.90",PVS: 0,PVZ: 1,PVA: 0,ALV: 0}, {LSTLZZ: 65016,SOLZLZZ: 0,BK: 0,STS: 0,SOLZS: 0,BKS: 0}],
  ["IV 6000 1 Kind KiSt", {taxClass: 4,gross: 600000,children: 1,church: true}, {RE4: 600000,STKL: 4,ZKF: 1,R: 1,KVZ: "2.90",PVS: 0,PVZ: 0,PVA: 0,ALV: 0}, {LSTLZZ: 108741,SOLZLZZ: 0,BK: 93841,STS: 0,SOLZS: 0,BKS: 0}],
  ["V 1500", {taxClass: 5,gross: 150000}, {RE4: 150000,STKL: 5,ZKF: 0,R: 0,KVZ: "2.90",PVS: 0,PVZ: 1,PVA: 0,ALV: 0}, {LSTLZZ: 15283,SOLZLZZ: 0,BK: 0,STS: 0,SOLZS: 0,BKS: 0}],
  ["V 2500", {taxClass: 5,gross: 250000}, {RE4: 250000,STKL: 5,ZKF: 0,R: 0,KVZ: "2.90",PVS: 0,PVZ: 1,PVA: 0,ALV: 0}, {LSTLZZ: 46566,SOLZLZZ: 0,BK: 0,STS: 0,SOLZS: 0,BKS: 0}],
  ["V 4500 KiSt", {taxClass: 5,gross: 450000,church: true}, {RE4: 450000,STKL: 5,ZKF: 0,R: 1,KVZ: "2.90",PVS: 0,PVZ: 1,PVA: 0,ALV: 0}, {LSTLZZ: 111258,SOLZLZZ: 0,BK: 111258,STS: 0,SOLZS: 0,BKS: 0}],
  ["V 12000", {taxClass: 5,gross: 1200000}, {RE4: 1200000,STKL: 5,ZKF: 0,R: 0,KVZ: "2.90",PVS: 0,PVZ: 1,PVA: 0,ALV: 0}, {LSTLZZ: 404850,SOLZLZZ: 22266,BK: 0,STS: 0,SOLZS: 0,BKS: 0}],
  ["VI 603", {taxClass: 6,gross: 60300}, {RE4: 60300,STKL: 6,ZKF: 0,R: 0,KVZ: "2.90",PVS: 0,PVZ: 1,PVA: 0,ALV: 0}, {LSTLZZ: 6733,SOLZLZZ: 0,BK: 0,STS: 0,SOLZS: 0,BKS: 0}],
  ["VI 2500", {taxClass: 6,gross: 250000}, {RE4: 250000,STKL: 6,ZKF: 0,R: 0,KVZ: "2.90",PVS: 0,PVZ: 1,PVA: 0,ALV: 0}, {LSTLZZ: 51000,SOLZLZZ: 0,BK: 0,STS: 0,SOLZS: 0,BKS: 0}],
  ["VI 6000 KiSt", {taxClass: 6,gross: 600000,church: true}, {RE4: 600000,STKL: 6,ZKF: 0,R: 1,KVZ: "2.90",PVS: 0,PVZ: 1,PVA: 0,ALV: 0}, {LSTLZZ: 166850,SOLZLZZ: 0,BK: 166850,STS: 0,SOLZS: 0,BKS: 0}],
  ["VI 20000", {taxClass: 6,gross: 2000000}, {RE4: 2000000,STKL: 6,ZKF: 0,R: 0,KVZ: "2.90",PVS: 0,PVZ: 1,PVA: 0,ALV: 0}, {LSTLZZ: 745458,SOLZLZZ: 41000,BK: 0,STS: 0,SOLZS: 0,BKS: 0}],
  ["I 4500 Bonus 3000 KiSt", {taxClass: 1,gross: 450000,bonus: 300000,church: true}, {RE4: 450000,STKL: 1,ZKF: 0,R: 1,KVZ: "2.90",PVS: 0,PVZ: 1,PVA: 0,ALV: 0,SONSTB: 300000,JRE4: 5400000}, {LSTLZZ: 65016,SOLZLZZ: 0,BK: 65016,STS: 78300,SOLZS: 0,BKS: 78300}],
  ["III 3500 Bonus 5000 1 Kind KiSt", {taxClass: 3,gross: 350000,bonus: 500000,children: 1,church: true}, {RE4: 350000,STKL: 3,ZKF: 1,R: 1,KVZ: "2.90",PVS: 0,PVZ: 0,PVA: 0,ALV: 0,SONSTB: 500000,JRE4: 4200000}, {LSTLZZ: 11450,SOLZLZZ: 0,BK: 0,STS: 92200,SOLZS: 0,BKS: 92200}],
  ["I 9000 Bonus 20000", {taxClass: 1,gross: 900000,bonus: 2000000}, {RE4: 900000,STKL: 1,ZKF: 0,R: 0,KVZ: "2.90",PVS: 0,PVZ: 1,PVA: 0,ALV: 0,SONSTB: 2000000,JRE4: 10800000}, {LSTLZZ: 221275,SOLZLZZ: 6151,BK: 0,STS: 840000,SOLZS: 46200,BKS: 0}],
  ["VI 2500 Bonus 1000", {taxClass: 6,gross: 250000,bonus: 100000}, {RE4: 250000,STKL: 6,ZKF: 0,R: 0,KVZ: "2.90",PVS: 0,PVZ: 1,PVA: 0,ALV: 0,SONSTB: 100000,JRE4: 3000000}, {LSTLZZ: 51000,SOLZLZZ: 0,BK: 0,STS: 33500,SOLZS: 0,BKS: 0}],
  ["Werkstudent 1500", {taxClass: 1,gross: 150000,jobType: "student"}, {RE4: 150000,STKL: 1,ZKF: 0,R: 0,KVZ: "2.90",PVS: 0,PVZ: 1,PVA: 0,ALV: 1}, {LSTLZZ: 925,SOLZLZZ: 0,BK: 0,STS: 0,SOLZS: 0,BKS: 0}],
  ["Werkstudent 2500", {taxClass: 1,gross: 250000,jobType: "student"}, {RE4: 250000,STKL: 1,ZKF: 0,R: 0,KVZ: "2.90",PVS: 0,PVZ: 1,PVA: 0,ALV: 1}, {LSTLZZ: 18733,SOLZLZZ: 0,BK: 0,STS: 0,SOLZS: 0,BKS: 0}],
  ["I 7000 Soli Milderung KiSt", {taxClass: 1,gross: 700000,church: true}, {RE4: 700000,STKL: 1,ZKF: 0,R: 1,KVZ: "2.90",PVS: 0,PVZ: 1,PVA: 0,ALV: 0}, {LSTLZZ: 143033,SOLZLZZ: 0,BK: 143033,STS: 0,SOLZS: 0,BKS: 0}],
  ["III 9000 Bonus 10000 2 Kinder KiSt", {taxClass: 3,gross: 900000,bonus: 1000000,children: 2,church: true}, {RE4: 900000,STKL: 3,ZKF: 2,R: 1,KVZ: "2.90",PVS: 0,PVZ: 0,PVA: 1,ALV: 0,SONSTB: 1000000,JRE4: 10800000}, {LSTLZZ: 148166,SOLZLZZ: 0,BK: 96533,STS: 343000,SOLZS: 0,BKS: 343000}],
  ["IV 3500 2 Kinder KiSt", {taxClass: 4,gross: 350000,children: 2,church: true}, {RE4: 350000,STKL: 4,ZKF: 2,R: 1,KVZ: "2.90",PVS: 0,PVZ: 0,PVA: 1,ALV: 0}, {LSTLZZ: 41416,SOLZLZZ: 0,BK: 19125,STS: 0,SOLZS: 0,BKS: 0}],
  ["I 2000 midijob KiSt", {taxClass: 1,gross: 200000,church: true}, {RE4: 200000,STKL: 1,ZKF: 0,R: 1,KVZ: "2.90",PVS: 0,PVZ: 1,PVA: 0,ALV: 0}, {LSTLZZ: 8816,SOLZLZZ: 0,BK: 8816,STS: 0,SOLZS: 0,BKS: 0}],
  ["II 3500 3 Kinder SN", {taxClass: 2,gross: 350000,children: 3,state: "SN"}, {RE4: 350000,STKL: 2,ZKF: 1.5,R: 0,KVZ: "2.90",PVS: 1,PVZ: 0,PVA: 2,ALV: 0}, {LSTLZZ: 31100,SOLZLZZ: 0,BK: 0,STS: 0,SOLZS: 0,BKS: 0}],
  ["I 1000 Bonus 2000", {taxClass: 1,gross: 100000,bonus: 200000}, {RE4: 100000,STKL: 1,ZKF: 0,R: 0,KVZ: "2.90",PVS: 0,PVZ: 1,PVA: 0,ALV: 0,SONSTB: 200000,JRE4: 1200000}, {LSTLZZ: 0,SOLZLZZ: 0,BK: 0,STS: 0,SOLZS: 0,BKS: 0}],
  ["V 6000 Bonus 6000 KiSt", {taxClass: 5,gross: 600000,bonus: 600000,church: true}, {RE4: 600000,STKL: 5,ZKF: 0,R: 1,KVZ: "2.90",PVS: 0,PVZ: 1,PVA: 0,ALV: 0,SONSTB: 600000,JRE4: 7200000}, {LSTLZZ: 162425,SOLZLZZ: 0,BK: 162425,STS: 228500,SOLZS: 12567,BKS: 228500}],
  ["I 25000 Spitzensteuer KiSt", {taxClass: 1,gross: 2500000,church: true}, {RE4: 2500000,STKL: 1,ZKF: 0,R: 1,KVZ: "2.90",PVS: 0,PVZ: 1,PVA: 0,ALV: 0}, {LSTLZZ: 894250,SOLZLZZ: 49183,BK: 894250,STS: 0,SOLZS: 0,BKS: 0}],
];

const kvzBp = (kvz) => Math.round(Number(kvz) * 100);

test('liczba przypadków BMF', () => {
  assert.ok(BMF_CASES.length >= 25);
});

for (const [name, input, pap, bmf] of BMF_CASES) {
  test(`PAP 2026 = BMF: ${name}`, () => {
    // 1) bezpośredni port PAP
    const r = lohnsteuer2026({ ...pap, KVZ: kvzBp(pap.KVZ) });
    assert.deepEqual(r, bmf);

    // 2) calculateDE: Lohnsteuer, Soli i Kirchensteuer zgodne z BMF
    const res = calculateDE(input);
    const month = input.bonus ? res.withBonus : res.regular;
    const rate = input.state === 'BY' || input.state === 'BW' ? 8 : 9;
    assert.equal(month.incomeTax, bmf.LSTLZZ + bmf.STS, 'Lohnsteuer');
    assert.equal(month.soli, bmf.SOLZLZZ + bmf.SOLZS, 'Soli');
    const church = input.church
      ? Math.floor((bmf.BK * rate) / 100) + Math.floor((bmf.BKS * rate) / 100)
      : 0;
    assert.equal(month.churchTax, church, 'Kirchensteuer');
    if (input.bonus) {
      assert.equal(res.regular.incomeTax, bmf.LSTLZZ);
      assert.equal(res.regular.soli, bmf.SOLZLZZ);
    }
  });
}

test('parametry 2026', () => {
  const P = PARAMS_DE_2026;
  assert.ok(Object.isFrozen(P));
  assert.equal(P.bbgPensionMonthly, eur(8450));
  assert.equal(P.bbgHealthMonthly, eur(5812.5));
  assert.equal(P.minijobLimit, eur(603));
  assert.equal(P.midijobUpper, eur(2000));
  assert.equal(P.midijobFactorF, 6619);
  assert.equal(P.avgHealthExtraBp, 290);
  assert.equal(P.tax.grundfreibetrag, 12348);
  assert.equal(P.soli.freigrenze, 20350);
});

test('etat 3500 €, kl. I, bez dzieci, 30 lat, Berlin — pełne netto', () => {
  const m = calculateDE({ gross: eur(3500) }).regular;
  assert.equal(m.pension, eur(325.5)); // 9,3%
  assert.equal(m.unemployment, eur(45.5)); // 1,3%
  assert.equal(m.health, eur(306.25)); // 7,3% + 1,45%
  assert.equal(m.care, eur(84)); // 1,8% + 0,6% (bezdzietny)
  assert.equal(m.social, eur(761.25));
  assert.equal(m.incomeTax, eur(405.5));
  assert.equal(m.soli, 0);
  assert.equal(m.net, eur(2333.25));
  assert.equal(m.midijob, false);
});

test('BBG: składki od 8450 € (RV/AV) i 5812,50 € (KV/PV)', () => {
  const m = calculateDE({ gross: eur(12000) }).regular;
  assert.equal(m.pension, eur(785.85));
  assert.equal(m.unemployment, eur(109.85));
  assert.equal(m.health, eur(508.59)); // 5812,50 × 8,75% = 508,59375
  assert.equal(m.care, eur(139.5)); // 5812,50 × 2,4%
});

test('PV: Saksonia, dzieci, wiek < 23', () => {
  assert.equal(calculateDE({ gross: eur(3000), state: 'SN' }).regular.care, eur(87)); // 2,9%
  assert.equal(calculateDE({ gross: eur(3000), children: 1 }).regular.care, eur(54)); // 1,8%
  assert.equal(calculateDE({ gross: eur(3000), children: 3 }).regular.care, eur(39)); // 1,3%
  assert.equal(calculateDE({ gross: eur(3000), children: 7 }).regular.care, eur(24)); // 0,8% (max 4 zniżki)
  assert.equal(calculateDE({ gross: eur(3000), age: 22 }).regular.care, eur(54));
});

test('Midijob 1500 €: obniżona podstawa pracownika', () => {
  // 2000/1397 × (1500 − 603) = 1284,18
  assert.equal(midijobEmployeeBase(eur(1500)), eur(1284.18));
  // DRV: 1,1459372 × 1500 − 291,8744 = 1427,03
  assert.equal(midijobTotalBase(eur(1500)), eur(1427.03));
  const m = calculateDE({ gross: eur(1500) }).regular;
  assert.equal(m.midijob, true);
  assert.equal(m.pension, eur(119.43));
  assert.equal(m.unemployment, eur(16.69));
  assert.equal(m.health, eur(112.37));
  assert.equal(m.care, eur(30.82));
  assert.ok(m.notes.includes('Midijob: niższe składki'));
  assert.equal(calculateDE({ gross: eur(2000) }).regular.midijob, true);
  assert.equal(calculateDE({ gross: eur(2000.01) }).regular.midijob, false);
});

test('Minijob 603 €: tylko RV 3,6%, bez podatku', () => {
  const m = calculateDE({ gross: eur(603), jobType: 'minijob' }).regular;
  assert.equal(m.pension, eur(21.71));
  assert.equal(m.social, eur(21.71));
  assert.equal(m.tax, 0);
  assert.equal(m.net, eur(581.29));
  const ex = calculateDE({ gross: eur(603), jobType: 'minijob', minijobRvExempt: true }).regular;
  assert.equal(ex.net, eur(603));
  // minimalna podstawa 175 €: 18,6% × 175 − 15% × 100
  assert.equal(calculateDE({ gross: eur(100), jobType: 'minijob' }).regular.pension, eur(17.55));
  // przekroczenie limitu → zwykła praca
  const over = calculateDE({ gross: eur(700), jobType: 'minijob' });
  assert.equal(over.input.jobType, 'regular');
  assert.equal(over.regular.midijob, true);
});

test('Werkstudent: tylko RV, podatek normalny', () => {
  const m = calculateDE({ gross: eur(2500), jobType: 'student' }).regular;
  assert.equal(m.pension, eur(232.5));
  assert.equal(m.unemployment + m.health + m.care, 0);
  assert.equal(m.incomeTax, eur(187.33));
});

test('premia: miesiąc z premią, netto premii, rok', () => {
  const r = calculateDE({ gross: eur(4500), bonus: eur(3000), church: true });
  assert.equal(r.withBonus.gross, eur(7500));
  assert.equal(r.withBonus.incomeTax, eur(650.16 + 783));
  assert.equal(r.withBonus.pension, eur(697.5)); // 9,3% × 7500
  assert.equal(r.bonus.gross, eur(3000));
  assert.equal(r.bonus.net, r.withBonus.net - r.regular.net);
  assert.equal(r.year.totals.gross, eur(4500) * 12);
  assert.equal(r.year.totals.net, r.regular.net * 12);
  const none = calculateDE({ gross: eur(4500) });
  assert.equal(none.bonus, null);
  assert.equal(none.withBonus, none.regular);
});

test('sumy i spójność pól', () => {
  for (const input of [
    { gross: eur(5200), taxClass: 3, children: 2, church: true, state: 'BW' },
    { gross: eur(800), taxClass: 6 },
    { gross: eur(9000), bonus: eur(15000), taxClass: 4 },
  ]) {
    const r = calculateDE(input);
    for (const m of [r.regular, r.withBonus]) {
      assert.equal(m.social, m.pension + m.unemployment + m.health + m.care);
      assert.equal(m.tax, m.incomeTax + m.soli + m.churchTax);
      assert.equal(m.net, m.gross - m.social - m.tax);
      assert.ok(Array.isArray(m.notes));
    }
  }
});

test('domyślne dane i normalizacja', () => {
  const r = calculateDE();
  assert.equal(r.input.age, 30);
  assert.equal(r.input.state, 'BE');
  assert.equal(r.input.taxClass, 1);
  assert.equal(r.input.healthExtra, 290);
  assert.equal(r.regular.net, 0);
  assert.equal(calculateDE({ state: 'XX', taxClass: 9 }).input.state, 'BE');
  assert.equal(calculateDE({ taxClass: 9 }).input.taxClass, 6);
  // ZKF: kl. I/II → 0,5 na dziecko, III/IV → 1,0, V/VI → 0
  assert.equal(calculateDE({ taxClass: 1, children: 3 }).input.zkf, 1.5);
  assert.equal(calculateDE({ taxClass: 4, children: 2 }).input.zkf, 2);
  assert.equal(calculateDE({ taxClass: 5, children: 2 }).input.zkf, 0);
  assert.equal(calculateDE({ taxClass: 2, children: 2, childAllowances: 2 }).input.zkf, 2);
});

test('DE_STATES: 16 krajów związkowych posortowanych po polsku', () => {
  assert.equal(DE_STATES.length, 16);
  const names = DE_STATES.map((s) => s.name);
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, 'pl')));
  assert.equal(new Set(DE_STATES.map((s) => s.code)).size, 16);
});

test('formatEUR', () => {
  assert.equal(formatEUR(345678), '3456,78 €');
  assert.equal(formatEUR(0), '0,00 €');
  assert.equal(formatEUR(5), '0,05 €');
  assert.equal(formatEUR(1234567), '12 345,67 €');
  assert.equal(formatEUR(-2050), '-20,50 €');
});
