(() => {
  const CRT_STORAGE_KEY = 'planets_crt_on';

  function readStoredCrt() {
    try {
      return localStorage.getItem(CRT_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  }

  function writeStoredCrt(isOn) {
    try {
      localStorage.setItem(CRT_STORAGE_KEY, isOn ? '1' : '0');
    } catch {
      // ignore (private mode / blocked storage)
    }
  }

  function setCrt(isOn, buttonEl) {
    document.documentElement.classList.toggle('crt-on', isOn);
    if (buttonEl) {
      buttonEl.classList.toggle('is-on', isOn);
      buttonEl.setAttribute('aria-pressed', String(isOn));
    }
  }

  function ensureCrtButton() {
    let btn = document.getElementById('toggleCrt');
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'toggleCrt';
      btn.type = 'button';
      btn.className = 'crt-toggle-btn';
      btn.setAttribute('aria-label', 'Toggle CRT filter');
      btn.setAttribute('aria-pressed', 'false');
      btn.textContent = 'CRT';
      document.body.appendChild(btn);
    }
    return btn;
  }

  function initSidebarToggle() {
    const sidebar = document.getElementById('sidebar');
    const toggleBtn = document.getElementById('toggleSidebar');
    if (!sidebar || !toggleBtn) return;

    toggleBtn.addEventListener('click', () => {
      sidebar.classList.toggle('open');
    });
  }

  function initCrtToggle() {
    const btn = ensureCrtButton();
    setCrt(readStoredCrt(), btn);

    btn.addEventListener('click', () => {
      const next = !document.documentElement.classList.contains('crt-on');
      setCrt(next, btn);
      writeStoredCrt(next);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initSidebarToggle();
      initCrtToggle();
    });
  } else {
    initSidebarToggle();
    initCrtToggle();
  }
})();
