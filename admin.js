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

  // ---------- Mostrar/ocultar contraseña ----------

  const passInput = document.getElementById("login-password");
  const togglePass = document.getElementById("toggle-pass");
  togglePass.addEventListener("click", () => {
    const show = passInput.type === "password";
    passInput.type = show ? "text" : "password";
    togglePass.textContent = show ? "🙈" : "👁";
    togglePass.setAttribute("aria-label", show ? "Ocultar contraseña" : "Mostrar contraseña");
  });

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

  // Ajusta esto si tu equipo opera fuera de México, o si capturan el
  // teléfono ya con lada de país incluida.
  const WHATSAPP_COUNTRY_CODE = "52";

  function whatsappLink(row) {
    const digits = row.telefono.replace(/\D/g, "");
    const phone = digits.length === 10 ? WHATSAPP_COUNTRY_CODE + digits : digits;
    const primerNombre = (row.nombre || "").trim().split(/\s+/)[0] || row.nombre;
    const auto = [row.marca, row.modelo].filter(Boolean).join(" ") || "tu auto";
    const mensaje = [
      `¡Hola ${primerNombre}! 🚗✨`,
      "",
      `Tu *${auto}* ya está listo y reluciente.`,
      "",
      "Puedes pasar por él cuando gustes 🕐",
      "",
      "¡Gracias por tu preferencia! 🙌",
      "*Detallados Barraza*",
    ].join("\n");
    return `https://wa.me/${phone}?text=${encodeURIComponent(mensaje)}`;
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

  // Marca el registro como listo Y abre WhatsApp con el aviso, en un solo
  // clic. window.open debe llamarse de forma síncrona (antes del await)
  // para que el navegador no lo bloquee como pop-up.
  function marcarListoYAvisar(row) {
    window.open(whatsappLink(row), "_blank", "noopener");
    setEstado(row.id, "listo");
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
      done.textContent = "Listo 💬";
      done.addEventListener("click", () => marcarListoYAvisar(row));
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
      done.textContent = "Listo 💬";
      done.addEventListener("click", () => marcarListoYAvisar(row));
      wrap.appendChild(done);
    }

    if (row.estado === "listo") {
      const wa = document.createElement("a");
      wa.className = "btn-whatsapp";
      wa.textContent = "Reenviar WhatsApp";
      wa.href = whatsappLink(row);
      wa.target = "_blank";
      wa.rel = "noopener";
      wrap.appendChild(wa);

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

  // ---------- Zona de peligro: reiniciar todos los registros ----------

  const resetModal = document.getElementById("reset-modal");
  const resetConfirmInput = document.getElementById("reset-confirm-input");
  const resetConfirmBtn = document.getElementById("reset-confirm-btn");
  const resetConfirmLabel = document.getElementById("reset-confirm-label");
  const resetError = document.getElementById("reset-error");

  function openResetModal() {
    resetConfirmInput.value = "";
    resetConfirmBtn.disabled = true;
    resetError.classList.add("hidden");
    resetModal.classList.remove("hidden");
    resetConfirmInput.focus();
  }

  function closeResetModal() {
    resetModal.classList.add("hidden");
  }

  document.getElementById("open-reset-modal").addEventListener("click", openResetModal);
  document.getElementById("reset-cancel").addEventListener("click", closeResetModal);
  resetModal.addEventListener("click", (e) => {
    if (e.target === resetModal) closeResetModal();
  });

  resetConfirmInput.addEventListener("input", () => {
    resetConfirmBtn.disabled = resetConfirmInput.value.trim().toUpperCase() !== "BORRAR";
  });

  resetConfirmBtn.addEventListener("click", async () => {
    resetConfirmBtn.disabled = true;
    resetConfirmLabel.textContent = "Borrando...";
    resetError.classList.add("hidden");

    // Filtro "atrapa-todo" en vez de un delete sin condición: Postgres
    // siempre tiene created_at, así que esto borra literalmente cada fila.
    const { error } = await client.from("registros").delete().gte("created_at", "1970-01-01");

    resetConfirmLabel.textContent = "Borrar todo";

    if (error) {
      console.error("No se pudieron borrar los registros", error);
      resetError.classList.remove("hidden");
      resetConfirmBtn.disabled = false;
      return;
    }

    closeResetModal();
    loadRows();
  });

  checkSession();
})();
