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
    const enEspera = rows.filter((r) => r.estado !== "listo").length;
    const listosHoy = rows.filter((r) => r.estado === "listo" && isToday(r.created_at));
    const ingresosHoy = listosHoy.reduce((sum, r) => sum + (r.precio || 0), 0);

    document.getElementById("d-espera").textContent = enEspera;
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

  // Lada por default para números de 10 dígitos sin lada de país.
  const WHATSAPP_COUNTRY_CODE = "52";
  // Excepción: números que empiezan con estas ladas de área son de EE.UU.
  // (915 = El Paso, TX), así que llevan +1 en vez de +52. Agrega más ladas
  // aquí si hace falta.
  const WHATSAPP_US_AREA_CODES = ["915"];
  const WHATSAPP_US_COUNTRY_CODE = "1";

  function primerNombreDe(row) {
    return (row.nombre || "").trim().split(/\s+/)[0] || row.nombre;
  }

  // Texto del mensaje, sin ningún emoji: WhatsApp Desktop en Windows rompe
  // los de "cara/objeto/mano" (par sustituto en Unicode) cuando llegan por
  // un link wa.me, y ya nos pasó dos veces — más vale no arriesgarse.
  function mensajeListo(row) {
    const auto = [row.marca, row.modelo].filter(Boolean).join(" ") || "tu auto";
    return [
      `¡Hola ${primerNombreDe(row)}!`,
      "",
      `Tu *${auto}* ya está listo.`,
      "",
      "Puedes pasar por él cuando gustes.",
      "",
      "Gracias por tu preferencia.",
      "*Detallados Barraza*",
    ].join("\n");
  }

  function whatsappPhone(row) {
    const digits = row.telefono.replace(/\D/g, "");
    if (digits.length !== 10) return digits;
    const esDeEEUU = WHATSAPP_US_AREA_CODES.some((lada) => digits.startsWith(lada));
    return (esDeEEUU ? WHATSAPP_US_COUNTRY_CODE : WHATSAPP_COUNTRY_CODE) + digits;
  }

  function whatsappLink(row) {
    return `https://wa.me/${whatsappPhone(row)}?text=${encodeURIComponent(mensajeListo(row))}`;
  }

  // ---------- Imagen personalizada de agradecimiento ----------

  let logoImgPromise = null;
  function loadLogoImage() {
    if (!logoImgPromise) {
      logoImgPromise = new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = "assets/logo-barraza.png";
      });
    }
    return logoImgPromise;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function nombreArchivo(row) {
    return `gracias-${primerNombreDe(row).toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`;
  }

  async function generarCanvasGracias(row) {
    const size = 1080;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");

    // Fondo: degradado oscuro con resplandor cian, igual que el sitio.
    const bg = ctx.createRadialGradient(size / 2, 260, 80, size / 2, size / 2, 820);
    bg.addColorStop(0, "#132a33");
    bg.addColorStop(1, "#070b0f");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size, size);

    // Logo arriba, centrado.
    try {
      const logo = await loadLogoImage();
      const logoW = 360;
      const logoH = (logo.height / logo.width) * logoW;
      ctx.drawImage(logo, (size - logoW) / 2, 90, logoW, logoH);
    } catch (e) {
      console.error("No se pudo cargar el logo para la imagen", e);
    }

    await Promise.all([
      document.fonts.load("700 96px Oswald"),
      document.fonts.load("700 42px Oswald"),
      document.fonts.load("600 36px Inter"),
      document.fonts.load("600 28px Inter"),
    ]);

    ctx.textAlign = "center";

    ctx.fillStyle = "#9fb0b8";
    ctx.font = "700 42px Oswald";
    ctx.fillText("GRACIAS POR TU PREFERENCIA", size / 2, 540);

    const nameGrad = ctx.createLinearGradient(180, 0, size - 180, 0);
    nameGrad.addColorStop(0, "#4fe0ff");
    nameGrad.addColorStop(1, "#22c1e0");
    ctx.fillStyle = nameGrad;
    ctx.font = "700 100px Oswald";
    ctx.fillText(primerNombreDe(row), size / 2, 660);

    const barW = 150;
    const barGrad = ctx.createLinearGradient(size / 2 - barW / 2, 0, size / 2 + barW / 2, 0);
    barGrad.addColorStop(0, "#4fe0ff");
    barGrad.addColorStop(1, "#8dc63f");
    ctx.fillStyle = barGrad;
    roundRect(ctx, size / 2 - barW / 2, 690, barW, 6, 3);
    ctx.fill();

    const auto = [row.marca, row.modelo].filter(Boolean).join(" ");
    ctx.fillStyle = "#eef3f5";
    ctx.font = "600 36px Inter";
    ctx.fillText(auto ? `Tu ${auto} quedó reluciente` : "Tu auto quedó reluciente", size / 2, 760);

    ctx.fillStyle = "#6d7d85";
    ctx.font = "600 28px Inter";
    ctx.fillText("Detallados Barraza  ×  Wiwynn", size / 2, 980);

    return canvas;
  }

  function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("No se pudo generar la imagen"))), "image/png");
    });
  }

  function descargarBlob(blob, nombre) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  // Genera la imagen y la manda de la forma más directa que el navegador
  // permita:
  //  - Celular (Android/iPhone): usa el "compartir" nativo del sistema con
  //    la imagen adjunta — el usuario elige WhatsApp y listo, se manda la
  //    foto de verdad, no solo el texto.
  //  - Computadora: los navegadores de escritorio no dejan compartir
  //    archivos así, así que abrimos WhatsApp con el mensaje ya escrito
  //    (al número correcto) y descargamos la imagen para adjuntarla a mano.
  async function enviarListoConImagen(row, waTab) {
    const canvas = await generarCanvasGracias(row);
    const blob = await canvasToBlob(canvas);
    const archivo = new File([blob], nombreArchivo(row), { type: "image/png" });
    const texto = mensajeListo(row);

    // waTab: una pestaña en blanco ya reservada (ver abajo) para cuando el
    // navegador no puede compartir el archivo directo — así, al navegarla
    // más abajo, el navegador no la trata como pop-up (eso solo se evita
    // si la pestaña se abrió dentro del mismo clic del usuario).
    if (!waTab && navigator.canShare && navigator.canShare({ files: [archivo] })) {
      try {
        await navigator.share({ files: [archivo], text: texto, title: "Detallados Barraza" });
        return;
      } catch (e) {
        if (e && e.name === "AbortError") return; // el usuario cerró el menú de compartir
        console.error("No se pudo compartir la imagen, uso el respaldo", e);
      }
    }

    const link = whatsappLink(row);
    if (waTab) {
      waTab.location = link;
    } else {
      window.open(link, "_blank", "noopener");
    }
    descargarBlob(blob, nombreArchivo(row));
  }

  function puedeCompartirArchivo() {
    try {
      const prueba = new File([""], "x.png", { type: "image/png" });
      return !!(navigator.canShare && navigator.canShare({ files: [prueba] }));
    } catch (e) {
      return false;
    }
  }

  // Punto de entrada compartido por "Listo" y "Reenviar": si el navegador
  // puede compartir archivos (celular), no abre nada — el share nativo se
  // encarga. Si no (computadora), reserva la pestaña de WhatsApp DENTRO del
  // clic del usuario para que no se bloquee como pop-up.
  function enviarConImagen(row) {
    // Ojo: "noopener" hace que window.open() regrese null (no hay
    // referencia a la ventana), así que aquí NO se usa — si no, nunca
    // podríamos navegar esta pestaña reservada más abajo. Como el destino
    // (wa.me) es un dominio conocido y confiable, no hay riesgo real.
    const waTab = puedeCompartirArchivo() ? null : window.open("", "_blank");
    enviarListoConImagen(row, waTab).catch((e) => console.error("No se pudo enviar la imagen", e));
  }

  function filteredRows() {
    if (activeFilter === "listo") {
      return rows.filter((r) => r.estado === "listo" && isToday(r.created_at)).slice().reverse();
    }
    if (activeFilter === "todos") {
      return rows.slice().reverse();
    }
    return rows.filter((r) => r.estado !== "listo");
  }

  async function setEstado(id, estado) {
    const { error } = await client.from("registros").update({ estado }).eq("id", id);
    if (error) console.error("No se pudo actualizar el estado", error);
    // loadRows() se dispara solo vía la suscripción de Realtime.
  }

  // Marca el registro como listo y manda el aviso (texto + imagen) por el
  // mejor camino disponible.
  function marcarListoYAvisar(row) {
    setEstado(row.id, "listo");
    enviarConImagen(row);
  }

  function fillActions(wrap, row) {
    if (row.estado !== "listo") {
      const done = document.createElement("button");
      done.className = "btn-done";
      done.textContent = "Listo 💬";
      done.addEventListener("click", () => marcarListoYAvisar(row));
      wrap.appendChild(done);
    }

    if (row.estado === "listo") {
      const wa = document.createElement("button");
      wa.className = "btn-whatsapp";
      wa.textContent = "Reenviar";
      wa.addEventListener("click", () => enviarConImagen(row));
      wrap.appendChild(wa);

      const undo = document.createElement("button");
      undo.className = "btn-undo";
      undo.textContent = "Reabrir";
      undo.addEventListener("click", () => setEstado(row.id, "pendiente"));
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
