## Struktura

| Plik | Co robi |
|---|---|
| `index.html` | Wygląd aplikacji |
| `css/styles.css` | Style (jasny i ciemny motyw jak w iOS) |
| `js/engine.js` | **Silnik obliczeń i wszystkie stawki** (`PARAMS_2026`) |
| `js/app.js` | Obsługa formularza i wyświetlanie wyników |
| `sw.js` | Działanie offline i aktualizacje |
| `manifest.webmanifest`, `icons/` | Ikona i nazwa na ekranie iPhone'a |
| `tests/engine.test.mjs` | Testy obliczeń |



## Aktualizacja stawek na kolejny rok

1. W `js/engine.js` popraw wartości w `PARAMS_2026` (płaca minimalna, limit 30-krotności,
   limit chorobowego, ewentualne zmiany stawek) i rok.
2. Popraw oczekiwane kwoty w `tests/engine.test.mjs` i uruchom `npm test`.
3. W `sw.js` zmień `VERSION` (np. `` `${PREFIX}2027-01-01-1` ``). Bez tego telefony zostaną przy starej wersji.
4. Wgraj **wszystkie** zmienione pliki na GitHub naraz (jednym „Upload files”), razem z `sw.js`.
   iPhone pobierze nową wersję sam przy następnym uruchomieniu albo po powrocie do aplikacji (najwyżej raz na godzinę).

## Zastrzeżenie

Kalkulator pokazuje zaliczki pobierane przy wypłacie według przepisów na 2026 rok.
Ostateczny podatek wychodzi w zeznaniu rocznym (PIT-37). Nie uwzględnia kilku umów naraz,
ulg z zeznania rocznego, PIT-0 dla rodzin 4+ i powracających z zagranicy ani potrąceń komorniczych.
