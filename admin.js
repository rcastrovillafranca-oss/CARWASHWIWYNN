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
    cargarDiasDisponibles();
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
      .select("id, created_at, nombre, telefono, marca, modelo, tipo_auto, precio, turno, turno_trabajo, estado, fecha_servicio")
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

  // ---------- Días disponibles ----------

  const diaForm = document.getElementById("dia-form");
  const diaFecha = document.getElementById("dia-fecha");
  const diaInicio = document.getElementById("dia-inicio");
  const diaFin = document.getElementById("dia-fin");
  const diaError = document.getElementById("dia-error");
  const diasLista = document.getElementById("dias-lista");

  function formatFechaCorta(fecha) {
    const [y, m, d] = fecha.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    const dow = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"][date.getDay()];
    const mes = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"][date.getMonth()];
    return `${dow} ${date.getDate()} ${mes}`;
  }

  async function cargarDiasDisponibles() {
    const hoy = new Date().toISOString().slice(0, 10);
    const { data, error } = await client
      .from("dias_disponibles")
      .select("id, fecha, hora_inicio, hora_fin")
      .gte("fecha", hoy)
      .order("fecha", { ascending: true });

    if (error) {
      console.error("No se pudieron cargar los días disponibles", error);
      return;
    }

    renderDiasDisponibles(data || []);
  }

  function renderDiasDisponibles(dias) {
    diasLista.innerHTML = "";

    if (dias.length === 0) {
      const p = document.createElement("p");
      p.className = "dias-lista__empty";
      p.textContent = "Todavía no agregas ningún día. Los clientes no podrán registrarse hasta que agregues al menos uno.";
      diasLista.appendChild(p);
      return;
    }

    dias.forEach((dia) => {
      const item = document.createElement("span");
      item.className = "dia-item";

      const texto = document.createElement("span");
      let html = formatFechaCorta(dia.fecha);
      if (dia.hora_inicio) {
        html += ` <span class="dia-item__hora">${dia.hora_inicio.slice(0, 5)}${dia.hora_fin ? "–" + dia.hora_fin.slice(0, 5) : ""}</span>`;
      }
      texto.innerHTML = html;
      item.appendChild(texto);

      const quitar = document.createElement("button");
      quitar.type = "button";
      quitar.className = "dia-item__quitar";
      quitar.textContent = "×";
      quitar.setAttribute("aria-label", `Quitar ${formatFechaCorta(dia.fecha)}`);
      quitar.addEventListener("click", async () => {
        const { error } = await client.from("dias_disponibles").delete().eq("id", dia.id);
        if (error) console.error("No se pudo quitar el día", error);
        cargarDiasDisponibles();
      });
      item.appendChild(quitar);

      diasLista.appendChild(item);
    });
  }

  diaForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    diaError.classList.add("hidden");

    if (!diaFecha.value) return;

    const { error } = await client.from("dias_disponibles").insert({
      fecha: diaFecha.value,
      hora_inicio: diaInicio.value || null,
      hora_fin: diaFin.value || null,
    });

    if (error) {
      console.error("No se pudo agregar el día", error);
      diaError.textContent = error.code === "23505" ? "Ese día ya estaba agregado." : "No se pudo agregar el día.";
      diaError.classList.remove("hidden");
      return;
    }

    diaForm.reset();
    diaInicio.value = "09:00";
    diaFin.value = "14:00";
    cargarDiasDisponibles();
  });

  // ---------- Stats ----------

  function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  // Todo esto se mide por "día de SERVICIO" (fecha_servicio), no por
  // cuándo se registró el cliente — con días agendados a futuro, lo que
  // importa operativamente es qué toca hoy, no cuándo se apuntaron.
  function renderStats() {
    const deHoy = rows.filter((r) => r.fecha_servicio === todayISO());
    const enEspera = deHoy.filter((r) => r.estado !== "listo").length;
    const listosHoy = deHoy.filter((r) => r.estado === "listo");
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
  //
  // imageUrl (opcional): si ya se subió la imagen de agradecimiento, se
  // pega su link en su propia línea — WhatsApp la reconoce como imagen y
  // la muestra con vista previa dentro del mensaje, sin que nadie tenga
  // que adjuntar nada a mano.
  function mensajeListo(row, imageUrl) {
    const auto = [row.marca, row.modelo].filter(Boolean).join(" ") || "tu auto";
    const lineas = [`¡Hola ${primerNombreDe(row)}!`, "", `Tu *${auto}* ya está listo.`];
    if (imageUrl) lineas.push("", imageUrl);
    lineas.push("", "Puedes pasar por él cuando gustes.", "", "Gracias por tu preferencia.", "*Detallados Barraza*");
    return lineas.join("\n");
  }

  function whatsappPhone(row) {
    const digits = row.telefono.replace(/\D/g, "");
    if (digits.length !== 10) return digits;
    const esDeEEUU = WHATSAPP_US_AREA_CODES.some((lada) => digits.startsWith(lada));
    return (esDeEEUU ? WHATSAPP_US_COUNTRY_CODE : WHATSAPP_COUNTRY_CODE) + digits;
  }

  function whatsappLink(row, imageUrl) {
    return `https://wa.me/${whatsappPhone(row)}?text=${encodeURIComponent(mensajeListo(row, imageUrl))}`;
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

  // Sube la imagen a Supabase Storage (bucket público "gracias", ver
  // supabase/schema.sql) y regresa su link público. Ese link se pega
  // dentro del propio mensaje de WhatsApp — WhatsApp lo reconoce como
  // imagen y muestra la vista previa directo en el chat, sin que nadie
  // tenga que adjuntar nada a mano.
  async function subirImagenGracias(blob, row) {
    const path = `${Date.now()}-${nombreArchivo(row)}`;
    const { error } = await client.storage.from("gracias").upload(path, blob, {
      contentType: "image/png",
      upsert: false,
    });
    if (error) throw error;
    const { data } = client.storage.from("gracias").getPublicUrl(path);
    return data.publicUrl;
  }

  // Siempre abre el chat del cliente CORRECTO (por su número, vía wa.me).
  // Nada de "compartir" genérico del sistema: eso abre un buscador de
  // contactos en blanco y no hay forma de saber a quién elegir.
  //
  // La imagen se sube a Storage y su link va DENTRO del mensaje, así
  // WhatsApp la muestra como foto sola, sin arrastrar ni adjuntar nada. Si
  // la subida falla (ej. no has corrido el schema.sql actualizado), cae de
  // respaldo a descargar la imagen para adjuntarla a mano.
  //
  // La pestaña de WhatsApp se reserva ANTES de las tareas asíncronas
  // (dentro del clic del usuario) para que el navegador no la bloquee
  // como pop-up; luego solo se navega a la URL final.
  async function enviarConImagen(row) {
    const waTab = window.open("", "_blank");
    try {
      const canvas = await generarCanvasGracias(row);
      const blob = await canvasToBlob(canvas);

      let imageUrl = null;
      try {
        imageUrl = await subirImagenGracias(blob, row);
      } catch (e) {
        console.error("No se pudo subir la imagen a Storage, se descarga en vez de incluirla en el mensaje", e);
      }

      const link = whatsappLink(row, imageUrl);
      if (waTab) {
        waTab.location = link;
      } else {
        window.open(link, "_blank");
      }

      if (!imageUrl) descargarBlob(blob, nombreArchivo(row));
    } catch (e) {
      console.error("No se pudo generar/enviar la imagen", e);
      if (waTab) waTab.location = whatsappLink(row);
    }
  }

  function filteredRows() {
    if (activeFilter === "listo") {
      return rows.filter((r) => r.estado === "listo" && r.fecha_servicio === todayISO()).slice().reverse();
    }
    if (activeFilter === "todos") {
      return rows.slice().reverse();
    }
    // Agrupado por día de servicio (el más próximo primero) y, dentro de
    // cada día, por orden de turno — así se ve el día de hoy junto y
    // completo antes de pasar al siguiente.
    return rows
      .filter((r) => r.estado !== "listo")
      .slice()
      .sort((a, b) => {
        const f = (a.fecha_servicio || "").localeCompare(b.fecha_servicio || "");
        if (f !== 0) return f;
        return new Date(a.created_at) - new Date(b.created_at);
      });
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
      node.querySelector(".row__turno-trabajo").textContent = row.turno_trabajo ? `Turno ${row.turno_trabajo}` : "";
      node.querySelector(".row__fecha").textContent = row.fecha_servicio ? formatFechaCorta(row.fecha_servicio) : "";
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
