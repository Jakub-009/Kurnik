# Kurnik

Prywatna aplikacja na telefon: receptury paszy, mieszanie, magazyn składników i stado. Działa bez internetu. Dane są tylko w telefonie (w przeglądarce Chrome), repozytorium zawiera sam kod.

## Instalacja na telefonie

1. W repozytorium: **Settings → Pages → Deploy from a branch → main → /(root) → Save**.
2. Otwórz adres GitHub Pages w Chrome na telefonie.
3. Z menu Chrome wybierz **Dodaj do ekranu głównego** (albo **Zainstaluj aplikację**). Potem otwieraj Kurnik z ikony.

## Kopia danych

- **Zrób kopię:** Ustawienia → **Zrób kopię**. Plik `kurnik-kopia-RRRR-MM-DD.json` zapisz poza telefonem, np. na Dysku Google. Co 30 dni Kurnik o tym przypomni.
- **Przywróć:** Ustawienia → **Wczytaj kopię** → wybierz plik. Dane w Kurniku zostaną zastąpione danymi z pliku.
- **Nie wgrywaj plików kopii do tego repozytorium.** Jest publiczne. `.gitignore` chroni tylko przy pracy z gitem; przy wgrywaniu przez stronę GitHuba po prostu nie wybieraj tych plików.
- Wyczyszczenie danych Chrome albo odinstalowanie Kurnika kasuje dane z telefonu. Ratuje tylko kopia.

## Nowa wersja

1. Zrób kopię danych.
2. Wgraj zmienione pliki do repozytorium (te same ścieżki). Numer `VERSION` w `sw.js` musi być nowy.
3. Otwórz Kurnik z internetem. Gdy pojawi się „Jest nowa wersja”, zamknij Kurnik i otwórz go jeszcze raz. Dane zostają.

Testy obliczeń: `node --test tests/kurnik.test.js` (Node.js 20 lub nowszy). Szczegóły: katalog `specyfikacja/`.

Ikony: [Lucide](https://lucide.dev) (licencja ISC, `icons/LUCIDE-LICENSE`); worek, paleta i kura narysowane w tym samym stylu.
