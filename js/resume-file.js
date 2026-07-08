/* resume-file.js — extract plain text from an uploaded resume file.
   Supports .txt/.md natively; lazy-loads pdf.js for .pdf and mammoth for .docx
   only when the user actually uploads that type (keeps the page light).
   Exposes: window.extractResumeText(file) -> Promise<string>
            window.initResumeDrop({ zone, input, onExtract, onStatus }) */
(function () {
  var PDFJS_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  var PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  var MAMMOTH_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js';

  var _loaded = {};
  function loadScript(src) {
    if (_loaded[src]) return _loaded[src];
    _loaded[src] = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('Could not load parser. Check your connection and try again.')); };
      document.head.appendChild(s);
    });
    return _loaded[src];
  }

  function readAsText(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result || '')); };
      r.onerror = function () { reject(new Error('Could not read that file.')); };
      r.readAsText(file);
    });
  }
  function readAsArrayBuffer(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = function () { reject(new Error('Could not read that file.')); };
      r.readAsArrayBuffer(file);
    });
  }

  async function extractPdf(file) {
    await loadScript(PDFJS_SRC);
    var pdfjsLib = window.pdfjsLib;
    if (!pdfjsLib) throw new Error('PDF reader failed to load.');
    try { pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER; } catch (e) {}
    var buf = await readAsArrayBuffer(file);
    var pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    var out = [];
    for (var p = 1; p <= pdf.numPages; p++) {
      var page = await pdf.getPage(p);
      var content = await page.getTextContent();
      // Rebuild lines using item positions so bullets/sections stay readable.
      var lines = {}, order = [];
      content.items.forEach(function (it) {
        var y = Math.round(it.transform[5]);
        if (!(y in lines)) { lines[y] = []; order.push(y); }
        lines[y].push(it.str);
      });
      order.sort(function (a, b) { return b - a; });
      out.push(order.map(function (y) { return lines[y].join(' ').replace(/\s+/g, ' ').trim(); }).join('\n'));
    }
    return out.join('\n\n').trim();
  }

  async function extractDocx(file) {
    await loadScript(MAMMOTH_SRC);
    if (!window.mammoth) throw new Error('DOCX reader failed to load.');
    var buf = await readAsArrayBuffer(file);
    var res = await window.mammoth.extractRawText({ arrayBuffer: buf });
    return String((res && res.value) || '').trim();
  }

  window.extractResumeText = async function (file) {
    if (!file) throw new Error('No file selected.');
    if (file.size > 10 * 1024 * 1024) throw new Error('That file is too large (max 10 MB).');
    var name = (file.name || '').toLowerCase();
    var ext = name.slice(name.lastIndexOf('.') + 1);
    if (ext === 'pdf' || file.type === 'application/pdf') return (await extractPdf(file));
    if (ext === 'docx' || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return (await extractDocx(file));
    if (ext === 'doc') throw new Error('Old .doc files aren\'t supported. Save as PDF or .docx and try again.');
    if (ext === 'txt' || ext === 'md' || ext === 'rtf' || (file.type || '').indexOf('text') === 0) return (await readAsText(file));
    // Last resort: try reading as text.
    return (await readAsText(file));
  };

  // Wire a drop zone + hidden file input to an onExtract(text) callback.
  window.initResumeDrop = function (opts) {
    var zone = opts.zone, input = opts.input;
    var onExtract = opts.onExtract || function () {};
    var onStatus = opts.onStatus || function () {};
    if (!zone || !input) return;

    async function handle(file) {
      if (!file) return;
      onStatus('Reading ' + (file.name || 'file') + '…', false);
      try {
        var text = await window.extractResumeText(file);
        if (!text || text.replace(/\s/g, '').length < 20) {
          onStatus('We couldn\'t find readable text in that file. If it\'s a scanned image, paste the text instead.', true);
          return;
        }
        onExtract(text, file);
        onStatus('Loaded ' + (file.name || 'file') + ' ✓', false);
      } catch (e) {
        onStatus(e.message || 'Could not read that file.', true);
      }
    }

    zone.addEventListener('click', function (e) {
      if (e.target.closest('textarea, a, button:not(.rf-pick)')) return;
      input.click();
    });
    input.addEventListener('change', function () { if (input.files && input.files[0]) handle(input.files[0]); input.value = ''; });

    ['dragenter', 'dragover'].forEach(function (ev) {
      zone.addEventListener(ev, function (e) { e.preventDefault(); e.stopPropagation(); zone.classList.add('rf-dragover'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      zone.addEventListener(ev, function (e) { e.preventDefault(); e.stopPropagation(); zone.classList.remove('rf-dragover'); });
    });
    zone.addEventListener('drop', function (e) {
      var dt = e.dataTransfer;
      if (dt && dt.files && dt.files[0]) handle(dt.files[0]);
    });
  };
})();
