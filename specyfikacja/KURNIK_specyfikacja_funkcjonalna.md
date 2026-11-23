# KURNIK — specyfikacja funkcjonalna

Wersja: 5.0 (stan aplikacji 1.5.0, tylko dla właściciela) · 23.11.2026
Dokument towarzyszący: `KURNIK_specyfikacja_UI_UX.md` (wersja 4.0)

---

## 1. Cel i zasada nadrzędna

KURNIK to prywatna aplikacja PWA dla jednej osoby: właściciela przydomowej hodowli kur. Zastępuje kartki i pamięć w sprawach paszy.

Aplikacja odpowiada na pytania:

- Jaki jest skład mojej mieszanki i ile czego dosypać przy mieszaniu?
- Na ile starcza 100 kg mieszanki?
- Ile mam składników w magazynie, na ile wystarczą i ile dokupić?
- Ile mam kur i ile mają lat?
- (opcjonalnie) Ile kosztuje moja mieszanka?

**Zasada nadrzędna: prosto i bez funkcji dla funkcji.** Nowa funkcja wchodzi tylko wtedy, gdy odpowiada na jedno z pytań powyżej i nie dokłada pracy przy codziennym używaniu.

**Poza zakresem:** ewidencja jaj, sprzedaż, finanse hodowli, kasa, wydatki, nieśność i statusy niosek, koszt jajka, wielu użytkowników, logowanie, synchronizacja, powiadomienia push, ciemny motyw.

Kod pisze AI, właściciel wdraża i testuje. Dlatego specyfikacja podaje wiążące wzory (sekcja 7) i przykłady testowe (sekcja 8).

---

## 2. Punkt wyjścia

| Wielkość | Wartość |
| --- | --- |
| Stado | ok. 30 ptaków |
| Receptura | pszenica 17 kg, kukurydza 13 kg, śruta sojowa 10 kg, groch 5 kg, kreda 3,25 kg, Dolmix DN 1,25 kg (razem 49,5 kg) + olej 1 l jako dodatek |
| Zużycie mieszanki | ok. 3,7 kg dziennie (1 t na ok. 270 dni) |

---

## 3. Zasady danych

1. **Wpisy zamiast liczników.** Zakup, dodanie własnego, mieszanie, pobranie i korekta to osobne wpisy. Stan składnika jest z nich liczony.
2. **Korekta stanu to osobny wpis.** Wpisujesz, ile jest naprawdę, a aplikacja zapisuje różnicę.
3. **Błędny wpis poprawia się edycją;** zapis i usunięcie można cofnąć („Cofnij” w snackbarze).
4. **Prognoza zawsze wygląda jak prognoza:** znak „≈”.
5. **Partia zamraża skład i ceny** z chwili mieszania.
6. **Ujemny stan nie blokuje zapisu.** Składnik ze stanem poniżej zera ma oznaczenie „Sprawdź stan”.
7. **Koszty są opcjonalne.** Brak ceny to „brak danych”, nigdy 0 zł. Bez żadnej ceny aplikacja nie pokazuje kosztów.
8. **Jednostki w zapisie:** masy w gramach, kwoty w groszach, liczby całkowite. Litry przelicza się przez gęstość; składnik w litrach bez gęstości to błąd.
9. **Zaokrąglanie tylko przy wyświetlaniu.**
10. **Dane z poprzednich wersji muszą się wczytać** (sekcja 6, zgodność).

---

## 4. Moduły

### 4.1. Składniki

Nazwa, jednostka (kg albo l), gęstość (dla litrów), **rodzaj**, ostatnia cena (uzupełnia się sama z zakupu).

**Rodzaj:**
- **Liczony w proporcjach** — wchodzi do masy mieszanki i procentów.
- **Dodatek (poza masą)** — np. olej. Nie wchodzi do masy ani procentów; dawkę liczy się na masę mieszanki. Dodatek może być w kg albo w l.

### 4.2. Receptury

- Nazwa, składniki z ilościami, uwagi. Kilka receptur; jedna jest aktualna. Kolejność składników można zmienić.
- **Masa receptury i procenty tylko ze składników liczonych w proporcjach** (np. 49,5 kg).
- Dodatek pokazany osobno z dawką na 100 kg mieszanki, np. „Olej · 2,02 l na 100 kg”. W recepturze może być kilka dodatków.
- Receptura musi mieć co najmniej jeden składnik oprócz dodatków.
- Gdy wszystkie składniki mają ceny: koszt 100 kg i 1 kg mieszanki (dodatki wchodzą do kosztu, nie do masy).

### 4.3. Mieszanie (partia)

Ekran „Mieszam”:
1. Wybór receptury (domyślnie aktualna).
2. **Masa mieszanki (bez dodatków):** 50 kg, 100 kg albo „Inna” (od 1 do 2 000 kg). Domyślnie masa ostatniej partii; gdy to nie 50 ani 100 kg, zaznaczona jest „Inna” z tą wartością. Bez partii: 100 kg.
3. Lista do odważenia w kolejności receptury: składniki i dodatki (z oznaczeniem „Dodatek”), każda pozycja z polem do odhaczenia i ołówkiem do zmiany ilości w tej jednej partii.
4. Ekran nie gaśnie, dopóki jest otwarty „Mieszam” (blokada wygaszania; gdy telefon jej nie obsługuje, nic się nie dzieje).
5. „Zapisz partię”: zapisuje partię i odejmuje składniki oraz dodatki z magazynu. Przy nieodhaczonych pozycjach jedno pytanie. Gdy jest wcześniejsza niezakończona partia, pytanie „Zakończyć poprzednią partię?”.

Partia ma: datę mieszania, początek karmienia (domyślnie dzień mieszania), ostatni dzień karmienia, masę mieszanki bez dodatków, skład z dodatkami, koszt (jeśli są ceny), pozostałość.

- W danych koniec partii to dzień po ostatnim dniu karmienia; na ekranie widać „Ostatni dzień karmienia”.
- **„Zakończ i mieszaj nową”** (ekran Pasza): kończy partię w użyciu z dzisiejszym dniem jako ostatnim dniem karmienia i pozostałością 0, potem otwiera „Mieszam”. Można cofnąć.
- „Zakończ partię” zostaje dla innej daty albo pozostałości.
- Partia z ostatnim dniem karmienia dziś lub wcześniej nie jest już w użyciu.
- Stare partie z olejem liczonym w masie (wersje do 1.4) wczytują się bez zmian; obliczenia biorą z nich masę bez oleju.

**Wyniki partii:** zużycie dziennie, gramy na ptaka dziennie, na ile starcza 100 kg, koszt dziennie (jeśli są ceny), porównanie z gotową paszą (jeśli podano jej cenę).

**Wykres:** na ekranie Pasza słupki zużycia dziennego kolejnych zakończonych partii (najwyżej 12 ostatnich, od najstarszej), pokazywany od 3 zakończonych partii.

### 4.4. Magazyn

- **Stan składnika** liczony z wpisów (wzór 7).
- **Dodaj do magazynu:** wybór **Zakup** albo **Własny**. Cena (za kg, za litr albo za całość, opcjonalnie) tylko przy zakupie. Aplikacja pamięta ostatni wybór osobno dla każdego składnika; bez historii domyślnie „Zakup”. Zakup aktualizuje ostatnią cenę.
- **Korekta stanu:** wpisujesz, ile jest naprawdę; aplikacja zapisuje różnicę. Tak też wpisuje się stany na start.
- **Inne pobranie:** np. 5 kg pszenicy wzięte na inny cel.
- **Prognoza zapasu** (wzór 8) dla każdego składnika i dodatku z aktualnej receptury, z orientacyjną datą wyczerpania. Poniżej progu (domyślnie 30 dni) oznaczenie „Kończy się”.
- **Ile dokupić** (wzór 11) na 2 i 3 miesiące, na ekranie składnika.
- **Ile mieszanki zostało** (prognoza) = masa partii w użyciu − średnie zużycie × dni od początku karmienia. Gdy spadnie do zera: „Mieszanka powinna się już skończyć. Sprawdź i zakończ partię.”

Średnie zużycie dzienne bierze się z 3 ostatnich zakończonych partii; bez nich z ustawień (domyślnie 3,7 kg).

### 4.5. Stado

- **Rocznik:** nazwa, kury albo koguty, liczba ptaków, zakup albo wyklucie z datą, wiek przy zakupie w tygodniach (opcjonalnie, tylko przy zakupie), oznaczenie (opcjonalnie).
- **Wiek** w pełnych miesiącach (wzór 10).
- **Zmień liczbę:** „Ubyło” albo „Przybyło”, liczba sztuk, data, uwaga z podpowiedziami do kliknięcia: padła, ubój, sprzedana, dokupione, wyklute.
- Ekran Stado: razem, w tym kur i kogutów; lista roczników (nazwa, kury/koguty, wiek, oznaczenie, liczba).
- Liczba ptaków służy do gramów paszy na ptaka.

Bez statusów nieśności, bez osobnych typów zdarzeń, bez nowych korekt liczby.

### 4.6. Ustawienia i kopia

- Próg ostrzeżenia w dniach (domyślnie 30).
- Ile zjadają dziennie, zanim zbierze się historia (domyślnie 3,7 kg).
- Cena gotowej paszy (opcjonalnie).
- Kopia danych: „Zrób kopię” (udostępnienie pliku, a gdy telefon nie umie udostępnić — pobranie), „Pobierz plik kopii”, „Wczytaj kopię”.
- Po 30 dniach od ostatniej kopii ekran Start pokazuje przypomnienie z przyciskiem „Zrób kopię”.

### 4.7. Teksty

Wszystkie teksty widoczne w aplikacji są w jednym pliku `ui/texts.js`. Ekrany biorą je tylko stamtąd. Zasady pisania: UI/UX, sekcja 10.

---

## 5. Stan budowy

Wersja 1.5.0 obejmuje oba dawne etapy (receptury, mieszanie, magazyn, stado, koszty) oraz zmiany z listy poprawek 1.5. Testy: `node --test tests/kurnik.test.js`.

---

## 6. Model danych i architektura

**Architektura:** PWA (HTML, CSS, JavaScript w modułach ES, bez frameworka i bez bibliotek), działa w telefonie, bez serwera i logowania.

- Dane w IndexedDB (`kurnik`). Aplikacja prosi o trwałe przechowywanie (`navigator.storage.persist()`).
- Service Worker trzyma pliki aplikacji; działa offline. Numer `VERSION` w `sw.js` zmienia się przy każdym wydaniu.
- **Hosting: GitHub Pages z publicznego repozytorium.** Repozytorium zawiera tylko kod i specyfikacje, nigdy dane ani kopie. `.gitignore` wyklucza `kurnik-kopia-*.json`, `*.kopia.json`, `kopie/`. Uwaga: `.gitignore` działa przy pracy z gitem; przy wgrywaniu przez stronę GitHuba trzeba samemu nie wybierać plików kopii.
- Obliczenia w czystych funkcjach (`src/calc/`), testowane przez `node --test`.

**Magazyny danych (IndexedDB):**

| Magazyn | Kluczowe pola |
| --- | --- |
| `ingredients` | nazwa, jednostka, gęstość, `kind` (`base` / `additive`), ostatnia cena, `lastSource` (`purchase` / `addition`) |
| `ingredientEvents` | składnik, typ (`purchase`, `addition`, `correction`, `withdrawal`, `batch`), data, gramy, cena, partia, uwagi |
| `recipes` | nazwa, pozycje (składnik, ilość w tysięcznych jednostki), aktualna, uwagi |
| `batches` | receptura i jej nazwa (kopia), data mieszania, start, koniec (dzień po ostatnim dniu karmienia), `mass` (bez dodatków), `massBasis: 'base'`, pozycje (dodatki z `additive: true`, litry w `millilitres`), pozostałość |
| `cohorts` | nazwa, `category` (`hens` / `roosters`), liczba, `dateKind` (`purchase` / `hatch`), data, wiek przy zakupie w tygodniach, oznaczenie |
| `cohortChanges` | rocznik, `type` (`add` / `loss`), liczba, data, uwaga |
| `settings` | próg, zużycie domyślne, cena gotowej paszy, data ostatniej kopii, licznik zapisów |

Każdy wpis ma UUID, datę utworzenia i znacznik usunięcia.

**Zgodność ze starszymi danymi** (bez zmiany zapisanych liczb, dat, partii i ruchów):
- Baza otwierana bez numeru wersji, więc działa także po wersji 1.5 od Codexa (baza w wersji 2).
- Po wczytaniu bazy i po imporcie kopii dane są ujednolicane w pamięci (`src/migrate.js`):
  - składnik bez `kind`: `oil: true` albo płynny składnik o nazwie zaczynającej się od „Olej” = dodatek, pozostałe = liczone w proporcjach;
  - zmiana stada `loss` / `add` bez uwagi dostaje uwagę z dawnego powodu (np. „padła”, „dokupione”);
  - dawne zmiany typu `status` są pomijane; dawne korekty liczby zostają w historii jako „Korekta: X szt.” (tylko do odczytu);
  - rocznik `initial` liczy się jak zakup bez wieku („co najmniej”); dawne pola statusów są ignorowane, a usuwane przy edycji rocznika.
- Kopie w wersjach 1–4 wczytują się. Nowa kopia ma wersję 4, więc wersja 1.4 też ją odczyta.

---

## 7. Wzory obliczeń

Masy w gramach, kwoty w groszach; kilogramy i złote tylko na ekranie.

1. Masa składnika w litrach (g) = litry × gęstość × 1000. **Masa receptury = suma mas składników liczonych w proporcjach.**
2. Udział składnika = masa składnika / masa receptury. Ilość na 100 kg = udział × 100 kg.
   **Dawka dodatku** = masa dodatku / masa receptury; ilość na 100 kg = ilość dodatku × 100 kg / masa receptury.
3. Składnik w partii = udział × masa mieszanki (gramy rozdzielane według największych reszt, suma równa masie). Dodatek w partii = ilość dodatku × masa mieszanki / masa receptury (litry zapisywane w ml).
4. Koszt partii = suma (masa pozycji × cena za gram), także dodatków; tylko gdy wszystkie pozycje mają cenę. Koszt kilograma = koszt / masa mieszanki bez dodatków × 1000.
5. Dni karmienia = koniec − start (koniec = dzień po ostatnim dniu karmienia). Zjedzona masa = (masa − pozostałość) × udział masy bez dodatków (dla nowych partii 1). Zużycie dzienne = zjedzona masa / dni.
6. Na ile starcza 100 kg = 100 kg / średnie zużycie dzienne. Gramy na ptaka = zużycie dzienne / średnia liczba ptaków w okresie partii.
7. Stan składnika = suma wpisów: zakupy + własne − zużycie w partiach − inne pobrania + korekty. Korekta = stan rzeczywisty − stan wyliczony.
8. **Dni zapasu** = (stan + r × mieszanka, która została) / (średnie zużycie dzienne × r), gdzie r = udział składnika albo dawka dodatku w aktualnej recepturze. Data wyczerpania = dziś + dni zapasu.
9. Różnica wobec gotowej paszy = zjedzona masa × (cena gotowej − koszt kilograma własnej). Dodatnia: „Taniej niż gotowa pasza o”, ujemna: „Drożej niż gotowa pasza o”.
10. Wiek: od daty wyklucia, a przy zakupie od daty zakupu − wiek przy zakupie (tygodnie × 7 dni); pełne miesiące, „X lat Y mies.”. Zakup bez wieku: „co najmniej”.
11. **Ile dokupić** na N dni (60 i 90) = średnie zużycie × r × N − (stan + r × mieszanka, która została). Wynik ≤ 0: „Wystarczy na dłużej niż 2 (3) miesiące”. Zaokrąglenie w górę do pełnych kg, dla litrów do 0,1 l.
12. Domyślna masa mieszania = masa bez dodatków ostatniej partii (najpóźniejsza data mieszania); bez partii 100 kg.

---

## 8. Przykłady testowe

Receptura T1: pszenica 17 kg, kukurydza 13 kg, śruta sojowa 10 kg, groch 5 kg, kreda 3,25 kg, Dolmix DN 1,25 kg, olej 1 l jako dodatek (gęstość 0,92).

| # | Scenariusz | Oczekiwany wynik |
| --- | --- | --- |
| T1 | Receptura z dodatkiem | masa 49,5 kg; pszenica 34,3% (34,34 kg na 100 kg); olej poza procentami, 2,02 l na 100 kg |
| T2 | Brak gęstości | błąd walidacji |
| T3 | Partia 1 000 kg, 22.04.2025–17.01.2026, pozostałość 0 | 270 dni; 3,704 kg dziennie; 100 kg ≈ 27 dni |
| T4 | T3 przy stałych 30 ptakach | 123,5 g na ptaka dziennie |
| T5 | Pszenica: korekta na 500 kg, zakup 1 000 kg, partia 340 kg, pobranie 5 kg | 1 155 kg |
| T6 | T5, stan rzeczywisty 1 140 kg | korekta −15 kg; stan 1 140 kg |
| T7 | Pszenica 1 000 kg, zużycie 3,704 kg dziennie, mieszanki nie zostało | ≈ 786 dni |
| T8 | T1 na 100 kg | 34,34 / 26,26 / 20,20 / 10,10 / 6,57 / 2,53 kg; olej 2,02 l |
| T9 | Partia 100 kg karmiona od 10 dni, 3,704 kg dziennie | ≈ 63 kg; ≈ 17 dni |
| T10 | Receptura z olejem liczonym w proporcjach, ceny: pszenica 0,70, kukurydza 0,65, soja 2,00, groch 1,30, kreda 0,86, Dolmix 5,60 zł/kg, olej 4,00 zł/l | koszt 60,645 zł; 100 kg = 120,28 zł; taniej na 1 352 kg wobec gotowej po 2,00 zł/kg o 1 077,82 zł |
| T11 | Zakup 14.04.2025, 16 tygodni, dziś 22.11.2026 | „1 rok 10 mies.” |
| T12 | Brak cen | brak kosztów, nigdzie „0 zł” |
| T13 | Olej 10 l, zużycie 3,704 kg dziennie, mieszanki nie zostało | ≈ 134 dni |
| T14 | Pszenica 50 kg, zużycie 3,5 kg dziennie | na 2 miesiące 23 kg, na 3 miesiące 59 kg |
| T15 | Masa „Inna” 75 kg | pszenica 25,76 kg; olej 1,52 l |
| T16 | Ostatnia partia 75 kg / brak partii | „Inna” z 75 / 100 kg |
| T17 | Rocznik 30 szt., ubyło 1 (padła), przybyło 5 (dokupione) | 34 szt., oba wpisy z uwagami w historii |
| T18 | Stare dane: rocznik 30, ubytek 2, status, korekta na 25 | 25 szt., bez statusu, w historii ubytek i korekta |
| T19 | Stary „Olej” z `oil: true` | dodatek; receptura 49,5 kg; stare partie bez zmian |
| T20 | Pokrzywa dodana jako „Własny” | następne dodanie pokrzywy: „Własny”; pszenica bez historii: „Zakup” |
