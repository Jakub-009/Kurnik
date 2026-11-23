# KURNIK — specyfikacja UI/UX

Wersja: 3.0 (wersja do budowy, tylko dla właściciela) · 22.11.2026
Dokument towarzyszący: `KURNIK_specyfikacja_funkcjonalna.md` (wersja 4.0)

---

## 1. Kierunek

Język Material 3 (Material You) ze stałą, własną paletą: kremowe tło, zieleń jako kolor główny, kolor żółtka dla ostrzeżeń. Kolory nie zmieniają się z tapetą telefonu.

- Z Material 3 bierzemy wzorce: pasek nawigacji, rozszerzony przycisk akcji (FAB), przyciski tonalne, chipy, karty, listy, snackbar, role kolorów, skalę typografii, kształty.
- Bez biblioteki Material Web Components (jest w trybie utrzymania); wygląd z własnych zmiennych CSS i prostych komponentów.
- Font systemowy (na Androidzie Roboto), bez pobierania.
- Tylko jasny motyw.

Wzorzec wizualny: widok D na płótnie makiet (sekcja 11).

---

## 2. Zasady UX

1. **Prosto i bez funkcji dla funkcji.** Każdy element ekranu odpowiada na jedno z pytań ze specyfikacji funkcjonalnej.
2. **Używane w kurniku i przy mieszalniku:** jedna ręka, czasem rękawice. Elementy dotykowe co najmniej 48 px, główne akcje 56–64 px, ważne przyciski w dolnej połowie ekranu.
3. **Czytelność w słońcu:** jasny motyw, kontrast tekstu co najmniej 4,5:1.
4. **Prognoza nigdy nie udaje pomiaru:** zawsze „≈” i podpis „prognoza”.
5. **Bez okienek „Czy na pewno?”** przy zapisie i usuwaniu; zamiast nich snackbar z „Cofnij”. Wyjątki: porzucenie niezapisanego formularza i import kopii.
6. **Rozsądne wartości domyślne:** dzisiejsza data, aktualna receptura, ostatnia cena.
7. **Jeden ekran, jedno zadanie.** Formularze na pełnym ekranie, bez paska nawigacji.
8. **Natychmiastowe działanie:** wszystko z pamięci telefonu, bez wskaźników ładowania.
9. **Koszty tylko wtedy, gdy są ceny.** Bez cen ekran nie pokazuje pustych pól kosztów ani „0 zł”.

---

## 3. Kolory

Stała paleta opisana rolami Material 3. W kodzie tylko nazwy ról. Wszystkie pary tekstu z tłem mają kontrast co najmniej 5,4:1; obramowania 4,2:1.

| Rola | Wartość | Tekst na niej | Użycie |
| --- | --- | --- | --- |
| primary | #2E6B36 | #FFFFFF | główny przycisk formularza, wyróżnione liczby, aktywne pole |
| primaryContainer | #B2F2B0 | #00210A | FAB „Mieszam” |
| secondaryContainer | #D5E8CF | #101F0F | przyciski tonalne, wybrane chipy, wskaźnik w pasku nawigacji, kółka ikon |
| secondary | #52634F | #FFFFFF | ikony drugorzędne |
| tertiaryContainer | #FFDEA6 | #261900 | baner „Do uzupełnienia”, „Sprawdź stan”, przypomnienie o kopii |
| tertiary | #7A5900 | #FFFFFF | tekst i ikony ostrzeżeń, pasek prognozy poniżej progu |
| errorContainer | #FFDAD6 | #410002 | błąd zapisu lub importu |
| error | #BA1A1A | #FFFFFF | tekst błędu pod polem |
| surface | #FBF8F1 | #1C1C17 | tło ekranu |
| surfaceContainerLow | #F5F2EA | #1C1C17 | listy, karty pomocnicze, klawisze cyfr |
| surfaceContainer | #EFECE4 | #1C1C17 | pasek nawigacji, karta partii w użyciu |
| surfaceContainerHigh | #E9E6DE | #1C1C17 | klawisze przecinka i ⌫, okna dialogowe |
| surfaceContainerHighest | #E4E1D9 | #1C1C17 | pola tekstowe, separatory |
| onSurfaceVariant | #47483F | — | teksty pomocnicze i podpisy |
| outline | #787869 | — | obramowania chipów i pól |
| outlineVariant | #C8C7B8 | — | delikatne obramowania |
| inverseSurface | #31312B | #F3F0E8 | snackbar |
| inversePrimary | #97D997 | — | przycisk „Cofnij” w snackbarze |

`theme-color` w manifeście PWA i w `<meta>` = surface (#FBF8F1).

---

## 4. Typografia

Font systemowy (`Roboto, system-ui, sans-serif`), skala Material 3, liczby z `font-variant-numeric: tabular-nums`.

| Styl | Rozmiar / interlinia | Grubość | Użycie |
| --- | --- | --- | --- |
| Display Small | 36 / 44 px | 400 | główna liczba na karcie (np. ≈ 63 kg) |
| Headline Small | 24 / 32 px | 400 | ilości na ekranie „Mieszam” |
| Title Large | 22 / 28 px | 400 | tytuł górnego paska |
| Title Medium | 16 / 24 px | 500 | nagłówki kart i sekcji |
| Body Large | 16 / 24 px | 400 | tekst pozycji listy, wartości |
| Body Medium | 14 / 20 px | 400 | tekst pomocniczy, podpisy |
| Label Large | 14 / 20 px | 500 | przyciski, chipy |
| Label Medium | 12 / 16 px | 500 | etykiety paska nawigacji (aktywna 700), podpowiedzi |

Tekst mieści się przy powiększonym foncie systemowym do 130%: kontenery z tekstem mają `min-height`, nie stałą wysokość.

---

## 5. Kształty, odstępy, rozmiary

| Element | Wartość |
| --- | --- |
| Zaokrąglenia | 8 px chipy i pola; 12 px pole liczby i klawisze; 16 px karty, banery, FAB; pełne przyciski i wskaźnik nawigacji; 4 px snackbar |
| Odstępy | siatka 4 px; margines ekranu 16 px; między kartami 12 px |
| Górny pasek | 64 px |
| Pasek nawigacji | 80 px, wskaźnik 64 × 32 px |
| Element dotykowy | minimum 48 × 48 px |
| Przycisk główny formularza | 56 px, pełna szerokość |
| FAB rozszerzony | 56 px, 16 px od prawej krawędzi, nad paskiem nawigacji |
| Klawisze klawiatury numerycznej | 56–64 px |
| Pozycja listy | 56 px (jedna linia), 64–72 px (dwie linie) |
| Cienie | tylko FAB i snackbar: 0 2px 6px rgba(0,0,0,.18), 0 1px 2px rgba(0,0,0,.12) |

---

## 6. Komponenty

| Komponent | Wygląd i zachowanie | Gdzie |
| --- | --- | --- |
| Górny pasek | tytuł + opcjonalny podtytuł; po prawej ikona ustawień; w formularzach po lewej „Zamknij” (×), w szczegółach „Wróć” (←) | każdy ekran |
| Pasek nawigacji | 4 zakładki z ikoną i etykietą, wskaźnik secondaryContainer | ekrany główne |
| FAB rozszerzony | primaryContainer, ikona i etykieta, jeden na ekran | Start i Pasza: „Mieszam”; Magazyn: „Zakup”; Stado: „Dodaj rocznik” |
| Przycisk wypełniony | primary, pełna szerokość, 56 px, jeden na ekran | zatwierdzenie formularza |
| Przycisk tonalny | secondaryContainer, 48 px | „Korekta stanu”, „Zakończ partię”, akcje drugorzędne |
| Przycisk tekstowy | tekst w kolorze primary, 48 px | „Zmień”, „Cofnij”, „Sprawdź” |
| Chip wyboru | obramowanie outline; wybrany: secondaryContainer + ✓ | masa partii (50 / 100 kg / inna), data, receptura |
| Pole liczby z klawiaturą | duża liczba w polu na pełną szerokość, puste na starcie; pod spodem klawiatura 3 × 4 (1–9, przecinek, 0, ⌫); jednostka obok liczby | ilości, masy, stany, liczba ptaków |
| Pole tekstowe | wypełnione, etykieta nad wartością, błąd pod spodem | nazwy, ceny, uwagi |
| Wiersz wartości | etykieta, wartość i „Zmień” w jednej linii 48 px | data, cena, receptura |
| Karta | tło surfaceContainerLow lub surfaceContainer, 16 px, bez cienia | partia w użyciu, podsumowania |
| Pozycja listy | ikona w kółku 40 px, tekst główny + pomocniczy, wartość po prawej; cała klikalna | składniki, receptury, partie, roczniki |
| Lista kontrolna | pozycja 56 px z polem do odhaczenia; odhaczona przekreślona i przyciemniona; ilość dużą czcionką po prawej | ekran „Mieszam” |
| Pasek prognozy | poziomy pasek z „≈ N dni” i datą wyczerpania, podpis „prognoza”; poniżej progu kolor tertiary i ikona ⚠ | magazyn, ekran startowy |
| Baner ostrzeżenia | tertiaryContainer, ikona ⚠, tytuł, opis, przycisk tekstowy | „Do uzupełnienia”, „Sprawdź stan”, przypomnienie o kopii |
| Snackbar | inverseSurface, tekst + „Cofnij”, 5 s | po zapisie, edycji i usunięciu |
| Okno dialogowe | tytuł, jedno zdanie, dwa przyciski tekstowe | porzucenie zmian, import kopii |
| Stan pusty | jedno zdanie + jeden przycisk | listy bez danych |

Ikony: Material Symbols Outlined (Apache 2.0) jako wbudowane SVG, tylko używane, zapisane w repozytorium.

---

## 7. Nawigacja i ekrany

Pasek nawigacji: **Start, Pasza, Magazyn, Stado.** Ustawienia pod ikoną w górnym pasku.

| Ekran | Zawartość | Etap |
| --- | --- | --- |
| Start | sekcja 8 | 1 (stado od 2) |
| Pasza | karta partii w użyciu (receptura, dzień, ≈ ile zostało, przycisk „Zakończ partię”); na ile starcza 100 kg; lista receptur (aktualna oznaczona); lista partii (najnowsze u góry); FAB „Mieszam” | 1 |
| Receptura | nazwa, składniki z ilościami, proporcje (% i ilość na 100 kg), masa; koszt 100 kg i 1 kg, jeśli są ceny; „Ustaw jako aktualną”, „Edytuj” | 1 (koszt od 2) |
| Edycja receptury | nazwa, lista składników (składnik, ilość, jednostka), „Dodaj składnik”, uwagi | 1 |
| Mieszam | chipy receptury i masy (50 kg / 100 kg / Inna); lista kontrolna składników z ilościami; „Zatwierdź partię”; po zatwierdzeniu pytanie o zakończenie poprzedniej partii | 1 |
| Partia | skład, daty, masa, pozostałość; wyniki: zużycie dziennie, na ile starcza 100 kg, g na ptaka (od etapu 2), koszt (jeśli są ceny) | 1 |
| Zakończ partię | data zakończenia (domyślnie dziś), pozostałość w kg (domyślnie 0), podgląd wyników | 1 |
| Magazyn | baner „Do uzupełnienia”; lista składników: stan i pasek prognozy (≈ dni, data wyczerpania), posortowana od najkrótszej prognozy; FAB „Zakup” | 1 |
| Składnik | stan, prognoza, ostatnia cena; przyciski „Zakup”, „Korekta stanu”, „Inne pobranie”; historia ruchów | 1 |
| Zakup | składnik, data, ilość (pole liczby), cena za kg albo łącznie (opcjonalnie) | 1 |
| Korekta stanu | stan wyliczony, pole „Jest faktycznie”, różnica przed zapisem | 1 |
| Inne pobranie | składnik, data, ilość, uwaga | 1 |
| Stado | karta: razem, kury, koguty; lista roczników (nazwa, oznaczenie, liczba, wiek); FAB „Dodaj rocznik” | 2 |
| Rocznik | nazwa, kategoria, liczba, data zakupu lub wyklucia, wiek, oznaczenie, historia zmian liczby; „Zmień liczbę” | 2 |
| Ustawienia | próg „Do uzupełnienia”, zużycie domyślne, cena gotowej paszy, eksport kopii, import kopii, data ostatniego eksportu | 1 |

---

## 8. Ekran startowy

Kolejność od góry, bez przewijania przy foncie 100%:

1. **Górny pasek:** „Kurnik”, dzień tygodnia i data, ikona ustawień.
2. **Karta „Pasza w użyciu”:** nazwa receptury, dzień partii, „≈ 63 kg · ≈ 17 dni” (Display Small, podpis „prognoza”). Gdy nie ma partii: „Brak partii w użyciu” i przycisk „Mieszam”.
3. **Baner „Do uzupełnienia”** (tylko gdy jest powód): lista składników z dniami, np. „Soja ≈ 12 dni”.
4. **Magazyn w skrócie:** 3 składniki z najkrótszą prognozą, z paskami prognozy; przycisk tekstowy „Cały magazyn”.
5. **Stado** (od etapu 2): „30 ptaków: 25 kur, 5 kogutów”.
6. **Przypomnienie o kopii** (gdy ostatni eksport był ponad 30 dni temu).
7. **FAB „Mieszam”.**

---

## 9. Wzorce interakcji

- **Zapis** zamyka formularz i pokazuje snackbar „Zapisano · Cofnij” na 5 s.
- **Edycja:** dotknięcie pozycji otwiera ten sam formularz z danymi. **Usuwanie:** „Usuń” w formularzu edycji, potem snackbar z „Cofnij”.
- **Przycisk wstecz Androida** zamyka formularz; przy niezapisanych zmianach pyta „Odrzucić zmiany?”.
- **Liczby:** pole liczby z klawiaturą numeryczną (z przecinkiem), puste na starcie. Ceny w polu tekstowym z klawiaturą dziesiętną systemu; przecinek i kropka działają tak samo.
- **Korekta stanu:** stan wyliczony, pole „Jest faktycznie”, podgląd różnicy, „Zapisz”.
- **Mieszanie:** odhaczanie jest tylko pomocą przy mieszalniku. „Zatwierdź partię” działa także bez odhaczenia wszystkiego; wtedy pyta jednym zdaniem „Nie wszystkie składniki są odhaczone. Zatwierdzić?”.
- **Ujemny stan składnika:** oznaczenie „Sprawdź stan” przy składniku i baner na ekranie startowym z przyciskiem „Korekta stanu”.
- **Walidacja** przy polu w momencie zapisu.

---

## 10. Teksty i formaty

Teksty krótkie, po polsku, standardowe pojęcia, tryb rozkazujący na przyciskach.

- Liczby: przecinek dziesiętny, spacja nierozdzielająca w tysiącach: 1 155 kg.
- Masy: do 10 kg z dwoma miejscami po przecinku na ekranie „Mieszam” (2,48 kg), w pozostałych miejscach do 10 kg z jednym (3,7 kg), powyżej bez (1 155 kg).
- Kwoty: „120,28 zł”, „1,20 zł/kg”.
- Daty: w nagłówku „niedziela, 22 listopada”, na listach „22.11”, poza bieżącym rokiem „22.11.2025”.
- Wiek: „1 rok 10 mies.”, „2 lata 3 mies.”, „5 mies.”.
- Odmiana liczebników przez `Intl.PluralRules('pl')`: 1 dzień, 2 dni; 1 kura, 2 kury, 5 kur.
- Formatowanie wyłącznie przez `Intl.NumberFormat('pl-PL')` i `Intl.DateTimeFormat('pl-PL')`.

**Słownik:** składnik, receptura, proporcje, partia (jedna zmieszana porcja), mieszanka (gotowa pasza z partii), magazyn, stan, zakup, korekta stanu, inne pobranie, prognoza zapasu, do uzupełnienia, rocznik, stado.

---

## 11. Dostępność i implementacja

**Dostępność**
- Kontrast tekstu co najmniej 4,5:1; kolor nigdy nie jest jedynym nośnikiem informacji (ikona + tekst przy ostrzeżeniach, „≈” przy prognozach).
- Prawdziwe `<button>`, `<a>`, `<input>` z `<label>`; przyciski z samą ikoną mają `aria-label`.
- Powiększony font do 130% nie ucina tekstu; `prefers-reduced-motion` wyłącza animacje.

**Implementacja**
1. `styles/tokens.css`: wartości z sekcji 3–5 jako zmienne nazwane jak w Material 3 (`--md-sys-color-primary` itd.). Żaden inny plik nie zawiera wartości hex.
2. `styles/components.css`: jedna klasa na komponent z sekcji 6.
3. `ui/`: funkcje JS dla powtarzalnych fragmentów (pole liczby z klawiaturą, snackbar z „Cofnij”, wzorzec korekty stanu, pasek prognozy).
4. `ui/format.js`: jedyne miejsce formatowania liczb, mas, kwot, dat, wieku i odmiany liczebników.
5. `ui/icons.js`: wybrane ikony Material Symbols jako SVG.
6. Bezpieczne marginesy (`env(safe-area-inset-bottom)`) pod paskiem nawigacji w trybie samodzielnym.

**Makiety:** płótno https://claude.ai/artifact/1tvnVZwrW34pL19bEUoXiD — obowiązuje styl widoku D (kolory, kształty, pasek, FAB, klawiatura). Treść makiet dotyczy wcześniejszego, szerszego zakresu (jaja, finanse) i nie jest wiążąca; ekrany powstają z tej specyfikacji.
