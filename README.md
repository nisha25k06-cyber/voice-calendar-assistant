# SaaS, React, mobile, and deployment

The repository now includes three clients and deployment manifests:

- `client/`: production-style React/Vite SaaS dashboard. Build output is written to `public/`.
- `mobile/`: Expo React Native client for Android, iOS, and web.
- `server.js`: shared Google Calendar + AI API.
- `vercel.json`, `render.yaml`, `firebase.json`: deployment starting points.

## React web app

```bash
npm install
cd client && npm install && npm run build
cd .. && npm start
```

For local frontend development, run the API in one terminal with `npm start`, then:

```bash
cd client
npm run dev
```

The React interface includes a SaaS-style workspace, calendar dashboard, assistant conversation, responsive mobile layout, and command suggestions.

## Mobile app

```bash
cd mobile
npm install
npx expo start
```

Set the API URL for a physical device:

```bash
EXPO_PUBLIC_API_URL=https://your-api.example.com npx expo start
```

The mobile client uses Expo Speech for spoken responses. Production mobile authentication should use a secure deep-link OAuth flow; the starter currently opens the web OAuth endpoint.

## Deployment

### Render

Connect the repository and use `render.yaml`, or configure:

- Build: `npm install && cd client && npm install && npm run build`
- Start: `npm start`

Set Google OAuth, AI, and `GOOGLE_REDIRECT_URI` environment variables. Add your production callback URL to Google Cloud Console.

### Vercel

The included `vercel.json` and `api/index.js` provide a starting point. Vercel functions are stateless, so replace the local `tokens.json` store and in-memory follow-up sessions with a managed database before production use.

### Firebase

Run `firebase login`, set the project in `.firebaserc`, then deploy hosting/functions. Add the same environment variables using your Firebase Functions configuration/secrets.

## Production checklist

Before calling this a production SaaS deployment:

- Add a database-backed encrypted token/session store.
- Add user accounts, tenant isolation, billing, rate limits, audit logs, CSRF protection, and structured logging.
- Use HTTPS and production OAuth redirect URIs.
- Add tests, monitoring, backups, and CI/CD.
