import 'dotenv/config';

function readPort(value, fallback) {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : fallback;
}

export const config = Object.freeze({
  nodeEnv: process.env.NODE_ENV || 'development',
  serverPort: readPort(process.env.PORT, 3000),
  previewPort: readPort(process.env.PREVIEW_PORT, 4173),
  publicSiteUrl: process.env.PUBLIC_SITE_URL || 'https://eb-athletic.com',
  adminEmail: (process.env.ADMIN_EMAIL || process.env.ADMIN_NOTIFICATION_EMAIL || 'eyad.bassem98@hotmail.com').trim().toLowerCase(),
  resendApiKey: process.env.RESEND_API_KEY || '',
  resendFromEmail: process.env.RESEND_FROM_EMAIL || '',
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || '',
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || '',
  twilioWhatsAppFrom: process.env.TWILIO_WHATSAPP_FROM || '',
  authOtpDevMode: process.env.AUTH_OTP_DEV_MODE === 'true',
  adminNewPassword: process.env.ADMIN_NEW_PASSWORD || '',
});
