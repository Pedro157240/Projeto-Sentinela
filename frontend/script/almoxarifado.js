let estoqueGlobal = [];
let filtroAtivo = "todos";
let editandoId = null;
let historicoEntradas = [];

  const usuario = JSON.parse(localStorage.getItem("hospital_user") || "{}");
  if (usuario.nome) {
    document.getElementById("nomeUsuario").textContent = "📦 " + usuario.nome;
    }

  function showToast(msg, tipo = "success") {
      const t = document.getElementById("toast");
      t.textContent = msg;
      t.className = `toast toast-${tipo} show`;
      setTimeout(() => { t.className = "toast"; }, 4000);
    }

  function setTab(tab) {
    document.getElementById("painelNovo").style.display = tab === "novo" ? "block" : "none";
    document.getElementById("painelRepor").style.display = tab === "repor" ? "block" : "none";
    document.getElementById("tabNovo").className = "tab-btn" + (tab === "novo" ? " active" : "");
    document.getElementById("tabRepor").className = "tab-btn" + (tab === "repor" ? " active" : "");
    if (tab === "repor") preencherSelectRepor();
    }

  function carregarEstoque() {
    fetch("/estoque")
      .then(r => r.json())
      .then(data => {
        estoqueGlobal = data;
        atualizarStats(data);
        renderizarFiltros(data);
        renderizarTabela(data);
        verificarAlertas(data);
        })
        .catch(() => showToast("❌ Erro ao carregar estoque.", "error"));
    }

    function atualizarStats(data) {
      document.getElementById("statItens").textContent = data.length;
      document.getElementById("statOk").textContent = data.filter(m => m.quantidade > 10).length;
      document.getElementById("statBaixo").textContent = data.filter(m => m.quantidade > 0 && m.quantidade <= 10).length;
      document.getElementById("statZerado").textContent = data.filter(m => m.quantidade === 0).length;
    }

    function verificarAlertas(data) {
      const baixos = data.filter(m => m.quantidade > 0 && m.quantidade <= 10);
      const zerados = data.filter(m => m.quantidade === 0);
      const el = document.getElementById("alertaEstoque");
      const msgs = [];
      if (zerados.length) msgs.push(`${zerados.length} medicamento(s) zerado(s): ${zerados.map(m => m.nome).join(", ")}`);
      if (baixos.length) msgs.push(`${baixos.length} com estoque baixo`);
      if (msgs.length) {
        document.getElementById("alertaTexto").textContent = msgs.join(" | ") + " — repor com urgência!";
        el.style.display = "flex";
      } else {
        el.style.display = "none";
      }
    }

    function renderizarFiltros(data) {
      const cats = [...new Set(data.map(m => m.categoria).filter(Boolean))];
      const el = document.getElementById("filterChips");
      el.innerHTML = `<span class="chip ${filtroAtivo === 'todos' ? 'active' : ''}" onclick="setFiltro('todos', this)">Todos</span>`;
      cats.forEach(c => {
        el.innerHTML += `<span class="chip ${filtroAtivo === c ? 'active' : ''}" onclick="setFiltro('${c}', this)">${c}</span>`;
      });
    }

    function setFiltro(cat, el) {
      filtroAtivo = cat;
      document.querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
      el.classList.add("active");
      filtrarTabela();
    }

    function filtrarTabela() {
      const busca = document.getElementById("buscaMed").value.toLowerCase();
      const filtrados = estoqueGlobal.filter(m => {
        const matchCat = filtroAtivo === "todos" || m.categoria === filtroAtivo;
        const matchBusc = m.nome.toLowerCase().includes(busca) || (m.categoria || "").toLowerCase().includes(busca);
        return matchCat && matchBusc;
      });
      renderizarTabela(filtrados);
    }

    function getStockClass(q) {
      if (q === 0) return "stock-empty";
      if (q <= 5) return "stock-critical";
      if (q <= 10) return "stock-low";
      return "stock-ok";
    }
    function getStockIcon(q) {
      if (q === 0) return "🚫";
      if (q <= 5) return "🔴";
      if (q <= 10) return "🟡";
      return "🟢";
    }

    function renderizarTabela(data) {
      const tbody = document.getElementById("tabelaEstoque");
      if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><div class="empty-icon">📭</div><p>Nenhum item encontrado.</p></div></td></tr>`;
        return;
      }
      tbody.innerHTML = data.map(m => `
    <tr>
      <td>
        <div class="med-name">${m.nome}</div>
      </td>
      <td><div class="med-cat">${m.categoria || "—"}</div></td>
      <td>
        <span class="stock-badge ${getStockClass(m.quantidade)}">
          ${getStockIcon(m.quantidade)} ${m.quantidade}
        </span>
      </td>
      <td style="color:var(--slate-500); font-size:13px">${m.unidade || "—"}</td>
      <td>
        <div class="action-row">
          <button class="btn-sm btn-success" onclick="abrirModalEditar(${m.id}, '${m.nome.replace(/'/g, "\\'")}', ${m.quantidade})">
            ✏️ Editar
          </button>
          <button class="btn-sm btn-danger-sm" onclick="removerMedicamento(${m.id}, '${m.nome.replace(/'/g, "\\'")}')">
            🗑️
          </button>
        </div>
      </td>
    </tr>
  `).join("");
    }

    function darEntrada() {
      const nome = document.getElementById("emNome").value.trim();
      const qtd = parseInt(document.getElementById("emQtd").value);
      const unidade = document.getElementById("emUnidade").value;
      const categoria = document.getElementById("emCategoria").value;

      if (!nome) { showToast("⚠️ Digite o nome do medicamento.", "warning"); return; }
      if (!qtd || qtd <= 0) { showToast("⚠️ Quantidade inválida.", "warning"); return; }

      fetch("/estoque", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, quantidade: qtd, unidade, categoria })
      })
        .then(r => r.json())
        .then(data => {
          if (data.erro) { showToast("❌ " + data.erro, "error"); return; }
          showToast("✅ " + data.mensagem, "success");
          document.getElementById("emNome").value = "";
          document.getElementById("emQtd").value = "10";

          historicoEntradas.unshift({
            tipo: "entrada",
            nome: data.medicamento.nome,
            qtd,
            unidade: data.medicamento.unidade,
            hora: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
            responsavel: usuario.nome || "Almoxarifado"
          });
          renderizarHistorico();
          carregarEstoque();
        })
        .catch(() => showToast("❌ Erro ao registrar entrada.", "error"));
    }

    function preencherSelectRepor() {
      const sel = document.getElementById("selReporMed");
      sel.innerHTML = `<option value="">-- Selecione --</option>`;
      estoqueGlobal.forEach(m => {
        const opt = document.createElement("option");
        opt.value = m.id;
        opt.textContent = `${m.nome} (atual: ${m.quantidade} ${m.unidade})`;
        sel.appendChild(opt);
      });
    }

    function reporEstoque() {
      const id = document.getElementById("selReporMed").value;
      const qtd = parseInt(document.getElementById("reporQtd").value);

      if (!id) { showToast("⚠️ Selecione um medicamento.", "warning"); return; }
      if (!qtd || qtd <= 0) { showToast("⚠️ Quantidade inválida.", "warning"); return; }

      const med = estoqueGlobal.find(m => m.id == id);

      fetch(`/estoque/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantidade: qtd })
      })
        .then(r => r.json())
        .then(data => {
          showToast(`✅ +${qtd} ${data.medicamento.unidade} adicionados! Novo total: ${data.medicamento.quantidade}`, "success");
          document.getElementById("reporQtd").value = "10";
          document.getElementById("reporObs").value = "";

          historicoEntradas.unshift({
            tipo: "reposicao",
            nome: data.medicamento.nome,
            qtd,
            unidade: data.medicamento.unidade,
            hora: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
            responsavel: usuario.nome || "Almoxarifado"
          });
          renderizarHistorico();
          carregarEstoque();
        })
        .catch(() => showToast("❌ Erro ao repor estoque.", "error"));
    }

    function abrirModalEditar(id, nome, qtdAtual) {
      editandoId = id;
      document.getElementById("modalMedNome").textContent = `💊 ${nome} — Estoque atual: ${qtdAtual}`;
      document.getElementById("modalQtd").value = "10";
      document.getElementById("modalEditar").classList.add("open");
    }

    function fecharModal() {
      document.getElementById("modalEditar").classList.remove("open");
      editandoId = null;
    }

    function confirmarEdicao() {
      const qtd = parseInt(document.getElementById("modalQtd").value);
      if (isNaN(qtd)) { showToast("⚠️ Digite um número válido.", "warning"); return; }

      fetch(`/estoque/${editandoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantidade: qtd })
      })
        .then(r => r.json())
        .then(data => {
          const acao = qtd > 0 ? `+${qtd}` : `${qtd}`;
          showToast(`✅ ${acao} ${data.medicamento.unidade}. Novo total: ${data.medicamento.quantidade}`, "success");
          fecharModal();
          carregarEstoque();
        })
        .catch(() => showToast("❌ Erro ao atualizar.", "error"));
    }

    function removerMedicamento(id, nome) {
      if (!confirm(`Tem certeza que deseja REMOVER "${nome}" do estoque?\nEsta ação não pode ser desfeita.`)) return;

      fetch(`/estoque/${id}`, { method: "DELETE" })
        .then(r => r.json())
        .then(() => {
          showToast(`🗑️ "${nome}" removido do estoque.`, "success");
          carregarEstoque();
        })
        .catch(() => showToast("❌ Erro ao remover.", "error"));
    }

    function carregarHistoricoEntradas() {
      renderizarHistorico();
    }

    function renderizarHistorico() {
      const div = document.getElementById("historico-entradas");
      if (historicoEntradas.length === 0) {
        div.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><p>Nenhuma entrada registrada nesta sessão.</p></div>`;
        return;
      }
      div.innerHTML = historicoEntradas.slice(0, 15).map(h => `
    <div class="hist-item">
      <div class="hist-icon ${h.tipo === 'reposicao' ? 'entrada' : 'entrada'}">
        ${h.tipo === "reposicao" ? "📦" : "📥"}
      </div>
      <div class="hist-info">
        <div class="hist-med">${h.nome}</div>
        <div class="hist-sub">🕐 ${h.hora} • 👤 ${h.responsavel} • ${h.tipo === "reposicao" ? "Reposição" : "Novo cadastro"}</div>
      </div>
      <div class="hist-qty-pos">+${h.qtd} ${h.unidade}</div>
    </div>
  `).join("");
    }

    const modal = document.getElementById("modalEditar");

if (modal) {
  modal.addEventListener("click", function (e) {
    if (e.target === this) fecharModal();
  });
}

    carregarEstoque();
    setInterval(carregarEstoque, 30000);