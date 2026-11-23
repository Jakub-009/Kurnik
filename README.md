# Kurnik PWA

Pasza, magazyn składników i roczniki stada. Aplikacja działa w Chrome także bez połączenia po pierwszym otwarciu z internetem. Wpisy są w lokalnej bazie IndexedDB. Do działania wystarczy hosting statyczny.

## Wdrożenie na GitHub Pages

1. Rozpakuj ZIP. Prześlij jego zawartość do katalogu głównego publicznego repozytorium, na gałąź `main`. Plik `index.html` powinien leżeć bezpośrednio w katalogu głównym. Zachowaj także `.nojekyll` i `.gitignore`. Jeżeli przesyłasz pliki z eksploratora, włącz widoczność ukrytych plików.
2. W repozytorium wybierz **Settings → Pages → Deploy from a branch → main → /(root) → Save**. Po wdrożeniu otwórz adres HTTPS wyświetlony przez GitHub Pages. [Instrukcja GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
3. W Chrome na Androidzie otwórz adres aplikacji, a następnie wybierz z menu **Dodaj do ekranu głównego** lub **Zainstaluj aplikację**. Po pierwszym uruchomieniu z internetem możesz otwierać Kurnik z ikony i pracować offline.

## Pierwsze użycie

- Aplikacja zaczyna z recepturą podstawową ze specyfikacji. W **Magazyn** otwórz składnik i użyj **Korekta stanu**, aby wpisać rzeczywisty zapas.
- W **Stado** dodaj roczniki z rzeczywistą obsadą. FAB „Dodaj” przyjmuje również własne i otrzymane zapasy. Ceny z ostatniego wycenionego zakupu służą do wyliczenia kosztu receptury. Zakup oleju można wycenić także za litr.
- W **Ustawienia → Eksportuj kopię** pobierzesz plik JSON ze wszystkimi danymi. Zachowaj go poza przeglądarką. Import zastępuje dane po potwierdzeniu. Kopii JSON nie umieszczaj w publicznym repozytorium.

## Test lokalny i aktualizacje

- Otwórz terminal w rozpakowanym katalogu. Uruchom `python3 -m http.server 8000` i otwórz [localhost:8000](http://localhost:8000). Uruchomienie przez dwuklik w plik HTML nie obsługuje modułów PWA.
- Uruchom `node --test` z Node.js 20 lub nowszym. Testy obejmują T1–T12, nakładanie się okresów, zapis składu partii i kopię danych.
- Przy każdym wydaniu zwiększ `VERSION` w `sw.js` i prześlij zaktualizowane pliki. Gdy aplikacja pobierze nową wersję, zamknij wszystkie jej okna i otwórz ją ponownie pod tym samym adresem. Dane pozostaną w IndexedDB.

## Szczegóły obliczeń

- Masy partii są zapisywane w pełnych gramach. Przy skalowaniu pojedyncze gramy rozdziela się według największych reszt, aby suma składników odpowiadała wybranej masie. Ekran mieszania podpowiada ilości dla 50 lub 100 kg. Zaokrągla wskazania do 100 g lub ml od 5 kg lub l oraz do 50 g lub ml poniżej tej wartości. Przy ilościach poniżej 50 g lub ml pokazuje drobniejsze wartości. Znak „≈” oznacza zaokrąglenie, a zapis partii zachowuje wyliczone ilości.
- Przy zazębiających się zakończonych partiach sumuje się zjedzoną masę i liczy wspólne dni tylko raz. Gdy kilka partii jest otwartych, prognoza przypisuje zużycie od najwcześniej rozpoczętej.
- Cena z zakupu zachowuje proporcję groszy do gramów, co pozwala liczyć ceny za litr i zakupy rozliczane łącznie bez wcześniejszego zaokrąglania ceny kilograma.
- Stado rejestruje roczniki i zdarzenia. Wprowadzony przewidywany start nieśności uruchamia przypomnienie o zmianie statusu. Rok nieśności pojawia się przy znanej dacie faktycznego startu.
