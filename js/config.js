// API_URL: base URL of the Cloudflare Worker backend (handles auth, Stripe, KV storage).
// GOOGLE_CLIENT_ID: OAuth client ID for "Sign in with Google" / Google Drive import. Empty disables the feature.
// LINKEDIN_CLIENT_ID: OAuth client ID for LinkedIn profile import. Empty disables the feature.
// STRIPE_PUBLISHABLE_KEY: public (safe to expose client-side) Stripe key used to initialize Stripe.js for checkout.
window.HIREFLOW_CONFIG = {
  API_URL: "https://hireflow-api.pritamavuthu7.workers.dev",
  GOOGLE_CLIENT_ID: "", // <-- Paste your Google OAuth Client ID here to enable Google sign-in
  // Get one at https://console.cloud.google.com/apis/credentials
  // Authorized redirect URI: https://hireflow-api.pritamavuthu7.workers.dev/auth/gdrive/callback
  LINKEDIN_CLIENT_ID: "", // <-- Paste your LinkedIn OAuth Client ID here to enable LinkedIn import
  // Get one at https://www.linkedin.com/developers/
  // Authorized redirect URI: https://hireflow-api.pritamavuthu7.workers.dev/auth/linkedin/callback
  STRIPE_PUBLISHABLE_KEY: "pk_live_51TCVh0F3oOWBYU0sNfuAlLni8MHne1azk7hKYwKRWwF1KnsWkK9AbHCrNpVAZ2J9Un1tT6ITG6ZlIfSh4BvBIvuk00J5TqZ71R"
};
