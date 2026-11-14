# Handschrift-Generator

Web-App (PWA), die getippten Text in **deine eigene Handschrift** umwandelt – sauber und digital, so als hättest du ihn mit einem Stift in GoodNotes geschrieben (kein Scan-/Papier-Effekt, keine Tintenflecken). Gedacht für das iPad (Safari → „Zum Home-Bildschirm“) mit Apple Pencil. Läuft komplett im Browser, kein Server, kein Backend.

**Live:** https://bennachtigall.github.io/handschrift-generator/

## Kurzanleitung für dich

1. Link oben in **Safari** auf dem iPad öffnen.
2. Teilen-Symbol → **„Zum Home-Bildschirm“**. Die App startet danach im Vollbild und funktioniert offline.
3. Tab **„Schablone“**: Zeichen für Zeichen mit dem Apple Pencil in die Felder schreiben (mindestens 3 Varianten pro Zeichen, 1 reicht schon zum Testen). Mit **„Weiter ›“** geht es zum nächsten Zeichen. Finger werden absichtlich ignoriert (Handballen).
4. **Backup machen:** oben auf deinen Profilnamen tippen → **„Backup exportieren (JSON)“** und die Datei sicher ablegen (z. B. iCloud Drive). Das solltest du nach dem Ausfüllen der Schablone sofort tun.
5. Tab **„Schreiben“**: Text über **„✎ Text“** eintippen/einfügen, links Regler und Papier einstellen, oben rechts **„Exportieren“**.

> Wichtig: Alle Daten liegen nur lokal auf dem Gerät (IndexedDB). Löschst du in Safari die Website-Daten oder die Home-Bildschirm-App, sind sie weg – dafür gibt es das Backup. Die App fordert dauerhaften Speicher an, das ersetzt das Backup aber nicht.

## Funktionen

**Schablone (Teil 1)**
- Schreibfelder mit Hilfslinien (Oberlänge, Mittellinie, Grundlinie, Unterlänge), das Zeichen steht daneben in Grau.
- Eingabe per Pointer Events mit Druck (Apple Pencil); Finger-Eingabe wird ignoriert.
- Zeichensatz: a–z, A–Z, ä ö ü Ä Ö Ü ß, 0–9 und `. , ; : ! ? - – " ' ( ) / & % € @ + =` sowie Leerzeichenbreite (waagerechten Strich in gewünschter Wortlücke ziehen).
- Mehrere Varianten pro Zeichen (ab 3 „fertig“, bis 6 möglich); beim Rendern wird zufällig gewählt, dieselbe Variante nie zweimal hintereinander.
- Optionale **Buchstabenpaare** (ch, ck, sch, tt, ll, ss, ei, ie, en, er, nn, mm, st, de, ge, un, an, in; eigene über „+“), die beim Schreiben bevorzugt werden.
- Pro Feld Rückgängig und „Neu schreiben“, pro Zeichen „Alle Varianten löschen“, Fortschrittsanzeige.
- Striche werden als **Vektordaten** (Punkte mit Druck) gespeichert.
- Breite/Bounding-Box je Zeichen werden automatisch bestimmt (Tinte beginnt bei x = 0, Abstände entstehen nur durch den Regler). Bei Zeichen, die auf der Linie sitzen, wird die Grundlinie automatisch geradegerückt, wenn du leicht darüber/darunter geschrieben hast (±0,45 x-Höhen).
- Mehrere Handschrift-Profile.

**Editor und Rendering (Teil 2)**
- Live-Vorschau als Canvas, A4 oder A5, Hoch-/Querformat; automatischer Zeilen- und Seitenumbruch an Wortgrenzen (sehr lange Wörter werden zeichenweise umbrochen), Absätze und Leerzeilen bleiben erhalten, beliebig viele Seiten.
- Noch nicht geschriebene Zeichen werden **rot gestrichelt markiert** (und oben aufgelistet), nicht weggelassen.
- Markierungen im Text: `**Text**` = unterstrichen (handgezogene, leicht wellige Linie), `==Text==` = Textmarker; Knöpfe setzen sie um die Auswahl.

**Regler (Teil 3)** – jeder mit Live-Vorschau und Zurücksetzen (↺): Buchstabenabstand (Standard eng, auch negativ), Wortabstand, Zeilenabstand, Schriftgröße (x-Höhe in mm), Unsauberkeit (Grundlinien-Wackeln, Rotation, Größenvariation, Verzerrung der Striche), Neigung, Ansteigen/Abfallen und „Wandern“ der Zeilen, Strichstärke, Druckvariation, Stiftfarbe (Auto/Blau/Schwarz/Rot/eigene), Textmarker-Farbe, vier Seitenränder, **Zufalls-Seed** mit „Neu würfeln“ (derselbe Seed ergibt immer dasselbe Ergebnis; der Zufall hängt am Zeichen-Index, sodass Änderungen am Textende den Anfang nicht verändern).

**Papier (Teil 4)** – Weiß, Liniert, Kariert, Punktraster, Collegeblock (mit Rand), Grundschul-Lineatur (4 Linien), Dunkel, eigenes Hintergrundbild. Auf Papier mit Linien/Karos sitzt die Schrift auf den Linien (Zeilenabstand = Anzahl übersprungener Linien); auf freiem Papier gilt ein Vielfaches der Schrifthöhe.

**Export (Teil 5)** – PDF (alle Seiten, echte Vektoren), PNG pro Seite in 300 dpi, jeweils mit oder ohne Papierhintergrund; über das Teilen-Menü des iPads (Web Share API), sonst als Download (mehrere PNGs dann als ZIP).

**GoodNotes-Export (Teil 6)** – siehe unten.

**Presets (Teil 7)** – alle Einstellungen als benannte Presets speichern/laden/löschen; die letzten Einstellungen (und der Text) werden beim Öffnen automatisch wiederhergestellt.

**Daten** – alles in IndexedDB; Backup/Import der kompletten Handschrift (Profile, Presets, Einstellungen) als JSON.

## GoodNotes-Export (inoffizielles Format)

Der Knopf „Als GoodNotes-Datei exportieren“ erzeugt eine `.goodnotes`-Datei (ZIP mit Protobuf-Journal), in der jeder Schriftstrich ein **echter Stift-Strich** ist (radieren, mit Lasso verschieben, umfärben). Textmarker werden zu echten Textmarker-Strichen. Das Papier liegt als PDF-Hintergrund darunter.

Was ich getan habe, und was **nicht** geprüft werden konnte:
- Aufbau, Feldnummern und die Geometrie-Kodierung sind aus der Dokumentation der Open-Source-Projekte nachgebaut und mit einer **echten Datei von dir** (`test.goodnotes`, GoodNotes-Schema 24) abgeglichen: gleiche Dateien im ZIP, gleiche Record-Reihenfolge im Ereignis-Journal, gleiche Felder je Strich, Papier-Größenfaktor 11/6 (PDF 455,04 × 588,45 pt ↔ 834,24 × 1078,825 Einheiten). Die erzeugte Datei lässt sich mit eigenem Decoder wieder korrekt einlesen.
- **Ich kann GoodNotes nicht selbst öffnen.** Ob dein GoodNotes die Datei importiert, kannst nur du auf dem iPad testen. Klappt es nicht oder schlägt der Export fehl, fällt die App automatisch auf **PDF** zurück (das lässt sich in GoodNotes immer importieren).
- Die Striche werden als **Kugelschreiber-Striche mit konstanter Breite pro Strich** (Mittelwert aus Druck/Strichstärke) geschrieben. Druckpressure-Stifte (Füller/Pinsel) haben zusätzliche, nicht vollständig dokumentierte Geometrie-Abschnitte; sie nachzubauen wäre ein Blindflug. Die Druckvariation siehst du daher im PDF/PNG, in GoodNotes aber nur als gleichmäßige Strichbreite pro Strich.
- Das Format ist inoffiziell und kann sich mit GoodNotes-Updates ändern.

### Quellen und Lizenzen
| Projekt | Lizenz | Verwendung |
|---|---|---|
| [wakeupnemo/inkterop](https://github.com/wakeupnemo/inkterop) (`docs/formats/goodnotes.md`) | MIT | Formatfakten (Container, Stroke-Felder, Geometrie-Signaturen, Events) – nur die Dokumentation gelesen |
| [Taylor-Nilsen/goodnotes-codec](https://github.com/Taylor-Nilsen/goodnotes-codec) (`docs/FORMAT.md`) | MIT | Formatfakten (Ballpoint-Signatur, Events, Papier/PDF-Skalierung) |
| [franzthiemann/goodparse](https://github.com/franzthiemann/goodparse) | **GPL-3.0** | Nur als Hintergrund genannt (die anderen Projekte beziehen sich darauf). **Kein Code und keine Dateien übernommen.** |
| [mBurmeisterL/Text-umwandler](https://github.com/mBurmeisterL/Text-umwandler) (PR #16) | **keine Lizenz** im Repository | Zur Orientierung gelesen. Ohne Lizenz darf Code nicht übernommen werden – **nichts davon kopiert**, der Writer ist eine eigene Neuimplementierung. |

Der gesamte Code dieses Projekts ist eigenständig geschrieben. Abhängigkeiten (alle MIT): `idb`, `pdf-lib`, `fflate`, `vite`, `vite-plugin-pwa`, `typescript`. Dieses Repository hat bewusst **keine Open-Source-Lizenz** (alle Rechte vorbehalten).

## Getroffene Entscheidungen

- **Einheiten:** Glyph-Koordinaten in „x-Höhen“ (Grundlinie → Mittellinie = 1), dadurch ist die Schriftgröße beliebig skalierbar. Schriftgröße-Regler = x-Höhe in mm.
- **Buchstabenabstand:** Standard 0,04 x-Höhen, Bereich −0,4 bis +1. Der Abstand ist der Abstand zwischen den Tintenkanten; Paar-Glyphen haben ihre natürliche Innenabstände.
- **Papierwahl passt Größe an:** Beim Wechseln des Papiers werden x-Höhe und Zeilenabstand auf einen passenden Wert gesetzt (z. B. Kariert 2,4 mm, Grundschule 3,5 mm); danach kannst du sie frei ändern.
- **Zufall:** Zufallswerte (Variante, Wackeln, Rotation, Größe) sind aus Seed + Zeichen-Index abgeleitet und damit reproduzierbar. Dieselbe Variante wird nie direkt wiederholt.
- **Fehlende Zeichen** werden mit rotem Kästchen und dem Zeichen markiert (abschaltbar; in Exporten ebenfalls sichtbar, solange die Option an ist).
- **Dunkles Papier:** Stiftfarbe „Auto“ wird automatisch weiß; wählst du eine eigene Farbe, bleibt sie.
- **Eigenes Hintergrundbild** wird auf max. 2200 px verkleinert und als JPEG im Preset/in den Einstellungen gespeichert.
- **Leerzeichen** werden durch das Ziehen eines Strichs in der Schablone gemessen (Standard 0,7 x-Höhen).
- **Repository:** öffentlich, aber nur du hast Schreibrechte (Standard bei GitHub: Fremde können forken, aber nichts in deinem Repo ändern). Issues/Wiki/Projekte sind abgeschaltet, `main` ist gegen Force-Push und Löschen geschützt. Deine Handschrift liegt **nie** im Repo, nur lokal auf deinem Gerät.
- **iCloud:** Das Projekt liegt in iCloud Drive; `node_modules` und `dist` sind deshalb als `*.nosync` mit Symlink angelegt, damit iCloud sie nicht synchronisiert.

## Lokal testen

```bash
npm install        # nur lokal im Projektordner
npm run dev        # Entwicklungsserver, http://localhost:5173
npm run build      # Typprüfung + Produktions-Build nach dist/
npm run preview    # gebaute App ausprobieren
```

Die Beispieldatei `referenz/test.goodnotes` (dein privates Dokument) ist über `.gitignore` ausgeschlossen und wird nicht veröffentlicht.

Deployment: Jeder Push auf `main` baut die App per GitHub Actions (`.github/workflows/deploy.yml`) und veröffentlicht sie auf GitHub Pages.

## Bekannte Grenzen / Ideen für später

- Der GoodNotes-Import ist wie beschrieben ungetestet auf einem echten Gerät.
- Kein Silbentrennen; Ligaturen nur über die Paar-Glyphen.
- Unterstreichen/Textmarker wirken auf ganze Textabschnitte innerhalb einer Zeile, nicht auf Teile von Paar-Glyphen.
- Die App ist auf dem Mac/Desktop nutzbar, aber zum Schreiben der Schablone ist ein Apple Pencil (oder eine Maus) nötig.
