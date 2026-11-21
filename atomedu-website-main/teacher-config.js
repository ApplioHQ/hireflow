window.ATOM_CLASSROOM_API = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
  ? 'http://127.0.0.1:8787'
  : 'https://atom-classroom-api.archimedes-api1.workers.dev';
