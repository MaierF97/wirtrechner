# Wirtwerk – Tischabrechnung

Eine mobiloptimierte Webanwendung für den Restaurantservice. Sie läuft ohne Backend und speichert Speisekarte, Tischanzahl, offene Bons und Zahlungen lokal im Browser.

## Starten

`index.html` kann direkt im Browser geöffnet werden. Für Installation als iPhone-Web-App und Offline-App-Cache muss die Anwendung über HTTPS laufen. Das Repository enthält einen GitHub-Actions-Workflow, der die statische App bei jedem Push nach `main` auf GitHub Pages veröffentlicht.

1. Repository-Einstellungen auf GitHub öffnen und unter **Pages** als Quelle **GitHub Actions** auswählen.
2. Änderungen nach `main` pushen; den Veröffentlichungsstatus unter **Actions** prüfen.
3. Die von GitHub Pages angezeigte HTTPS-Adresse in Safari auf dem iPhone öffnen und **Teilen → Zum Home-Bildschirm** wählen.

## Bedienung

- **Tische:** Im oberen, grünen Bereich der Artikelkachel wird ein Artikel direkt gebucht. Der farbig markierte untere Bereich **Mit Notiz** öffnet den Kommentardialog; alternativ den oberen Bereich lange drücken. Der Kommentar bleibt am jeweiligen Bonposten sichtbar.
- **Abrechnen:** Für „Auswahl abrechnen“ eine Bonposition pro Tipp auswählen; die Auswahlzahl steht links neben dem Preis und ein Tipp auf das Minus verringert sie wieder. Die Angabe, wie viele Portionen offen sind, bleibt daneben erhalten. „Betrag teilen“ berechnet einen gleichen Anteil aus dem noch offenen Betrag.
- **Zahlung:** Ausschließlich Barzahlung. Ist der Rechner aktiviert, kann der gewünschte Kundenbetrag inklusive Trinkgeld sowie das tatsächlich erhaltene Bargeld eingegeben werden. Trinkgeld und Rückgeld werden separat berechnet und Trinkgeld wird separat gespeichert.
- **Storno:** Mit dem ×-Button am Bonposten kann nach Bestätigung jeweils eine noch offene Portion storniert werden.
- **Reset:** In den Einstellungen können alle offenen Tischposten und die heutigen Abrechnungen gelöscht werden. Das Passwort ist der heutige Wochentag; Speisekarte, Tischanzahl und Einstellungen bleiben bestehen. Da die App statisch und lokal läuft, ist das eine Bestätigung gegen versehentliche Bedienung und keine echte Zugriffssicherung.
- **Einstellungen:** Tischanzahl ändern, die Kategorie-Reihenfolge auf dem Bon per Pfeiltasten festlegen, Speisen und Getränke anlegen, bearbeiten oder löschen und den Wechselgeldrechner ein- oder ausschalten.

## Daten und Grenzen

Die Daten liegen ausschließlich im `localStorage` des jeweiligen Browsers und Geräts. Es gibt keine Benutzerkonten, Synchronisierung zwischen Geräten oder zentrale Datensicherung. Browserdaten löschen entfernt auch die gespeicherten Bons und Einstellungen. Für den produktiven Einsatz mit mehreren Bedienungen wäre ein gemeinsames Backend erforderlich.

Es sind zunächst keine Speisen oder Getränke angelegt. Lege alle Artikel zuerst unter **Einstellungen → Speisekarte** an.

Die App ist als einfache, backendfreie Basis gedacht und ersetzt kein zertifiziertes Kassensystem oder eine steuerliche / buchhalterische Lösung.
