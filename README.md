# Wirtwerk – Tischabrechnung

Eine mobiloptimierte Webanwendung für den Restaurantservice. Sie läuft ohne Backend und speichert Speisekarte, Tischanzahl, offene Bons und Zahlungen lokal im Browser.

## Starten

`index.html` kann direkt im Browser geöffnet werden. Für Installation als iPhone-Web-App und Offline-App-Cache muss die Anwendung über HTTPS laufen. Das Repository enthält einen GitHub-Actions-Workflow, der die statische App bei jedem Push nach `main` auf GitHub Pages veröffentlicht.

1. Repository-Einstellungen auf GitHub öffnen und unter **Pages** als Quelle **GitHub Actions** auswählen.
2. Änderungen nach `main` pushen; den Veröffentlichungsstatus unter **Actions** prüfen.
3. Die von GitHub Pages angezeigte HTTPS-Adresse in Safari auf dem iPhone öffnen und **Teilen → Zum Home-Bildschirm** wählen.

## Bedienung

- **Tische:** Tisch öffnen, Artikel antippen und optional einen Kommentar wie „ohne Zwiebeln“ oder „mit stillem Wasser“ ergänzen. Der Kommentar bleibt am jeweiligen Bonposten sichtbar.
- **Abrechnen:** Alle offenen Posten, markierte Posten oder einen frei eingegebenen Teilbetrag abrechnen. „Betrag teilen“ berechnet einen gleichen Anteil aus dem noch offenen Betrag.
- **Zahlung:** Ausschließlich Barzahlung. Der optionale Wechselgeldrechner zeigt bei Eingabe des erhaltenen Betrags das Rückgeld an.
- **Einstellungen:** Tischanzahl ändern, Speisen und Getränke anlegen, bearbeiten oder löschen und den Wechselgeldrechner ein- oder ausschalten.

## Daten und Grenzen

Die Daten liegen ausschließlich im `localStorage` des jeweiligen Browsers und Geräts. Es gibt keine Benutzerkonten, Synchronisierung zwischen Geräten oder zentrale Datensicherung. Browserdaten löschen entfernt auch die gespeicherten Bons und Einstellungen. Für den produktiven Einsatz mit mehreren Bedienungen wäre ein gemeinsames Backend erforderlich.

Es sind zunächst keine Speisen oder Getränke angelegt. Lege alle Artikel zuerst unter **Einstellungen → Speisekarte** an.

Die App ist als einfache, backendfreie Basis gedacht und ersetzt kein zertifiziertes Kassensystem oder eine steuerliche / buchhalterische Lösung.
