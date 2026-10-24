# Hyper Team Library — preview

## Files
- `index.html`: welcome page and library UI
- `style.css`: responsive design using the Hyper Team palette
- `script.js`: Google Sheets loading, filters, and Telegram links
- `fonts/`: add the two font files here to use the local Montserrat font files

## Test locally
Open `index.html` in a browser. If the browser blocks CSV downloads from a `file://` URL, run a simple local static server (for example VS Code Live Server) or test on a GitHub Pages preview branch.

## Important Telegram behavior
The links use Telegram's share URL with a prefilled message. Telegram may show a recipient chooser; select `@HyperTeamITE_Bot` and press Send. A website cannot send a message as the user without user interaction.

## Google Sheets
The current published CSV URLs and GIDs are carried over from the existing site. The UI expects the existing headers `File Name`, `Size`, `Path`, and `Category`.

The provided workbook has `Source Type` in the `softwares` sheet but not in `courses`, and the values are currently blank. Until the team fills it, the request message falls back to the file name so the flow can still be tested. The bot should eventually use the agreed `Source Type` value as its lookup key.

## GitHub Pages
These files are static and can be published directly. No Node.js server or build step is required. To use the local font files, place `Montserrat-Regular.ttf` and `Montserrat-Bold.ttf` in `fonts/`.
