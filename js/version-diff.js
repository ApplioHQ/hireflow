/* version-diff.js -- Resume version comparison (pure client-side).
   Exposes window.versionDiff = { compute, render }. */
(function () {
  'use strict';

  function norm(s) { return String(s == null ? '' : s).trim(); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }

  // ---- Word-level diff (Myers-like, simplified) ----
  function wordDiff(a, b) {
    var wa = norm(a).split(/(\s+)/), wb = norm(b).split(/(\s+)/);
    if (norm(a) === norm(b)) return [{ type: 'eq', text: norm(a) }];
    var n = wa.length, m = wb.length;
    // LCS via DP (fine for resume-sized text)
    var dp = [];
    var i, j;
    for (i = 0; i <= n; i++) { dp[i] = []; for (j = 0; j <= m; j++) dp[i][j] = 0; }
    for (i = 1; i <= n; i++)
      for (j = 1; j <= m; j++)
        dp[i][j] = wa[i - 1] === wb[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    // Backtrack
    var ops = [];
    i = n; j = m;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && wa[i - 1] === wb[j - 1]) {
        ops.push({ type: 'eq', text: wa[i - 1] }); i--; j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        ops.push({ type: 'add', text: wb[j - 1] }); j--;
      } else {
        ops.push({ type: 'del', text: wa[i - 1] }); i--;
      }
    }
    ops.reverse();
    // Merge consecutive same-type spans
    var merged = [], last = null;
    ops.forEach(function (o) {
      if (last && last.type === o.type) last.text += o.text;
      else { last = { type: o.type, text: o.text }; merged.push(last); }
    });
    return merged;
  }

  function renderWordDiff(a, b) {
    var ops = wordDiff(a, b);
    return ops.map(function (o) {
      if (o.type === 'eq') return esc(o.text);
      if (o.type === 'del') return '<del class="vd-del">' + esc(o.text) + '</del>';
      return '<ins class="vd-add">' + esc(o.text) + '</ins>';
    }).join('');
  }

  // ---- Structured diff ----

  function diffPersonal(cur, old) {
    var fields = ['fullName', 'email', 'phone', 'location', 'linkedin', 'github', 'website', 'summary'];
    var changes = [];
    fields.forEach(function (f) {
      var a = norm((old || {})[f]), b = norm((cur || {})[f]);
      if (a === b) return;
      if (f === 'summary') {
        changes.push({ field: 'Summary', html: renderWordDiff(a, b) });
      } else {
        var label = f.charAt(0).toUpperCase() + f.slice(1).replace(/([A-Z])/g, ' $1');
        changes.push({ field: label, html: (a ? '<del class="vd-del">' + esc(a) + '</del> ' : '') + (b ? '<ins class="vd-add">' + esc(b) + '</ins>' : '') });
      }
    });
    return changes;
  }

  function matchKey(entry, fields) {
    return fields.map(function (f) { return norm(entry[f]); }).join('|').toLowerCase();
  }

  function diffList(curList, oldList, keyFields, descField, labelFn) {
    var cur = curList || [], old = oldList || [];
    var oldMap = {};
    old.forEach(function (e, i) { oldMap[matchKey(e, keyFields)] = { entry: e, idx: i }; });
    var seen = {};
    var changes = [];
    cur.forEach(function (e) {
      var k = matchKey(e, keyFields);
      var label = labelFn(e);
      seen[k] = true;
      if (!oldMap[k]) {
        changes.push({ type: 'added', label: label });
      } else {
        var oe = oldMap[k].entry;
        var aDesc = norm(oe[descField]), bDesc = norm(e[descField]);
        if (aDesc !== bDesc) {
          changes.push({ type: 'modified', label: label, html: renderWordDiff(aDesc, bDesc) });
        }
      }
    });
    old.forEach(function (e) {
      var k = matchKey(e, keyFields);
      if (!seen[k]) changes.push({ type: 'removed', label: labelFn(e) });
    });
    return changes;
  }

  function diffSkills(curCats, oldCats) {
    var flatten = function (cats) {
      var s = {};
      (cats || []).forEach(function (c) { (c.items || []).forEach(function (i) { s[String(i).toLowerCase().trim()] = String(i); }); });
      return s;
    };
    var cur = flatten(curCats), old = flatten(oldCats);
    var added = [], removed = [];
    Object.keys(cur).forEach(function (k) { if (!old[k]) added.push(cur[k]); });
    Object.keys(old).forEach(function (k) { if (!cur[k]) removed.push(old[k]); });
    return { added: added, removed: removed };
  }

  function compute(current, old) {
    var diff = { personal: [], experience: [], education: [], projects: [], skills: { added: [], removed: [] }, empty: true };
    diff.personal = diffPersonal(current.personal, old.personal);
    diff.experience = diffList(current.experience, old.experience, ['title', 'company'], 'description', function (e) { return (e.title || 'Role') + (e.company ? ' at ' + e.company : ''); });
    diff.education = diffList(current.education, old.education, ['school', 'degree'], 'description', function (e) { return (e.degree || 'Degree') + (e.school ? ' - ' + e.school : ''); });
    diff.projects = diffList(current.projects, old.projects, ['name'], 'description', function (e) { return e.name || 'Project'; });
    diff.skills = diffSkills((current.skills || {}).categories, (old.skills || {}).categories);
    diff.empty = !diff.personal.length && !diff.experience.length && !diff.education.length && !diff.projects.length && !diff.skills.added.length && !diff.skills.removed.length;
    return diff;
  }

  // ---- Render diff to HTML ----

  function section(title, body) {
    return '<div class="vd-section"><div class="vd-section-title">' + esc(title) + '</div>' + body + '</div>';
  }

  function render(diff) {
    if (diff.empty) return '<div class="vd-empty">No differences found. The current resume matches this version.</div>';
    var html = '';

    if (diff.personal.length) {
      html += section('Personal Info', diff.personal.map(function (c) {
        return '<div class="vd-row"><span class="vd-field">' + esc(c.field) + '</span>' + c.html + '</div>';
      }).join(''));
    }

    var listSection = function (title, items) {
      if (!items.length) return;
      html += section(title, items.map(function (c) {
        var prefix = c.type === 'added' ? '<span class="vd-badge vd-badge-add">+ Added</span>'
          : c.type === 'removed' ? '<span class="vd-badge vd-badge-del">- Removed</span>'
          : '<span class="vd-badge vd-badge-mod">~ Changed</span>';
        var body = prefix + ' <strong>' + esc(c.label) + '</strong>';
        if (c.html) body += '<div class="vd-desc">' + c.html + '</div>';
        return '<div class="vd-row">' + body + '</div>';
      }).join(''));
    };

    listSection('Experience', diff.experience);
    listSection('Education', diff.education);
    listSection('Projects', diff.projects);

    if (diff.skills.added.length || diff.skills.removed.length) {
      var body = '';
      if (diff.skills.added.length) body += '<div class="vd-row"><span class="vd-badge vd-badge-add">+ Added</span> ' + diff.skills.added.map(function (s) { return '<span class="vd-skill vd-skill-add">' + esc(s) + '</span>'; }).join(' ') + '</div>';
      if (diff.skills.removed.length) body += '<div class="vd-row"><span class="vd-badge vd-badge-del">- Removed</span> ' + diff.skills.removed.map(function (s) { return '<span class="vd-skill vd-skill-del">' + esc(s) + '</span>'; }).join(' ') + '</div>';
      html += section('Skills', body);
    }

    return '<div class="vd-wrap">' + html + '</div>';
  }

  window.versionDiff = { compute: compute, render: render };
})();
