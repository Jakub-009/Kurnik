# Kurnik

Kurnik to aplikacja do mieszania paszy, pilnowania zapasów i prowadzenia stada. Działa na telefonie także bez internetu. Dane są zapisane w przeglądarce. Kurnik używa ikon [Lucide](https://lucide.dev/), na licencji ISC opisanej w [icons/LUCIDE-LICENSE](icons/LUCIDE-LICENSE).

## Zainstaluj na telefonie

Otwórz adres aplikacji w Chrome na Androidzie. Z menu wybierz **Dodaj do ekranu głównego** lub **Zainstaluj aplikację**. Potem otwieraj Kurnik z ikony.

## Zrób lub przywróć kopię

W ustawieniach wybierz **Eksportuj kopię** i zachowaj plik poza przeglądarką. Przycisk **Zrób kopię** na ekranie Start pozwala przekazać plik z telefonu. Aby przywrócić dane, w ustawieniach wybierz **Importuj kopię**, wskaż plik i potwierdź zastąpienie obecnych wpisów.

## Wgraj nową wersję

Zrób kopię w używanej wersji. Podmień pliki w repozytorium GitHub Pages, zachowując katalogi. Po publikacji otwórz Kurnik z internetem, zamknij wszystkie jego okna i uruchom ponownie.

Aby wcześniej sprawdzić kopię, rozpakuj aplikację w osobnym katalogu i uruchom tam `python3 -m http.server 8000`. W osobnym profilu Chrome otwórz `http://localhost:8000` i zaimportuj kopię. Porównaj zapasy, daty i skład dawnych partii oraz liczebność roczników z wersją na telefonie.
