# Kurnik — specyfikacja funkcjonalna 1.5.0

## Dane i działanie

Kurnik to działająca offline aplikacja PWA do mieszania paszy, pilnowania zapasów i liczenia stada. Nie wymaga konta ani serwera danych. Dane są w IndexedDB. Nowy użytkownik dostaje przykładową recepturę i składniki bez stanów magazynowych. Zapis zmian umożliwia cofnięcie ostatniej operacji przez kilka sekund.

## Pasza i receptury

- Składnik ma nazwę, jednostkę kg albo l i rodzaj **Liczony w proporcjach** albo **Dodatek (poza masą)**. Przy litrach obowiązuje gęstość w kg/l.
- Receptura ma nazwę, składniki z ilościami, kolejność oraz opcjonalne uwagi. Jedna receptura jest aktualna. Kolejność zmienia się przeciągając wiersze na osobnym ekranie.
- Masa receptury i procenty obejmują składniki liczone w proporcjach. Dodatków może być kilka. Każdy dodatek ma ilość z receptury i dawkę na 100 kg, bez procentu.
- Mieszanie proponuje ostatnią zapisaną masę mieszanki bez dodatków. Bez historii proponuje 100 kg. Do wyboru są 50 kg, 100 kg i **Inna** w zakresie 1–2 000 kg. Pole przyjmuje przecinek lub kropkę.
- Wszystkie pozycje, w tym dodatki, są na tej samej liście w kolejności receptury. Każdą można odhaczyć i poprawić jej ilość. Zapis pamięta nazwy, ilości, jednostki, gęstości i ceny z chwili mieszania oraz tworzy ruchy zużycia w magazynie. Edycja partii przelicza jej ruchy.
- W nowych partiach zapisana masa obejmuje mieszankę bez dodatków. Dodatki pozostają w zapisanych pozycjach partii. Koszt partii i koszt na kilogram mieszanki uwzględniają dodatki. Brak cen nie oznacza ceny zerowej. Zakończone partie pokazują zużycie na dobę i, gdy jest historia stada, zużycie na ptaka.
- **Zakończ partię** pozwala wpisać ostatni dzień karmienia i pozostałość. W bazie koniec jest pierwszym dniem bez tej partii. **Zakończ i mieszaj nową** zapisuje ostatni dzień jako dziś i pozostałość 0 oraz otwiera mieszanie. Operację można cofnąć.
- Średnia dzienna jest liczona z maksymalnie trzech ostatnich zakończonych partii, z łącznego zużycia i sumy dni bez podwajania nakładających się okresów. Bez danych stosuje się wartość z ustawień. Przy kilku otwartych partiach prognoza przypisuje zużycie od najwcześniej rozpoczętej.
- Sekcja Pasza pokazuje wykres SVG po co najmniej trzech zakończonych partiach. Pokazuje maksymalnie 12 ostatnich, od najstarszej, z miesiącem i rokiem ostatniego karmienia.
- Podczas mieszania Kurnik prosi o blokadę wygaszania ekranu, gdy przeglądarka ją obsługuje. Zwalnia ją po zapisie, przy wyjściu i po przejściu w tło. Przywraca ją po powrocie do mieszania.

## Magazyn

- Stan to suma ruchów zapisanych w gramach. Magazyn obsługuje zakup, własny zapas, korektę stanu, inne pobranie i zużycie w partii. Historia otwiera szczegóły ruchu z edycją lub odsyłaczem do partii. Stan do wpisania różni się od zapisanego zera.
- Formularz **Dodaj do magazynu** ma wybór **Zakup** albo **Własny**. Cenę można wpisać tylko przy zakupie. Kurnik pamięta ostatni wybór osobno dla każdego składnika. Domyślny wybór bez historii to zakup. Ceny zakupu przyjmują kwotę za kg, za litr przy jednostce l lub za całość.
- Prognoza działa dla składnika z wpisanym stanem i dodatnią dawką w aktualnej recepturze. Dawka masowa to gramy składnika podzielone przez gramy mieszanki bez dodatków. Zużycie dzienne składnika to dawka razy dzienne zużycie mieszanki. Zapas do prognozy obejmuje stan oraz dawkę razy przewidywaną pozostałość mieszanki. Dni zapasu to zapas podzielony przez zużycie dzienne składnika. Ujemna prognoza pokazuje 0 dni. Datę wyczerpania liczy się od dziś.
- **Ile dokupić** używa tego samego dziennego zużycia i zapasu. Od potrzeb na 60 lub 90 dni odejmuje dostępny zapas. Wynik dodatni zaokrągla w górę do 1 kg lub 0,1 l. Wynik niedodatni oznacza, że zapas wystarczy.

## Stado

- Rocznik ma nazwę, kategorię Kury lub Koguty, początkową liczbę, datę zakupu lub wyklucia oraz opcjonalne oznaczenie. Dla zakupu można wpisać wiek w tygodniach. Przy nieznanym wieku w dniu zakupu aplikacja pokazuje wiek od zakupu z dopiskiem „co najmniej”.
- **Zmień liczbę** zapisuje liczbę, datę, kierunek Ubyło albo Przybyło i opcjonalną uwagę. Podpowiedzi wpisują gotowy tekst do pola uwagi. Historia pokazuje datę, podpisaną zmianę i uwagę.
- Stado pokazuje bieżącą liczbę kur, kogutów i ptaków razem. Lista roczników pokazuje nazwę, oznaczenie, liczbę i wiek.

## Start, kopie i ustawienia

- Start pokazuje trzy karty: pasza w użyciu, najbliższy prognozowany brak (w tym dodatki) i stado. Karta zapasów prowadzi do składnika. Karta paszy prowadzi do partii, a bez partii do mieszania. Karta stada prowadzi do roczników lub do utworzenia pierwszego.
- Ustawienia obejmują próg zapasu, dzienne zużycie bez historii, opcjonalną cenę gotowej paszy oraz eksport i import kopii. Po 30 dniach od ostatniej kopii lub pierwszego uruchomienia Start przypomina o kopii. **Zrób kopię** próbuje udostępnić plik i pobiera go przy braku obsługi. Import pokazuje potwierdzenie przed zastąpieniem danych.
- Teksty ekranów, przycisków, komunikatów i błędów pozostają w `ui/texts.js`. Obliczenia dziedzinowe są w `src/calc/`.

## Zgodność danych

IndexedDB przechodzi z wersji 1 na 2. Import przyjmuje kopie wersji 1–4. Migracja uzupełnia typ składnika, przełącza stary rodzaj daty początkowej na zakup bez wieku oraz uzupełnia puste uwagi ze starych powodów ubytku. Starsze korekty liczby są tylko do odczytu. Starsze zdarzenia bez wpływu na liczbę ptaków pomija się w historii i licznikach. Historyczne masy, pozostałości, ceny, daty i ruchy magazynowe pozostają zapisane w pierwotnej postaci. Stare partie zawierające osobno oznaczony olej kalkulacje odczytują z uwzględnieniem dawnego zapisu masy.
