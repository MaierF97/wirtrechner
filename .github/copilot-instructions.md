# Wirtwerk development notes

- This is a dependency-free, static German-language web app. Keep the interface mobile-first and usable on iPhone.
- `app.js` contains the application logic; `styles.css` contains presentation; `index.html` is the entry point.
- Persistent data is stored locally in browser `localStorage`. Do not add a backend or third-party network dependency unless requested.
- For PWA installation and service-worker behavior, serve the static files over HTTPS (or localhost). Verify changes in both narrow mobile and desktop layouts.
- The project has no build step or automated test runner. Validate JavaScript changes and exercise table booking, partial/full settlement, and settings flows manually.
