# Na rękę — kalkulator wypłaty netto

Prosta aplikacja na iPhone'a (PWA), która liczy, ile naprawdę dostaniesz na rękę
z umowy o pracę, zlecenia albo umowy o dzieło w Polsce. Stawki na 2026 rok.

- Wpisujesz wiek, wybierasz kraj (na razie Polska) i rodzaj umowy, wpisujesz brutto i ewentualną premię.
- Aplikacja pokazuje kwotę netto oraz każde potrącenie: kwotę i procent.
- Uwzględnia ulgę dla młodych, zwolnienie studentów na zleceniu, PPK, PIT-2,
  koszty 250/300 zł, koszty 20%/50%, umowy do 200 zł, próg 32% i roczny limit składek ZUS.
- Liczy cały rok miesiąc po miesiącu i ostrzega, kiedy wypłata się zmieni.
- Wszystko liczy się na telefonie. Nic nie jest nigdzie wysyłane, działa bez internetu.

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

## Uruchomienie na Macu

```bash
python3 -m http.server 5180
```

Potem otwórz w przeglądarce http://localhost:5180

Testy obliczeń:

```bash
npm test
```

## Wrzucenie do internetu (GitHub Pages, za darmo)

1. Załóż konto na https://github.com (jeśli nie masz).
2. Utwórz nowe repozytorium, np. `na-reke` (publiczne, bo darmowe GitHub Pages wymaga publicznego repozytorium;
   w kodzie nie ma żadnych Twoich danych).
3. Wgraj wszystkie pliki z tego folderu (Add file → Upload files).
4. Settings → Pages → Source: „Deploy from a branch”, Branch: `main`, folder `/ (root)` → Save.
5. Po minucie aplikacja jest pod adresem `https://TWOJ-LOGIN.github.io/na-reke/`.

Strona ma zakaz indeksowania przez wyszukiwarki (znacznik `noindex`), więc nikt na nią nie trafi przypadkiem.

## Instalacja na iPhonie

1. Otwórz adres aplikacji w **Safari**.
2. Stuknij **Udostępnij** (kwadrat ze strzałką) → **Do ekranu początkowego** → **Dodaj**.
3. **Otwórz nową ikonę raz przy włączonym internecie.** Aplikacja na ekranie początkowym ma własną pamięć,
   oddzielną od Safari, więc dopiero przy tym pierwszym uruchomieniu zapisuje się do działania offline.
   Od tej chwili działa także bez internetu.

Dane wpisane wcześniej w Safari nie przenoszą się do zainstalowanej aplikacji. To normalne zachowanie iOS.

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
