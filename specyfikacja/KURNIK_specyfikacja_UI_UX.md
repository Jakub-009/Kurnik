# Kurnik — specyfikacja UI/UX 1.5.0

## Układ i nawigacja

Aplikacja jest projektowana najpierw dla telefonu. Dolna nawigacja zawiera Start, Paszę, Magazyn i Stado. Ustawienia otwiera ikona koła zębatego. Ekran szczegółów ma powrót, formularz ma zamknięcie. Tytuł nowego ekranu otrzymuje fokus dla czytnika ekranu. Widoczny obrys fokusu dotyczy interaktywnych elementów obsługiwanych klawiaturą.

## Start

Trzy klikalne karty, w kolejności:

1. **Pasza w użyciu** pokazuje szacowaną masę i dni w stylu Display Small, w kolorze primary. Podpis podaje recepturę i dzień karmienia. Bez używanej partii karta zawiera krótki pusty stan i przycisk tonalny **Mieszam**.
2. **Najbliższy brak** pokazuje nazwę składnika i liczbę dni, pod spodem datę wyczerpania. Kliknięcie otwiera składnik.
3. **Stado** pokazuje liczbę ptaków, a pod spodem liczby kur i kogutów. Pusty stan kieruje do dodania pierwszego rocznika.

Pod kartami jest tylko przypomnienie o kopii, kiedy jest potrzebne, z przyciskiem **Zrób kopię**. Start nie ma FAB-a, banera zapasów ani listy „Magazyn w skrócie”.

## Akcje i formularze

- Zielony pełny przycisk służy do zatwierdzenia formularza. Główne akcje ekranów list są na FAB-ach: **Mieszam**, **Dodaj**, **Dodaj rocznik**. Akcje drugorzędne są tonalne, poboczne tekstowe.
- **Dodaj składnik** i **Dodaj recepturę** są tekstowymi akcjami z ikoną plus. Na ekranie receptury **Mieszam** jest tonalny i stoi obok edycji. Na karcie paszy w zakładce Pasza zostają **Zakończ i mieszaj nową** oraz **Zakończ partię**. Szczegóły partii są dostępne na liście.
- Na listach składników nie ma ikon przy wierszach. Zmianę kolejności wykonuje się w osobnym widoku, przeciągając za uchwyt. Klawiatura pozwala przestawiać wiersze strzałkami.
- Pola liczbowe używają natywnej klawiatury. Przy wyborze **Inna** pole masy pokazuje się pod chipami. Receptura ma tę samą dokładność masy w widoku listy i szczegółów. Lista mieszania ma wspólną informację o zaokrągleniu.
- Formularz rocznika ma jedną kolumnę, dwa przełączniki kategorii i daty, liczbę, opcjonalny wiek przy zakupie i oznaczenie. W formularzu zmiany liczby są dwa kierunki, data i uwaga z klikalnymi podpowiedziami.

## Pierwsze uruchomienie i prognozy

Bez wpisanego stanu Magazyn i karta Start wyświetlają jedną instrukcję z akcją **Wpisz stany** prowadzącą do pierwszego składnika bez stanu. Gdy część składników ma stany, pozostałe oznacza krótki podpis „Wpisz, ile masz”. Prognoza ma pasek 8 px i ikonę ostrzeżenia pod progiem. Stado bez roczników pokazuje „Dodaj pierwszy rocznik”.

## Ikony i teksty

Interfejs stosuje ikony Lucide, 24 × 24, bez wypełnienia, z obrysem 2 px w kolorze tekstu i zaokrąglonymi łączeniami. Pasza, Magazyn i Stado mają własne rysunki w tym stylu. Ikony są w `ui/icons.js`, a licencja w `icons/LUCIDE-LICENSE`.

Teksty interfejsu są w `ui/texts.js`. Używają zwykłych słów i spójnych nazw. Komunikat mówi krótko co się stało i co możesz zrobić. Dynamiczne liczby, daty i odmiany są formaturowane do języka polskiego.
