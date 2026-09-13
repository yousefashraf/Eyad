# Eyad Wellness Site

This project is a multi-page health and wellness website built with HTML and CSS, powered by Vite for local development. Sign-in and registration are stored in a local SQLite database (`data/app.db`).

## Getting started

```bash
npm install
npm run dev
```

On Windows PowerShell, create your local environment file from the template:

```powershell
Copy-Item .env.example .env
```

On macOS or Linux:

```bash
cp .env.example .env
```

Edit `.env` with your provider keys, then start the app:

```bash
npm run dev
```

Then open the local URL shown in the terminal. Create an account on `auth-updated.html` — the API lives at `/api` on the same origin.

Registration and sign-in use the client's WhatsApp number and password.

## Environment variables

The server loads `.env` through `server/config.js`. Keep `.env` local; it is ignored by Git. Use `.env.example` as the complete template.

| Variable | Purpose |
| --- | --- |
| `PORT` | Vite development server port, default `3000` |
| `PREVIEW_PORT` | Production preview port, default `4173` |
| `PUBLIC_SITE_URL` | Public URL included in admin submission links |
| `ADMIN_EMAIL` | Admin account email and notification recipient |
| `RESEND_API_KEY` | Resend API key for submission email notifications |
| `RESEND_FROM_EMAIL` | Verified Resend sender, for example `Evolved & Balanced <notifications@example.com>` |
| `TWILIO_ACCOUNT_SID` | Twilio account SID for WhatsApp OTP delivery |
| `TWILIO_AUTH_TOKEN` | Twilio auth token |
| `TWILIO_WHATSAPP_FROM` | Twilio WhatsApp sender number |
| `AUTH_OTP_DEV_MODE` | Allows OTP codes to be returned in development when `true` |
| `ADMIN_NEW_PASSWORD` | Temporary password input for the reset command |

### Submission email notifications

To email the admin automatically whenever a client submits a form, configure Resend before starting the server:

```text
RESEND_API_KEY=re_your_api_key
RESEND_FROM_EMAIL=Evolved & Balanced <notifications@your-verified-domain.com>
ADMIN_EMAIL=eyad.bassem98@hotmail.com
PUBLIC_SITE_URL=https://eb-athletic.com
```

The `RESEND_FROM_EMAIL` domain must be verified in Resend. Without the Resend variables, submissions still save normally and only the email notification is skipped.

### Reset the admin password

Set `ADMIN_NEW_PASSWORD` in `.env`, then run:

```bash
npm run reset-admin-password
```

Remove the password from `.env` after the reset. Never commit `.env` or provider keys.

## Production build

```bash
npm run build
```

## Preview production build

```bash
npm run preview
```
