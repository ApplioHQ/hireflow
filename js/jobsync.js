/* jobsync.js — cross-device sync for the job tracker (hf_jobs). One shared module
   used by the tracker, dashboard, autopilot, and editor so a job saved on any device
   shows up everywhere. Last-write-wins by a local timestamp (hf_jobs_ts). Fail-open:
   any network hiccup just leaves local data untouched. Exposes window.HFJobsSync. */
(function () {
  'use strict';
  var API = (window.HIREFLOW_CONFIG && window.HIREFLOW_CONFIG.API_URL) || '';
  var TOKEN = localStorage.getItem('hf_token');

  function localJobs() {
    try { var j = JSON.parse(localStorage.getItem('hf_jobs') || '[]'); return Array.isArray(j) ? j : []; }
    catch (e) { return []; }
  }
  function localTs() { return parseInt(localStorage.getItem('hf_jobs_ts') || '0', 10) || 0; }

  window.HFJobsSync = {
    // Push current local jobs to the cloud (call after any local add/edit/delete).
    push: function () {
      if (!API || !TOKEN) return;
      var ts = Date.now();
      try { localStorage.setItem('hf_jobs_ts', String(ts)); } catch (e) {}
      fetch(API + '/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TOKEN },
        body: JSON.stringify({ jobs: localJobs(), updatedAt: ts })
      }).catch(function () {});
    },
    // Pull cloud jobs; if newer than local, adopt them and call onAdopt(true).
    pull: function (onAdopt) {
      onAdopt = onAdopt || function () {};
      if (!API || !TOKEN) { onAdopt(false); return; }
      fetch(API + '/jobs', { headers: { 'Authorization': 'Bearer ' + TOKEN } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
          if (!d || !Array.isArray(d.jobs)) { if (localTs()) window.HFJobsSync.push(); onAdopt(false); return; }
          var cloudTs = d.updatedAt || 0, lTs = localTs();
          if (cloudTs > lTs) {
            try { localStorage.setItem('hf_jobs', JSON.stringify(d.jobs)); localStorage.setItem('hf_jobs_ts', String(cloudTs)); } catch (e) {}
            onAdopt(true);
          } else {
            if (lTs > cloudTs) window.HFJobsSync.push();   // local newer → update cloud
            onAdopt(false);
          }
        }).catch(function () { onAdopt(false); });
    }
  };
})();
