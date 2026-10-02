var TOKEN = '';
var MACHINE_ID = null;
var machineData = null;
var detailRefreshInterval = null;
var historyChart = null;
var allProcesses = [];

function initMachineDetail(id) {
  MACHINE_ID = id;
  TOKEN = getToken();
  loadMachineDetail();
  detailRefreshInterval = setInterval(loadMachineDetail, 10000);
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

function loadMachineDetail() {
  api('GET', '/machines/' + MACHINE_ID + '/detail').then(function(data) {
    if (data.detail) {
      document.getElementById('detailName').textContent = 'Erro: ' + data.detail;
      return;
    }
    machineData = data;
    renderHeader();
    renderOverview();
    renderCpu();
    renderMemory();
    renderDisk();
    renderNetwork();
    renderSensors();
    renderGPU();
    renderProcesses();
  }).catch(function(err) {
    console.error('Erro ao carregar detalhe:', err);
  });
}

function renderHeader() {
  var m = machineData;
  var machine = m.machine || {};
  var icon = machine.icon || 'mdi:server';
  var color = machine.color || '';

  document.getElementById('detailIcon').className = 'mdi ' + icon;
  if (color) {
    document.getElementById('detailIcon').style.color = color;
  }
  document.getElementById('detailName').textContent = machine.name || 'Máquina';
  document.getElementById('detailHost').textContent = machine.host + (machine.port ? ':' + machine.port : '');

  var statusEl = document.getElementById('detailStatus');
  if (m.status === 'online') {
    statusEl.className = 'detail-status online';
    statusEl.innerHTML = '<span class="status-dot online"></span> online';
  } else {
    statusEl.className = 'detail-status offline';
    statusEl.innerHTML = '<span class="status-dot offline"></span> offline';
  }
}

function switchDetailTab(tab) {
  document.querySelectorAll('.detail-tab').forEach(function(t) {
    t.classList.toggle('active', t.dataset.tab === tab);
  });
  document.querySelectorAll('.detail-section').forEach(function(s) {
    s.classList.toggle('active', s.id === 'section-' + tab);
  });
  if (tab === 'history') loadHistory();
}

function formatBytes(b) {
  if (!b || b === 0) return '0 B';
  var k = 1024;
  var sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  var i = Math.floor(Math.log(b) / Math.log(k));
  return parseFloat((b / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatUptime(s) {
  if (!s) return '-';
  var d = Math.floor(s / 86400);
  var h = Math.floor((s % 86400) / 3600);
  var m = Math.floor((s % 3600) / 60);
  if (d > 0) return d + 'd ' + h + 'h ' + m + 'm';
  if (h > 0) return h + 'h ' + m + 'm';
  return m + 'm';
}

function pctClass(val) {
  if (val >= 90) return 'critical';
  if (val >= 70) return 'warning';
  return 'normal';
}

function gaugeColor(val) {
  if (val >= 90) return 'var(--red)';
  if (val >= 70) return 'var(--yellow)';
  return 'var(--green)';
}

// ============================================================
// OVERVIEW
// ============================================================

function renderOverview() {
  var m = machineData;
  var sys = m.system || {};
  var cpu = m.cpu || {};
  var mem = m.memory || {};
  var load = m.load || {};
  var uptime = m.uptime || {};

  // System info cards
  var sysHtml = '';
  sysHtml += infoCard(t('machine.hostname'), sys.hostname || '-');
  sysHtml += infoCard(t('machine.os'), (sys.os_name || '-') + ' ' + (sys.os_version || ''));
  sysHtml += infoCard('Distro', sys.linux_distro || '-');
  sysHtml += infoCard(t('machine.uptime'), formatUptime(uptime.uptime));
  sysHtml += infoCard('CPU Cores', cpu.cpucore || '-');
  sysHtml += infoCard(t('machine.load'), (load.min1 || 0) + ' / ' + (load.min5 || 0) + ' / ' + (load.min15 || 0));
  document.getElementById('overviewSystemInfo').innerHTML = sysHtml;

  // Gauges
  var gaugeHtml = '';
  var cpuPct = cpu.total || 0;
  var memPct = mem.percent || 0;
  var diskPct = 0;
  if (m.disk && m.disk.length > 0) {
    var maxDisk = 0;
    m.disk.forEach(function(d) { if (d.percent > maxDisk) maxDisk = d.percent; });
    diskPct = maxDisk;
  }
  gaugeHtml += gaugeCard('CPU', cpuPct, Math.round(cpuPct) + '%');
  gaugeHtml += gaugeCard(t('machine.memory'), memPct, Math.round(memPct) + '%');
  gaugeHtml += gaugeCard(t('machine.disks'), diskPct, Math.round(diskPct) + '%');
  document.getElementById('overviewGauges').innerHTML = gaugeHtml;
}

function infoCard(label, value) {
  return '<div class="info-card"><div class="info-label">' + label + '</div><div class="info-value">' + value + '</div></div>';
}

function gaugeCard(label, pct, display) {
  var color = gaugeColor(pct);
  return '<div class="gauge-card">' +
    '<div class="gauge-label">' + label + '</div>' +
    '<div class="gauge-value" style="color:' + color + '">' + display + '</div>' +
    '<div class="progress-bar" style="height:6px;margin-top:0.5rem">' +
    '<div class="progress-fill ' + pctClass(pct) + '" style="width:' + Math.min(pct, 100) + '%"></div></div>' +
    '</div>';
}

// ============================================================
// CPU
// ============================================================

function renderCpu() {
  var cpu = machineData.cpu || {};
  var pct = cpu.total || 0;
  var html = gaugeCard('CPU Total', pct, Math.round(pct) + '%');
  html += '<div class="info-grid" style="margin-top:1rem">';
  html += infoCard('User', (cpu.user || 0).toFixed(1) + '%');
  html += infoCard('System', (cpu.system || 0).toFixed(1) + '%');
  html += infoCard('IOWait', (cpu.iowait || 0).toFixed(1) + '%');
  html += infoCard('Steal', (cpu.steal || 0).toFixed(1) + '%');
  html += infoCard('Cores', cpu.cpucore || '-');
  html += '</div>';

  // Per-core if available
  if (cpu.cpu_per_core && cpu.cpu_per_core.length > 0) {
    html += '<h3 style="margin:1rem 0 0.5rem;font-size:0.9rem;color:var(--text-secondary)">Per Core</h3>';
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:0.5rem">';
    cpu.cpu_per_core.forEach(function(core, i) {
      var corePct = core.total || 0;
      html += '<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-sm);padding:0.5rem;text-align:center">';
      html += '<div style="font-size:0.7rem;color:var(--text-muted)">Core ' + i + '</div>';
      html += '<div style="font-size:1rem;font-weight:700;color:' + gaugeColor(corePct) + '">' + Math.round(corePct) + '%</div>';
      html += '<div class="progress-bar" style="height:3px;margin-top:0.3rem"><div class="progress-fill ' + pctClass(corePct) + '" style="width:' + corePct + '%"></div></div>';
      html += '</div>';
    });
    html += '</div>';
  }

  document.getElementById('cpuGauges').innerHTML = html;
}

// ============================================================
// MEMORY
// ============================================================

function renderMemory() {
  var mem = machineData.memory || {};
  var pct = mem.percent || 0;
  var html = gaugeCard(t('machine.memory'), pct, Math.round(pct) + '%');
  html += '<div class="info-grid" style="margin-top:1rem">';
  html += infoCard('Total', formatBytes(mem.total));
  html += infoCard('Used', formatBytes(mem.used));
  html += infoCard('Available', formatBytes(mem.available));
  html += infoCard('Free', formatBytes(mem.free));
  html += infoCard('Active', formatBytes(mem.active));
  html += infoCard('Buffers', formatBytes(mem.buffers));
  html += infoCard('Cached', formatBytes(mem.cached));
  html += '</div>';

  // Swap
  if (mem.swap) {
    var swapPct = mem.swap.percent || 0;
    html += '<h3 style="margin:1rem 0 0.5rem;font-size:0.9rem;color:var(--text-secondary)">Swap</h3>';
    html += '<div class="info-grid">';
    html += infoCard('Total', formatBytes(mem.swap.total));
    html += infoCard('Used', formatBytes(mem.swap.used));
    html += infoCard('Free', formatBytes(mem.swap.free));
    html += infoCard('Percent', Math.round(swapPct) + '%');
    html += '</div>';
  }

  document.getElementById('memGauges').innerHTML = html;
}

// ============================================================
// DISK
// ============================================================

function renderDisk() {
  var disks = machineData.disk || [];
  if (disks.length === 0) {
    document.getElementById('diskList').innerHTML = '<p style="color:var(--text-muted)">' + t('machine.no_data') + '</p>';
    return;
  }
  var html = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:0.75rem">';
  disks.forEach(function(d) {
    var pct = d.percent || 0;
    html += '<div class="info-card">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem">';
    html += '<div><div class="info-label">' + (d.device_name || '') + '</div>';
    html += '<div class="info-value" style="font-size:0.9rem">' + (d.mnt_point || '') + '</div></div>';
    html += '<div style="font-size:1.1rem;font-weight:700;color:' + gaugeColor(pct) + '">' + Math.round(pct) + '%</div>';
    html += '</div>';
    html += '<div class="progress-bar" style="height:6px"><div class="progress-fill ' + pctClass(pct) + '" style="width:' + pct + '%"></div></div>';
    html += '<div style="display:flex;justify-content:space-between;margin-top:0.5rem;font-size:0.75rem;color:var(--text-muted)';
    html += '"><span>' + formatBytes(d.size) + ' total</span>';
    html += '<span>' + formatBytes(d.used) + ' used</span>';
    html += '<span>' + formatBytes(d.free) + ' free</span></div>';
    html += '<div style="font-size:0.7rem;color:var(--text-muted);margin-top:0.3rem">' + (d.fs_type || '') + '</div>';
    html += '</div>';
  });
  html += '</div>';
  document.getElementById('diskList').innerHTML = html;
}

// ============================================================
// NETWORK
// ============================================================

function renderNetwork() {
  var networks = machineData.network || [];
  if (networks.length === 0) {
    document.getElementById('networkList').innerHTML = '<p style="color:var(--text-muted)">' + t('machine.no_data') + '</p>';
    return;
  }
  var html = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:0.75rem">';
  networks.forEach(function(n) {
    if (n.interface_name === 'lo') return;
    html += '<div class="info-card">';
    html += '<div class="info-label">' + (n.interface_name || '') + '</div>';
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;margin-top:0.5rem">';
    html += '<div><div style="font-size:0.7rem;color:var(--text-muted)">▼ Received</div>';
    html += '<div style="font-size:1rem;font-weight:600">' + formatBytes(n.bytes_rate_recv || 0) + '/s</div></div>';
    html += '<div><div style="font-size:0.7rem;color:var(--text-muted)">▲ Sent</div>';
    html += '<div style="font-size:1rem;font-weight:600">' + formatBytes(n.bytes_rate_sent || 0) + '/s</div></div>';
    if (n.speed) {
      html += '<div><div style="font-size:0.7rem;color:var(--text-muted)">Speed</div>';
      html += '<div style="font-size:0.85rem">' + n.speed + ' Mbps</div></div>';
    }
    html += '</div></div>';
  });
  html += '</div>';
  document.getElementById('networkList').innerHTML = html;
}

// ============================================================
// SENSORS
// ============================================================

function renderSensors() {
  var sensors = machineData.sensors || [];
  if (sensors.length === 0) {
    document.getElementById('sensorList').innerHTML = '<p style="color:var(--text-muted)">' + t('machine.no_sensors') + '</p>';
    return;
  }
  var html = '';
  sensors.forEach(function(s) {
    var val = s.value || 0;
    var label = s.label || s.sensor_name || '';
    var sensorType = s.sensor_type || '';
    var icon = 'mdi:thermometer';
    var valClass = 'temp-ok';

    if (sensorType === 'temperature_core' || sensorType === 'temperature') {
      icon = 'mdi:thermometer';
      if (val > 80) valClass = 'temp-high';
      else if (val > 60) valClass = 'temp-warn';
    } else if (sensorType === 'fan_speed') {
      icon = 'mdi:fan';
      valClass = '';
    } else if (sensorType === 'battery') {
      icon = 'mdi:car-battery';
      valClass = val < 20 ? 'temp-high' : '';
    } else if (sensorType === 'voltage') {
      icon = 'mdi:flash';
      valClass = '';
    }

    var unit = '';
    if (sensorType.indexOf('temperature') !== -1) unit = ' °C';
    else if (sensorType === 'fan_speed') unit = ' RPM';
    else if (sensorType === 'battery') unit = '%';
    else if (sensorType === 'voltage') unit = ' V';

    html += '<div class="sensor-card">';
    html += '<i class="mdi ' + icon.replace(':', '-') + '"></i>';
    html += '<div class="sensor-info">';
    html += '<div class="sensor-name">' + label + '</div>';
    html += '<div class="sensor-value ' + valClass + '">' + Math.round(val * 10) / 10 + unit + '</div>';
    html += '</div></div>';
  });
  document.getElementById('sensorList').innerHTML = html;
}

// ============================================================
// GPU
// ============================================================

function renderGPU() {
  var gpus = machineData.gpu || [];
  var container = document.getElementById('gpuList');
  if (!container) return;
  if (gpus.length === 0) {
    container.innerHTML = '<p style="color:var(--text-muted)">Nenhuma GPU detectada ou plugin GPU não ativo no Glances.</p>';
    return;
  }
  var html = '';
  gpus.forEach(function(g) {
    var load = g.load || 0;
    var temp = g.temperature || 0;
    var memP = g.mem_percent || 0;
    var memUsed = g.mem_used || 0;
    var memTotal = g.mem || 0;
    var name = g.name || 'GPU ' + (g.id || 0);

    html += '<div class="sensor-card" style="flex-direction:column;align-items:stretch;padding:1rem;gap:0.75rem">';
    html += '<div style="display:flex;align-items:center;gap:0.75rem">';
    html += '<i class="mdi mdi-expansion-card" style="font-size:1.5rem;color:var(--accent)"></i>';
    html += '<div><div style="font-weight:600">' + name + '</div>';
    html += '<div style="font-size:0.78rem;color:var(--text-muted)">ID: ' + (g.id || 0) + '</div></div>';
    html += '</div>';

    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:0.75rem">';

    html += '<div class="metric-item"><span class="metric-label">Load</span>';
    html += '<span class="metric-value ' + pctClass(load) + '">' + Math.round(load) + '%</span>';
    html += '<div class="progress-bar"><div class="progress-fill ' + pctClass(load) + '" style="width:' + load + '%"></div></div></div>';

    if (temp > 0) {
      html += '<div class="metric-item"><span class="metric-label">Temperature</span>';
      html += '<span class="metric-value ' + (temp >= 85 ? 'critical' : temp >= 70 ? 'warning' : 'normal') + '">' + temp + '°C</span></div>';
    }

    if (memTotal > 0) {
      html += '<div class="metric-item"><span class="metric-label">VRAM</span>';
      html += '<span class="metric-value ' + pctClass(memP) + '">' + Math.round(memP) + '%</span>';
      html += '<div class="progress-bar"><div class="progress-fill ' + pctClass(memP) + '" style="width:' + memP + '%"></div></div>';
      html += '<span style="font-size:0.7rem;color:var(--text-muted)">' + formatBytes(memUsed * 1024 * 1024) + ' / ' + formatBytes(memTotal * 1024 * 1024) + '</span></div>';
    }

    html += '</div></div>';
  });
  container.innerHTML = html;
}

// ============================================================
// PROCESSES
// ============================================================

function renderProcesses() {
  allProcesses = machineData.processlist || [];
  renderProcessTable(allProcesses);
}

function renderProcessTable(procs) {
  var cpuCount = (machineData.cpu && machineData.cpu.cpucore) || 1;
  var html = '';
  procs.forEach(function(p) {
    var cpuNorm = Math.round((p.cpu_percent || 0) / cpuCount * 10) / 10;
    html += '<tr>';
    html += '<td>' + (p.pid || '-') + '</td>';
    html += '<td title="' + (p.cmdline || '') + '">' + (p.name || '?') + '</td>';
    html += '<td>' + (p.username || '-') + '</td>';
    html += '<td style="color:' + gaugeColor(cpuNorm) + '">' + cpuNorm + '</td>';
    html += '<td style="color:' + gaugeColor(p.memory_percent || 0) + '">' + (p.memory_percent || 0) + '</td>';
    html += '<td>' + (p.nthreads || '-') + '</td>';
    html += '<td>' + (p.status || '-') + '</td>';
    html += '<td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + (p.cmdline || '') + '">' + (p.cmdline || '-') + '</td>';
    html += '</tr>';
  });
  document.getElementById('processTableBody').innerHTML = html || '<tr><td colspan="8" style="text-align:center;color:var(--text-muted)">' + t('machine.no_data') + '</td></tr>';
}

function filterProcesses() {
  var q = document.getElementById('processSearch').value.toLowerCase();
  var filtered = allProcesses.filter(function(p) {
    var name = (p.name || '').toLowerCase();
    var user = (p.username || '').toLowerCase();
    var cmd = (p.cmdline || '').toLowerCase();
    return name.indexOf(q) !== -1 || user.indexOf(q) !== -1 || cmd.indexOf(q) !== -1;
  });
  renderProcessTable(filtered);
}

// ============================================================
// HISTORY
// ============================================================

function loadHistory() {
  var hours = document.getElementById('historyPeriod').value;
  api('GET', '/machines/' + MACHINE_ID + '/history?hours=' + hours).then(function(data) {
    renderHistoryChart(data);
  });
}

function renderHistoryChart(data) {
  var ctx = document.getElementById('historyChart');
  if (!ctx) return;
  if (historyChart) historyChart.destroy();

  var points = data.points || [];
  if (points.length === 0) {
    ctx.parentElement.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:2rem">' + t('machine.no_history') + '</p>';
    return;
  }

  var labels = points.map(function(p) {
    var d = new Date(p.timestamp);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  });

  var cpuData = points.map(function(p) { return p.cpu || 0; });
  var memData = points.map(function(p) { return p.mem || 0; });
  var diskData = points.map(function(p) { return p.disk || 0; });

  historyChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'CPU %',
          data: cpuData,
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59,130,246,0.1)',
          fill: true,
          tension: 0.3,
          pointRadius: 0,
          borderWidth: 2,
        },
        {
          label: t('machine.memory') + ' %',
          data: memData,
          borderColor: '#22c55e',
          backgroundColor: 'rgba(34,197,94,0.1)',
          fill: true,
          tension: 0.3,
          pointRadius: 0,
          borderWidth: 2,
        },
        {
          label: t('machine.disks') + ' %',
          data: diskData,
          borderColor: '#eab308',
          backgroundColor: 'rgba(234,179,8,0.1)',
          fill: true,
          tension: 0.3,
          pointRadius: 0,
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: {
          labels: { color: '#94a3b8', font: { size: 11 } },
        },
        tooltip: {
          backgroundColor: '#1a2235',
          titleColor: '#e2e8f0',
          bodyColor: '#94a3b8',
          borderColor: '#2a3650',
          borderWidth: 1,
        },
      },
      scales: {
        x: {
          ticks: { color: '#64748b', maxTicksLimit: 12, font: { size: 10 } },
          grid: { color: 'rgba(42,54,80,0.5)' },
        },
        y: {
          min: 0,
          max: 100,
          ticks: { color: '#64748b', font: { size: 10 } },
          grid: { color: 'rgba(42,54,80,0.5)' },
        },
      },
    },
  });
}
