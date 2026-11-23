# KURNIK — specyfikacja funkcjonalna

Wersja: 4.0 (wersja do budowy, tylko dla właściciela) · 22.11.2026
Dokument towarzyszący: `KURNIK_specyfikacja_UI_UX.md` (wersja 3.0)

---

## 1. Cel i zasada nadrzędna

KURNIK to prywatna aplikacja PWA dla jednej osoby: właściciela przydomowej hodowli kur. Zastępuje kartki i pamięć w sprawach paszy.

Aplikacja odpowiada na pytania:

- Jaki jest skład mojej mieszanki i ile czego dosypać przy mieszaniu?
- Na ile starcza 100 kg mieszanki?
- Ile mam składników w magazynie, na ile wystarczą i kiedy trzeba dokupić?
- Ile mam kur i ile mają lat?
- (opcjonalnie) Ile kosztuje moja mieszanka?

**Zasada nadrzędna: prosto i bez funkcji dla funkcji.** Nowa funkcja wchodzi tylko wtedy, gdy odpowiada na jedno z pytań powyżej i nie dokłada pracy przy codziennym używaniu.

**Poza zakresem:** ewidencja jaj, sprzedaż, finanse hodowli, kasa, wydatki, nieśność, koszt jajka, wielu użytkowników, logowanie, synchronizacja między urządzeniami, powiadomienia push, ciemny motyw.

Kod pisze AI, właściciel wdraża i testuje. Dlatego specyfikacja podaje wiążące wzory (sekcja 7) i przykłady testowe (sekcja 8).

---

## 2. Punkt wyjścia

| Wielkość | Wartość |
| --- | --- |
| Stado | ok. 30 ptaków: ok. 20 niosek, ok. 5 młodych, ok. 5 kogutów |
| Receptura na ok. 50 kg | pszenica 17 kg, kukurydza 13 kg, śruta sojowa 10 kg, groch 5 kg, kreda 3,25 kg, Dolmix DN 1,25 kg, olej 1 l |
| Zużycie mieszanki | ok. 3,7 kg/dzień (1 t na ok. 270 dni) |
| Koszt mieszanki | ok. 1,20 zł/kg przy ówczesnych cenach |

---

## 3. Zasady danych

1. **Wpisy zamiast liczników.** Zakup, mieszanie, pobranie i korekta to osobne wpisy. Stan składnika jest z nich wyliczany.
2. **Korekta stanu to osobny wpis.** Wpisujesz, ile faktycznie masz, a aplikacja zapisuje różnicę. Historia nie jest zmieniana.
3. **Błędny wpis poprawia się edycją;** usunięcie można cofnąć.
4. **Prognoza zawsze wygląda jak prognoza:** znak „≈” i podpis „prognoza”.
5. **Partia zamraża skład i ceny** z chwili mieszania. Późniejsza zmiana receptury albo ceny jej nie zmienia.
6. **Ujemny stan nie blokuje zapisu.** Składnik ze stanem poniżej zera jest oznaczony „sprawdź stan”.
7. **Koszty są opcjonalne.** Brak ceny to „brak danych”, nigdy 0 zł. Gdy żaden składnik nie ma ceny, aplikacja nie pokazuje kosztów w ogóle.
8. **Jednostki w zapisie:** masy w gramach, kwoty w groszach, liczby całkowite. Litry przelicza się na kilogramy wyłącznie przez gęstość składnika; składnik w litrach bez gęstości to błąd walidacji.
9. **Zaokrąglanie tylko przy wyświetlaniu.**

---

## 4. Moduły

### 4.1. Składniki

Nazwa, jednostka (kg albo l), gęstość (obowiązkowa dla litrów, np. olej 0,92 kg/l), ostatnia cena (opcjonalnie, uzupełnia się sama z zakupu).

### 4.2. Receptury

- Nazwa, składniki z ilościami i jednostkami, uwagi. Można mieć kilka receptur (np. letnia, zimowa); jedna jest oznaczona jako aktualna.
- Aplikacja pokazuje masę receptury i **proporcje**: udział każdego składnika w % i ilość na 100 kg.
- Gdy składniki mają ceny: koszt 100 kg i 1 kg według ostatnich cen.

### 4.3. Mieszanie (partia)

Ekran „Mieszam”:
1. Wybór receptury (domyślnie aktualna) i masy: skróty 50 kg i 100 kg albo dowolna wartość.
2. Lista składników przeliczonych na tę masę, dużą czcionką, z odhaczaniem dosypanych pozycji.
3. Możliwość zmiany ilości w tej jednej partii (receptura zostaje bez zmian).
4. „Zatwierdź partię”: zapisuje partię i odejmuje składniki z magazynu.

Partia ma: datę mieszania, datę rozpoczęcia podawania (domyślnie dzień mieszania), datę zakończenia, masę, skład, koszt (jeśli są ceny), pozostałość przy zakończeniu.

- Przy zatwierdzeniu nowej partii aplikacja proponuje zakończenie poprzedniej z dzisiejszą datą; można to zmienić albo pominąć.
- Data zakończenia to pierwszy dzień, w którym partia nie jest już podawana.

**Wyniki partii:** zużycie na dzień, gramy na ptaka na dzień (z liczby ptaków w stadzie), na ile starcza 100 kg, koszt dziennie (jeśli są ceny). Dla partii w użyciu wyniki są szacowane z dni, które już upłynęły.

### 4.4. Magazyn

Magazyn liczy tylko ilości.

- **Stan składnika** wyliczany ze wpisów (wzór 7).
- **Zakup:** składnik, data, ilość, cena (opcjonalnie: za kg albo łącznie). Zwiększa stan i aktualizuje ostatnią cenę.
- **Korekta stanu:** wpisujesz, ile faktycznie masz (np. „pszenica 550 kg”), a aplikacja zapisuje różnicę. To także sposób na wprowadzenie stanów na start.
- **Inne pobranie:** np. 5 kg pszenicy wzięte na inny cel.
- **Prognoza zapasu** (wzór 8): na ile dni wystarczy każdy składnik przy aktualnej recepturze i średnim zużyciu, z uwzględnieniem mieszanki, która jeszcze jest, oraz orientacyjna data wyczerpania.
- **Do uzupełnienia:** składniki, które wystarczą na mniej dni niż ustawiony próg (domyślnie 30).
- **Ile mieszanki zostało** (prognoza) = masa partii w użyciu − średnie zużycie × dni od rozpoczęcia. Gdy prognoza spadnie do zera, a partia nie jest zakończona, aplikacja prosi o sprawdzenie.

Średnie zużycie dzienne bierze się z 3 ostatnich zakończonych partii; gdy ich nie ma, z wartości wpisanej w ustawieniach (domyślnie 3,7 kg/dzień).

### 4.5. Stado

- **Rocznik:** nazwa (np. „Kury 2025”), kategoria (kury / koguty), liczba sztuk, data zakupu albo wyklucia, wiek przy zakupie (opcjonalnie, w tygodniach), oznaczenie (np. kolor obrączki, opcjonalnie), uwagi.
- **Wiek** liczony automatycznie w pełnych miesiącach (wzór 10).
- **Zmiana liczby:** nowa liczba sztuk z datą i opcjonalną uwagą (np. „padła 1”). Historia zmian zostaje.
- Ekran pokazuje: ile ptaków razem, ile kur, ile kogutów, wiek każdego rocznika.
- Liczba ptaków służy do wyliczenia gramów paszy na ptaka.

Bez kosztów, bez statusów nieśności, bez osobnych typów zdarzeń.

### 4.6. Ustawienia

- Próg „Do uzupełnienia” w dniach (domyślnie 30).
- Zużycie dzienne do prognozy, zanim powstaną partie (domyślnie 3,7 kg).
- Cena gotowej paszy do porównania (opcjonalnie; gdy pusta, porównania nie ma).
- Eksport i import kopii zapasowej.

---

## 5. Etapy budowy

### Etap 1: receptury, mieszanie, magazyn

Zakres: składniki, receptury z proporcjami, ekran „Mieszam”, partie, magazyn (zakupy, korekty, pobrania, prognoza zapasu, „Do uzupełnienia”), ekran startowy, kopia zapasowa.

Kryteria ukończenia:
- [ ] Przykłady T1–T3, T5–T9 i T12 dają oczekiwane wyniki.
- [ ] Zmiana receptury albo ceny po zatwierdzeniu partii nie zmienia tej partii.
- [ ] Dwie partie zachodzące na siebie są liczone bez podwójnych dni.
- [ ] Eksport i import kopii odtwarzają wszystkie dane na czystej instalacji.
- [ ] Przez 2 miesiące wpisujesz mieszanie i zakupy. Jeśli coś przeszkadza, upraszczasz przed etapem 2.

### Etap 2: stado i koszty

Zakres: roczniki z wiekiem i liczbą, gramy na ptaka, koszty mieszanki (jeśli są ceny), porównanie z gotową paszą.

Kryteria ukończenia:
- [ ] Przykłady T4, T10 i T11 dają oczekiwane wyniki.
- [ ] Bez wpisanych cen aplikacja nie pokazuje żadnych kosztów.

---

## 6. Model danych i architektura

**Architektura:** PWA (HTML, CSS, JavaScript w modułach ES, bez frameworka), działa w całości w telefonie, bez serwera i bez logowania.

- Dane w IndexedDB przeglądarki. Przy pierwszym uruchomieniu aplikacja prosi o trwałe przechowywanie (`navigator.storage.persist()`).
- Service Worker do plików aplikacji; działa offline zawsze.
- **Kopia zapasowa:** eksport wszystkich danych do pliku JSON (udostępnienie albo zapis do Pobranych). Na ekranie startowym przypomnienie, gdy ostatni eksport był ponad 30 dni temu. Import tylko do pustej aplikacji albo z wyraźnym potwierdzeniem zastąpienia danych.
- **Hosting: GitHub Pages z publicznego repozytorium GitHub**, tak jak aplikacja „Czas pracy” właściciela. Repozytorium zawiera wyłącznie kod i obecne specyfikacje. Hosting służy tylko do zainstalowania i aktualizacji aplikacji; dane nie opuszczają telefonu.
- **Instalacja:** otwarcie adresu GitHub Pages w Chrome na telefonie → „Dodaj do ekranu głównego”. Potem aplikacja działa z ikony, w pełnym oknie, bez internetu.
- **Aktualizacja:** nowa wersja plików w repozytorium. Service Worker pobiera ją przy następnym uruchomieniu z internetem; dane w IndexedDB zostają. Zmiana numeru wersji w Service Workerze przy każdym wydaniu.
- **Repozytorium jest publiczne, więc:** nigdy nie zawiera danych, plików kopii zapasowej ani danych osobowych; `.gitignore` wyklucza `*.json` z kopiami (`kurnik-kopia-*.json`) i folder `kopie/`; plik manifestu PWA i konfiguracja nie zawierają niczego prywatnego.
- **Ryzyko utraty danych:** wyczyszczenie danych Chrome albo usunięcie aplikacji kasuje dane z telefonu; jedynym zabezpieczeniem jest regularny eksport kopii (przypomnienie co 30 dni) zapisany poza przeglądarką, np. w Pobranych albo na Dysku Google.
- Obliczenia w czystych funkcjach (`src/calc/`) bez DOM i bazy danych, testowane przez `node --test`.

**Magazyny danych (IndexedDB):**

| Magazyn | Kluczowe pola |
| --- | --- |
| `ingredients` | id, nazwa, jednostka, gęstość, ostatnia cena (grosze za kg) |
| `ingredientEvents` | id, składnik, typ (zakup, zużycie w partii, inne pobranie, korekta stanu), data, ilość w g, kwota (zakup, opcjonalnie), partia, uwagi |
| `recipes` | id, nazwa, pozycje (składnik, ilość, jednostka), aktualna (tak/nie), uwagi |
| `batches` | id, receptura i jej nazwa (kopia), data mieszania, start, koniec, pozycje (składnik, masa, cena/kg), masa, koszt, pozostałość |
| `cohorts` | id, nazwa, kategoria, liczba, data zakupu lub wyklucia, wiek przy zakupie, oznaczenie, uwagi |
| `cohortChanges` | id, rocznik, data, nowa liczba, uwaga |
| `settings` | próg dni, zużycie domyślne, cena gotowej paszy, data ostatniego eksportu |

Każdy wpis ma identyfikator (UUID), datę utworzenia i znacznik usunięcia (usuwanie miękkie, z „Cofnij”).

---

## 7. Wzory obliczeń

Masy w gramach, kwoty w groszach; kilogramy i złote tylko na ekranie i w przykładach.

1. Masa składnika w litrach (g) = litry × gęstość (kg/l) × 1000. Masa receptury = suma mas składników.
2. Udział składnika = masa składnika / masa receptury. Ilość na 100 kg = udział × 100 kg.
3. Składnik w partii = ilość w recepturze × masa docelowa / masa receptury.
4. Koszt partii = suma (masa składnika × cena za gram); liczony tylko, gdy wszystkie składniki mają cenę, inaczej „brak danych”. Koszt kilograma = koszt partii / masa partii × 1000.
5. Dni użytkowania = data zakończenia − data rozpoczęcia. Zjedzona masa = masa partii − pozostałość. Zużycie dzienne = zjedzona masa / dni użytkowania.
6. Na ile starcza 100 kg = 100 kg / średnie zużycie dzienne. Gramy na ptaka na dzień = zużycie dzienne (g) / liczba ptaków w okresie partii (średnia z dni).
7. Stan składnika = zakupy − zużycie w partiach − inne pobrania + korekty stanu. Korekta = stan rzeczywisty − stan wyliczony.
8. Dni zapasu składnika = (stan + udział składnika × ile mieszanki zostało) / (średnie zużycie dzienne × udział składnika w aktualnej recepturze). Data wyczerpania = dziś + dni zapasu.
9. Oszczędność wobec gotowej paszy = zjedzona masa × (cena gotowej − koszt kilograma własnej), z pełną precyzją kosztu.
10. Data wyklucia (gdy nie podano) = data zakupu − wiek przy zakupie (tygodnie × 7 dni). Wiek rocznika = pełne miesiące od daty wyklucia do dziś, wyświetlany jako „X lat Y mies.” albo „Y mies.”. Gdy nie znamy ani daty wyklucia, ani wieku przy zakupie, wiek liczy się od daty zakupu z dopiskiem „co najmniej”.

---

## 8. Przykłady testowe

| # | Scenariusz | Dane | Oczekiwany wynik |
| --- | --- | --- | --- |
| T1 | Receptura i proporcje | pszenica 17 kg, kukurydza 13 kg, soja 10 kg, groch 5 kg, kreda 3,25 kg, Dolmix 1,25 kg, olej 1 l (gęstość 0,92) | masa 50,42 kg; pszenica 33,7% (33,72 kg na 100 kg); olej 1,8% (1,98 l na 100 kg) |
| T2 | Brak gęstości | olej w litrach bez gęstości | błąd walidacji, partii nie da się zatwierdzić |
| T3 | Zużycie dzienne | partia 1 000 kg, start 22.04.2025, koniec 17.01.2026, pozostałość 0 | 270 dni; 3,704 kg/dzień; 100 kg starcza na ≈ 27 dni |
| T4 | Gramy na ptaka | T3 przy stałych 30 ptakach | 123,5 g/ptaka/dzień |
| T5 | Stan składnika | pszenica: korekta stanu na 500 kg, zakup 1 000 kg, zużycie w partii 340 kg, inne pobranie 5 kg | 1 155 kg |
| T6 | Korekta stanu | T5, potem stan rzeczywisty 1 140 kg | korekta −15 kg w historii; stan 1 140 kg |
| T7 | Prognoza zapasu | pszenica 1 000 kg; receptura z T1; zużycie 3,704 kg/dzień; mieszanki nie zostało | ≈ 801 dni |
| T8 | Partia w przeliczeniu | receptura z T1 przeliczona na 100 kg | pszenica 33,72 kg; kukurydza 25,78 kg; soja 19,83 kg; groch 9,92 kg; kreda 6,45 kg; Dolmix 2,48 kg; olej 1,98 l |
| T9 | Ile mieszanki zostało | partia 100 kg podawana od 10 dni; zużycie 3,704 kg/dzień | ≈ 63 kg; ≈ 17 dni (prognoza) |
| T10 | Koszt mieszanki | T1 z cenami: pszenica 0,70, kukurydza 0,65, soja 2,00, groch 1,30, kreda 0,86, Dolmix 5,60 zł/kg, olej 4,00 zł/l | koszt 60,645 zł; 1,2028 zł/kg; 100 kg = 120,28 zł; oszczędność na 1 352 kg wobec gotowej po 2,00 zł/kg = 1 077,82 zł |
| T11 | Wiek rocznika | zakup 14.04.2025, wiek przy zakupie 16 tygodni; dziś 22.11.2026 | 22 pełne miesiące: „1 rok 10 mies.” |
| T12 | Brak cen | receptura z T1, żaden składnik nie ma ceny | aplikacja nie pokazuje kosztów; nigdzie nie ma „0 zł” |
