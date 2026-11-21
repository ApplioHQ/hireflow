# atomEDU Classroom API

Accountless, short-lived classroom sessions for Orbit Room and Atom Lockdown Browser. Each room is one SQLite-backed Durable Object with hibernating WebSockets. Sessions expire and delete their stored state after 24 hours.

```bash
npm install
npm run types
npm run check
npm run dev
```

Deploy with `npm run deploy`. No secrets are stored in the repository. Teacher and student capabilities use cryptographically random bearer tokens returned only to the creating or joining browser.
