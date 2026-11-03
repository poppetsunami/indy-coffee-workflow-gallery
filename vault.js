(() => {
  const gate = document.querySelector('#gate');
  const workspace = document.querySelector('#workspace');
  const input = document.querySelector('#password');
  const button = document.querySelector('#submit');
  const message = document.querySelector('#message');
  const viewer = document.querySelector('#viewer');
  const decoder = new TextDecoder();
  let key, assets;
  const cache = new Map();
  const decode64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  async function decrypt(path) {
    const response = await fetch(new URL(path, location.href));
    if (!response.ok) throw new Error('Download failed');
    const data = new Uint8Array(await response.arrayBuffer());
    return crypto.subtle.decrypt({ name: 'AES-GCM', iv: data.slice(0, 12) }, key, data.slice(12));
  }
  window.galleryAsset = path => {
    if (!assets?.[path]) return Promise.reject(new Error('Unknown gallery file'));
    if (!cache.has(path)) cache.set(path, decrypt(assets[path].path).then(bytes => URL.createObjectURL(new Blob([bytes], { type: assets[path].mime }))));
    return cache.get(path);
  };
  document.querySelector('#lock').onclick = () => location.reload();
  document.querySelector('#unlock').onsubmit = async event => {
    event.preventDefault();
    button.disabled = true;
    message.textContent = 'Opening gallery…';
    try {
      const response = await fetch('config.json');
      if (!response.ok) throw new Error('Configuration unavailable');
      const config = await response.json();
      const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(input.value), 'PBKDF2', false, ['deriveKey']);
      key = await crypto.subtle.deriveKey({name:'PBKDF2',salt:decode64(config.salt),iterations:config.iterations,hash:'SHA-256'}, material, {name:'AES-GCM',length:256}, false, ['decrypt']);
      const payload = JSON.parse(decoder.decode(await decrypt(config.entry)));
      assets = payload.assets;
      const parsed = new DOMParser().parseFromString(payload.html, 'text/html');
      parsed.querySelectorAll('img[src]').forEach(img => { img.dataset.vaultPath = img.getAttribute('src'); img.removeAttribute('src'); });
      parsed.querySelectorAll('a[href]').forEach(a => {
        const path = a.getAttribute('href');
        if (assets[path]) { a.dataset.vaultPath = path; a.href = '#'; }
      });
      const loader = parsed.createElement('script');
      loader.textContent = `
        const watch = new IntersectionObserver(entries => entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          const img = entry.target; watch.unobserve(img);
          parent.galleryAsset(img.dataset.vaultPath).then(url => { img.src = url; }).catch(() => { img.alt = 'Screenshot could not load. Refresh to retry.'; });
        }), { rootMargin: '400px' });
        document.querySelectorAll('img[data-vault-path]').forEach(img => watch.observe(img));
        document.addEventListener('click', event => {
          const a = event.target.closest('a[data-vault-path]'); if (!a) return;
          event.preventDefault();
          const preview = window.open('about:blank', '_blank');
          if (preview) { preview.opener = null; preview.document.body.textContent = 'Opening file…'; }
          parent.galleryAsset(a.dataset.vaultPath).then(url => { if (preview) preview.location.replace(url); else window.location.href = url; }).catch(() => { if (preview) preview.document.body.textContent = 'Unable to open this file. Please return to the gallery and retry.'; });
        });
      `;
      parsed.body.appendChild(loader);
      viewer.srcdoc = '<!doctype html>' + parsed.documentElement.outerHTML;
      input.value = '';
      gate.hidden = true;
      workspace.hidden = false;
    } catch (error) {
      key = undefined;
      message.textContent = error.name === 'OperationError' ? 'Incorrect password. Please try again.' : 'Unable to open the gallery. Check your connection and try again.';
      input.focus();
    } finally {
      button.disabled = false;
    }
  };
})();
