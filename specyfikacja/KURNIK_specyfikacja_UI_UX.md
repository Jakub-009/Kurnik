# KURNIK — specyfikacja UI/UX

Wersja: 4.2 (stan aplikacji 1.6.0, tylko dla właściciela) · 23.11.2026
Dokument towarzyszący: `KURNIK_specyfikacja_funkcjonalna.md` (wersja 5.0)

---

## 1. Kierunek

Język Material 3 (Material You) ze stałą, własną paletą: kremowe tło, zieleń jako kolor główny, kolor żółtka dla ostrzeżeń. Kolory nie zmieniają się z tapetą telefonu.

- Z Material 3 bierzemy wzorce: pasek nawigacji, rozszerzony przycisk akcji (FAB), przyciski tonalne, chipy, karty, listy, snackbar, role kolorów, skalę typografii, kształty.
- Bez biblioteki Material Web Components (jest w trybie utrzymania); wygląd z własnych zmiennych CSS i prostych komponentów.
- Font systemowy (na Androidzie Roboto), bez pobierania.
- Tylko jasny motyw.

Wzorzec wizualny: widok D na płótnie makiet (sekcja 11). Ikony: Lucide (sekcja 6).

---

## 2. Zasady UX

1. **Prosto i bez funkcji dla funkcji.** Każdy element ekranu odpowiada na jedno z pytań ze specyfikacji funkcjonalnej.
2. **Używane w kurniku i przy mieszalniku:** jedna ręka, czasem rękawice. Elementy dotykowe co najmniej 48 px, główne akcje 56–64 px, ważne przyciski w dolnej połowie ekranu.
3. **Czytelność w słońcu:** jasny motyw, kontrast tekstu co najmniej 4,5:1.
4. **Prognoza nigdy nie udaje pomiaru:** zawsze „≈”.
5. **Bez okienek „Czy na pewno?”** przy zapisie i usuwaniu; zamiast nich snackbar z „Cofnij”. Wyjątki: porzucenie niezapisanego formularza, import kopii, zapis partii bez odhaczenia wszystkiego, pytanie o zakończenie poprzedniej partii.
6. **Rozsądne wartości domyślne:** dzisiejsza data, aktualna receptura, ostatnia cena, masa ostatniej partii, ostatni wybór „Zakup / Własny” dla składnika.
10. **Jedna główna akcja na ekranie:** pełny zielony przycisk w formularzu albo FAB na ekranie listy. Akcje drugorzędne: przyciski tonalne. Akcje poboczne: sam tekst (z ikoną).
7. **Jeden ekran, jedno zadanie.** Formularze na pełnym ekranie, bez paska nawigacji.
8. **Natychmiastowe działanie:** wszystko z pamięci telefonu, bez wskaźników ładowania.
9. **Koszty tylko wtedy, gdy są ceny.** Bez cen ekran nie pokazuje pustych pól kosztów ani „0 zł”.

---

## 3. Kolory

Stała paleta opisana rolami Material 3. W kodzie tylko nazwy ról. Wszystkie pary tekstu z tłem mają kontrast co najmniej 5,4:1; obramowania 4,2:1.

| Rola | Wartość | Tekst na niej | Użycie |
| --- | --- | --- | --- |
| primary | #2E6B36 | #FFFFFF | główny przycisk formularza, wyróżnione liczby, aktywne pole |
| primaryContainer | #B2F2B0 | #00210A | FAB |
| secondaryContainer | #D5E8CF | #101F0F | przyciski tonalne, wybrane chipy, wskaźnik w pasku nawigacji, kółka ikon |
| secondary | #52634F | #FFFFFF | ikony drugorzędne |
| tertiaryContainer | #FFDEA6 | #261900 | przypomnienie o kopii |
| tertiary | #7A5900 | #FFFFFF | tekst i ikony ostrzeżeń („Kończy się”, „Sprawdź stan”), pasek i liczba prognozy poniżej progu |
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
| Display Small | 36 / 44 px | 400, kolor primary | główna liczba na karcie (np. ≈ 63 kg · ≈ 17 dni); nigdy czarna ani pogrubiona |
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
| Pozycja listy | 56 px (jedna linia), 64–72 px (dwie linie) |
| Cienie | tylko FAB i snackbar: 0 2px 6px rgba(0,0,0,.18), 0 1px 2px rgba(0,0,0,.12) |

---

## 6. Komponenty

| Komponent | Wygląd i zachowanie | Gdzie |
| --- | --- | --- |
| Górny pasek | tytuł + opcjonalny podtytuł; po prawej ikona ustawień; w formularzach po lewej „Zamknij” (×), w szczegółach „Wróć” (←). Tytuł dostaje fokus po zmianie ekranu, bez widocznego obrysu | każdy ekran |
| Pasek nawigacji | 4 zakładki z ikoną i etykietą, wskaźnik secondaryContainer | ekrany główne |
| FAB rozszerzony | primaryContainer, ikona i etykieta, jeden na ekran | Pasza: „Mieszam”; Magazyn: „Dodaj”; Stado: „Dodaj rocznik”. Start bez FAB |
| Przycisk wypełniony | primary, pełna szerokość, 56 px, jeden na ekran | zapis formularza |
| Przycisk tonalny | secondaryContainer, 48 px | akcje drugorzędne: „Zakończ i mieszaj nową”, „Mieszam” i „Edytuj” w recepturze, „Dodaj” i „Korekta stanu” w składniku, „Zmień liczbę”, „Zrób kopię” |
| Przycisk tekstowy | tekst w kolorze primary, opcjonalnie z ikoną, 48 px | akcje poboczne: „Zakończ partię”, „Dodaj składnik”, „Dodaj recepturę”, „Edytuj”, „Zmień”, „Cofnij” |
| Przełącznik wyboru | 2 przyciski obok siebie w jednej ramce, wybrany secondaryContainer + ✓ (pod spodem pola radio) | Zakup / Własny, Kury / Koguty, Zakup / Wyklucie, Ubyło / Przybyło, rodzaj składnika |
| Chip wyboru | obramowanie outline; wybrany: secondaryContainer + ✓ | masa (50 kg / 100 kg / Inna), receptura, podpowiedzi uwagi |
| Pole liczby | duża liczba w polu na pełną szerokość, jednostka po prawej, klawiatura numeryczna telefonu (`inputmode`) | ilości, masy, stany, liczba ptaków |
| Pole tekstowe | etykieta nad polem, błąd pod spodem | nazwy, ceny, uwagi |
| Wiersz wartości | etykieta, wartość i „Zmień” w jednej linii 48 px | data |
| Karta | tło surfaceContainerLow, 16 px, bez cienia | podsumowania |
| Karta Start | tytuł, duża liczba (Display Small, primary), jedna linijka podpisu; cała karta klikalna | ekran Start |
| Pozycja listy | tekst główny + pomocniczy, wartość po prawej; cała klikalna. Ikona w kółku tylko przy recepturach, partiach i rocznikach; **składniki bez ikon** | listy |
| Lista do odważenia | pozycja 56 px z polem do odhaczenia, dodatki z oznaczeniem „Dodatek”; odhaczona przekreślona; ilość dużą czcionką i ołówek | ekran „Mieszam” |
| Pasek prognozy | „≈ N dni” i „skończy się ok. …”, pasek 7 px; poniżej progu kolor tertiary i ikona ostrzeżenia | magazyn |
| Wykres zużycia | słupki SVG w kolorze primary, wartości i podpisy (miesiąc i rok) w onSurfaceVariant, bez biblioteki | ekran Pasza, od 3 zakończonych partii |
| Baner | tertiaryContainer, ikona ostrzeżenia, tytuł, opis, przycisk | przypomnienie o kopii |
| Snackbar | inverseSurface, tekst + „Cofnij”, 5 s | po zapisie, edycji i usunięciu |
| Okno dialogowe | tytuł, jedno zdanie, dwa przyciski | porzucenie zmian, import kopii, mieszanie |
| Stan pusty | jedno zdanie (+ przycisk, gdy na ekranie nie ma FAB) | listy bez danych |

**Ikony: Lucide** (lucide.dev, licencja ISC, plik `icons/LUCIDE-LICENSE`), wklejone jako SVG w `ui/icons.js`: 24 × 24, bez wypełnienia, linia 2, zaokrąglone końce i łączenia. Użyte: `house`, `settings`, `pencil`, `plus`, `arrow-left`, `x`, `chevron-right`, `triangle-alert`, `check`, `download`, `share-2`, `grip-vertical`, `scroll-text`, `trash-2`. Trzy ikony narysowane w tym samym stylu: **worek** (Pasza), **paleta z workami** (Magazyn), **kura** z profilu (Stado).

---

## 7. Nawigacja i ekrany

Pasek nawigacji: **Start, Pasza, Magazyn, Stado.** Ustawienia pod ikoną w górnym pasku.

| Ekran | Zawartość |
| --- | --- |
| Start | sekcja 8 |
| Pasza | karta „Pasza w użyciu” (receptura, masa, „≈ kg · ≈ dni”, daty, „Zakończ i mieszaj nową”, „Zakończ partię”); na ile starcza 100 kg; wykres zużycia; receptury (masa „49,5 kg”, aktualna oznaczona); partie; FAB „Mieszam” |
| Receptura | masa, składniki z % i ilością na 100 kg, dodatki z dawką na 100 kg; koszt (jeśli są ceny); „Mieszam”, „Edytuj”, „Zmień kolejność”, „Ustaw jako aktualną” |
| Edycja receptury | nazwa, pozycje (składnik, ilość), „Dodaj pozycję”, „Nowy składnik”, uwagi |
| Mieszam | receptura; masa 50 kg / 100 kg / Inna; lista do odważenia ze składnikami i dodatkami; daty; „Zapisz partię”. Ekran nie gaśnie |
| Partia | masa i dodatki, daty (z ostatnim dniem karmienia), pozostałość, wyniki, skład, koszt |
| Zakończ partię | ostatni dzień karmienia (domyślnie dziś), pozostałość, podgląd wyników |
| Magazyn | karta „Wpisz stany” przy pierwszym uruchomieniu; składniki ze stanem i paskiem prognozy, od najkrótszej prognozy; FAB „Dodaj” |
| Składnik | „Powinno być”, prognoza, ostatnia cena; „Dodaj”, „Korekta stanu”, „Inne pobranie”, „Edytuj”; „Ile dokupić”; historia |
| Dodaj do magazynu | składnik, Zakup / Własny, ilość, cena (tylko zakup), data, uwagi |
| Korekta stanu | „Powinno być”, pole „Ile jest naprawdę”, różnica przed zapisem |
| Stado | karta „Razem” (liczba ptaków, kury, koguty, pisklęta); sekcja „Klucie i pisklęta”, gdy coś jest; roczniki; tekst „Wstaw jaja albo dodaj pisklęta”; FAB „Dodaj rocznik” |
| Rocznik | liczba, kury i koguty, data, wiek, oznaczenie, z klucia (jaja, wyklute, przeniesienie), historia zmian; „Zmień liczbę”, „Edytuj” |
| Dodaj rocznik | nazwa, kury i koguty (dwa pola obok siebie), Zakup / Wyklucie, data, wiek przy zakupie, oznaczenie |
| Klucie albo pisklęta | Inkubator / Kwoka / Kupione pisklęta, nazwa, data wstawienia, jaja, niezalężone, zamarłe (albo data zakupu, wiek, liczba piskląt) |
| Klucie | „Mogą się już kluć” albo „za ≈ N dni”, dzień z 21, liczby jaj; „Wpisz wyklute”, „Edytuj” |
| Pisklęta | liczba, wiek w tygodniach, pasza (kupna albo Twoja mieszanka od …), wylęgowość; „Przechodzą na moją mieszankę”, „Przeniesiono do stada”, „Zmień liczbę”, „Edytuj” |
| Zmień liczbę | Ubyło / Przybyło, Kury / Koguty (przy pisklętach bez wyboru), ile sztuk, data, uwaga z podpowiedziami |
| Ustawienia | próg ostrzeżenia, zużycie domyślne, cena gotowej paszy, kopia danych, numer wersji |

---

## 8. Ekran startowy

Start pokazuje „co dalej”, czyli to, czego nie widać razem na innych ekranach. Nie powiela Paszy.

1. **Następne mieszanie:** „za ≈ 5 dni”, podpis: „Mieszanka skończy się ok. 28.11 · zostało ok. 19,4 kg”. Pod spodem sprawdzenie magazynu na kolejną partię tej samej masy: „Na następną partię (50 kg) masz wszystko.” albo „…brakuje: Śruta sojowa 6 kg.” Bez partii: „Brak mieszanki w użyciu” i przycisk „Mieszam”.
2. **Kończy się najszybciej:** 3 składniki z najkrótszą prognozą („≈ N dni”); poniżej progu w kolorze tertiary z ikoną i podpowiedzią „dokup ok. X na 2 miesiące”. Każdy prowadzi do składnika. Bez wpisanych stanów: „Wpisz stany”.
3. **Stado i zużycie:** liczba ptaków, kur i kogutów, „ok. 120 g na ptaka dziennie, razem 3,6 kg”, skąd ta wartość (z partii albo z Ustawień), koszt paszy na miesiąc przy wpisanych cenach. Bez stada: zachęta do wpisania stada i „Dodaj rocznik”.
4. Karta klucia albo piskląt (nad kartą stada), gdy są: „za ≈ 4 dni” / „Mogą się już kluć” albo liczba piskląt, wiek i pasza.
5. Przypomnienie o kopii (po 30 dniach) z „Zrób kopię”.

Karta „Pasza w użyciu” na ekranie Pasza mówi wprost: „Zostało ok. 19,4 kg”, „Starczy do ok. 28.11 · ≈ 5 dni”, dzień karmienia i podstawę wyliczenia („Liczone: 30 × 120 g = 3,6 kg dziennie · Wartość z Ustawień”).

---

## 9. Wzorce interakcji

- **Zapis** zamyka formularz i pokazuje snackbar „Zapisano · Cofnij” na 5 s.
- **Edycja:** dotknięcie pozycji otwiera ten sam formularz z danymi. **Usuwanie:** „Usuń” w formularzu edycji, potem snackbar z „Cofnij”.
- **Przycisk wstecz Androida** zamyka formularz; przy niezapisanych zmianach pyta „Odrzucić zmiany?”.
- **Liczby:** pole z klawiaturą numeryczną telefonu; przecinek i kropka działają tak samo.
- **Korekta stanu:** „Powinno być”, pole „Ile jest naprawdę”, podgląd różnicy, „Zapisz”.
- **Mieszanie:** odhaczanie jest tylko pomocą. „Zapisz partię” działa bez odhaczenia wszystkiego; wtedy jedno pytanie „Nie wszystko jest odhaczone. Zapisać partię?”.
- **Zakończ i mieszaj nową:** jedno dotknięcie kończy partię i otwiera „Mieszam”; snackbar z „Cofnij”.
- **Ujemny stan składnika:** oznaczenie „Sprawdź stan” przy składniku.
- **Walidacja** przy polu w momencie zapisu.

---

## 10. Teksty i formaty

Wszystkie teksty są w `ui/texts.js`. Zasady:

- krótko i zwyczajnie, jak mówi się w gospodarstwie; tryb rozkazujący na przyciskach;
- w komunikacie najpierw co się stało, potem co zrobić; jedno, najwyżej dwa krótkie zdania;
- bez słów: „bazowy”, „wyliczony”, „powiązany”, „niespójny”, „dopuszczalny zakres”, „JSON”, „podawanie”, „szacunek uwzględnia”;
- ta sama rzecz zawsze tak samo nazwana (słownik niżej).

- Liczby: przecinek dziesiętny, spacja nierozdzielająca w tysiącach: 1 155 kg.
- Masy: na ekranie „Mieszam” zaokrąglone do 100 g (poniżej 5 kg do 50 g); masa receptury do dwóch miejsc bez zbędnych zer („49,5 kg”); stany magazynu do trzech miejsc.
- Kwoty: „120,28 zł”, „1,20 zł/kg”.
- Daty: w nagłówku „niedziela, 22 listopada”, na listach „22.11”, poza bieżącym rokiem „22.11.2025”.
- Wiek: „1 rok 10 mies.”, „2 lata 3 mies.”, „5 mies.”.
- Odmiana liczebników przez `Intl.PluralRules('pl')`: 1 dzień, 2 dni; 1 kura, 2 kury, 5 kur.
- Formatowanie wyłącznie przez `Intl.NumberFormat('pl-PL')` i `Intl.DateTimeFormat('pl-PL')`.

**Słownik:** składnik, dodatek (poza masą), receptura, proporcje, partia (jedna zmieszana porcja), mieszanka (pasza z partii), masa mieszanki (bez dodatków), karmienie, magazyn, zakup, własny, korekta stanu, inne pobranie, „Powinno być”, „Kończy się”, „Ile dokupić”, rocznik, stado, „Zmień liczbę”, kopia danych.

---

## 11. Dostępność i implementacja

**Dostępność**
- Kontrast tekstu co najmniej 4,5:1; kolor nigdy nie jest jedynym nośnikiem informacji (ikona + tekst przy ostrzeżeniach, „≈” przy prognozach).
- Prawdziwe `<button>`, `<a>`, `<input>` z `<label>`; przyciski z samą ikoną mają `aria-label`.
- Powiększony font do 130% nie ucina tekstu; `prefers-reduced-motion` wyłącza animacje.

**Implementacja**
1. `styles/tokens.css`: wartości z sekcji 3–5 jako zmienne nazwane jak w Material 3 (`--md-sys-color-primary` itd.). Żaden inny plik nie zawiera wartości hex.
2. `styles/components.css`: jedna klasa na komponent z sekcji 6.
3. `ui/components.js`: funkcje JS dla powtarzalnych fragmentów (pole liczby, przełącznik wyboru, karta Start, pasek prognozy, baner).
4. `ui/format.js`: jedyne miejsce formatowania liczb, mas, kwot, dat, wieku i odmiany liczebników.
5. `ui/icons.js`: ikony Lucide i trzy narysowane w ich stylu.
6. `ui/texts.js`: wszystkie teksty.
7. Bezpieczne marginesy (`env(safe-area-inset-bottom)`) pod paskiem nawigacji w trybie samodzielnym.

**Makiety:** płótno https://claude.ai/artifact/1tvnVZwrW34pL19bEUoXiD — obowiązuje styl widoku D (kolory, kształty, pasek, FAB, klawiatura). Treść makiet dotyczy wcześniejszego, szerszego zakresu (jaja, finanse) i nie jest wiążąca; ekrany powstają z tej specyfikacji.
