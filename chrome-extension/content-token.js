// Runs on appliohq.com. Mirrors the signed-in auth token into extension storage
// so the popup can call the API on the user's behalf. Read-only: never writes
// to the page, never touches anything but the token.
(function () {
  try {
    var token = localStorage.getItem('hf_token');
    if (token) {
      chrome.storage.local.set({ hf_token: token, hf_token_at: Date.now() });
    }
  } catch (e) { /* localStorage may be blocked; ignore */ }
})();
