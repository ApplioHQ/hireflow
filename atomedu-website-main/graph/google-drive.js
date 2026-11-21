import { prepareGraphExport } from './share-export.js';

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink';

/** Request a short-lived token inside a user click. Tokens are never persisted. */
export function requestDriveAccessToken(google, clientId) {
  if (!google?.accounts?.oauth2 || typeof clientId !== 'string' || !clientId) {
    throw new Error('Google authorization is not ready. Open Share / export again.');
  }
  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      callback: response => {
        if (response?.error || typeof response?.access_token !== 'string' || !response.access_token
          || !google.accounts.oauth2.hasGrantedAllScopes(response, DRIVE_SCOPE)) {
          reject(new Error('Google Drive permission was not granted.'));
          return;
        }
        resolve(response.access_token);
      },
      error_callback: () => reject(new Error('Google authorization was closed or could not open.')),
    });
    client.requestAccessToken({ prompt: '' });
  });
}

/** Send only the chosen graph JSON directly from this browser to Google Drive. */
export async function uploadGraphToDrive(graph, accessToken, fetchImpl = fetch) {
  if (typeof accessToken !== 'string' || !accessToken) throw new TypeError('A Google access token is required.');
  const prepared = prepareGraphExport('google-drive', graph);
  const snapshot = JSON.parse(prepared.content);
  if (!snapshot.graph.expressions.length) throw new RangeError('Add a graph expression before exporting.');
  const boundary = `atom_${crypto.randomUUID().replace(/-/g, '')}`;
  const fileName = `atom-graph-${new Date().toISOString().slice(0, 10)}.json`;
  const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: fileName, mimeType: 'application/json' })}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${prepared.content}\r\n--${boundary}--`;
  const response = await fetchImpl(UPLOAD_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
    redirect: 'manual',
  });
  if (!response.ok) throw new Error(`Google Drive could not save this graph (HTTP ${response.status}).`);
  const result = await response.json();
  if (typeof result?.id !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(result.id)) {
    throw new Error('Google Drive did not confirm the saved file.');
  }
  return { id: result.id, url: `https://drive.google.com/file/d/${result.id}/view` };
}
