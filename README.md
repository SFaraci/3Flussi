# Planner 3 Flussi (GitHub Pages)

Web app leggera per pianificare le attività su tre flussi (Conservatorio, Tempo Reale, Libera Professione).  
Nessuna dipendenza da build: funziona con React CDN + Babel in-browser.

## Deploy su GitHub Pages

1. Crea un nuovo repository (pubblico o privato) su GitHub.
2. Aggiungi **questi file** alla root del repo:
   - `index.html`
   - `app.jsx`
   - `manifest.json`
   - `sw.js`
3. Commit & push.
4. Vai su **Settings → Pages** e scegli:
   - **Source**: *Deploy from a branch*
   - **Branch**: *main* (o quello che usi), cartella `/root`
5. Attendi la pubblicazione e apri l'URL fornito da GitHub Pages.

## Funzioni
- Pianificazione per colonne: Backlog · Oggi · In corso · Fatto
- Suggerimento giornaliero in base a quote per area e urgenza/priorità
- Salvataggio su `localStorage`
- Esporta/Importa JSON per spostare i dati tra dispositivi
- PWA installabile (con `manifest.json` e `sw.js`) per uso offline

## Note tecniche
- Per semplicità si usa **Babel Standalone** per trasformare JSX lato client.
- Se preferisci un build “serio” (Vite/Parcel), posso creare un setup con bundling e code-splitting.
- Service worker: caching basilare (offline-first) dei file principali.
