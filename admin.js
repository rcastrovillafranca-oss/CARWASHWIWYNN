(function () {
  const isConfigured =
    typeof SUPABASE_URL !== "undefined" &&
    !SUPABASE_URL.includes("TU-PROYECTO") &&
    typeof SUPABASE_ANON_KEY !== "undefined" &&
    !SUPABASE_ANON_KEY.includes("TU-ANON-KEY");

  const loginView = document.getElementById("login-view");
  const dashView = document.getElementById("dash-view");
  const loginForm = document.getElementById("login-form");
  const loginBtn = document.getElementById("login-btn");
  const loginLabel = document.getElementById("login-label");
  const loginError = document.getElementById("login-error");
  const loginNotConfigured = document.getElementById("login-not-configured");

  if (!isConfigured) {
    loginNotConfigured.classList.remove("hidden");
    loginForm.querySelector("button").disabled = true;
    return;
  }

  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  let rows = [];
  let activeFilter = "activos";
  let channel = null;

  // ---------- Auth ----------

  async function checkSession() {
    const { data } = await client.auth.getSession();
    if (data.session) {
      showDashboard();
    } else {
      showLogin();
    }
  }

  function showLogin() {
    loginView.classList.remove("hidden");
    dashView.classList.add("hidden");
    if (channel) {
      client.removeChannel(channel);
      channel = null;
    }
  }

  function showDashboard() {
    loginView.classList.add("hidden");
    dashView.classList.remove("hidden");
    loadRows();
    subscribeRealtime();
  }

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    loginError.classList.add("hidden");
    loginBtn.disabled = true;
    loginLabel.textContent = "Entrando...";

    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;

    const { error } = await client.auth.signInWithPassword({ email, password });

    loginBtn.disabled = false;
    loginLabel.textContent = "Entrar";

    if (error) {
      loginError.classList.remove("hidden");
      return;
    }

    showDashboard();
  });

  document.getElementById("logout-btn").addEventListener("click", async () => {
    await client.auth.signOut();
    showLogin();
  });

  // ---------- Data ----------

  async function loadRows() {
    const { data, error } = await client
      .from("registros")
      .select("id, created_at, nombre, telefono, marca, modelo, tipo_auto, precio, turno, estado")
      .order("created_at", { ascending: true });

    if (error) {
      console.error("No se pudieron cargar los registros", error);
      return;
    }

    rows = data || [];
    renderStats();
    renderQueue();
  }

  function subscribeRealtime() {
    if (channel) return;
    channel = client
      .channel("admin-registros")
      .on("postgres_changes", { event: "*", schema: "public", table: "registros" }, loadRows)
      .subscribe();
  }

  // ---------- Stats ----------

  function isToday(iso) {
    const d = new Date(iso);
    const now = new Date();
    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    );
  }

  function renderStats() {
    const enEspera = rows.filter((r) => r.estado === "pendiente").length;
    const enProceso = rows.filter((r) => r.estado === "en_proceso").length;
    const listosHoy = rows.filter((r) => r.estado === "listo" && isToday(r.created_at));
    const ingresosHoy = listosHoy.reduce((sum, r) => sum + (r.precio || 0), 0);

    document.getElementById("d-espera").textContent = enEspera;
    document.getElementById("d-proceso").textContent = enProceso;
    document.getElementById("d-listos").textContent = listosHoy.length;
    document.getElementById("d-ingresos").textContent = `$${ingresosHoy}`;
  }

  // ---------- Queue rendering ----------

  const tabs = document.querySelectorAll(".tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => {
        t.classList.remove("active");
        t.setAttribute("aria-selected", "false");
      });
      tab.classList.add("active");
      tab.setAttribute("aria-selected", "true");
      activeFilter = tab.dataset.filter;
      renderQueue();
    });
  });

  function relativeTime(iso) {
    const diffMs = Date.now() - new Date(iso).getTime();
    const mins = Math.round(diffMs / 60000);
    if (mins < 1) return "justo ahora";
    if (mins < 60) return `hace ${mins} min`;
    const hrs = Math.round(mins / 60);
    return `hace ${hrs} h`;
  }

  function tipoLabel(tipo) {
    return tipo === "troca" ? "Troca / Camioneta" : "Carro chico";
  }

  function filteredRows() {
    if (activeFilter === "listo") {
      return rows.filter((r) => r.estado === "listo" && isToday(r.created_at)).slice().reverse();
    }
    if (activeFilter === "todos") {
      return rows.slice().reverse();
    }
    return rows.filter((r) => r.estado === "pendiente" || r.estado === "en_proceso");
  }

  async function setEstado(id, estado) {
    const { error } = await client.from("registros").update({ estado }).eq("id", id);
    if (error) console.error("No se pudo actualizar el estado", error);
    // loadRows() se dispara solo vía la suscripción de Realtime.
  }

  function fillActions(wrap, row) {
    if (row.estado === "pendiente") {
      const start = document.createElement("button");
      start.className = "btn-start";
      start.textContent = "Iniciar";
      start.addEventListener("click", () => setEstado(row.id, "en_proceso"));
      wrap.appendChild(start);

      const done = document.createElement("button");
      done.className = "btn-done";
      done.textContent = "Listo";
      done.addEventListener("click", () => setEstado(row.id, "listo"));
      wrap.appendChild(done);
    }

    if (row.estado === "en_proceso") {
      const undo = document.createElement("button");
      undo.className = "btn-undo";
      undo.textContent = "Deshacer";
      undo.addEventListener("click", () => setEstado(row.id, "pendiente"));
      wrap.appendChild(undo);

      const done = document.createElement("button");
      done.className = "btn-done";
      done.textContent = "Marcar listo";
      done.addEventListener("click", () => setEstado(row.id, "listo"));
      wrap.appendChild(done);
    }

    if (row.estado === "listo") {
      const undo = document.createElement("button");
      undo.className = "btn-undo";
      undo.textContent = "Reabrir";
      undo.addEventListener("click", () => setEstado(row.id, "en_proceso"));
      wrap.appendChild(undo);
    }
  }

  function renderQueue() {
    const list = document.getElementById("queue-list");
    const empty = document.getElementById("queue-empty");
    const template = document.getElementById("row-template");

    const items = filteredRows();
    list.innerHTML = "";
    empty.classList.toggle("hidden", items.length > 0);

    items.forEach((row) => {
      const node = template.content.cloneNode(true);
      const article = node.querySelector(".row");
      article.classList.add(`row--${row.estado}`);

      // El número de turno es el mismo que ve el cliente en su pantalla de
      // confirmación — así el equipo puede llamarlo "turno 5" y coincide.
      node.querySelector(".row__pos").textContent = row.turno != null ? row.turno : "—";

      node.querySelector(".row__nombre").textContent = row.nombre;
      node.querySelector(".row__precio").textContent = `$${row.precio}`;
      node.querySelector(".row__auto").textContent = [row.marca, row.modelo].filter(Boolean).join(" ") || "—";

      const tel = node.querySelector(".row__tel");
      tel.textContent = row.telefono;
      tel.href = `tel:${row.telefono.replace(/\D/g, "")}`;

      node.querySelector(".row__tipo").textContent = tipoLabel(row.tipo_auto);
      node.querySelector(".row__hora").textContent = relativeTime(row.created_at);

      fillActions(node.querySelector(".row__actions"), row);

      list.appendChild(node);
    });
  }

  checkSession();
})();
