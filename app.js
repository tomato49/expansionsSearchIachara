// ===== State =====
let allChars = [];
let currentVer = '6';
let skillFilters = []; // [{name, threshold}]
let abilityMinMap = {}; // {STR: 30, ...}

// 7版 vs 6版で表示する能力値とスライダー最大値
const VER_CONFIG = {
  '7': {
    abilities: ['STR','CON','POW','DEX','APP','SIZ','INT','EDU','LUK'],
    abMax: 90,
    abMaxOverride: { EDU: 105 },
    abilityKeys: { STR:'str', CON:'con', POW:'pow', DEX:'dex', APP:'app', SIZ:'siz', INT:'int', EDU:'edu', LUK:'luck' }
  },
  '6': {
    abilities: ['STR','CON','POW','DEX','APP','SIZ','INT','EDU'],
    abMax: 18,
    abMaxOverride: { EDU: 21 },
    abilityKeys: { STR:'str', CON:'con', POW:'pow', DEX:'dex', APP:'app', SIZ:'siz', INT:'int', EDU:'edu' }
  }
};

// ===== HTMLエスケープ =====
// 名前などを innerHTML に入れる前に通す(< & " が含まれても表示が崩れないように)
function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// 表示中の版(6版/7版)のキャラクターか。バージョン情報が無いデータは 7版 として扱う
const isCurrentVer = ch => (ch.data?.version || '7th').startsWith(currentVer);

// ===== データの読み込み =====
function loadChars(parsed) {
  // APIは作成日の古い順で返すので、新しい順に並べ替えて表示する
  allChars = [...parsed].reverse();
  document.getElementById('noData').style.display = 'none';
  document.getElementById('cardGrid').style.display = 'grid';
  buildSkillSelect();
  renderCards();
}

// ===== Version tabs =====
document.querySelectorAll('.ver-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    currentVer = btn.dataset.ver;
    document.querySelectorAll('.ver-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    localStorage.setItem('coc_ver', currentVer);
    abilityMinMap = {};
    skillFilters = [];
    document.getElementById('skillFilterTags').innerHTML = '';
    resetSanUI();
    renderAbilityFilters();
    buildSkillSelect();
    renderCards();
  });
});

// スライダー等の連続入力で何度も全カードを描き直さないよう、1フレームに1回へまとめる
let renderQueued = false;
function requestRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    renderCards();
  });
}

// ===== SAN filter =====
document.getElementById('sanRange').addEventListener('input', e => {
  const v = parseInt(e.target.value);
  abilityMinMap['SAN'] = v;
  document.getElementById('abval-SAN').textContent = v > 0 ? v + '以上' : '指定なし';
  requestRender();
});

// SANスライダーの表示を初期状態に戻す(絞り込み条件の側は abilityMinMap で管理)
function resetSanUI() {
  document.getElementById('sanRange').value = 0;
  document.getElementById('abval-SAN').textContent = '指定なし';
}

// ===== Ability filters =====
function renderAbilityFilters() {
  const cfg = VER_CONFIG[currentVer];
  const container = document.getElementById('abilityFilters');
  container.innerHTML = '';
  cfg.abilities.forEach(ab => {
    const min = abilityMinMap[ab] || 0;
    const div = document.createElement('div');
    div.className = 'ability-row';
    div.innerHTML = `
      <div class="ability-head">
        <span class="ability-name">${ab}</span>
        <span class="ability-val" id="abval-${ab}">${min > 0 ? min + '以上' : '指定なし'}</span>
      </div>
      <input type="range" min="0" max="${(cfg.abMaxOverride && cfg.abMaxOverride[ab]) || cfg.abMax}" value="${min}" step="1" />
    `;
    div.querySelector('input').addEventListener('input', e => {
      const v = parseInt(e.target.value);
      abilityMinMap[ab] = v;
      document.getElementById('abval-' + ab).textContent = v > 0 ? v + '以上' : '指定なし';
      requestRender();
    });
    container.appendChild(div);
  });
}

// ===== 技能名の正規化（共通） =====
// （）なしでまとめて扱う技能
const GROUP_SKILLS = new Set(['操縦','芸術','製作','運転','母国語','近接戦闘','射撃','言語','科学']);

// プルダウン・フィルター用：GROUP_SKILLSは親名のみ
function skillFullName(sk) {
  const add = sk.additionalName || '';
  if (GROUP_SKILLS.has(sk.name)) return sk.name;
  return sk.name + (add ? '（' + add + '）' : '');
}

// カード表示用：常に（）込み
function skillDisplayName(sk) {
  const add = sk.additionalName || '';
  return sk.name + (add ? '（' + add + '）' : '');
}

// ===== Skill select =====
const CAT_LABELS = {
  actionSkills: '行動技能',
  battleSkills: '戦闘技能',
  searchSkills: '探索技能',
  knowledgeSkills: '知識技能',
  negotiationSkills: '交渉技能'
};
const CAT_ORDER = ['actionSkills','battleSkills','searchSkills','knowledgeSkills','negotiationSkills'];

function collectSkillsByCategory() {
  const result = {};
  CAT_ORDER.forEach(cat => result[cat] = new Set());
  allChars.filter(isCurrentVer).forEach(ch => {
    const d = ch.data;
    CAT_ORDER.forEach(cat => {
      const skills = d[cat];
      if (!skills) return;
      [...(skills.static || []), ...(skills.additional || [])].forEach(sk => {
        if (!sk.name) return;
        // GROUP_SKILLSは親名のみ、それ以外は（）込みで登録
        result[cat].add(skillFullName(sk));
      });
    });
  });
  CAT_ORDER.forEach(cat => result[cat] = [...result[cat]]);
  return result;
}

// ===== Custom skill combobox =====
const comboInput = document.getElementById('skillComboInput');
const dropdown = document.getElementById('skillDropdown');
let allSkillOptions = []; // [{cat, name}]
let selectedSkillName = '';
let activeIndex = -1;

function buildSkillSelect() {
  const bycat = collectSkillsByCategory();
  allSkillOptions = [];
  CAT_ORDER.forEach(cat => {
    const names = bycat[cat];
    if (!names || names.length === 0) return;
    names.sort((a,b) => a.localeCompare(b, 'ja')).forEach(name => {
      allSkillOptions.push({ cat, name });
    });
  });
  selectedSkillName = '';
  comboInput.value = '';
  renderDropdown('');
}

function renderDropdown(query) {
  const q = query.trim().toLowerCase();
  const filtered = q ? allSkillOptions.filter(o => o.name.toLowerCase().includes(q)) : allSkillOptions;

  if (filtered.length === 0) {
    dropdown.innerHTML = '<div class="skill-dropdown-empty">該当なし</div>';
    return;
  }

  let html = '';
  let lastCat = null;
  filtered.forEach(o => {
    if (o.cat !== lastCat) {
      html += `<div class="skill-dropdown-group">${CAT_LABELS[o.cat]}</div>`;
      lastCat = o.cat;
    }
    html += `<div class="skill-dropdown-item" data-name="${esc(o.name)}">${esc(o.name)}</div>`;
  });
  dropdown.innerHTML = html;
  activeIndex = -1;

  dropdown.querySelectorAll('.skill-dropdown-item').forEach(el => {
    el.addEventListener('mousedown', e => {
      e.preventDefault();
      selectSkill(el.dataset.name);
    });
  });
}

function selectSkill(name) {
  selectedSkillName = name;
  comboInput.value = name;
  dropdown.classList.remove('open');
}

comboInput.addEventListener('focus', () => {
  renderDropdown(comboInput.value);
  dropdown.classList.add('open');
});
comboInput.addEventListener('blur', () => {
  setTimeout(() => dropdown.classList.remove('open'), 150);
});
comboInput.addEventListener('input', () => {
  selectedSkillName = '';
  renderDropdown(comboInput.value);
  dropdown.classList.add('open');
});
let isComposing = false;
comboInput.addEventListener('compositionstart', () => { isComposing = true; });
comboInput.addEventListener('compositionend', () => { isComposing = false; });

comboInput.addEventListener('keydown', e => {
  if (isComposing) return;
  const items = dropdown.querySelectorAll('.skill-dropdown-item');
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    activeIndex = Math.min(activeIndex + 1, items.length - 1);
    items.forEach((el, i) => el.classList.toggle('active', i === activeIndex));
    items[activeIndex]?.scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    activeIndex = Math.max(activeIndex - 1, 0);
    items.forEach((el, i) => el.classList.toggle('active', i === activeIndex));
    items[activeIndex]?.scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (activeIndex >= 0 && items[activeIndex]) {
      selectSkill(items[activeIndex].dataset.name);
    } else if (items.length >= 1) {
      selectSkill(items[0].dataset.name);
    }
  } else if (e.key === 'Escape') {
    dropdown.classList.remove('open');
  }
});

// ===== Skill threshold =====
// スライダーと数値入力は連動する。数値は 0〜100 の整数に補正する。
const threshSlider = document.getElementById('skillThreshold');
const threshNum = document.getElementById('skillThreshNum');

function parseThreshold(v) {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? null : Math.min(100, Math.max(0, n));
}

// 数値欄の内容を補正して、スライダーにも反映し、確定した値を返す
function commitThreshold() {
  const v = parseThreshold(threshNum.value);
  const value = v === null ? parseInt(threshSlider.value, 10) : v;
  threshNum.value = value;
  threshSlider.value = value;
  return value;
}

threshSlider.addEventListener('input', () => {
  threshNum.value = threshSlider.value;
});

threshNum.addEventListener('input', () => {
  // 入力途中(空欄など)は触らず、数値として読めるときだけスライダーを動かす
  const v = parseThreshold(threshNum.value);
  if (v !== null) threshSlider.value = v;
});
threshNum.addEventListener('change', commitThreshold);
threshNum.addEventListener('focus', () => threshNum.select());
threshNum.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    document.getElementById('addSkillFilter').click();
  }
});

document.getElementById('addSkillFilter').addEventListener('click', () => {
  const name = selectedSkillName || comboInput.value.trim();
  if (!name) return;
  const threshold = commitThreshold();
  if (skillFilters.some(f => f.name === name)) return;
  skillFilters.push({ name, threshold });
  selectedSkillName = '';
  comboInput.value = '';
  renderSkillTags();
  renderCards();
});

function renderSkillTags() {
  const container = document.getElementById('skillFilterTags');
  container.innerHTML = '';
  skillFilters.forEach((f, i) => {
    const tag = document.createElement('div');
    tag.className = 'filter-tag';
    tag.innerHTML = `${esc(f.name)} ≥${f.threshold}<span class="filter-tag-remove">×</span>`;
    tag.querySelector('.filter-tag-remove').addEventListener('click', () => {
      skillFilters.splice(i, 1);
      renderSkillTags();
      renderCards();
    });
    container.appendChild(tag);
  });
}

// ===== Theme toggle =====
const themeBtn = document.getElementById('themeBtn');
themeBtn.addEventListener('click', () => {
  const isLight = document.documentElement.classList.toggle('light');
  themeBtn.textContent = isLight ? '☽ ダーク' : '☀ ライト';
  localStorage.setItem('coc_theme', isLight ? 'light' : 'dark');
});

// ===== Lost toggle =====
const showLostCb = document.getElementById('showLost');
const toggleThumb = document.getElementById('toggleThumb');
const toggleTrack = document.getElementById('toggleTrack');
showLostCb.addEventListener('change', () => {
  const on = showLostCb.checked;
  toggleThumb.style.transform = on ? 'translateX(16px)' : 'translateX(3px)';
  toggleTrack.style.background = on ? 'var(--red)' : 'var(--border2)';
  renderCards();
});

// ===== Name search =====
document.getElementById('nameSearch').addEventListener('input', requestRender);

// ===== Reset =====
document.getElementById('resetBtn').addEventListener('click', () => {
  abilityMinMap = {};
  skillFilters = [];
  document.getElementById('nameSearch').value = '';
  document.getElementById('skillFilterTags').innerHTML = '';
  resetSanUI();
  renderAbilityFilters();
  renderCards();
});

// ===== 技能1件の合計値 =====
// 合計値(sumPoint)が無いときは各ポイントから計算する。
// 母国語・回避は初期値が未設定(0)のとき、能力値から補う。
// 職業・興味・成長・その他ポイントの合計(初期値は含まない)
function skillExtra(sk) {
  return (sk.professionPoint||0) + (sk.interestPoint||0) + (sk.growthPoint||0) + (sk.otherPoint||0);
}

function calcSkillValue(ch, sk) {
  const extra = skillExtra(sk);
  const noDefault = sk.defaultPoint === undefined || sk.defaultPoint === 0;
  if (sk.name === '母国語' && noDefault) {
    return getAbilityValue(ch, 'edu') * (currentVer === '7' ? 1 : 5) + extra;
  }
  if (sk.name === '回避' && noDefault) {
    const dex = getAbilityValue(ch, 'dex');
    return (currentVer === '7' ? Math.floor(dex / 2) : dex * 2) + extra;
  }
  return sk.sumPoint !== undefined ? sk.sumPoint : (sk.defaultPoint||0) + extra;
}

// ===== Get skill value =====
function getSkillValue(ch, rawName) {
  const d = ch.data;
  const isGroup = GROUP_SKILLS.has(rawName);
  let best = null;
  for (const cat of CAT_ORDER) {
    const skills = d[cat];
    if (!skills) continue;
    const all = [...(skills.static || []), ...(skills.additional || [])];
    for (const sk of all) {
      const match = isGroup ? sk.name === rawName : skillFullName(sk) === rawName;
      if (!match) continue;
      const val = calcSkillValue(ch, sk);
      if (best === null || val > best) best = val;
    }
  }
  return best;
}

// ===== Get ability value =====
function getAbilityValue(ch, abKey) {
  if (abKey === 'san') return ch.data?.abilities?.sanCurrent ?? 0;
  const v = ch.data?.abilities?.[abKey];
  if (!v) return 0;
  return (v.value || 0) + (v.fixedDiff || 0) + (v.tmpFixedDiff || 0);
}

// ===== Get top skills =====
function getTopSkills(ch, highlightNames) {
  const d = ch.data;
  const all = [];
  CAT_ORDER.forEach(cat => {
    const skills = d[cat];
    if (!skills) return;
    [...(skills.static||[]), ...(skills.additional||[])].forEach(sk => {
      const val = calcSkillValue(ch, sk);
      const fullName = skillDisplayName(sk);
      const baseName = fullName.replace(/（.*）$/, '');
      const isHighlighted = highlightNames.has(fullName) || (GROUP_SKILLS.has(baseName) && highlightNames.has(baseName));
      if (isHighlighted || skillExtra(sk) > 0 || (sk.sumPoint !== undefined && sk.sumPoint > (sk.defaultPoint||0))) {
        all.push({ name: fullName, val, isHighlighted });
      }
    });
  });
  all.sort((a,b) => b.val - a.val);
  // フィルター対象は必ず含め、残りはtop6まで
  const highlighted = all.filter(s => s.isHighlighted);
  const others = all.filter(s => !s.isHighlighted).slice(0, Math.max(0, 6 - highlighted.length));
  return [...highlighted, ...others].sort((a,b) => b.val - a.val);
}

// ===== Render =====
function renderCards() {
  const cfg = VER_CONFIG[currentVer];
  const nameQ = document.getElementById('nameSearch').value.trim().toLowerCase();
  const showLost = showLostCb.checked;

  const inVer = allChars.filter(isCurrentVer);
  const filtered = inVer.filter(ch => {
    // Name search
    const name = (ch.data?.profile?.name || '').toLowerCase();
    const furi = (ch.data?.profile?.furi || '').toLowerCase();
    if (nameQ && !name.includes(nameQ) && !furi.includes(nameQ)) return false;

    // Lost filter
    if (!showLost && ch.data?.profile?.isLost) return false;

    // Ability filters
    for (const [ab, minVal] of Object.entries(abilityMinMap)) {
      if (minVal <= 0) continue;
      const key = ab === 'SAN' ? 'san' : cfg.abilityKeys[ab];
      if (!key) continue;
      if (getAbilityValue(ch, key) < minVal) return false;
    }

    // Skill filters
    for (const sf of skillFilters) {
      const val = getSkillValue(ch, sf.name);
      if (val === null || val < sf.threshold) return false;
    }

    return true;
  });

  const grid = document.getElementById('cardGrid');
  const countEl = document.getElementById('resultCount');
  countEl.innerHTML = `<b>${filtered.length}</b> / ${inVer.length} キャラクター`;

  if (filtered.length === 0) {
    grid.innerHTML = '<div class="empty-state">条件に一致するキャラクターが見つかりません</div>';
    return;
  }

  const hlNames = new Set(skillFilters.map(f => f.name));

  grid.innerHTML = '';
  filtered.forEach(ch => {
    const prof = ch.data?.profile || {};
    const name = prof.name || '不明';
    const furi = prof.furi || '';
    const age = prof.age || '';
    const sex = prof.sex || '';
    const profession = prof.profession || '';
    const isLost = prof.isLost;
    const sanVal = ch.data?.abilities?.sanCurrent ?? '';

    // Card background image
    const iconUrl = prof.icons?.[0]?.url || '';

    // Abilities
    const abChips = cfg.abilities.map(ab => {
      const key = cfg.abilityKeys[ab];
      const val = getAbilityValue(ch, key);
      return `<div class="ability-chip">${ab} <b>${val}</b></div>`;
    }).join('');

    const str = getAbilityValue(ch, 'str');
    const siz = getAbilityValue(ch, 'siz');
    // HP・MP計算
    const con = getAbilityValue(ch, 'con');
    const pow = getAbilityValue(ch, 'pow');
    const hp = Math.ceil((con + siz) / (currentVer === '7' ? 10 : 2));
    const mp = currentVer === '7' ? Math.floor(pow / 5) : pow;

    // MOV計算（7版のみ）
    let movChip = '';
    if (currentVer === '7') {
      const dex = getAbilityValue(ch, 'dex');
      let mov;
      if (str < siz && dex < siz) mov = 7;
      else if (str > siz && dex > siz) mov = 9;
      else mov = 8;
      movChip = `<div class="ability-chip">MOV <b>${mov}</b></div>`;
    }

    // DB計算
    const strSizRaw = str + siz;
    let db;
    if (currentVer === '7') {
      if (strSizRaw <= 64) db = '-2';
      else if (strSizRaw <= 84) db = '-1';
      else if (strSizRaw <= 124) db = '0';
      else if (strSizRaw <= 164) db = '+1D4';
      else db = '+1D6';
    } else {
      if (strSizRaw <= 12) db = '-1D6';
      else if (strSizRaw <= 16) db = '-1D4';
      else if (strSizRaw <= 24) db = '0';
      else if (strSizRaw <= 32) db = '+1D4';
      else if (strSizRaw <= 40) db = '+1D6';
      else if (strSizRaw <= 56) db = '+2D6';
      else if (strSizRaw <= 72) db = '+3D6';
      else if (strSizRaw <= 88) db = '+4D6';
      else db = '+5D6';
    }

    // Skills
    const topSkills = getTopSkills(ch, hlNames);
    const skillHtml = topSkills.map(s =>
      `<span class="skill-pill${s.isHighlighted ? ' highlight' : ''}">${esc(s.name)} ${s.val}</span>`
    ).join('');

    const subParts = [];
    if (furi) subParts.push(furi);
    const meta = [age ? age + '歳' : '', sex].filter(Boolean).join('・');
    if (meta) subParts.push(meta);
    if (profession) subParts.push(profession);

    const card = document.createElement('div');
    card.className = 'char-card' + (isLost ? ' is-lost' : '');
    card.innerHTML = `
      <div class="card-top">
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:5px;margin-bottom:4px;">
            <div class="ver-badge">${currentVer}版</div>
            <a href="https://iachara.com/view/${esc(ch.id)}" target="_blank" rel="noopener" title="キャラクターページを開く" class="ext-link">
              <span style="font-size:10px;">いあきゃらへ</span>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            </a>
          </div>
          <div class="card-name">${esc(name)}</div>
          ${subParts.length ? `<div class="card-sub">${subParts.map(esc).join(' ｜ ')}</div>` : ''}
        </div>
      </div>
      <div style="display:flex;gap:4px;margin-bottom:4px;margin-top:-4px;position:relative;z-index:1;">
        ${sanVal !== '' ? `<div class="san-chip">SAN <b>${sanVal}</b></div>` : ''}
        <div class="derived-chip">HP <b>${hp}</b></div>
        <div class="derived-chip">MP <b>${mp}</b></div>
        <div class="derived-chip">DB <b>${db}</b></div>
      </div>
      <div class="ability-chips">${abChips}${movChip}</div>
      <div class="skill-pills">${skillHtml || '<span style="font-size:11px;color:var(--text3);">技能データなし</span>'}</div>
    `;
    if (iconUrl) {
      const bg = document.createElement('img');
      bg.className = 'card-bg';
      bg.decoding = 'async';
      bg.src = iconUrl;
      bg.setAttribute('referrerpolicy', 'no-referrer');
      bg.setAttribute('alt', '');
      card.appendChild(bg);
    }
    grid.appendChild(card);
  });
}

// Init
renderAbilityFilters();

// テーマ・バージョン復元
const savedTheme = localStorage.getItem('coc_theme');
if (savedTheme === 'light') {
  document.documentElement.classList.add('light');
  themeBtn.textContent = '☽ ダーク';
}
const savedVer = localStorage.getItem('coc_ver');
if (savedVer && savedVer !== currentVer) {
  currentVer = savedVer;
  document.querySelectorAll('.ver-tab').forEach(b => {
    b.classList.toggle('active', b.dataset.ver === currentVer);
  });
  renderAbilityFilters();
}

// 拡張機能: この検索画面のタブを background に登録する(同じタブを使い回すため)
chrome.runtime.sendMessage({ type: 'VIEWER_READY' });

// 拡張機能: マイページで取得済みのデータを storage.session から読み込む
chrome.storage.session.get('charaData').then(({ charaData }) => {
  if (Array.isArray(charaData) && charaData.length) loadChars(charaData);
});

// ===== Help Modal =====
function openHelp() {
  document.getElementById('helpOverlay').classList.add('open');
}
function closeHelp() {
  document.getElementById('helpOverlay').classList.remove('open');
}

document.getElementById('helpBtn').addEventListener('click', openHelp);
document.getElementById('helpClose').addEventListener('click', closeHelp);
document.getElementById('helpOverlay').addEventListener('click', closeHelp);
document.querySelector('.help-modal').addEventListener('click', e => e.stopPropagation());
