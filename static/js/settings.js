var TOKEN = '';

var POPULAR_ICONS = [
  'mdi:server', 'mdi:desktop-tower', 'mdi:laptop', 'mdi:router-wireless',
  'mdi:nas', 'mdi:cloud', 'mdi:network', 'mdi:database',
  'mdi:harddisk', 'mdi:monitor', 'mdi:television', 'mdi:cellphone',
  'mdi:printer', 'mdi:camera', 'mdi:cctv', 'mdi:shield-home',
  'mdi:home', 'mdi:factory', 'mdi:domain', 'mdi:office-building',
  'mdi:server-network', 'mdi:access-point-network', 'mdi:lan',
  'mdi:web', 'mdi:radio-tower', 'mdi:access-point', 'mdi:switch',
  'mdi:docker', 'mdi:container', 'mdi:cube', 'mdi:hexagon',
  'mdi:raspberry-pi', 'mdi:chip', 'mdi:microchip', 'mdi:memory',
  'mdi:thermometer', 'mdi:fan', 'mdi:car-battery', 'mdi:battery',
  'mdi:power-plug', 'mdi:lightning-bolt', 'mdi:flash',
  'mdi:video', 'mdi:music', 'mdi:filmstrip', 'mdi:gamepad-variant',
  'mdi:robot', 'mdi:brain', 'mdi:fire', 'mdi:leaf',
  'mdi:lock', 'mdi:key', 'mdi:shield-check', 'mdi:eye',
  'mdi:account', 'mdi:account-group', 'mdi:wrench', 'mdi:screwdriver',
  'mdi:cog', 'mdi:tune', 'mdi:sliders', 'mdi:magnify',
  'mdi:bell', 'mdi:bell-ring', 'mdi:email', 'mdi:phone',
  'mdi:chart-line', 'mdi:chart-bar', 'mdi:chart-pie', 'mdi:chart-areaspline',
  'mdi:speedometer', 'mdi:gauge', 'mdi:dashboard',
  'mdi:calendar', 'mdi:clock', 'mdi:timer', 'mdi:history',
  'mdi:spotify', 'mdi:youtube', 'mdi:github',
];

var MACHINE_COLORS = [
  '', '#3b82f6', '#22c55e', '#ef4444', '#eab308',
  '#f97316', '#a855f7', '#06b6d4', '#ec4899', '#14b8a6',
];

var selectedMachineIcon = 'mdi:server';
var selectedMachineColor = '';
var editingMachineId = null;

function initSettings() {
  TOKEN = getToken();
  initColorPicker();
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
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TOKEN }
  };
  if (body) opts.body = JSON.stringify(body);
  return fetch('/api' + path, opts).then(function(r) {
    if (!r.ok) return r.json().catch(function() { return { detail: 'Erro HTTP ' + r.status }; });
    return r.json();
  });
}

function loadSettings() {
  initSettings();
  loadMachines();
  loadAlertMachines();
  if (IS_ADMIN) {
    loadUsers();
    loadBackups();
    loadUpdateStatus();
  }
}

// ============================================================
// ICON PICKER (machine form)
// ============================================================

function toggleMachineIconPicker() {
  var dd = document.getElementById('machineIconDropdown');
  var isOpen = dd.classList.contains('open');
  dd.classList.toggle('open');
  if (!isOpen) {
    renderMachineIconGrid('');
    document.getElementById('machineIconSearch').value = '';
    document.getElementById('machineIconSearch').focus();
  }
}

function renderMachineIconGrid(filter) {
  var grid = document.getElementById('machineIconGrid');
  var icons = POPULAR_ICONS;
  if (filter) {
    var q = filter.toLowerCase();
    icons = icons.filter(function(ic) { return ic.indexOf(q) !== -1; });
  }
  var html = '';
  icons.forEach(function(ic) {
    var sel = ic === selectedMachineIcon ? ' selected' : '';
    html += '<div class="icon-picker-item' + sel + '" data-icon="' + ic + '" onclick="selectMachineIcon(\'' + ic + '\')" title="' + ic + '">';
    html += '<i class="mdi ' + ic.replace(':', '-') + '"></i></div>';
  });
  grid.innerHTML = html;
}

function selectMachineIcon(icon) {
  selectedMachineIcon = icon;
  document.getElementById('machineIconPreview').className = 'mdi ' + icon.replace(':', '-');
  document.getElementById('machineIconName').textContent = icon;
  document.getElementById('machineIconDropdown').classList.remove('open');
}

function filterMachineIcons() {
  var q = document.getElementById('machineIconSearch').value;
  renderMachineIconGrid(q);
}

// Close icon picker on outside click
document.addEventListener('click', function(e) {
  var wrap = document.querySelector('#tab-machines .icon-picker-wrap');
  if (wrap && !wrap.contains(e.target)) {
    var dd = document.getElementById('machineIconDropdown');
    if (dd) dd.classList.remove('open');
  }
});

// ============================================================
// COLOR PICKER
// ============================================================

function initColorPicker() {
  var row = document.getElementById('machineColorRow');
  if (!row) return;
  var html = '<div class="color-swatch no-color selected" data-color="" onclick="selectMachineColor(\'\')"></div>';
  MACHINE_COLORS.forEach(function(c) {
    if (!c) return;
    html += '<div class="color-swatch" style="background:' + c + '" data-color="' + c + '" onclick="selectMachineColor(\'' + c + '\')"></div>';
  });
  row.innerHTML = html;
}

function selectMachineColor(color) {
  selectedMachineColor = color;
  document.querySelectorAll('#machineColorRow .color-swatch').forEach(function(sw) {
    sw.classList.toggle('selected', sw.dataset.color === color);
  });
}

// ============================================================
// MACHINES
// ============================================================

function loadMachines() {
  api('GET', '/machines/').then(function(data) {
    var tbody = document.getElementById('machinesBody');
    var html = '';
    data.forEach(function(m, idx) {
      var icon = m.icon || 'mdi:server';
      var color = m.color || '';
      var colorStyle = color ? ' style="border-left:3px solid ' + color + ';padding-left:0.5rem"' : '';
      html += '<tr' + colorStyle + ' data-id="' + m.id + '">';
      html += '<td style="white-space:nowrap">';
      html += '<button class="btn-icon" onclick="moveMachine(' + m.id + ',-1)" title="Mover acima"' + (idx === 0 ? ' disabled' : '') + '>▲</button> ';
      html += '<button class="btn-icon" onclick="moveMachine(' + m.id + ',1)" title="Mover abaixo"' + (idx === data.length - 1 ? ' disabled' : '') + '>▼</button>';
      html += '</td>';
      html += '<td><i class="mdi ' + icon.replace(':', '-') + '" style="font-size:1.2rem"></i></td>';
      html += '<td>' + (m.name || m.host) + '</td>';
      html += '<td>' + m.host + '</td>';
      html += '<td>' + m.port + '</td>';
      html += '<td><span class="status-dot ' + m.status + '"></span>' + m.status + '</td>';
      if (IS_ADMIN) {
        html += '<td><button class="btn-secondary" onclick="editMachine(' + m.id + ')" style="margin-right:0.3rem">Editar</button>';
        html += '<button class="btn-danger" onclick="deleteMachine(' + m.id + ')">Remover</button></td>';
      }
      html += '</tr>';
    });
    tbody.innerHTML = html || '<tr><td colspan="7" style="text-align:center;color:var(--text-muted)">Nenhuma máquina cadastrada</td></tr>';
    window._machinesData = data;
  });
}

function moveMachine(id, direction) {
  var data = window._machinesData;
  if (!data) return;
  var ids = data.map(function(m) { return m.id; });
  var idx = ids.indexOf(id);
  if (idx === -1) return;
  var newIdx = idx + direction;
  if (newIdx < 0 || newIdx >= ids.length) return;
  var tmp = ids[idx];
  ids[idx] = ids[newIdx];
  ids[newIdx] = tmp;
  api('POST', '/machines/reorder', { ids: ids }).then(function() {
    loadMachines();
  });
}

function addMachine() {
  var name = document.getElementById('machineName').value.trim();
  var host = document.getElementById('machineHost').value.trim();
  var port = parseInt(document.getElementById('machinePort').value) || 61208;
  var isLocal = document.getElementById('machineLocal').checked;
  var tags = document.getElementById('machineTags').value.trim();
  var description = document.getElementById('machineDescription').value.trim();
  if (!host) return alert('Host é obrigatório');
  var payload = {
    name: name, host: host, port: port, is_local: isLocal, tags: tags,
    icon: selectedMachineIcon, description: description, color: selectedMachineColor,
  };
  var promise;
  if (editingMachineId) {
    promise = api('PUT', '/machines/' + editingMachineId, payload);
  } else {
    promise = api('POST', '/machines/', payload);
  }
  promise.then(function(res) {
    if (res && res.detail) return alert(res.detail);
    resetMachineForm();
    loadMachines();
  });
}

function editMachine(id) {
  api('GET', '/machines/').then(function(data) {
    var m = data.find(function(x) { return x.id === id; });
    if (!m) return;
    editingMachineId = id;
    document.getElementById('machineName').value = m.name || '';
    document.getElementById('machineHost').value = m.host || '';
    document.getElementById('machinePort').value = m.port || 61208;
    document.getElementById('machineLocal').checked = m.is_local || false;
    document.getElementById('machineTags').value = m.tags || '';
    document.getElementById('machineDescription').value = m.description || '';
    selectedMachineIcon = m.icon || 'mdi:server';
    selectedMachineColor = m.color || '';
    document.getElementById('machineIconPreview').className = 'mdi ' + selectedMachineIcon.replace(':', '-');
    document.getElementById('machineIconName').textContent = selectedMachineIcon;
    initColorPicker();
    document.querySelectorAll('#machineColorRow .color-swatch').forEach(function(sw) {
      sw.classList.toggle('selected', sw.dataset.color === selectedMachineColor);
    });
    var btn = document.querySelector('.add-machine-form .btn-primary');
    if (btn) btn.textContent = 'Salvar';
    document.getElementById('machineName').focus();
  });
}

function resetMachineForm() {
  editingMachineId = null;
  document.getElementById('machineName').value = '';
  document.getElementById('machineHost').value = '';
  document.getElementById('machineTags').value = '';
  document.getElementById('machineDescription').value = '';
  selectedMachineIcon = 'mdi:server';
  selectedMachineColor = '';
  document.getElementById('machineIconPreview').className = 'mdi mdi-server';
  document.getElementById('machineIconName').textContent = 'mdi:server';
  initColorPicker();
  var btn = document.querySelector('.add-machine-form .btn-primary');
  if (btn) btn.textContent = 'Adicionar';
}

function testMachine() {
  var host = document.getElementById('machineHost').value.trim();
  var port = parseInt(document.getElementById('machinePort').value) || 61208;
  var name = document.getElementById('machineName').value.trim() || 'Teste';
  var result = document.getElementById('testResult');
  if (!host) {
    result.className = 'test-result error';
    result.textContent = 'Digite o IP ou hostname da máquina';
    return;
  }
  result.className = 'test-result';
  result.textContent = 'Testando conexão...';
  result.style.display = 'block';
  api('POST', '/machines/test', { name: name, host: host, port: port }).then(function(res) {
    if (res.alive) {
      result.className = 'test-result success';
      result.textContent = 'Conexão OK! ' + (res.system ? res.system.os_name + ' ' + res.system.os_version : '');
    } else {
      result.className = 'test-result error';
      result.textContent = 'Falha: ' + (res.error || 'Verifique IP/porta e firewall.');
    }
  }).catch(function(err) {
    result.className = 'test-result error';
    result.textContent = 'Erro de rede: ' + err.message;
  });
}

function deleteMachine(id) {
  if (!confirm('Remover esta máquina?')) return;
  api('DELETE', '/machines/' + id).then(function() { loadMachines(); });
}

// ============================================================
// USERS
// ============================================================

function loadUsers() {
  api('GET', '/system/users').then(function(data) {
    var tbody = document.getElementById('usersBody');
    if (!tbody) return;
    var html = '';
    data.forEach(function(u) {
      html += '<tr>';
      html += '<td>' + u.username + '</td>';
      html += '<td>' + (u.full_name || '<span style="color:var(--text-muted)">-</span>') + '</td>';
      html += '<td>' + (u.email || '<span style="color:var(--text-muted)">-</span>') + '</td>';
      html += '<td>' + (u.telegram_username || '<span style="color:var(--text-muted)">-</span>') + '</td>';
      html += '<td><span class="role-badge ' + u.role + '">' + u.role + '</span></td>';
      html += '<td>';
      if (u.username !== 'admin') {
        html += '<select onchange="changeRole(' + u.id + ', this.value)" style="padding:0.2rem;background:var(--bg-secondary);color:var(--text-primary);border:1px solid var(--border);border-radius:4px;font-size:0.8rem">';
        html += '<option value="viewer"' + (u.role === 'viewer' ? ' selected' : '') + '>Visualizador</option>';
        html += '<option value="admin"' + (u.role === 'admin' ? ' selected' : '') + '>Admin</option>';
        html += '</select> ';
        html += '<button class="btn-danger" onclick="deleteUser(' + u.id + ', \'' + u.username + '\')">Remover</button>';
      } else {
        html += '<span style="color:var(--text-muted);font-size:0.8rem">Admin principal</span>';
      }
      html += '</td></tr>';
    });
    tbody.innerHTML = html;
  });
}

function addUser() {
  var username = document.getElementById('newUsername').value.trim();
  var password = document.getElementById('newPassword').value;
  var role = document.getElementById('newRole').value;
  var fullName = document.getElementById('newFullName').value.trim();
  var email = document.getElementById('newEmail').value.trim();
  var telegram = document.getElementById('newTelegram').value.trim();
  var result = document.getElementById('userActionResult');
  if (!username || !password) {
    result.className = 'test-result error';
    result.textContent = 'Usuário e senha são obrigatórios';
    return;
  }
  api('POST', '/auth/register', {
    username: username, password: password, role: role,
    full_name: fullName, email: email, telegram_username: telegram,
  }).then(function(res) {
    if (res.message) {
      result.className = 'test-result success';
      result.textContent = res.message;
      document.getElementById('newUsername').value = '';
      document.getElementById('newPassword').value = '';
      document.getElementById('newFullName').value = '';
      document.getElementById('newEmail').value = '';
      document.getElementById('newTelegram').value = '';
      loadUsers();
    } else {
      result.className = 'test-result error';
      result.textContent = res.detail || 'Erro ao criar usuário';
    }
  });
}

function changeRole(userId, newRole) {
  api('PUT', '/auth/users/role', { user_id: userId, role: newRole }).then(function(res) {
    if (res.message) loadUsers();
    else alert(res.detail || 'Erro ao alterar role');
  });
}

function deleteUser(userId, username) {
  if (!confirm('Remover o usuário "' + username + '"?')) return;
  api('DELETE', '/auth/users/' + userId).then(function(res) {
    if (res.message) loadUsers();
    else alert(res.detail || 'Erro ao remover usuário');
  });
}

// ============================================================
// BACKUPS
// ============================================================

function createBackup() {
  api('POST', '/backup/create').then(function(res) {
    alert('Backup criado: ' + res.path);
    loadBackups();
  });
}

function loadBackups() {
  api('GET', '/backup/list').then(function(data) {
    var container = document.getElementById('backupList');
    if (!container) return;
    var html = '';
    (data.backups || []).forEach(function(b) {
      html += '<div class="backup-item"><span>' + b.name + '</span>';
      html += '<div style="display:flex;gap:0.5rem">';
      html += '<button class="btn-secondary" onclick="downloadBackup(\'' + b.name + '\')">Download</button>';
      html += '<button class="btn-secondary" onclick="restoreBackup(\'' + b.path + '\')">Restaurar</button>';
      html += '</div></div>';
    });
    container.innerHTML = html || '<p style="color:var(--text-muted)">Nenhum backup encontrado</p>';
  });
}

function downloadBackup(name) {
  window.location.href = '/api/backup/download?name=' + encodeURIComponent(name);
}

function restoreBackup(path) {
  if (!confirm('Restaurar este backup? Os dados atuais serão substituídos.')) return;
  api('POST', '/backup/restore?backup_path=' + encodeURIComponent(path)).then(function(res) {
    alert(res.message || 'Backup restaurado');
    loadMachines();
  });
}

// ============================================================
// PASSWORD / PROFILE
// ============================================================

function changePassword() {
  var oldP = document.getElementById('currentPassword').value;
  var newP = document.getElementById('changeNewPassword').value;
  var confirmP = document.getElementById('changeConfirmPassword').value;
  var result = document.getElementById('passwordResult');

  if (!oldP || !newP || !confirmP) {
    result.style.color = 'var(--red)';
    result.textContent = 'Preencha todos os campos';
    return;
  }
  if (newP !== confirmP) {
    result.style.color = 'var(--red)';
    result.textContent = 'As senhas novas não conferem';
    return;
  }
  if (newP.length < 4) {
    result.style.color = 'var(--red)';
    result.textContent = 'A nova senha deve ter no mínimo 4 caracteres';
    return;
  }

  api('POST', '/auth/change-password', { old_password: oldP, new_password: newP, confirm_password: confirmP }).then(function(res) {
    if (res.message) {
      result.style.color = 'var(--green)';
      result.textContent = res.message;
      document.getElementById('currentPassword').value = '';
      document.getElementById('changeNewPassword').value = '';
      document.getElementById('changeConfirmPassword').value = '';
    } else {
      result.style.color = 'var(--red)';
      result.textContent = res.detail || 'Erro';
    }
  });
}

function saveProfile() {
  var r = document.getElementById('profileResult');
  api('PUT', '/system/me', {
    full_name: document.getElementById('profileName').value,
    email: document.getElementById('profileEmail').value,
    telegram_username: document.getElementById('profileTelegram').value,
    receive_alerts_email: document.getElementById('alertEmail').checked,
    receive_alerts_telegram: document.getElementById('alertTelegram').checked,
  }).then(function(d) {
    r.style.color = d.message ? 'var(--green)' : 'var(--red)';
    r.textContent = d.message || d.detail || 'Erro';
  });
}

function saveAlertPrefs() {
  var r = document.getElementById('alertResult');
  api('PUT', '/system/me', {
    receive_alerts_email: document.getElementById('alertEmail').checked,
    receive_alerts_telegram: document.getElementById('alertTelegram').checked,
  }).then(function(d) {
    r.style.color = d.message ? 'var(--green)' : 'var(--red)';
    r.textContent = d.message || d.detail || 'Erro';
  });
}

// ============================================================
// ALERT MACHINE PREFERENCES
// ============================================================

function loadAlertMachines() {
  api('GET', '/system/me/alert-machines').then(function(data) {
    var list = document.getElementById('alertMachinesList');
    if (!data.machines || data.machines.length === 0) {
      list.innerHTML = '<span style="color:var(--text-muted);font-size:0.85rem">Nenhuma máquina cadastrada</span>';
      return;
    }
    var html = '';
    data.machines.forEach(function(m) {
      var chk = m.selected ? ' checked' : '';
      html += '<label class="toggle" style="padding:0.4rem 0;font-size:0.85rem;display:flex">';
      html += '<input type="checkbox" class="alert-machine-cb" value="' + m.id + '"' + chk + '>';
      html += '<span class="toggle-track"></span>';
      html += '<span class="toggle-label"><i class="mdi mdi-server" style="font-size:1rem"></i> ' + m.name + ' (' + m.host + ')</span>';
      html += '</label>';
    });
    list.innerHTML = html;
  });
}

function saveAlertMachines() {
  var r = document.getElementById('alertMachinesResult');
  var ids = [];
  document.querySelectorAll('.alert-machine-cb:checked').forEach(function(cb) {
    ids.push(parseInt(cb.value));
  });
  api('PUT', '/system/me/alert-machines', { machine_ids: ids }).then(function(d) {
    r.style.color = d.message ? 'var(--green)' : 'var(--red)';
    r.textContent = d.message || d.detail || 'Erro';
  });
}

// ============================================================
// DASHBOARD UPDATE
// ============================================================

function loadUpdateStatus() {
  api('GET', '/system/update/status').then(function(d) {
    if (d.error) return;
    document.getElementById('updCurrentSha').textContent = d.local_sha || '—';
    document.getElementById('updBranch').textContent = d.branch || '—';
    document.getElementById('updLastCheck').textContent = d.last_check ? formatDate(d.last_check) : 'Nunca';
    document.getElementById('updLastApply').textContent = d.last_apply ? formatDate(d.last_apply) : 'Nunca';

    if (d.has_update) {
      showUpdStatus('update', 'Atualização disponível: ' + d.remote_sha + ' → clique em "Aplicar Atualização"');
      document.getElementById('btnApplyUpdate').style.display = '';
    } else {
      showUpdStatus('ok', 'Você está na versão mais recente.');
    }

    // Auto-check se última verificação > 7 dias
    autoCheckUpdate(d.last_check);
  });
}

function autoCheckUpdate(lastCheck) {
  if (!lastCheck) {
    // Nunca verificou → verificar agora
    checkForUpdates();
    return;
  }
  var last = new Date(lastCheck);
  var now = new Date();
  var daysDiff = (now - last) / (1000 * 60 * 60 * 24);
  if (daysDiff >= 7) {
    checkForUpdates();
  }
}

function checkForUpdates() {
  var btn = document.getElementById('btnCheckUpdate');
  var res = document.getElementById('updResult');
  btn.disabled = true;
  btn.textContent = '🔍 Verificando...';
  res.textContent = '';

  api('POST', '/system/update/check').then(function(d) {
    btn.disabled = false;
    btn.textContent = '🔍 Verificar Atualização';
    if (d.error) {
      showUpdStatus('error', 'Erro: ' + d.error);
      return;
    }
    document.getElementById('updLastCheck').textContent = formatDate(d.last_check);
    if (d.has_update) {
      showUpdStatus('update', 'Atualização disponível! Local: ' + d.local_sha + ' → Remoto: ' + d.remote_sha);
      document.getElementById('btnApplyUpdate').style.display = '';
    } else {
      showUpdStatus('ok', 'Você está na versão mais recente (' + d.local_sha + ').');
      document.getElementById('btnApplyUpdate').style.display = 'none';
    }
  });
}

function applyUpdate() {
  if (!confirm('Aplicar atualização do Dashboard? O serviço será reiniciado.')) return;
  var btn = document.getElementById('btnApplyUpdate');
  var res = document.getElementById('updResult');
  btn.disabled = true;
  btn.textContent = '⬇️ Atualizando...';
  res.textContent = '';

  api('POST', '/system/update/apply').then(function(d) {
    if (d.success) {
      showUpdStatus('ok', 'Atualizado para ' + d.new_sha + '! Recarregando...');
      res.style.color = 'var(--green)';
      res.textContent = d.message;
      setTimeout(function() { location.reload(); }, 3000);
    } else {
      btn.disabled = false;
      btn.textContent = '⬇️ Aplicar Atualização';
      showUpdStatus('error', 'Erro: ' + d.error);
    }
  });
}

function showUpdStatus(type, msg) {
  var el = document.getElementById('updStatus');
  el.style.display = 'block';
  el.textContent = msg;
  if (type === 'ok') {
    el.style.background = 'rgba(34,197,94,0.1)';
    el.style.border = '1px solid var(--green)';
    el.style.color = 'var(--green)';
  } else if (type === 'update') {
    el.style.background = 'rgba(234,179,8,0.1)';
    el.style.border = '1px solid #eab308';
    el.style.color = '#eab308';
  } else {
    el.style.background = 'rgba(239,68,68,0.1)';
    el.style.border = '1px solid var(--red)';
    el.style.color = 'var(--red)';
  }
}

function formatDate(isoStr) {
  try {
    return new Date(isoStr).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch(e) {
    return isoStr;
  }
}
