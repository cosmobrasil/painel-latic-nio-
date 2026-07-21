(function () {
  "use strict";

  // Configuration and constants
  const ACCESS_TOKEN_KEY = "admin_access_token";
  const ADMIN_PASSWORD = "Cosmob2026@";

  const isLocal = location.hostname.includes("localhost") || location.hostname === "127.0.0.1";
  const isNetlify = location.hostname.endsWith("netlify.app");
  
  // Resolve base API URL dynamically
  const API_BASE = isLocal 
    ? "http://localhost:3001" 
    : "https://formulario-production-8df7.up.railway.app";

  // --- Utilitario de timeout para fetch ---
  const FETCH_TIMEOUT_MS = 15000;

  function fetchComTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { ...options, signal: controller.signal })
      .finally(() => clearTimeout(timer));
  }

  async function fetchComRetry(url, options = {}, retries = 2) {
    for (let i = 0; i <= retries; i++) {
      try {
        return await fetchComTimeout(url, options);
      } catch (error) {
        if (i === retries) throw error;
        await new Promise(r => setTimeout(r, 1000 * (i + 1)));
      }
    }
  }

  // DOM Elements
  const gate = document.querySelector("#gate");
  const gateForm = document.querySelector("#gate-form");
  const passwordInput = document.querySelector("#password");
  const gateError = document.querySelector("#gate-error");
  const wrap = document.querySelector(".wrap");
  
  const btnReload = document.querySelector("#btn-reload");
  const btnLogout = document.querySelector("#btn-logout");
  const searchInput = document.querySelector("#search-input");
  
  const statTotalRespostas = document.querySelector("#stat-total-respostas");
  const statMediaIgc = document.querySelector("#stat-media-igc");
  const statMediaPcm = document.querySelector("#stat-media-pcm");
  const responsesBody = document.querySelector("#responses-body");

  // State
  let allResponses = [];

  // Init
  function init() {
    const savedToken = sessionStorage.getItem(ACCESS_TOKEN_KEY);
    if (savedToken === ADMIN_PASSWORD) {
      setLocked(false);
      carregar();
    } else {
      setLocked(true);
    }
  }

  // Toggle layout lock
  function setLocked(locked) {
    if (locked) {
      gate.classList.remove("hidden");
      wrap.classList.add("locked");
      passwordInput.value = "";
    } else {
      gate.classList.add("hidden");
      wrap.classList.remove("locked");
    }
  }

  // Handle gate login submit
  gateForm.addEventListener("submit", function (e) {
    e.preventDefault();
    const entered = passwordInput.value;
    
    if (entered === ADMIN_PASSWORD) {
      gateError.classList.add("hidden");
      sessionStorage.setItem(ACCESS_TOKEN_KEY, entered);
      setLocked(false);
      carregar();
    } else {
      gateError.textContent = "Senha incorreta. Tente novamente.";
      gateError.classList.remove("hidden");
    }
  });

  // Handle logout
  btnLogout.addEventListener("click", function () {
    sessionStorage.removeItem(ACCESS_TOKEN_KEY);
    setLocked(true);
  });

  // Manual refresh
  btnReload.addEventListener("click", function () {
    carregar();
  });

  // Filter input event
  searchInput.addEventListener("input", function () {
    renderTable();
  });

  // Format percent helper
  function formatPercent(value) {
    return `${Number(value || 0).toFixed(1)}%`;
  }

  // PCM is normalized by the API using each report's actual maximum score.
  function formatPcmPercent(value) {
    return `${Number(value || 0).toFixed(1)}%`;
  }

  // Get score class for colors
  function getScoreClass(igc) {
    if (igc >= 80) return "score-badge-high";
    if (igc >= 60) return "score-badge-mid";
    if (igc >= 40) return "score-badge-low";
    return "score-badge-verylow";
  }

  // Load responses from backend
  async function carregar() {
    responsesBody.innerHTML = `<tr><td colspan="8" class="table-loading">Carregando dados do servidor...</td></tr>`;
    
    const token = sessionStorage.getItem(ACCESS_TOKEN_KEY) || ADMIN_PASSWORD;
    const url = `${API_BASE}/api/admin/respostas?token=${encodeURIComponent(token)}`;

    try {
      const response = await fetchComTimeout(url);
      const resData = await response.json();

      if (!response.ok) {
        throw new Error(resData.error || "Erro ao buscar dados do servidor.");
      }

      allResponses = resData.data || [];
      renderTable();
      renderStats();
    } catch (err) {
      console.error(err);
      
      // If unauthorized, clean session and bounce back to login
      if (err.message.includes("autorizado") || err.message.includes("Token admin")) {
        sessionStorage.removeItem(ACCESS_TOKEN_KEY);
        setLocked(true);
        alert("Sua sessão expirou ou o token é inválido.");
      } else {
        responsesBody.innerHTML = `
          <tr>
            <td colspan="8" class="table-loading" style="color: var(--error)">
              Erro: ${err.message}<br/>
              <span style="font-size: 0.8rem; color: var(--muted)">Verifique se o backend está rodando em ${API_BASE}</span>
            </td>
          </tr>
        `;
      }
    }
  }

  // Calculate and render average stats overview cards
  function renderStats() {
    if (!allResponses.length) {
      statTotalRespostas.textContent = "0";
      statMediaIgc.textContent = "0.0%";
      statMediaPcm.textContent = "0.0%";
      return;
    }

    const total = allResponses.length;
    const sumIgc = allResponses.reduce((acc, curr) => acc + Number(curr.igc || 0), 0);
    const sumPcm = allResponses.reduce((acc, curr) => {
      const pcmPercent = curr.pcmPercent ?? ((Number(curr.pcm || 0) / 2) * 100);
      return acc + pcmPercent;
    }, 0);

    const avgIgc = sumIgc / total;
    const avgPcm = sumPcm / total;

    statTotalRespostas.textContent = String(total);
    statMediaIgc.textContent = formatPercent(avgIgc);
    statMediaPcm.textContent = formatPcmPercent(avgPcm);
  }

  // Render main data table
  function renderTable() {
    const query = searchInput.value.toLowerCase().trim();
    
    // Filter array
    const filtered = allResponses.filter(function (row) {
      if (!query) return true;
      return (
        row.nomeEmpresa.toLowerCase().includes(query) ||
        row.nomeResponsavel.toLowerCase().includes(query) ||
        row.cidade.toLowerCase().includes(query) ||
        row.produto.toLowerCase().includes(query)
      );
    });

    if (!filtered.length) {
      responsesBody.innerHTML = `
        <tr>
          <td colspan="8" class="table-loading">Nenhum diagnóstico correspondente encontrado.</td>
        </tr>
      `;
      return;
    }

    const token = sessionStorage.getItem(ACCESS_TOKEN_KEY) || ADMIN_PASSWORD;

    responsesBody.innerHTML = filtered.map(function (row) {
      const idStr = row.assessment_id || row.id;
      const htmlUrl = `${API_BASE}/api/admin/respostas/${idStr}/html?token=${encodeURIComponent(token)}`;
      const pdfUrl = `${API_BASE}/api/admin/respostas/${idStr}/pdf?token=${encodeURIComponent(token)}`;

      return `
        <tr>
          <td><span class="company-name">${escapeHtml(row.nomeEmpresa)}</span></td>
          <td>${escapeHtml(row.nomeResponsavel)}</td>
          <td>${escapeHtml(row.cidade)} / ${escapeHtml(row.uf)}</td>
          <td>${escapeHtml(row.produto)}</td>
          <td>${escapeHtml(row.dataHora)}</td>
          <td class="text-center">
            <span class="score-badge ${getScoreClass(row.igc)}">
              ${formatPercent(row.igc)}
            </span>
          </td>
          <td class="text-center">
            <span class="score-badge ${getScoreClass(row.pcmPercent ?? ((Number(row.pcm || 0) / 2) * 100))}">
              ${formatPcmPercent(row.pcmPercent ?? ((Number(row.pcm || 0) / 2) * 100))}
            </span>
          </td>
          <td class="text-right">
            <div class="actions-cell">
              <a href="${htmlUrl}" target="_blank" class="btn btn-sm btn-sm-html">Visualizar HTML</a>
              <a href="${pdfUrl}" target="_blank" class="btn btn-sm btn-sm-pdf">Baixar PDF</a>
            </div>
          </td>
        </tr>
      `;
    }).join("");
  }

  // Escape HTML string
  function escapeHtml(val) {
    return String(val ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // Initialize page
  init();

})();
