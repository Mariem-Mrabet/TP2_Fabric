const $ = (id) => document.getElementById(id);

async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function show(text, type) {
  const box = $('result');
  box.textContent = text;
  box.className = 'result ' + type;
}

async function computeHash() {
  const content = $('content').value;
  if (content === '') {
    show('Veuillez saisir le contenu du document.', 'error');
    return null;
  }
  const h = await sha256Hex(content);
  $('hash').value = h;
  return h;
}

async function callApi(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Erreur inconnue');
  }
  return data;
}

function withButton(button, fn) {
  return async () => {
    button.disabled = true;
    try {
      await fn();
    } catch (err) {
      show('Échec : ' + err.message, 'error');
    } finally {
      button.disabled = false;
    }
  };
}

$('btnHash').addEventListener('click', async () => {
  const h = await computeHash();
  if (h) show('Hash calculé.', 'info');
});

$('btnRegister').addEventListener('click', withButton($('btnRegister'), async () => {
  const docId = $('docId').value.trim();
  if (!docId) return show("Veuillez saisir l'identifiant du document.", 'error');
  const h = await computeHash();
  if (!h) return;
  show('Transaction envoyée, en attente de confirmation...', 'info');
  const data = await callApi('/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ docId, hash: h })
  });
  show(`Réussite : ${data.message}\nIdentifiant : ${data.document.docId}\nDate : ${data.document.timestamp}`, 'ok');
}));

$('btnVerify').addEventListener('click', withButton($('btnVerify'), async () => {
  const docId = $('docId').value.trim();
  if (!docId) return show("Veuillez saisir l'identifiant du document.", 'error');
  const h = await computeHash();
  if (!h) return;
  const data = await callApi('/api/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ docId, hash: h })
  });
  show(data.message, data.status === 'VALID' ? 'ok' : 'error');
}));

$('btnRead').addEventListener('click', withButton($('btnRead'), async () => {
  const docId = $('docId').value.trim();
  if (!docId) return show("Veuillez saisir l'identifiant du document.", 'error');
  const data = await callApi('/api/document/' + encodeURIComponent(docId));
  if (data.status === 'NOT_FOUND') {
    show(`Identifiant : ${docId}\n${data.message}`, 'error');
  } else {
    show(`Identifiant : ${data.document.docId}\nHash enregistré :\n${data.document.hash}`, 'ok');
  }
}));