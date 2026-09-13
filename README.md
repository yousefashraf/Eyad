# Eyad Wellness Site

This project is a multi-page health and wellness website built with HTML and CSS, powered by Vite for local development. Sign-in and registration are stored in a local SQLite database (`data/app.db`).

## Getting started

```bash
npm install
npm run dev
```

Then open the local URL shown in the terminal. Create an account on `auth-updated.html` — the API lives at `/api` on the same origin.

Registration and sign-in use the client's WhatsApp number and password.

## Submission email notifications

To email Eyad automatically whenever a client submits a form, configure Resend before starting the server:

```text
RESEND_API_KEY=re_your_api_key
RESEND_FROM_EMAIL=Evolved & Balanced <notifications@your-verified-domain.com>
ADMIN_NOTIFICATION_EMAIL=eyad.bassem98@hotmail.com
PUBLIC_SITE_URL=https://eb-athletic.com
```

The `RESEND_FROM_EMAIL` domain must be verified in Resend. Without the Resend variables, submissions still save normally and only the email notification is skipped.

## Production build

```bash
npm run build
```

## Preview production build

```bash
npm run preview
```
