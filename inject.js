// ページ側(MAIN world)で動く。charasheet APIのレスポンスをコピーして通知する。
(() => {
  // 対象: iachara.com 系ホストの、パス末尾が /charasheet のリクエスト
  //   例) https://apiv3.iachara.com/v3/user/charasheet
  // APIのバージョン(v3→v4など)やホスト名(apiv3→apiv4)が変わっても拾えるよう、
  // バージョン部分は固定しない。
  const HOST_RE = /(^|\.)iachara\.com$/;
  const PATH_RE = /\/charasheet\/?$/;

  function isTarget(input) {
    try {
      const raw = typeof input === 'string' ? input
                : input instanceof URL ? input.href
                : (input && input.url) || '';
      const u = new URL(raw, location.href);   // 相対URLにも対応
      return HOST_RE.test(u.hostname) && PATH_RE.test(u.pathname);
    } catch (_) {
      return false;
    }
  }

  // キャラクターデータらしい形か(配列、または data を持つオブジェクト)
  function looksLikeCharaData(v) {
    if (Array.isArray(v)) return v.length === 0 || (v[0] && typeof v[0] === 'object');
    return !!v && typeof v === 'object' && 'data' in v;
  }

  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    const res = await origFetch.apply(this, args);
    try {
      if (res.ok && isTarget(args[0])) {
        res.clone().text().then((text) => {
          try {
            const data = JSON.parse(text);
            if (looksLikeCharaData(data)) {
              window.postMessage({ type: 'COC_CHARA_DATA', data }, '*');
            }
          } catch (_) { /* JSON以外は無視 */ }
        });
      }
    } catch (_) { /* ページの動作を壊さない */ }
    return res;
  };
})();
