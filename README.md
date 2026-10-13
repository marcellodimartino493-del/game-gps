# GAME GPS – Version 0.3 (GTA First)

Eine funktionsfähige **Browser-Demo** einer Routenplaner-App: echte Straßen und echte GPS-Position, aber mit GTA-inspiriertem User Interface, kompakter Radar-Minimap und wechselbaren Minecraft-/Fortnite-Layouts. Alle Layouts sind **eigenständige, von Spielen inspirierte Designs** und enthalten keine originalen geschützten Spieldateien.

## Was neu ist

- GTA-inspirierter Startbildschirm (Standard) mit dunkler Vektorkarte und türkisfarbener Route
- Echte kleine **Radar-Minimap**, mit der Hauptkarte synchronisiert
- **3D-Modus** mit geneigter Karte und 3D-Gebäuden, soweit Geodaten verfügbar sind
- GPS-Ortung, Geschwindigkeitsanzeige **nur bei echten GPS-Geschwindigkeitsdaten** und GPS-Folgemodus
- Starthinweis / nächsten Schritt der Route im HUD (nur Vorschau; Abbiegeentfernungen sind Luftlinie)
- Suche nach Start und Ziel per Adressfeld (Nominatim), Koordinaten oder Klick auf die Karte
- Routen für Auto, Rad oder Fuß inklusive Entfernung, Dauer, ungefähre Ankunft und Abbiegeliste (FOSSGIS-OSRM)
- Alternativrouten, **falls** der Routingdienst welche zurückliefert
- Lokal gespeicherte letzte Ziele
- Routenlinks zum Teilen **nach Veröffentlichung auf einer öffentlichen HTTPS-Domain**
- Kartenstile wechseln ohne Routenverlust
- Für Smartphone und Desktop optimierte Oberfläche, Karte durch Menü-Button ein-/ausblenden
- Installierbares Web-App-Manifest für geeignete Browser

## Starten auf Windows

1. Die ZIP-Datei entpacken.
2. Im entpackten Ordner in die Adressleiste des Datei-Explorers `cmd` eingeben und Enter drücken.
3. `python -m http.server 8000` eingeben und Enter drücken (Python muss installiert sein).
4. Im Browser `http://localhost:8000` öffnen.
5. GPS nach Nachfrage freigeben. Alternativ Start und Ziel als Adresse eingeben.

Du kannst `index.html` für eine erste optische Ansicht direkt öffnen, aber GPS ist bei `file://` typischerweise nicht nutzbar. Für die echte App auf dem Handy alle Dateien auf einen **HTTPS-Webhost** (z. B. GitHub Pages oder Netlify) hochladen und anschließend im Browser »Zum Home-Bildschirm« auswählen.

## Benutzungsbeispiel

- Start: `Frankfurt Hauptbahnhof` | Ziel: `Römerberg Frankfurt` | Auto → **ROUTE FINDEN**
- Anschließend GTA-/Minecraft-/Fortnite-Modus umschalten, auf **3D** klicken oder die Minimap anschauen.
- **GPS-Folgemodus** zeigt deine Position auf einer vorberechneten Route. Es gibt noch **keine vollwertige, verkehrssichere Turn-by-Turn-Navigation**.

## Grenzen & Sicherheit

- Erfordert Internet und WebGL; MapLibre wird über CDN geladen. Keine Offline-Karten.
- Verkehrsstörungen, Echtzeit-Verkehrsdaten, Sprachansagen, automatische Umplanung, Routenabweichungswarnung und Hintergrundnavigation fehlen.
- GPS klappt nur mit Nutzerzustimmung, unter HTTPS oder auf localhost; Genauigkeit kann schwanken.
- Adresssuche überträgt Suchbegriffe an Nominatim, Routenabfragen übertragen Start/Ziel an FOSSGIS; OpenFreeMap empfängt Kartenkachelabfragen. Letzte Zielorte werden lokal im Browser gespeichert.
- Bei einer größeren öffentlichen App solltest du Nominatim-/OSRM-Demodienste gegen geeignete Hosting-Angebote bzw. eigene Server tauschen. Die öffentlichen Demo-Server liefern keine Verfügbarkeitserklärung für produktiven Einsatz und sind teils auf ca. 1 Anfrage pro Sekunde und App begrenzt. Kein clientseitiges Autocomplete implementiert.
- Bitte die App nicht während der Fahrt bedienen. Verkehrsregeln, Beschilderung und Straßensituation sind maßgeblich.

## Technischer Aufbau

- `index.html` – zugängliche Oberfläche / PWA-Metadaten
- `style.css` – responsiver GTA-HUD und zwei zusätzliche Designs
- `app.js` – Suche, Routing, GPS, Stile, Minimap, 3D und Browser-Speicherung
- `manifest.webmanifest`, `icon-192.png`, `icon-512.png` – Icons und Installierbarkeit

Es ist kein Build-/Node-Prozess nötig. Dateien bearbeitbar mit jedem Texteditor.

## Datenquellen, Lizenzen und Nutzungsbedingungen

- [MapLibre GL JS](https://maplibre.org/maplibre-gl-js/docs/) – BSD-3-Clause
- [OpenFreeMap](https://openfreemap.org/) – öffentliche Vektor-Kartenstile ohne API-Key; Pflichtattribution auf der Karte
- [OpenStreetMap](https://www.openstreetmap.org/copyright) – OpenStreetMap-Mitwirkende / ODbL
- [Nominatim](https://operations.osmfoundation.org/policies/nominatim/) – öffentliche Instanz, keine Live-Autocomplete-Anfragen
- [FOSSGIS-Routing](https://routing.openstreetmap.de/about.html) – OSRM-Demodienst

Version 0.3 ist ein Prototyp zum Ausprobieren, nicht für die produktive Fahrzeugnavigation zugelassen.
