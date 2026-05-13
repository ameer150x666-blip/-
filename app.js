// app.js - التطبيق الرئيسي
// يعتمد على firebase.js الذي يوفر auth, db, currentUser, userFavorites, toggleFavorite

// دوال الأمان
function escapeHtml(unsafe) {
  if (typeof unsafe !== 'string') return '';
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function sanitizeUrl(url) {
  if (!url || typeof url !== 'string') return '#';
  try {
    const parsed = new URL(url, location.origin);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') ? parsed.href : '#';
  } catch {
    return '#';
  }
}

function safeSetText(element, text) {
  if (element) element.textContent = text;
}

// الحالة
const state = {
  platform: 'java',
  allMods: [],
  filteredMods: [],
  activeFilter: 'all',
  searchQuery: '',
  offsetJava: 0,
  offsetBedrock: 0,
  noMoreResults: false,
  versionCache: {},
  selectedForCompat: new Set(),
  sessionSeed: Date.now()
};

// اختصارات DOM
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const modsGrid = document.getElementById('modsGrid');
const filtersSection = document.getElementById('filtersSection');
const statsBar = document.getElementById('statsBar');
const compatBtn = document.getElementById('compatBtn');
const compatModal = document.getElementById('compatModal');
const compatContent = document.getElementById('compatContent');
const modDetailOverlay = document.getElementById('modDetailOverlay');
const modDetailPanel = document.getElementById('modDetailPanel');
const adsRow = document.getElementById('adsRow');
const shuffleBadge = document.getElementById('shuffleBadge');
const platformBadge = document.getElementById('platformBadge');
const favoritesBtn = document.getElementById('favoritesBtn');

// تنقية الإدخال
searchInput.addEventListener('input', function() {
  this.value = this.value.replace(/[<>"'`]/g, '');
});

// استبدال أحداث onerror
document.getElementById('headerLogoImg').addEventListener('error', function() {
  this.style.display = 'none';
  document.getElementById('headerLogoFallback').style.display = 'flex';
});
document.getElementById('heroLogoImg').addEventListener('error', function() {
  this.style.display = 'none';
  document.getElementById('heroLogoFallback').style.display = 'block';
});

// تبديل المنصة
document.querySelectorAll('.platform-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.platform-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const newPlatform = btn.dataset.platform;
    if (state.platform !== newPlatform) {
      state.platform = newPlatform;
      state.allMods = [];
      state.filteredMods = [];
      state.offsetJava = 0;
      state.offsetBedrock = 0;
      state.noMoreResults = false;
      state.activeFilter = 'all';
      updatePlatformUI();
      debouncedSearch(searchInput.value || (state.platform==='java'?'minecraft':'bedrock'));
    }
  });
});

// زر المفضلة
favoritesBtn.addEventListener('click', () => {
  if (!currentUser) return;
  const favMods = state.allMods.filter(m => userFavorites.has(m.slug));
  state.filteredMods = favMods;
  renderGrid();
});

// دوال واجهة المستخدم
function updatePlatformUI() {
  platformBadge.textContent = '';
  const globe = document.createElement('i');
  globe.className = 'fa-solid fa-globe';
  platformBadge.appendChild(globe);
  platformBadge.append(state.platform === 'java' ? ' JAVA' : ' BEDROCK');

  filtersSection.textContent = '';
  const filterLabel = document.createElement('span');
  filterLabel.className = 'filter-label';
  filterLabel.textContent = state.platform === 'java' ? 'Loader:' : 'Category:';
  filtersSection.appendChild(filterLabel);

  const filterNames = state.platform === 'java'
    ? ['ALL', 'FABRIC', 'FORGE', 'NEOFORGE', 'QUILT', '⭐ TRENDING', '🔥 POPULAR', '🆕 NEW']
    : ['ALL', 'ADDON', 'TEXTURE', 'WORLD', 'SKIN', '⭐ TRENDING', '🔥 POPULAR', '🆕 NEW'];

  filterNames.forEach(name => {
    const chip = document.createElement('button');
    chip.className = 'filter-chip';
    if (name === 'ALL') chip.classList.add('active');
    chip.dataset.filter = name.toLowerCase();
    chip.textContent = name;
    filtersSection.appendChild(chip);
  });

  bindFilterClicks();
  buildStatsBar();
  renderAds();
}

function buildStatsBar() {
  statsBar.textContent = '';
  if (state.platform === 'java') {
    const items = [
      { cls: 'working', label: 'Working', id: 'statWorking' },
      { cls: 'outdated', label: 'Outdated', id: 'statOutdated' },
      { cls: 'broken', label: 'Broken', id: 'statBroken' },
      { cls: 'incompatible', label: 'Incompatible', id: 'statIncompatible' }
    ];
    items.forEach(item => statsBar.appendChild(createStat(item.label, item.id, item.cls)));
  } else {
    statsBar.appendChild(createStat('Active', 'statWorking', 'working'));
    statsBar.appendChild(createStat('Old', 'statOutdated', 'outdated'));
  }
}

function createStat(label, id, cls) {
  const span = document.createElement('span');
  const dot = document.createElement('span');
  dot.className = `stat-dot ${cls}`;
  const strong = document.createElement('strong');
  strong.id = id;
  strong.textContent = '0';
  span.appendChild(dot);
  span.append(` ${label}: `);
  span.appendChild(strong);
  return span;
}

function bindFilterClicks() {
  document.querySelectorAll('#filtersSection .filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#filtersSection .filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      state.activeFilter = chip.dataset.filter;
      applyFiltersAndRender();
    });
  });
}

// الإعلانات
const horizontalAds = [
  { title: 'مخدمات ماينكرافت', gradient: 'linear-gradient(135deg, #0d3b4f, #00bcd4)', link: '#' },
  { title: 'أدوات تطوير المودات', gradient: 'linear-gradient(135deg, #1a1a2e, #7c3aed)', link: '#' },
  { title: 'حزم شيدر احترافية', gradient: 'linear-gradient(135deg, #1a1000, #d4a843)', link: '#' },
  { title: 'لانشر مودباك', gradient: 'linear-gradient(135deg, #0a0a14, #00e676)', link: '#' }
];

function createAdCard(ad) {
  const card = document.createElement('div');
  card.className = 'ad-horizontal-card';
  
  const badge = document.createElement('div');
  badge.className = 'ad-badge-mini';
  badge.textContent = 'إعلان';
  card.appendChild(badge);
  
  const img = document.createElement('div');
  img.className = 'ad-horizontal-img';
  img.style.background = ad.gradient;
  card.appendChild(img);
  
  const title = document.createElement('div');
  title.className = 'ad-horizontal-title';
  title.textContent = ad.title;
  card.appendChild(title);
  
  const link = document.createElement('a');
  link.className = 'ad-horizontal-btn';
  link.href = sanitizeUrl(ad.link);
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = 'معرفة المزيد';
  card.appendChild(link);
  
  return card;
}

function renderAds() {
  adsRow.textContent = '';
  horizontalAds.forEach(ad => adsRow.appendChild(createAdCard(ad)));
}

// خلط عشوائي
function shuffleArray(arr, seed) {
  const array = [...arr];
  let m = array.length, t, i;
  let s = seed || Date.now();
  const random = () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
  while (m) {
    i = Math.floor(random() * m--);
    t = array[m];
    array[m] = array[i];
    array[i] = t;
  }
  return array;
}

function showShuffleIndicator() {
  shuffleBadge.style.display = 'inline-flex';
  setTimeout(() => { shuffleBadge.style.display = 'none'; }, 2000);
}

function hashCode(str) {
  if (typeof str !== 'string') return Math.abs(Date.now());
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

// استدعاء عند تغير حالة الدخول (من firebase.js)
window.onAuthStateChangedCallback = function(user) {
  // إعادة عرض القائمة إذا تغيرت حالة الدخول
  if (state.filteredMods.length > 0) {
    const seed = user ? hashCode(user.uid) : state.sessionSeed;
    state.filteredMods = shuffleArray(state.filteredMods, seed);
    renderGrid();
    updateStats();
    showShuffleIndicator();
  }
};

// استدعاء عند الحاجة لإعادة عرض الشبكة بعد تغيير المفضلة
window.renderGridCallback = function() {
  renderGrid();
};

// تفاصيل المود
function closeModDetail() {
  modDetailOverlay.style.display = 'none';
}

function openModDetail(slug) {
  if (typeof slug !== 'string' || !slug.match(/^[a-zA-Z0-9_-]+$/)) return;
  
  const mod = state.allMods.find(m => m.slug === slug);
  if (!mod) return;
  
  modDetailPanel.textContent = '';
  
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '×';
  closeBtn.style.cssText = 'float:right;background:none;border:none;color:white;font-size:1.5rem;cursor:pointer;';
  closeBtn.addEventListener('click', closeModDetail);
  modDetailPanel.appendChild(closeBtn);
  
  if (mod.icon_url) {
    const bigImg = document.createElement('img');
    bigImg.src = sanitizeUrl(mod.icon_url);
    bigImg.style.cssText = 'width:100%;max-height:250px;object-fit:cover;border-radius:12px;margin-bottom:16px;';
    bigImg.alt = mod.title;
    bigImg.addEventListener('error', function() { this.style.display = 'none'; });
    modDetailPanel.appendChild(bigImg);
  }
  
  const title = document.createElement('h2');
  title.textContent = mod.title;
  modDetailPanel.appendChild(title);
  
  const desc = document.createElement('p');
  desc.style.margin = '12px 0';
  desc.textContent = mod.description || 'No description';
  modDetailPanel.appendChild(desc);
  
  if (mod.gameVersions || mod.versions) {
    const versionsContainer = document.createElement('div');
    versionsContainer.style.margin = '10px 0';
    const vers = (mod.gameVersions || mod.versions || []).slice(0,5);
    vers.forEach(v => {
      const badge = document.createElement('span');
      badge.className = 'badge badge-version';
      badge.textContent = v;
      versionsContainer.appendChild(badge);
    });
    modDetailPanel.appendChild(versionsContainer);
  }
  
  const downloadBtn = document.createElement('button');
  downloadBtn.className = 'download-btn';
  downloadBtn.textContent = '⬇ Download Latest Version';
  downloadBtn.style.cssText = 'font-size:1rem; padding:12px 20px; margin:12px 0; width:100%;';
  downloadBtn.addEventListener('click', async () => {
    if (state.platform === 'java') {
      const versions = mod._versionData || await fetchProjectVersionsJava(mod.slug);
      if (Array.isArray(versions) && versions.length > 0) {
        const latest = versions.sort((a, b) => new Date(b.date_published) - new Date(a.date_published))[0];
        const url = sanitizeUrl(latest.files?.[0]?.url || '');
        if (url && url !== '#') {
          const newWindow = window.open(url, '_blank');
          if (newWindow) newWindow.opener = null;
        } else {
          showToast('الرابط غير متاح');
        }
      }
    } else {
      const url = sanitizeUrl(mod.download_url);
      if (url && url !== '#') {
        const newWindow = window.open(url, '_blank');
        if (newWindow) newWindow.opener = null;
      } else {
        showToast('الرابط غير متاح');
      }
    }
  });
  modDetailPanel.appendChild(downloadBtn);
  
  if (state.platform === 'java') {
    const modrinthLink = document.createElement('a');
    modrinthLink.href = sanitizeUrl(`https://modrinth.com/mod/${mod.slug}`);
    modrinthLink.className = 'card-link';
    modrinthLink.target = '_blank';
    modrinthLink.rel = 'noopener noreferrer';
    modrinthLink.textContent = 'View on Modrinth';
    modDetailPanel.appendChild(modrinthLink);
  }
  
  // إعلان داخل التفاصيل
  const adContainer = document.createElement('div');
  adContainer.className = 'ad-card-inline';
  const adFlex = document.createElement('div');
  adFlex.style.cssText = 'display:flex;align-items:center;gap:10px;';
  const adImg = document.createElement('div');
  adImg.className = 'ad-horizontal-img';
  adImg.style.cssText = 'width:60px;height:60px;border-radius:10px;background:linear-gradient(135deg,#7c3aed,#d4a843);';
  adFlex.appendChild(adImg);
  const adText = document.createElement('div');
  const adTitle = document.createElement('div');
  adTitle.style.cssText = 'font-weight:700;color:white;';
  adTitle.textContent = 'إعلان ممول';
  const adSub = document.createElement('div');
  adSub.style.cssText = 'font-size:0.7rem;color:#aaa;';
  adSub.textContent = 'احصل على أفضل الإضافات';
  adText.appendChild(adTitle);
  adText.appendChild(adSub);
  adFlex.appendChild(adText);
  adContainer.appendChild(adFlex);
  const adLink = document.createElement('a');
  adLink.href = '#';
  adLink.className = 'ad-horizontal-btn';
  adLink.style.marginTop = '8px';
  adLink.target = '_blank';
  adLink.rel = 'noopener noreferrer';
  adLink.textContent = 'معرفة المزيد';
  adLink.addEventListener('click', e => e.preventDefault());
  adContainer.appendChild(adLink);
  modDetailPanel.appendChild(adContainer);
  
  modDetailOverlay.style.display = 'flex';
}

// فتح التفاصيل من أي مكان
window.openModDetail = openModDetail;

modDetailOverlay.addEventListener('click', e => {
  if (e.target === modDetailOverlay) closeModDetail();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && modDetailOverlay.style.display === 'flex') closeModDetail();
});

// التوافق
function openCompatModal() {
  if (state.platform !== 'java') return;
  
  compatContent.textContent = '';
  compatModal.style.display = 'flex';
  
  const heading = document.createElement('h3');
  heading.style.color = 'white';
  const hIcon = document.createElement('i');
  hIcon.className = 'fa-solid fa-link';
  heading.appendChild(hIcon);
  heading.append(' Select mods');
  compatContent.appendChild(heading);
  
  const listContainer = document.createElement('div');
  listContainer.style.cssText = 'max-height:300px;overflow:auto;';
  
  state.selectedForCompat.clear();
  
  state.filteredMods.slice(0, 20).forEach(mod => {
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = mod.slug;
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) state.selectedForCompat.add(mod.slug);
      else state.selectedForCompat.delete(mod.slug);
    });
    label.appendChild(checkbox);
    label.append(' ' + mod.title);
    listContainer.appendChild(label);
    listContainer.appendChild(document.createElement('br'));
  });
  
  compatContent.appendChild(listContainer);
  
  const checkBtn = document.createElement('button');
  checkBtn.id = 'runCheckBtn';
  checkBtn.className = 'download-btn';
  checkBtn.textContent = 'Check';
  checkBtn.addEventListener('click', () => {
    const resultDiv = document.getElementById('checkResult');
    if (!resultDiv) return;
    resultDiv.textContent = '';
    
    const slugs = Array.from(state.selectedForCompat);
    if (slugs.length < 2) {
      const msg = document.createElement('p');
      msg.style.color = 'red';
      msg.textContent = 'اختر مودين على الأقل';
      resultDiv.appendChild(msg);
      return;
    }
    
    const mods = slugs.map(s => state.allMods.find(m => m.slug === s)).filter(Boolean);
    if (mods.length < 2) {
      const msg = document.createElement('p');
      msg.style.color = 'red';
      msg.textContent = 'بعض المودات غير موجودة';
      resultDiv.appendChild(msg);
      return;
    }
    
    const common = [...new Set(mods[0].gameVersions)].filter(v => 
      mods.every(m => m.gameVersions.includes(v))
    );
    
    const msg = document.createElement('p');
    if (common.length > 0) {
      msg.style.color = '#00e676';
      const icon = document.createElement('i');
      icon.className = 'fa-solid fa-check';
      msg.appendChild(icon);
      msg.append(' Compatible: ' + common.join(', '));
    } else {
      msg.style.color = 'red';
      const icon = document.createElement('i');
      icon.className = 'fa-solid fa-xmark';
      msg.appendChild(icon);
      msg.append(' No common version');
    }
    resultDiv.appendChild(msg);
  });
  compatContent.appendChild(checkBtn);
  
  const resultDiv = document.createElement('div');
  resultDiv.id = 'checkResult';
  compatContent.appendChild(resultDiv);
}

compatBtn.addEventListener('click', openCompatModal);

function closeCompatModal() {
  compatModal.style.display = 'none';
  state.selectedForCompat.clear();
}
compatModal.addEventListener('click', e => {
  if (e.target === compatModal) closeCompatModal();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && compatModal.style.display === 'flex') closeCompatModal();
});

// API و Rate Limiting
let lastRequestTime = 0;
async function safeFetch(url, options) {
  const now = Date.now();
  if (now - lastRequestTime < 500) return null;
  lastRequestTime = now;
  return fetch(url, options);
}

async function searchJava(query, offset = 0) {
  const safeQuery = encodeURIComponent(query.trim());
  const res = await safeFetch(`https://api.modrinth.com/v2/search?query=${safeQuery}&limit=20&offset=${offset}`);
  if (!res || !res.ok) throw new Error('API failed');
  const data = await res.json();
  return (data.hits || []).map(hit => ({
    ...hit,
    title: typeof hit.title === 'string' ? hit.title : 'Unknown',
    slug: typeof hit.slug === 'string' ? hit.slug : '',
    description: typeof hit.description === 'string' ? hit.description : '',
    icon_url: typeof hit.icon_url === 'string' ? hit.icon_url : null,
    categories: Array.isArray(hit.categories) ? hit.categories : [],
    date_modified: hit.date_modified || null,
    downloads: typeof hit.downloads === 'number' ? hit.downloads : (hit.follows || 0),
    rating: typeof hit.rating === 'number' ? hit.rating : 0
  }));
}

async function fetchProjectVersionsJava(slug) {
  if (!slug || typeof slug !== 'string' || !slug.match(/^[a-zA-Z0-9_-]+$/)) return [];
  if (state.versionCache[slug]) return state.versionCache[slug];
  try {
    const res = await safeFetch(`https://api.modrinth.com/v2/project/${encodeURIComponent(slug)}/version`);
    if (!res || !res.ok) throw new Error('Version fetch failed');
    const data = await res.json();
    state.versionCache[slug] = Array.isArray(data) ? data : [];
    return state.versionCache[slug];
  } catch (e) {
    state.versionCache[slug] = [];
    return [];
  }
}

async function searchBedrock(query, offset = 0) {
  const safeQuery = encodeURIComponent(query.trim());
  const res = await safeFetch(`https://api.mcpedl.com/v1/search?query=${safeQuery}&limit=20&offset=${offset}`);
  if (!res || !res.ok) throw new Error('Bedrock API error');
  const json = await res.json();
  return (json.posts || []).map(post => ({
    title: typeof post.title === 'string' ? post.title : 'Unknown',
    slug: (typeof post.slug === 'string' ? post.slug : post.id?.toString()) || 'unknown',
    description: typeof post.description === 'string' ? post.description : '',
    icon_url: typeof post.thumbnail === 'string' ? post.thumbnail : typeof post.image === 'string' ? post.image : null,
    date_modified: post.date || post.updated || null,
    versions: Array.isArray(post.game_versions) ? post.game_versions : [],
    download_url: typeof post.download_url === 'string' ? post.download_url : typeof post.link === 'string' ? post.link : '#',
    category: typeof post.category === 'string' ? post.category : 'addon',
    downloads: typeof post.downloads === 'number' ? post.downloads : 0,
    rating: typeof post.rating === 'number' ? post.rating : 0
  }));
}

function enrichMod(raw) {
  if (!raw || typeof raw !== 'object') return null;
  
  if (state.platform === 'java') {
    return {
      title: typeof raw.title === 'string' ? raw.title : 'Unknown',
      slug: typeof raw.slug === 'string' ? raw.slug : 'unknown',
      description: typeof raw.description === 'string' ? raw.description : '',
      icon_url: typeof raw.icon_url === 'string' ? raw.icon_url : null,
      categories: Array.isArray(raw.categories) ? raw.categories : [],
      date_modified: raw.date_modified || null,
      loaders: (Array.isArray(raw.categories) ? raw.categories : []).filter(c => 
        typeof c === 'string' && ['fabric','forge','neoforge','quilt'].includes(c.toLowerCase())
      ),
      healthStatus: 'WORKING',
      gameVersions: [],
      _versionData: null,
      downloads: typeof raw.downloads === 'number' ? raw.downloads : 0,
      rating: typeof raw.rating === 'number' ? raw.rating : 0
    };
  } else {
    return {
      title: typeof raw.title === 'string' ? raw.title : 'Unknown',
      slug: typeof raw.slug === 'string' ? raw.slug : 'unknown',
      description: typeof raw.description === 'string' ? raw.description : '',
      icon_url: typeof raw.icon_url === 'string' ? raw.icon_url : null,
      date_modified: raw.date_modified || null,
      versions: Array.isArray(raw.versions) ? raw.versions : [],
      download_url: typeof raw.download_url === 'string' ? raw.download_url : '#',
      category: typeof raw.category === 'string' ? raw.category : 'addon',
      downloads: typeof raw.downloads === 'number' ? raw.downloads : 0,
      rating: typeof raw.rating === 'number' ? raw.rating : 0
    };
  }
}

async function performSearch(query) {
  const sanitizedQuery = typeof query === 'string' ? query.trim().replace(/[<>"'`]/g, '') : '';
  state.searchQuery = sanitizedQuery;
  state.offsetJava = 0;
  state.offsetBedrock = 0;
  state.allMods = [];
  state.noMoreResults = false;
  
  modsGrid.textContent = '';
  const spinner = document.createElement('div');
  spinner.className = 'spinner';
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'display:flex;justify-content:center;padding:30px;';
  wrapper.appendChild(spinner);
  modsGrid.appendChild(wrapper);

  try {
    if (state.platform === 'java') {
      const hits = await searchJava(sanitizedQuery || 'minecraft', 0);
      const rawMods = hits.map(enrichMod).filter(Boolean);
      await Promise.all(rawMods.map(m => fetchProjectVersionsJava(m.slug).then(v => {
        m._versionData = v;
        m.gameVersions = [...new Set((v || []).flatMap(ver => Array.isArray(ver.game_versions) ? ver.game_versions : []))];
      })));
      state.allMods = rawMods;
      state.offsetJava = rawMods.length;
    } else {
      const posts = await searchBedrock(sanitizedQuery || 'bedrock', 0);
      state.allMods = posts.map(enrichMod).filter(Boolean);
      state.offsetBedrock = state.allMods.length;
    }
    applyFiltersAndRender();
  } catch (err) {
    showToast('فشل تحميل المودات');
  }
}

function applyFiltersAndRender() {
  let filtered = [...state.allMods];
  
  if (state.activeFilter === '⭐ trending') {
    filtered.sort((a,b) => (b.downloads||0) - (a.downloads||0));
  } else if (state.activeFilter === '🔥 popular') {
    filtered.sort((a,b) => (b.rating||0) - (a.rating||0));
  } else if (state.activeFilter === '🆕 new') {
    filtered.sort((a,b) => new Date(b.date_modified||0) - new Date(a.date_modified||0));
  } else if (state.activeFilter !== 'all') {
    if (state.platform === 'java') {
      filtered = filtered.filter(m => m.loaders && m.loaders.includes(state.activeFilter));
    } else {
      filtered = filtered.filter(m => m.category && m.category.toLowerCase() === state.activeFilter.toLowerCase());
    }
  }
  
  state.filteredMods = filtered;
  renderGrid();
  updateStats();
}

function createModCard(mod) {
  const card = document.createElement('div');
  card.className = 'card';
  card.addEventListener('click', () => openModDetail(mod.slug));
  
  const topRow = document.createElement('div');
  topRow.style.cssText = 'display:flex;gap:10px;';
  
  if (mod.icon_url) {
    const img = document.createElement('img');
    img.src = sanitizeUrl(mod.icon_url);
    img.className = 'card-icon';
    img.alt = mod.title;
    img.addEventListener('error', function() { this.style.display = 'none'; });
    topRow.appendChild(img);
  }
  
  const titleGroup = document.createElement('div');
  const title = document.createElement('div');
  title.style.fontWeight = '700';
  title.textContent = mod.title;
  titleGroup.appendChild(title);
  
  const slug = document.createElement('div');
  slug.style.cssText = 'font-size:0.7rem;color:#666;';
  slug.textContent = '/' + mod.slug;
  titleGroup.appendChild(slug);
  
  topRow.appendChild(titleGroup);
  card.appendChild(topRow);
  
  const badgeRow = document.createElement('div');
  badgeRow.style.margin = '8px 0';
  badgeRow.style.display = 'flex';
  badgeRow.style.flexWrap = 'wrap';
  badgeRow.style.gap = '4px';
  
  if (state.platform === 'java' && mod.loaders) {
    mod.loaders.forEach(loader => {
      const badge = document.createElement('span');
      badge.className = 'badge badge-loader';
      badge.textContent = loader;
      badgeRow.appendChild(badge);
    });
  }
  
  const versions = (mod.gameVersions || mod.versions || []).slice(0, 2);
  versions.forEach(version => {
    const badge = document.createElement('span');
    badge.className = 'badge badge-version';
    badge.textContent = version;
    badgeRow.appendChild(badge);
  });
  
  const ratingSpan = document.createElement('span');
  ratingSpan.style.cssText = 'font-size:0.7rem;color:var(--gold);';
  ratingSpan.textContent = `⭐ ${mod.rating || 0}`;
  badgeRow.appendChild(ratingSpan);
  
  const downloadsSpan = document.createElement('span');
  downloadsSpan.style.cssText = 'font-size:0.7rem;color:#aaa;';
  downloadsSpan.textContent = `⬇ ${mod.downloads || 0}`;
  badgeRow.appendChild(downloadsSpan);
  
  card.appendChild(badgeRow);
  
  const bottomRow = document.createElement('div');
  bottomRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;';
  
  const timestamp = document.createElement('span');
  timestamp.className = 'mod-timestamp';
  const clockIcon = document.createElement('i');
  clockIcon.className = 'fa-regular fa-clock';
  timestamp.appendChild(clockIcon);
  timestamp.append(' ' + formatDate(mod.date_modified));
  bottomRow.appendChild(timestamp);
  
  const favBtn = document.createElement('button');
  favBtn.className = 'favorite-star';
  favBtn.addEventListener('click', e => {
    e.stopPropagation();
    toggleFavorite(mod.slug); // التأشير على المفضلة (من firebase.js)
  });
  const favIcon = document.createElement('i');
  favIcon.className = userFavorites.has(mod.slug) ? 'fa-solid fa-star' : 'fa-regular fa-star';
  favBtn.appendChild(favIcon);
  bottomRow.appendChild(favBtn);
  
  const downloadAction = document.createElement('button');
  downloadAction.className = 'download-btn';
  downloadAction.textContent = 'DOWNLOAD';
  downloadAction.addEventListener('click', e => {
    e.stopPropagation();
    openModDetail(mod.slug); // يفتح التفاصيل للتحميل
  });
  bottomRow.appendChild(downloadAction);
  
  card.appendChild(bottomRow);
  
  return card;
}

function renderGrid() {
  modsGrid.textContent = '';
  const adsEvery = 5;
  
  state.filteredMods.forEach((mod, i) => {
    modsGrid.appendChild(createModCard(mod));
    
    if ((i + 1) % adsEvery === 0 && i < state.filteredMods.length - 1) {
      const adCard = document.createElement('div');
      adCard.className = 'ad-horizontal-card';
      adCard.style.cssText = 'margin:0;flex:1;min-width:200px;';
      const adBadge = document.createElement('div');
      adBadge.className = 'ad-badge-mini';
      adBadge.textContent = 'إعلان';
      adCard.appendChild(adBadge);
      const adImg = document.createElement('div');
      adImg.className = 'ad-horizontal-img';
      adImg.style.background = '#333';
      adCard.appendChild(adImg);
      const adTitle = document.createElement('div');
      adTitle.className = 'ad-horizontal-title';
      adTitle.textContent = 'Sponsored';
      adCard.appendChild(adTitle);
      const adLink = document.createElement('a');
      adLink.href = '#';
      adLink.className = 'ad-horizontal-btn';
      adLink.textContent = 'معرفة المزيد';
      adLink.addEventListener('click', e => e.preventDefault());
      adCard.appendChild(adLink);
      modsGrid.appendChild(adCard);
    }
  });
  
  const sentinel = document.createElement('div');
  sentinel.id = 'scrollSentinel';
  sentinel.style.height = '10px';
  modsGrid.appendChild(sentinel);
  
  observeSentinel();
}

function updateStats() {
  const statWorking = document.getElementById('statWorking');
  const statOutdated = document.getElementById('statOutdated');
  
  if (state.platform === 'java') {
    if (statWorking) statWorking.textContent = state.allMods.length;
    if (statOutdated) statOutdated.textContent = 0;
    const statBroken = document.getElementById('statBroken');
    const statIncompatible = document.getElementById('statIncompatible');
    if (statBroken) statBroken.textContent = 0;
    if (statIncompatible) statIncompatible.textContent = 0;
  } else {
    if (statWorking) statWorking.textContent = state.filteredMods.length;
    if (statOutdated) statOutdated.textContent = state.allMods.length - state.filteredMods.length;
  }
}

function formatDate(date) {
  if (!date) return '';
  try {
    const days = Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
    if (days < 0) return 'Recently';
    if (days < 1) return 'Today';
    if (days < 2) return 'Yesterday';
    if (days < 30) return `${days} days ago`;
    if (days < 365) return `${Math.floor(days/30)} months ago`;
    return `${Math.floor(days/365)} years ago`;
  } catch (e) {
    return '';
  }
}

// البحث مع debounce
let searchDebounceTimer;
function debouncedSearch(rawQuery) {
  const query = typeof rawQuery === 'string' ? rawQuery.trim().replace(/[<>"'`]/g, '') : '';
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    performSearch(query || (state.platform === 'java' ? 'minecraft' : 'bedrock'));
  }, 400);
}

searchBtn.addEventListener('click', () => debouncedSearch(searchInput.value));
searchInput.addEventListener('keypress', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    debouncedSearch(searchInput.value);
  }
});

// التمرير اللانهائي
let isLoadingMore = false;

const sentinelObserver = new IntersectionObserver(entries => {
  if (entries[0].isIntersecting && !state.noMoreResults && state.searchQuery && !isLoadingMore) {
    loadMore();
  }
}, { rootMargin: '200px' });

function observeSentinel() {
  const sentinel = document.getElementById('scrollSentinel');
  if (sentinel) sentinelObserver.observe(sentinel);
  else sentinelObserver.disconnect();
}

async function loadMore() {
  if (isLoadingMore || state.noMoreResults) return;
  isLoadingMore = true;
  try {
    let newMods = [];
    
    if (state.platform === 'java') {
      const hits = await searchJava(state.searchQuery, state.offsetJava);
      if (!hits || hits.length === 0) { state.noMoreResults = true; return; }
      
      const rawMods = hits.map(enrichMod).filter(Boolean);
      await Promise.all(rawMods.map(m => fetchProjectVersionsJava(m.slug).then(v => {
        m._versionData = v;
        m.gameVersions = [...new Set((v || []).flatMap(ver => Array.isArray(ver.game_versions) ? ver.game_versions : []))];
      })));
      
      state.offsetJava += hits.length;
      newMods = rawMods;
    } else {
      const posts = await searchBedrock(state.searchQuery, state.offsetBedrock);
      if (!posts || posts.length === 0) { state.noMoreResults = true; return; }
      state.offsetBedrock += posts.length;
      newMods = posts.map(enrichMod).filter(Boolean);
    }
    
    state.allMods = [...state.allMods, ...newMods];
    const seed = currentUser ? hashCode(currentUser.uid) : state.sessionSeed;
    state.allMods = shuffleArray(state.allMods, seed);
    applyFiltersAndRender();
    observeSentinel();
  } catch(e) {
    showToast('فشل تحميل المزيد');
  } finally {
    isLoadingMore = false;
  }
}

// بدء التطبيق
state.sessionSeed = Date.now();
updatePlatformUI();
debouncedSearch('minecraft');