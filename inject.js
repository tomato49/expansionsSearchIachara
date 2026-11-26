// ページ側(MAIN world)で動く。charasheet APIのレスポンスをコピーして通知する。
(() => {
  const TARGET = 'apiv3.iachara.com/v3/user/charasheet';
  const origFetch = window.fetch;

  window.fetch = async function (...args) {
    const res = await origFetch.apply(this, args);
    try {
      const input = args[0];
      const url = typeof input === 'string' ? input
                : input instanceof URL ? input.href
                : (input && input.url) || '';
      if (url.includes(TARGET) && res.ok) {
        res.clone().text().then((text) => {
          try {
            window.postMessage({ type: 'COC_CHARA_DATA', data: JSON.parse(text) }, '*');
          } catch (_) { /* JSON以外は無視 */ }
        });
      }
    } catch (_) { /* ページの動作を壊さない */ }
    return res;
  };
})();
