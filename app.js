// Home Hub TEST front end. Holds no data; keeps only sign-in timestamps on this device for the P2 check.
(function () {
  const $ = (id) => document.getElementById(id);
  let token = null;
  let tokenExp = 0;
  let busy = false;

  function store(key, value) { try { if (value === undefined) return localStorage.getItem(key); localStorage.setItem(key, value); } catch (e) { return null; } }

  function decode(jwt) {
    const part = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(escape(atob(part))));
  }

  function fmt(ts) { return ts ? new Date(Number(ts)).toLocaleString('en-GB') : 'never'; }

  function showSession() {
    const first = store('hh_first_signin');
    const last = store('hh_last_signin');
    const method = store('hh_last_method');
    const days = first ? ((Date.now() - Number(first)) / 86400000).toFixed(1) : '0';
    $('session-info').textContent = 'First sign-in on this device: ' + fmt(first) + ' (' + days + ' days ago). Last: ' +
      fmt(last) + ' via ' + (method || 'n/a') + '.';
  }

  function setSignedIn(on) {
    ['btn-read', 'btn-add', 'btn-event'].forEach((id) => { $(id).disabled = !on; });
  }

  function log(text, cls) {
    const li = document.createElement('li');
    li.textContent = new Date().toLocaleTimeString('en-GB') + '  ' + text;
    if (cls) li.className = cls;
    $('log').prepend(li);
  }

  function onCredential(resp) {
    token = resp.credential;
    const p = decode(token);
    tokenExp = p.exp;
    const auto = /auto/.test(resp.select_by || '');
    const now = Date.now();
    if (!store('hh_first_signin')) store('hh_first_signin', String(now));
    store('hh_last_signin', String(now));
    store('hh_last_method', (auto ? 'automatic' : 'tap') + ' (' + (resp.select_by || 'unknown') + ')');
    $('signin-status').innerHTML = '';
    const s = document.createElement('span');
    s.className = 'ok';
    s.textContent = 'Signed in as ' + p.email + (auto ? ', automatically (no tap).' : ', after a tap.');
    $('signin-status').appendChild(s);
    showSession();
    setSignedIn(true);
    log('Sign-in: ' + (resp.select_by || 'unknown'), 'ok');
  }

  async function call(action, extra, useToken) {
    if (!window.HH.door) { log('Door address not set yet (config.js).', 'bad'); return null; }
    const sendToken = useToken === undefined ? token : useToken;
    if (useToken === undefined && (!token || Date.now() / 1000 > tokenExp - 30)) {
      log('Sign-in has expired; asking again.', 'bad');
      setSignedIn(false);
      if (window.google) google.accounts.id.prompt();
      return null;
    }
    if (busy) return null;
    busy = true;
    const t0 = performance.now();
    try {
      const res = await fetch(window.HH.door, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(Object.assign({ action: action, token: sendToken }, extra || {})),
        redirect: 'follow'
      });
      const data = await res.json();
      const ms = Math.round(performance.now() - t0);
      const timing = ms + ' ms round trip (server ' + data.serverMs + ' ms, token check ' + (data.verifyMs || 0) + ' ms)';
      if (data.ok) log(action + ': OK, ' + timing, 'ok');
      else log(action + ': REFUSED (' + data.error + '), ' + timing, 'bad');
      return data;
    } catch (e) {
      log(action + ': FAILED after ' + Math.round(performance.now() - t0) + ' ms (' + e.message + ')', 'bad');
      return null;
    } finally {
      busy = false;
    }
  }

  function showRows(rows) {
    const ul = $('rows');
    ul.innerHTML = '';
    if (!rows.length) { ul.innerHTML = '<li class="muted">No rows yet.</li>'; return; }
    rows.forEach((r) => {
      const li = document.createElement('li');
      li.textContent = r.when + ' | ' + r.who + ' | ' + r.text;
      ul.appendChild(li);
    });
  }

  $('btn-read').addEventListener('click', async () => {
    const d = await call('read');
    if (d && d.ok) showRows(d.rows);
  });

  $('btn-refuse').addEventListener('click', () => call('read', null, 'not-a-real-token'));

  $('add-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const text = $('add-text').value.trim();
    if (!text) return;
    const d = await call('add', { text: text, device: navigator.userAgent.slice(0, 120) });
    if (d && d.ok) { $('add-text').value = ''; showRows(d.rows); }
  });

  $('btn-event').addEventListener('click', async () => {
    const d = await call('event', { minutes: Number($('lead').value) });
    if (d && d.ok) log('Event set for ' + d.start + ' (pop-up at start time).', 'ok');
  });

  function showDevice() {
    const standalone = window.matchMedia('(display-mode: standalone)').matches;
    $('device').textContent = (standalone ? 'Opened as installed app (full screen).' : 'Opened in a browser tab.') +
      ' Online: ' + (navigator.onLine ? 'yes' : 'no') + '. Offline shell: ' +
      ('serviceWorker' in navigator && navigator.serviceWorker.controller ? 'ready' : 'not yet') + '.';
    $('offline').style.display = navigator.onLine ? 'none' : 'block';
  }
  window.addEventListener('online', showDevice);
  window.addEventListener('offline', showDevice);

  window.hhGsiLoaded = function () {
    google.accounts.id.initialize({
      client_id: window.HH.clientId,
      callback: onCredential,
      auto_select: true,
      use_fedcm_for_prompt: true,
      cancel_on_tap_outside: false
    });
    google.accounts.id.renderButton($('gsi-button'), { theme: 'filled_blue', size: 'large', text: 'signin_with', shape: 'pill' });
    google.accounts.id.prompt();
  };

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(() => navigator.serviceWorker.ready).then(showDevice);
  }
  showSession();
  showDevice();
  if (!navigator.onLine) $('signin-status').textContent = 'No signal: sign-in needs a connection.';
})();
