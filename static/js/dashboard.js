var TOKEN = '';
var machinesData = [];
var currentTemplate = 'grid';
var refreshInterval = null;
var checkedUsers = {};
var checkedProcs = {};
var checkedMachines = {};
var currentLayoutId = 'default';
var layoutsData = [];
var pagesData = [];
var currentPageId = 'all';
var allMachinesList = [];

// ============================================================
// ICONS
// ============================================================
var POPULAR_ICONS = [
  'mdi:server', 'mdi:desktop-tower', 'mdi:laptop', 'mdi:router-wireless',
  'mdi:nas', 'mdi:cloud', 'mdi:network', 'mdi:database',
  'mdi:harddisk', 'mdi:monitor', 'mdi:television', 'mdi:cellphone',
  'mdi:printer', 'mdi:camera', 'mdi:cctv', 'mdi:shield-home',
  'mdi:home', 'mdi:factory', 'mdi:domain', 'mdi:office-building',
  'mdi:server-network', 'mdi:access-point-network', 'mdi:lan',
  'mdi:web', 'mdi:radio-tower', 'mdi:access-point', 'mdi:switch',
  'mdi:docker', 'mdi:container', 'mdi:cube', 'mdi:hexagon',
  'mdi:router-network', 'mdi:ethernet', 'mdi:cable-routing',
  'mdi:harddisk-variant', 'mdi:solid', 'mdi:server-minus',
  'mdi:server-plus', 'mdi:server-security', 'mdi:server-off',
  'mdi:raspberry-pi', 'mdi:chip', 'mdi:microchip', 'mdi:memory',
  'mdi:thermometer', 'mdi:fan', 'mdi:car-battery', 'mdi:battery',
  'mdi:power-plug', 'mdi:lightning-bolt', 'mdi:flash',
  'mdi:weather-sunny', 'mdi:thermometer-lines',
  'mdi:video', 'mdi:music', 'mdi:filmstrip', 'mdi:gamepad-variant',
  'mdi:robot', 'mdi:brain', 'mdi:cpu-64-bit', 'mdi:chip',
  'mdi:fire', 'mdi:water', 'mdi:leaf', 'mdi:flower',
  'mdi:star', 'mdi:heart', 'mdi:trophy', 'mdi:medal',
  'mdi:lock', 'mdi:key', 'mdi:shield-check', 'mdi:shield-alert',
  'mdi:eye', 'mdi:eye-off', 'mdi:account', 'mdi:account-group',
  'mdi:wrench', 'mdi:screwdriver', 'mdi:tools', 'mdi:cog',
  'mdi:cog-transfer', 'mdi:tune', 'mdi:sliders',
  'mdi:magnify', 'mdi:magnify-plus', 'mdi:magnify-minus',
  'mdi:bell', 'mdi:bell-ring', 'mdi:bell-off',
  'mdi:email', 'mdi:phone', 'mdi:message', 'mdi:message-alert',
  'mdi:chart-line', 'mdi:chart-bar', 'mdi:chart-pie', 'mdi:chart-areaspline',
  'mdi:speedometer', 'mdi:gauge', 'mdi:dashboard',
  'mdi:calendar', 'mdi:clock', 'mdi:timer', 'mdi:history',
  'mdi:map-marker', 'mdi:compass', 'mdi:directions',
  'mdi:car', 'mdi:bus', 'mdi:train', 'mdi:airplane',
  'mdi:spotify', 'mdi:youtube', 'mdi:github', 'mdi:reddit',
];

var MACHINE_COLORS = [
  '', '#3b82f6', '#22c55e', '#ef4444', '#eab308',
  '#f97316', '#a855f7', '#06b6d4', '#ec4899', '#14b8a6',
];

function initDashboard(username) {
  TOKEN = getToken();
  var savedCpuMin = localStorage.getItem('cpuMinFilter');
  if (savedCpuMin !== null) {
    document.getElementById('cpuMinFilter').value = savedCpuMin;
  }
  loadLayouts();
  loadPages();
  loadAllMachinesList();
  changeTemplate('grid');
  refreshAll();
  refreshInterval = setInterval(refreshAll, 10000);
}

function getToken() {
  var stored = localStorage.getItem('token');
  if (stored) return stored;
  var parts = document.cookie.split(';');
  for (var i = 0; i < parts.length; i++) {
    var c = parts[i].trim();
    if (c.startsWith('token=')) return c.substring(6);
  }
  return '';
}

function api(method, path, body) {
  var opts = {
    method: method,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TOKEN }
  };
  if (body) opts.body = JSON.stringify(body);
  return fetch('/api' + path, opts).then(function(r) { return r.json(); });
}

function loadAllMachinesList() {
  api('GET', '/machines/').then(function(data) {
    allMachinesList = data || [];
  });
}

// ============================================================
// PAGES
// ============================================================

function loadPages() {
  api('GET', '/dashboard/pages').then(function(data) {
    pagesData = data || [];
    renderPageTabs();
  });
}

function renderPageTabs() {
  var container = document.getElementById('pageTabs');
  if (!container) return;
  var html = '<button class="page-tab' + (currentPageId === 'all' ? ' active' : '') + '" data-page-id="all" onclick="selectPage(\'all\')">';
  html += '<span class="mdi mdi-view-dashboard"></span> ' + t('dashboard.all_pages');
  html += '</button>';
  pagesData.forEach(function(p) {
    var active = currentPageId == p.id ? ' active' : '';
    html += '<button class="page-tab' + active + '" data-page-id="' + p.id + '" onclick="selectPage(' + p.id + ')">';
    html += '<span class="mdi ' + (p.icon || 'mdi:view-dashboard').replace(':', '-') + '"></span> ' + p.name;
    html += '<span class="page-tab-actions">';
    html += '<span onclick="event.stopPropagation();openPageModal(' + p.id + ')" title="Editar" style="cursor:pointer;margin-right:0.3rem">✏</span>';
    html += '<span onclick="event.stopPropagation();deletePage(' + p.id + ')" title="Excluir" style="cursor:pointer">&#10005;</span>';
    html += '</span>';
    html += '</button>';
  });
  html += '<button class="page-tab-add" onclick="openPageModal()" title="' + t('dashboard.add_page') + '">+</button>';
  container.innerHTML = html;
}

function selectPage(pageId) {
  currentPageId = pageId;
  renderPageTabs();
  refreshAll();
}

function openPageModal(editId) {
  var modal = document.getElementById('pageModal');
  var title = document.getElementById('pageModalTitle');
  var nameInput = document.getElementById('pageNameInput');
  var editIdInput = document.getElementById('pageEditId');
  var iconPreview = document.getElementById('pageIconPreview');
  var iconName = document.getElementById('pageIconName');

  if (editId) {
    var page = pagesData.find(function(p) { return p.id === editId; });
    if (!page) return;
    title.textContent = t('dashboard.edit_page');
    editIdInput.value = editId;
    nameInput.value = page.name;
    iconPreview.className = 'mdi ' + (page.icon || 'mdi:view-dashboard');
    iconName.textContent = page.icon || 'mdi:view-dashboard';
  } else {
    title.textContent = t('dashboard.create_page');
    editIdInput.value = '';
    nameInput.value = '';
    iconPreview.className = 'mdi mdi:view-dashboard';
    iconName.textContent = 'mdi:view-dashboard';
  }

  // Populate machine checkboxes
  var list = document.getElementById('pageMachinesList');
  var selectedIds = [];
  if (editId) {
    var pg = pagesData.find(function(p) { return p.id === editId; });
    if (pg) selectedIds = pg.machine_ids || [];
  }
  var html = '';
  allMachinesList.forEach(function(m) {
    var chk = selectedIds.indexOf(m.id) !== -1 ? ' checked' : '';
    html += '<label class="toggle" style="padding:0.3rem 0;font-size:0.85rem">';
    html += '<input type="checkbox" class="page-machine-cb" value="' + m.id + '"' + chk + '>';
    html += '<span class="toggle-track"></span>';
    html += '<span class="toggle-label"><i class="mdi ' + (m.icon || 'mdi:server').replace(':', '-') + '" style="font-size:1rem"></i> ' + m.name + '</span>';
    html += '</label>';
  });
  list.innerHTML = html || '<p style="color:var(--text-muted);font-size:0.8rem">' + t('dashboard.no_machines') + '</p>';

  modal.style.display = 'flex';
  nameInput.focus();
}

function closePageModal(e) {
  if (!e || e.target === document.getElementById('pageModal')) {
    document.getElementById('pageModal').style.display = 'none';
  }
}

function confirmSavePage() {
  var editId = document.getElementById('pageEditId').value;
  var name = document.getElementById('pageNameInput').value.trim();
  var icon = document.getElementById('pageIconName').textContent;
  if (!name) return;

  var machineIds = [];
  document.querySelectorAll('.page-machine-cb:checked').forEach(function(cb) {
    machineIds.push(parseInt(cb.value));
  });

  if (editId) {
    api('PUT', '/dashboard/pages/' + editId, { name: name, icon: icon, machine_ids: machineIds }).then(function(res) {
      document.getElementById('pageModal').style.display = 'none';
      if (res.message) loadPages();
    });
  } else {
    api('POST', '/dashboard/pages', { name: name, icon: icon, machine_ids: machineIds }).then(function(res) {
      document.getElementById('pageModal').style.display = 'none';
      if (res.id) {
        loadPages();
        selectPage(res.id);
      }
    });
  }
}

function deletePage(pageId) {
  if (!confirm(t('dashboard.confirm_delete_page'))) return;
  api('DELETE', '/dashboard/pages/' + pageId).then(function(res) {
    if (res.message) {
      if (currentPageId == pageId) selectPage('all');
      loadPages();
    }
  });
}

// ============================================================
// ICON PICKER (pages)
// ============================================================

function togglePageIconPicker() {
  var dd = document.getElementById('pageIconDropdown');
  var isOpen = dd.classList.contains('open');
  dd.classList.toggle('open');
  if (!isOpen) {
    renderPageIconGrid('');
    document.getElementById('pageIconSearch').value = '';
    document.getElementById('pageIconSearch').focus();
  }
}

function renderPageIconGrid(filter) {
  var grid = document.getElementById('pageIconGrid');
  var current = document.getElementById('pageIconName').textContent;
  var icons = POPULAR_ICONS;
  if (filter) {
    var q = filter.toLowerCase();
    icons = icons.filter(function(ic) { return ic.indexOf(q) !== -1; });
  }
  var html = '';
  icons.forEach(function(ic) {
    var sel = ic === current ? ' selected' : '';
    html += '<div class="icon-picker-item' + sel + '" data-icon="' + ic + '" onclick="selectPageIcon(\'' + ic + '\')" title="' + ic + '">';
    html += '<i class="mdi ' + ic.replace(':', '-') + '"></i></div>';
  });
  grid.innerHTML = html;
}

function selectPageIcon(icon) {
  document.getElementById('pageIconPreview').className = 'mdi ' + icon.replace(':', '-');
  document.getElementById('pageIconName').textContent = icon;
  document.getElementById('pageIconDropdown').classList.remove('open');
}

function filterPageIcons() {
  var q = document.getElementById('pageIconSearch').value;
  renderPageIconGrid(q);
}

// Close icon picker on outside click
document.addEventListener('click', function(e) {
  var wrap = document.querySelector('#pageModal .icon-picker-wrap');
  if (wrap && !wrap.contains(e.target)) {
    document.getElementById('pageIconDropdown').classList.remove('open');
  }
});

// ============================================================
// DATA REFRESH
// ============================================================

function refreshAll() {
  var url = '/dashboard/all';
  if (currentPageId !== 'all') {
    url += '?page_id=' + currentPageId;
  }
  api('GET', url).then(function(data) {
    machinesData = data.machines || [];
    updateOverview();
    updateMachineFilter();
    initMachinesSection();
    updatePerMachineFilters();
    renderDashboard();
  }).catch(function(err) {
    console.error('Erro ao carregar dados:', err);
  });
}

function updateOverview() {
  var total = machinesData.length;
  var online = machinesData.filter(function(m) { return m.status === 'online'; }).length;
  var offline = total - online;
  var cpuSum = 0, memSum = 0, count = 0;
  machinesData.forEach(function(m) {
    if (m.status === 'online' && m.cpu) {
      cpuSum += m.cpu.total || 0;
      memSum += m.memory ? (m.memory.percent || 0) : 0;
      count++;
    }
  });
  document.getElementById('statTotal').textContent = total;
  document.getElementById('statOnline').textContent = online;
  document.getElementById('statOffline').textContent = offline;
  document.getElementById('statAvgCPU').textContent = count > 0 ? Math.round(cpuSum / count) + '%' : '0%';
  document.getElementById('statAvgMem').textContent = count > 0 ? Math.round(memSum / count) + '%' : '0%';
}

function updateMachineFilter() {
  var container = document.getElementById('machineFilter');
  var html = '';
  machinesData.forEach(function(m) {
    var mid = m.machine.id;
    if (!(mid in checkedMachines)) checkedMachines[mid] = true;
    var chk = checkedMachines[mid] ? ' checked' : '';
    var icon = m.machine.icon || 'mdi:server';
    html += '<label class="toggle"><input type="checkbox" class="machine-cb"' + chk + ' onchange="toggleMachine(this)" data-machine="' + mid + '">';
    html += '<span class="toggle-track"></span>';
    html += '<span class="toggle-label"><i class="mdi ' + icon.replace(':', '-') + '" style="font-size:0.9rem"></i> ' + m.machine.name + '</span></label>';
  });
  container.innerHTML = html;
  var countEl = document.getElementById('machineCount');
  if (countEl) countEl.textContent = machinesData.length + ' total';
}

function toggleMachine(cb) {
  checkedMachines[parseInt(cb.dataset.machine)] = cb.checked;
  applyFilters();
}

function toggleAllMachines(val) {
  var cbs = document.querySelectorAll('.machine-cb');
  cbs.forEach(function(cb) {
    cb.checked = val;
    checkedMachines[parseInt(cb.dataset.machine)] = val;
  });
  applyFilters();
}

function toggleMachinesSection() {
  var container = document.getElementById('machinesListContainer');
  var icon = document.getElementById('machinesExpandIcon');
  var isHidden = container.style.maxHeight === '0px';
  if (isHidden) {
    container.style.maxHeight = container.scrollHeight + 'px';
    icon.textContent = '▼';
  } else {
    container.style.maxHeight = '0px';
    icon.textContent = '▶';
  }
  localStorage.setItem('machinesCollapsed', isHidden ? '0' : '1');
}

function initMachinesSection() {
  var collapsed = localStorage.getItem('machinesCollapsed') !== '0';
  var container = document.getElementById('machinesListContainer');
  var icon = document.getElementById('machinesExpandIcon');
  if (collapsed) {
    container.style.maxHeight = '0px';
    icon.textContent = '▶';
  } else {
    container.style.maxHeight = container.scrollHeight + 'px';
    icon.textContent = '▼';
  }
  var countEl = document.getElementById('machineCount');
  if (countEl && machinesData.length > 0) {
    countEl.textContent = machinesData.length + ' total';
  }
}

function updatePerMachineFilters() {
  machinesData.forEach(function(m) {
    var mid = m.machine.id;
    var key = 'm' + mid;

    if (!(key in checkedUsers)) checkedUsers[key] = {};
    if (!(key in checkedProcs)) checkedProcs[key] = {};

    var processes = m.processlist || [];
    var users = {};
    var procs = {};
    processes.forEach(function(p) {
      var u = p.username || 'N/A';
      var n = p.name || '?';
      users[u] = (users[u] || 0) + 1;
      procs[n] = (procs[n] || 0) + 1;
    });
    Object.keys(users).forEach(function(u) {
      if (!(u in checkedUsers[key])) checkedUsers[key][u] = true;
    });
    Object.keys(procs).forEach(function(p) {
      if (!(p in checkedProcs[key])) checkedProcs[key][p] = true;
    });
  });
}

function toggleExpand(key) {
  var body = document.getElementById('body_' + key);
  var icon = document.getElementById('icon_' + key);
  var isHidden = body.style.display === 'none';
  body.style.display = isHidden ? 'block' : 'none';
  icon.textContent = isHidden ? '▼' : '▶';
  localStorage.setItem('expand_' + key, isHidden ? '1' : '0');
}

function togglePerMachineItem(key, type, name, checked) {
  if (type === 'user') checkedUsers[key][name] = checked;
  else checkedProcs[key][name] = checked;
  applyFilters();
}

function toggleAllPerMachine(key, type, val) {
  var map = type === 'user' ? checkedUsers[key] : checkedProcs[key];
  Object.keys(map).forEach(function(k) { map[k] = val; });
  updatePerMachineFilters();
  applyFilters();
}

function filterItems(key, type, query) {
  var container = document.getElementById('items_' + key + '_' + type);
  if (!container) return;
  var q = query.toLowerCase();
  var labels = container.querySelectorAll('.filter-item');
  labels.forEach(function(lbl) {
    var name = lbl.getAttribute('data-name') || '';
    lbl.style.display = name.indexOf(q) !== -1 ? '' : 'none';
  });
}

function toggleAllPerMachineGlobal(type, val) {
  Object.keys(checkedUsers).forEach(function(key) {
    if (type === 'user') {
      Object.keys(checkedUsers[key]).forEach(function(k) { checkedUsers[key][k] = val; });
    }
  });
  Object.keys(checkedProcs).forEach(function(key) {
    if (type === 'proc') {
      Object.keys(checkedProcs[key]).forEach(function(k) { checkedProcs[key][k] = val; });
    }
  });
  updatePerMachineFilters();
  applyFilters();
}

function applyFilters() {
  renderDashboard();
}

function getFilteredMachines() {
  var showCPU = document.getElementById('filterCPU').checked;
  var showMem = document.getElementById('filterMem').checked;
  var showGPU = document.getElementById('filterGPU').checked;
  var showDisk = document.getElementById('filterDisk').checked;
  var showNet = document.getElementById('filterNet').checked;
  var showProc = document.getElementById('filterProc').checked;
  var sortBy = document.getElementById('sortBy').value;
  var cpuMin = parseFloat(document.getElementById('cpuMinFilter').value) || 0;
  localStorage.setItem('cpuMinFilter', cpuMin);
  var filtered = machinesData.filter(function(m) {
    if (!checkedMachines[m.machine.id]) return false;
    // CPU minimum filter: hide machines with CPU below threshold (always show offline)
    if (m.status === 'online' && m.cpu && (m.cpu.total || 0) < cpuMin) return false;
    return true;
  });
  filtered.sort(function(a, b) {
    if (sortBy === 'name') return a.machine.name.localeCompare(b.machine.name);
    if (sortBy === 'cpu') return ((b.cpu ? b.cpu.total : 0) || 0) - ((a.cpu ? a.cpu.total : 0) || 0);
    if (sortBy === 'mem') return ((b.memory ? b.memory.percent : 0) || 0) - ((a.memory ? a.memory.percent : 0) || 0);
    if (sortBy === 'status') return (b.status === 'online' ? 1 : 0) - (a.status === 'online' ? 1 : 0);
    return 0;
  });
  return { machines: filtered, showCPU: showCPU, showMem: showMem, showGPU: showGPU, showDisk: showDisk, showNet: showNet, showProc: showProc };
}

function renderDashboard() {
  var f = getFilteredMachines();
  var grid = document.getElementById('dashboardGrid');
  grid.className = 'dashboard-grid view-' + currentTemplate;
  var html = '';
  f.machines.forEach(function(m) {
    html += renderMachineCard(m, f);
  });
  grid.innerHTML = html || '<p style="color:var(--text-muted);text-align:center;grid-column:1/-1;">' + t('dashboard.no_machines') + '</p>';
}

function pctClass(val) {
  if (val >= 90) return 'critical';
  if (val >= 70) return 'warning';
  return 'normal';
}

function tempClass(val) {
  if (val >= 85) return 'critical';
  if (val >= 70) return 'warning';
  return 'normal';
}

function renderMachineCard(m, filters) {
  var isOffline = m.status !== 'online';
  var cpuTotal = m.cpu ? (m.cpu.total || 0) : 0;
  var memPercent = m.memory ? (m.memory.percent || 0) : 0;
  var memTotal = m.memory ? (m.memory.total || 0) : 0;
  var memUsed = m.memory ? (m.memory.used || 0) : 0;
  var load = m.load ? m.load : {};
  var uptime = m.uptime ? m.uptime : {};
  var disks = m.disk || [];
  var networks = m.network || [];
  var processes = m.processlist || [];
  var mid = m.machine.id;
  var key = 'm' + mid;
  var icon = m.machine.icon || 'mdi:server';
  var color = m.machine.color || '';

  var cardStyle = '';
  var headerStyle = '';
  if (color) {
    cardStyle = ' style="border-left:3px solid ' + color + '"';
  }

  var html = '<div class="machine-card' + (isOffline ? ' offline' : '') + '"' + cardStyle + '>';
  html += '<div class="card-header">';
  html += '<h4 style="cursor:pointer" onclick="window.location.href=\'/machine/' + mid + '\'">';
  html += '<i class="mdi ' + icon.replace(':', '-') + '" style="font-size:1.2rem;flex-shrink:0"></i>';
  html += '<span class="status-dot ' + (isOffline ? 'offline' : 'online') + '"></span>';
  html += m.machine.name;
  if (m.system && m.system.hostname && m.system.hostname !== m.machine.name) {
    html += '<span style="color:var(--text-muted);font-weight:400;font-size:0.8rem"> — ' + m.system.hostname + '</span>';
  }
  html += '</h4>';
  html += '<div style="display:flex;align-items:center;gap:0.5rem">';
  html += '<span style="font-size:0.75rem;color:var(--text-muted)">' + m.machine.host + '</span>';
  if (!isOffline && processes.length > 0) {
    html += '<button class="card-filter-btn" onclick="event.stopPropagation();openFilterModal(' + mid + ')" title="Filtrar processos">⚙ ' + t('machine.filters') + '</button>';
  }
  html += '</div></div>';
  html += '<div class="card-body">';

  if (isOffline) {
    html += '<p style="text-align:center;color:var(--text-muted);padding:1rem;">' + t('dashboard.offline') + '</p></div></div>';
    return html;
  }

  html += '<div class="metric-grid">';

  if (filters.showCPU) {
    html += '<div class="metric-item"><span class="metric-label">CPU</span>';
    html += '<span class="metric-value ' + pctClass(cpuTotal) + '">' + Math.round(cpuTotal) + '%</span>';
    html += '<div class="progress-bar"><div class="progress-fill ' + pctClass(cpuTotal) + '" style="width:' + cpuTotal + '%"></div></div></div>';
  }

  if (filters.showMem) {
    html += '<div class="metric-item"><span class="metric-label">' + t('machine.memory') + '</span>';
    html += '<span class="metric-value ' + pctClass(memPercent) + '">' + Math.round(memPercent) + '%</span>';
    html += '<div class="progress-bar"><div class="progress-fill ' + pctClass(memPercent) + '" style="width:' + memPercent + '%"></div></div>';
    html += '<span style="font-size:0.7rem;color:var(--text-muted)">' + formatBytes(memUsed) + ' / ' + formatBytes(memTotal) + '</span></div>';
  }

  if (filters.showMem) {
    var ut = typeof uptime === 'number' ? uptime : (uptime.uptime || 0);
    if (ut > 0) {
      html += '<div class="metric-item"><span class="metric-label">' + t('machine.uptime') + '</span>';
      html += '<span class="metric-value" style="font-size:0.85rem">' + formatUptime(ut) + '</span></div>';
    }
  }

  var gpus = m.gpu || [];
  if (filters.showGPU && gpus.length > 0) {
    gpus.forEach(function(g) {
      var gpuLoad = g.load || 0;
      var gpuTemp = g.temperature || 0;
      var gpuMemP = g.mem_percent || 0;
      html += '<div class="metric-item" style="border-left:2px solid var(--accent);padding-left:0.5rem;margin-top:0.5rem">';
      html += '<span class="metric-label" style="color:var(--accent)">GPU: ' + (g.name || 'N/A') + '</span>';
      html += '<div style="display:flex;gap:1rem;flex-wrap:wrap;font-size:0.78rem">';
      html += '<span>Load: <strong class="' + pctClass(gpuLoad) + '">' + Math.round(gpuLoad) + '%</strong></span>';
      if (gpuTemp > 0) html += '<span>Temp: <strong class="' + tempClass(gpuTemp) + '">' + gpuTemp + '°C</strong></span>';
      if (gpuMemP > 0) html += '<span>VRAM: <strong class="' + pctClass(gpuMemP) + '">' + Math.round(gpuMemP) + '%</strong></span>';
      html += '</div>';
      html += '<div class="progress-bar"><div class="progress-fill ' + pctClass(gpuLoad) + '" style="width:' + gpuLoad + '%"></div></div>';
      html += '</div>';
    });
  }

  if (filters.showDisk && disks.length > 0) {
    html += '</div><div style="margin-top:0.75rem"><span class="metric-label">' + t('machine.disks') + '</span>';
    disks.forEach(function(d) {
      var dp = d.percent || 0;
      html += '<div style="display:flex;align-items:center;gap:0.5rem;margin:0.2rem 0;font-size:0.8rem">';
      html += '<span style="width:120px;color:var(--text-secondary)">' + (d.device_name || d.mnt_point || '') + '</span>';
      html += '<div class="progress-bar" style="flex:1"><div class="progress-fill ' + pctClass(dp) + '" style="width:' + dp + '%"></div></div>';
      html += '<span style="width:40px;text-align:right;color:var(--text-muted)">' + Math.round(dp) + '%</span></div>';
    });
    html += '</div>';
  }

  if (filters.showNet && networks.length > 0) {
    html += '<div style="margin-top:0.75rem"><span class="metric-label">' + t('machine.network') + '</span>';
    networks.forEach(function(n) {
      if (n.interface_name && n.interface_name !== 'lo') {
        html += '<div style="font-size:0.75rem;color:var(--text-secondary);margin:0.15rem 0">';
        html += n.interface_name + ': ▼' + formatBytes(n.bytes_rate_recv || 0) + '/s ▲' + formatBytes(n.bytes_rate_sent || 0) + '/s</div>';
      }
    });
    html += '</div>';
  }

  html += '</div>';

  if (filters.showProc && processes.length > 0) {
    var machineUsers = checkedUsers[key] || {};
    var machineProcs = checkedProcs[key] || {};
    var filteredProcs = processes.filter(function(p) {
      var u = p.username || 'N/A';
      var n = p.name || '?';
      return machineUsers[u] && machineProcs[n];
    });
    var topProcs = filteredProcs.slice(0, 10);
    var cpuCount = (m.cpu && m.cpu.cpucore) || 1;
    html += '<div style="margin-top:0.75rem"><span class="metric-label">' + t('machine.processes') + ' (' + filteredProcs.length + ' de ' + processes.length + ')</span>';
    html += '<table class="process-table"><thead><tr><th>' + t('machine.name') + '</th><th>' + t('machine.user') + '</th><th>' + t('machine.cpu_pct') + '</th><th>' + t('machine.mem_pct') + '</th></tr></thead><tbody>';
    topProcs.forEach(function(p) {
      var cpuNorm = Math.round((p.cpu_percent || 0) / cpuCount * 10) / 10;
      html += '<tr><td title="' + (p.cmdline || '') + '">' + (p.name || '?') + '</td>';
      html += '<td>' + (p.username || '-') + '</td>';
      html += '<td>' + cpuNorm + '</td>';
      html += '<td>' + (p.memory_percent || 0) + '</td></tr>';
    });
    html += '</tbody></table></div>';
  }

  html += '</div></div>';
  return html;
}

function formatBytes(b) {
  if (b === 0) return '0 B';
  var k = 1024;
  var sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  var i = Math.floor(Math.log(b) / Math.log(k));
  return parseFloat((b / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatUptime(s) {
  var d = Math.floor(s / 86400);
  var h = Math.floor((s % 86400) / 3600);
  var m = Math.floor((s % 3600) / 60);
  if (d > 0) return d + 'd ' + h + 'h';
  if (h > 0) return h + 'h ' + m + 'm';
  return m + 'm';
}

function changeTemplate(tpl) {
  currentTemplate = tpl;
  renderDashboard();
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

function getCurrentConfig() {
  return {
    template: currentTemplate,
    display: {
      cpu: document.getElementById('filterCPU').checked,
      mem: document.getElementById('filterMem').checked,
      disk: document.getElementById('filterDisk').checked,
      net: document.getElementById('filterNet').checked,
      proc: document.getElementById('filterProc').checked,
    },
    sortBy: document.getElementById('sortBy').value,
    machines: JSON.parse(JSON.stringify(checkedMachines)),
    users: JSON.parse(JSON.stringify(checkedUsers)),
    procs: JSON.parse(JSON.stringify(checkedProcs)),
  };
}

function applyConfig(cfg) {
  if (!cfg) return;
  if (cfg.template) {
    currentTemplate = cfg.template;
    document.getElementById('templateSelector').value = cfg.template;
  }
  if (cfg.display) {
    document.getElementById('filterCPU').checked = cfg.display.cpu !== false;
    document.getElementById('filterMem').checked = cfg.display.mem !== false;
    document.getElementById('filterDisk').checked = cfg.display.disk !== false;
    document.getElementById('filterNet').checked = cfg.display.net !== false;
    document.getElementById('filterProc').checked = cfg.display.proc !== false;
  }
  if (cfg.sortBy) document.getElementById('sortBy').value = cfg.sortBy;
  if (cfg.machines) {
    Object.keys(cfg.machines).forEach(function(k) { checkedMachines[k] = cfg.machines[k]; });
    var mcbs = document.querySelectorAll('.machine-cb');
    mcbs.forEach(function(cb) {
      var mid = parseInt(cb.dataset.machine);
      if (mid in checkedMachines) cb.checked = checkedMachines[mid];
    });
  }
  if (cfg.users) {
    Object.keys(cfg.users).forEach(function(k) { checkedUsers[k] = cfg.users[k]; });
  }
  if (cfg.procs) {
    Object.keys(cfg.procs).forEach(function(k) { checkedProcs[k] = cfg.procs[k]; });
  }
  updatePerMachineFilters();
  applyFilters();
}

function loadLayouts() {
  api('GET', '/dashboard/layouts').then(function(data) {
    layoutsData = data || [];
    var sel = document.getElementById('layoutSelector');
    sel.innerHTML = '';
    var defOpt = document.createElement('option');
    defOpt.value = 'default';
    defOpt.textContent = 'Default ★';
    if (currentLayoutId === 'default') defOpt.selected = true;
    sel.appendChild(defOpt);
    layoutsData.forEach(function(l) {
      var opt = document.createElement('option');
      opt.value = l.id;
      opt.textContent = l.name + (l.is_default ? ' ★' : '');
      if (l.id == currentLayoutId) opt.selected = true;
      sel.appendChild(opt);
    });
  });
}

function loadLayout(id) {
  if (id === 'default') {
    currentLayoutId = 'default';
    checkedUsers = {};
    checkedProcs = {};
    checkedMachines = {};
    document.getElementById('filterCPU').checked = true;
    document.getElementById('filterMem').checked = true;
    document.getElementById('filterDisk').checked = true;
    document.getElementById('filterNet').checked = true;
    document.getElementById('filterProc').checked = true;
    document.getElementById('sortBy').value = 'manual';
    refreshAll();
    return;
  }
  var layout = layoutsData.find(function(l) { return l.id == id; });
  if (!layout) return;
  currentLayoutId = layout.id;
  try {
    var cfg = JSON.parse(layout.config);
    applyConfig(cfg);
    refreshAll();
  } catch(e) {
    console.error('Erro ao carregar layout:', e);
  }
}

function saveCurrentLayout() {
  document.getElementById('layoutNameInput').value = '';
  document.getElementById('layoutActionSelect').value = 'new';
  toggleLayoutNameInput();

  var updateSel = document.getElementById('layoutUpdateSelect');
  updateSel.innerHTML = '';
  layoutsData.forEach(function(l) {
    var opt = document.createElement('option');
    opt.value = l.id;
    opt.textContent = l.name;
    if (l.id == currentLayoutId) opt.selected = true;
    updateSel.appendChild(opt);
  });

  var baseSel = document.getElementById('layoutBaseSelect');
  baseSel.innerHTML = '<option value="">' + t('layouts.copy_empty') + '</option><option value="__current__">' + t('layouts.use_current') + '</option>';
  layoutsData.forEach(function(l) {
    if (String(l.id) !== String(currentLayoutId)) {
      var opt = document.createElement('option');
      opt.value = l.id;
      opt.textContent = l.name;
      baseSel.appendChild(opt);
    }
  });
  baseSel.value = currentLayoutId !== 'default' ? currentLayoutId : '';

  document.getElementById('layoutModal').style.display = 'flex';
  document.getElementById('layoutNameInput').focus();
}

function toggleLayoutNameInput() {
  var action = document.getElementById('layoutActionSelect').value;
  document.getElementById('layoutNameInput').style.display = action === 'new' ? 'block' : 'none';
  document.getElementById('layoutUpdateSelect').style.display = action === 'update' ? 'block' : 'none';
}

function closeLayoutModal(e) {
  if (!e || e.target === document.getElementById('layoutModal')) {
    document.getElementById('layoutModal').style.display = 'none';
  }
}

function confirmSaveLayout() {
  var action = document.getElementById('layoutActionSelect').value;
  var baseVal = document.getElementById('layoutBaseSelect').value;
  var cfg;
  if (baseVal === '__current__' || baseVal === '') {
    cfg = getCurrentConfig();
  } else {
    var baseLayout = layoutsData.find(function(l) { return String(l.id) === baseVal; });
    if (baseLayout) {
      try { cfg = JSON.parse(baseLayout.config); } catch(e) { cfg = getCurrentConfig(); }
    } else {
      cfg = getCurrentConfig();
    }
  }

  if (action === 'update') {
    var selId = document.getElementById('layoutUpdateSelect').value;
    if (!selId) return;
    api('PUT', '/dashboard/layouts/' + selId, { name: '', config: JSON.stringify(cfg) }).then(function(res) {
      document.getElementById('layoutModal').style.display = 'none';
      if (res.message) {
        loadLayouts();
      } else {
        alert(res.detail || 'Erro ao atualizar');
      }
    });
  } else {
    var name = document.getElementById('layoutNameInput').value.trim();
    if (!name) return;
    api('POST', '/dashboard/layouts', { name: name, config: JSON.stringify(cfg) }).then(function(res) {
      document.getElementById('layoutModal').style.display = 'none';
      if (res.id) {
        currentLayoutId = res.id;
        loadLayouts();
      } else {
        alert(res.detail || 'Erro ao salvar');
      }
    });
  }
}

function deleteCurrentLayout() {
  if (currentLayoutId === 'default') {
    alert('Não é possível excluir o layout padrão');
    return;
  }
  if (!confirm('Excluir este layout?')) return;
  api('DELETE', '/dashboard/layouts/' + currentLayoutId).then(function(res) {
    if (res.message) {
      currentLayoutId = 'default';
      loadLayouts();
      loadLayout('default');
    } else {
      alert(res.detail || 'Erro ao excluir');
    }
  });
}

/* ============================================================
   FILTER MODAL (per-machine)
   ============================================================ */
function openFilterModal(machineId) {
  var m = machinesData.find(function(d) { return d.machine.id === machineId; });
  if (!m) return;
  var key = 'm' + machineId;
  var processes = m.processlist || [];

  if (!(key in checkedUsers)) checkedUsers[key] = {};
  if (!(key in checkedProcs)) checkedProcs[key] = {};

  var users = {};
  var procs = {};
  processes.forEach(function(p) {
    var u = p.username || 'N/A';
    var n = p.name || '?';
    users[u] = (users[u] || 0) + 1;
    procs[n] = (procs[n] || 0) + 1;
  });
  Object.keys(users).forEach(function(u) {
    if (!(u in checkedUsers[key])) checkedUsers[key][u] = true;
  });
  Object.keys(procs).forEach(function(p) {
    if (!(p in checkedProcs[key])) checkedProcs[key][p] = true;
  });

  var displayName = m.machine.name + (m.system && m.system.hostname ? ' — ' + m.system.hostname : '');

  var modal = document.createElement('div');
  modal.className = 'filter-modal-overlay';
  modal.id = 'filterModal';
  modal.onclick = function(e) { if (e.target === modal) closeFilterModal(); };

  var html = '<div class="filter-modal">';
  html += '<h3>⚙ ' + t('filter_modal.title') + ' — ' + displayName + '</h3>';

  html += '<div class="filter-modal-section">';
   html += '<h4>' + t('filter_modal.users') + '<span>';
  html += '<button class="btn-filter-action" onclick="modalToggleAll(\'' + key + '\',\'user\',true)">' + t('filter_modal.toggle_all') + '</button> ';
  html += '<button class="btn-filter-action" onclick="modalToggleAll(\'' + key + '\',\'user\',false)">' + t('common.none') + '</button>';
  html += '</span></h4>';
  html += '<input type="text" class="filter-search" placeholder="' + t('filter_modal.search_user') + '... oninput="modalFilterList(this,\'user-list\')" style="width:100%;margin-bottom:0.3rem">';
  html += '<div class="filter-modal-list" id="user-list">';
  Object.keys(users).sort().forEach(function(u) {
    var chk = checkedUsers[key][u] ? ' checked' : '';
    html += '<label class="filter-modal-item toggle" data-name="' + u.toLowerCase() + '">';
    html += '<input type="checkbox"' + chk + ' onchange="modalToggleItem(\'' + key + '\',\'user\',\'' + u.replace(/'/g, "\\'") + '\',this.checked)"> ';
    html += '<span class="toggle-track"></span>';
    html += '<span class="toggle-label">' + u + ' <span class="filter-count">(' + users[u] + ')</span></span></label>';
  });
  html += '</div></div>';

  html += '<div class="filter-modal-section">';
  html += '<h4>' + t('filter_modal.processes') + '<span>';
  html += '<button class="btn-filter-action" onclick="modalToggleAll(\'' + key + '\',\'proc\',true)">' + t('filter_modal.toggle_all') + '</button> ';
  html += '<button class="btn-filter-action" onclick="modalToggleAll(\'' + key + '\',\'proc\',false)">' + t('common.none') + '</button>';
  html += '</span></h4>';
  html += '<input type="text" class="filter-search" placeholder="' + t('filter_modal.search_proc') + '... oninput="modalFilterList(this,\'proc-list\')" style="width:100%;margin-bottom:0.3rem">';
  html += '<div class="filter-modal-list" id="proc-list">';
  Object.keys(procs).sort().forEach(function(p) {
    var chk = checkedProcs[key][p] ? ' checked' : '';
    var safeName = p.replace(/'/g, "\\'").replace(/"/g, '&quot;');
    html += '<label class="filter-modal-item toggle" data-name="' + p.toLowerCase() + '">';
    html += '<input type="checkbox"' + chk + ' onchange="modalToggleItem(\'' + key + '\',\'proc\',\'' + safeName + '\',this.checked)"> ';
    html += '<span class="toggle-track"></span>';
    html += '<span class="toggle-label">' + p + ' <span class="filter-count">(' + procs[p] + ')</span></span></label>';
  });
  html += '</div></div>';

  html += '<div class="filter-modal-actions">';
  html += '<button class="btn-secondary" onclick="closeFilterModal()">' + t('filter_modal.cancel') + '</button>';
  html += '</div></div>';

  modal.innerHTML = html;
  document.body.appendChild(modal);
}

function closeFilterModal() {
  var m = document.getElementById('filterModal');
  if (m) m.remove();
}

function modalToggleItem(key, type, name, checked) {
  if (type === 'user') checkedUsers[key][name] = checked;
  else checkedProcs[key][name] = checked;
  applyFilters();
}

function modalToggleAll(key, type, val) {
  var map = type === 'user' ? checkedUsers[key] : checkedProcs[key];
  Object.keys(map).forEach(function(k) { map[k] = val; });
  var listId = type === 'user' ? 'user-list' : 'proc-list';
  var list = document.getElementById(listId);
  if (list) {
    list.querySelectorAll('input[type="checkbox"]').forEach(function(cb) { cb.checked = val; });
  }
  applyFilters();
}

function modalFilterList(input, listId) {
  var list = document.getElementById(listId);
  if (!list) return;
  var q = input.value.toLowerCase();
  list.querySelectorAll('.filter-modal-item').forEach(function(lbl) {
    var name = lbl.getAttribute('data-name') || '';
    lbl.style.display = name.indexOf(q) !== -1 ? '' : 'none';
  });
}
