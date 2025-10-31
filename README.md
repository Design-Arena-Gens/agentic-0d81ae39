# InvoiceCraft – Privacy-First Invoice Generator

InvoiceCraft is a fully client-side invoicing workspace built with vanilla HTML, CSS, and JavaScript. It runs entirely in the browser, persists data locally, and never sends information to a server.

## Features

- Three-panel workspace with live invoice preview
- Client, product, and invoice management with local persistence (localStorage)
- Dynamic line items, discounts, taxes, and currency formatting
- Sequential invoice numbering, status tracking, and automated overdue detection
- Dashboard analytics with revenue chart (Chart.js)
- PDF download (jsPDF + html2canvas), print-ready layout, CSV/JSON exports
- Data portability: raw JSON export/import, optional AES-GCM encrypted export, shareable URL encoding
- Template gallery (Classic, Modern, Minimal, Bold), accent color and font selector
- Auto-save drafts, quick history reload, customizable footer and privacy statement

## Tech Stack

- HTML5, CSS3, vanilla JavaScript
- Chart.js, jsPDF, html2canvas via CDN
- LocalStorage for persistence, Web Crypto API for optional encryption

## Getting Started

1. Open `index.html` in any modern browser.
2. Complete company and client details, add line items, and customize the template.
3. Save invoices, export PDFs/CSV/JSON, or share encrypted backups.

## Development

No build tools are required. Edit `index.html`, `styles.css`, and `script.js` as needed. The project is deployable on any static host (e.g., Vercel, Netlify, GitHub Pages).

## Privacy

InvoiceCraft stores everything locally inside your browser (`localStorage`). Nothing leaves your device unless you export or share data yourself.

## License

MIT
