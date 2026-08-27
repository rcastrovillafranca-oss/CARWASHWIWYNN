(function () {
  const isConfigured =
    typeof SUPABASE_URL !== "undefined" &&
    !SUPABASE_URL.includes("TU-PROYECTO") &&
    typeof SUPABASE_ANON_KEY !== "undefined" &&
    !SUPABASE_ANON_KEY.includes("TU-ANON-KEY");

  const client = isConfigured
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

  // A partir de cuántos carros por delante mostramos el aviso de espera.
  const WARNING_THRESHOLD = 5;

  // ---------- Scroll reveal (runs first so a later error never leaves content invisible) ----------

  const revealEls = document.querySelectorAll(".reveal");

  if ("IntersectionObserver" in window) {
    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("in-view");
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
    );
    revealEls.forEach((el) => revealObserver.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add("in-view"));
  }

  // ---------- Form ----------

  const form = document.getElementById("form-registro");
  const success = document.getElementById("success");
  const errorMsg = document.getElementById("form-error");
  const submitBtn = document.getElementById("submit-btn");
  const submitLabel = document.getElementById("submit-label");

  const tipoInput = document.getElementById("tipo_auto");
  const precioInput = document.getElementById("precio");
  const priceCards = document.querySelectorAll(".price-card");
  const TIPO_LABELS = { chico: "Carro chico", troca: "Troca / Camioneta" };

  function selectCard(card) {
    priceCards.forEach((c) => {
      const isChosen = c === card;
      c.classList.toggle("selected", isChosen);
      c.classList.toggle("dimmed", !isChosen);
      c.setAttribute("aria-checked", isChosen ? "true" : "false");
    });
    tipoInput.value = card.dataset.tipo;
    precioInput.value = card.dataset.precio;
    submitLabel.textContent = `Confirmar registro · ${TIPO_LABELS[card.dataset.tipo]} · $${card.dataset.precio}`;
  }

  priceCards.forEach((card) => {
    card.addEventListener("click", () => {
      selectCard(card);
      document.getElementById("registro").scrollIntoView({ behavior: "smooth" });
    });
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        card.click();
      }
    });
  });

  // ---------- Turno de trabajo del cliente ----------

  const shiftPicker = document.getElementById("shift-picker");
  const shiftPickerEmpty = document.getElementById("shift-picker-empty");
  const turnoTrabajoInput = document.getElementById("turno_trabajo");
  const shiftChips = shiftPicker.querySelectorAll(".shift-chip");

  function selectShift(chip) {
    shiftChips.forEach((c) => {
      const isChosen = c === chip;
      c.classList.toggle("selected", isChosen);
      c.classList.toggle("dimmed", !isChosen);
      c.setAttribute("aria-checked", isChosen ? "true" : "false");
    });
    turnoTrabajoInput.value = chip.dataset.turno;
    shiftPickerEmpty.classList.add("hidden");
  }

  shiftChips.forEach((chip) => {
    chip.addEventListener("click", () => selectShift(chip));
  });

  // ---------- Día de servicio ----------

  const DOW_LABELS = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];
  const MES_LABELS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const DOW_FULL = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const MES_FULL = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
  ];

  // "2026-09-02" -> Date en horario LOCAL (no UTC), para que el día de la
  // semana no se recorra por el huso horario del navegador.
  function parseFechaLocal(fecha) {
    const [y, m, d] = fecha.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function formatHora(hora) {
    if (!hora) return "";
    const [h, m] = hora.split(":");
    const hn = Number(h);
    const ampm = hn >= 12 ? "pm" : "am";
    const h12 = hn % 12 === 0 ? 12 : hn % 12;
    return `${h12}${m !== "00" ? ":" + m : ""}${ampm}`;
  }

  function formatDayLong(fecha) {
    const d = parseFechaLocal(fecha);
    return `${DOW_FULL[d.getDay()]} ${d.getDate()} de ${MES_FULL[d.getMonth()]}`;
  }

  const dayPicker = document.getElementById("day-picker");
  const dayPickerEmpty = document.getElementById("day-picker-empty");
  const fechaInput = document.getElementById("fecha_servicio");
  let diasDisponibles = [];

  function selectDay(chip, dia) {
    dayPicker.querySelectorAll(".day-chip").forEach((c) => {
      c.classList.remove("selected");
      c.setAttribute("aria-checked", "false");
    });
    chip.classList.add("selected");
    chip.setAttribute("aria-checked", "true");
    fechaInput.value = dia.fecha;
  }

  function renderDayPicker() {
    dayPicker.querySelectorAll(".day-chip").forEach((c) => c.remove());

    if (diasDisponibles.length === 0) {
      dayPickerEmpty.textContent = "No hay días disponibles por el momento. Vuelve a checar más tarde.";
      dayPickerEmpty.classList.remove("hidden");
      submitBtn.disabled = true;
      return;
    }

    dayPickerEmpty.classList.add("hidden");
    submitBtn.disabled = false;

    diasDisponibles.forEach((dia, i) => {
      const d = parseFechaLocal(dia.fecha);
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "day-chip";
      chip.setAttribute("role", "radio");
      chip.setAttribute("aria-checked", "false");
      chip.innerHTML = `
        <span class="day-chip__dow">${DOW_LABELS[d.getDay()]}</span>
        <span class="day-chip__num">${d.getDate()}</span>
        <span class="day-chip__mes">${MES_LABELS[d.getMonth()]}</span>
        ${dia.hora_inicio ? `<span class="day-chip__hora">${formatHora(dia.hora_inicio)}${dia.hora_fin ? "–" + formatHora(dia.hora_fin) : ""}</span>` : ""}
      `;
      chip.addEventListener("click", () => selectDay(chip, dia));
      dayPicker.appendChild(chip);
      if (i === 0) selectDay(chip, dia);
    });
  }

  async function cargarDiasDisponibles() {
    if (!client) {
      // Modo demo (Supabase no configurado): unos días de ejemplo para
      // poder probar el diseño.
      const hoy = new Date();
      diasDisponibles = [1, 3, 5].map((offset) => {
        const d = new Date(hoy);
        d.setDate(d.getDate() + offset);
        return { fecha: d.toISOString().slice(0, 10), hora_inicio: "09:00", hora_fin: "14:00" };
      });
      renderDayPicker();
      return;
    }

    try {
      const hoyISO = new Date().toISOString().slice(0, 10);
      const { data, error } = await client
        .from("dias_disponibles")
        .select("fecha, hora_inicio, hora_fin")
        .gte("fecha", hoyISO)
        .order("fecha", { ascending: true });

      if (error) throw error;
      diasDisponibles = data || [];
      renderDayPicker();
    } catch (err) {
      console.error("No se pudieron cargar los días disponibles", err);
      dayPickerEmpty.textContent = "No se pudieron cargar los días disponibles.";
    }
  }

  cargarDiasDisponibles();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorMsg.classList.add("hidden");

    const data = Object.fromEntries(new FormData(form).entries());
    data.precio = Number(data.precio);

    if (!data.fecha_servicio) {
      dayPickerEmpty.classList.remove("hidden");
      dayPickerEmpty.textContent = "Elige un día antes de continuar.";
      return;
    }

    if (!data.turno_trabajo) {
      shiftPickerEmpty.classList.remove("hidden");
      shiftPicker.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    submitBtn.disabled = true;
    submitLabel.textContent = "Registrando...";

    try {
      let turno;
      let carrosAdelante = 0;

      if (client) {
        // Llama a la función registrar_lavado (ver supabase/schema.sql): inserta
        // el registro y de paso calcula el turno del día y cuántos autos en
        // espera hay antes que el suyo — todo en un solo paso atómico, sin
        // que el navegador necesite leer la tabla completa.
        const { data: result, error } = await client.rpc("registrar_lavado", {
          p_nombre: data.nombre,
          p_telefono: data.telefono,
          p_tipo_auto: data.tipo_auto,
          p_precio: data.precio,
          p_marca: data.marca,
          p_modelo: data.modelo,
          p_fecha_servicio: data.fecha_servicio,
          p_turno_trabajo: data.turno_trabajo,
        });

        if (error) throw error;
        const row = Array.isArray(result) ? result[0] : result;
        turno = row.turno;
        carrosAdelante = row.carros_adelante || 0;
      } else {
        console.warn("Supabase no está configurado (config.js). Guardando solo en consola.");
        turno = Math.floor(Math.random() * 9) + 1;
      }

      document.getElementById("success-nombre").textContent = data.nombre;
      document.getElementById("success-turno").textContent = turno;
      document.getElementById("success-auto").textContent = `${data.marca} ${data.modelo}`;
      document.getElementById("success-fecha").textContent = formatDayLong(data.fecha_servicio);

      const warning = document.getElementById("success-warning");
      if (carrosAdelante >= WARNING_THRESHOLD) {
        document.getElementById("success-adelante").textContent = carrosAdelante;
        warning.classList.remove("hidden");
      } else {
        warning.classList.add("hidden");
      }

      form.classList.add("hidden");
      success.classList.remove("hidden");
      success.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
      console.error(err);
      errorMsg.classList.remove("hidden");
    } finally {
      submitBtn.disabled = false;
      submitLabel.textContent = `Confirmar registro · ${TIPO_LABELS[tipoInput.value]} · $${precioInput.value}`;
    }
  });

  document.getElementById("reset-btn").addEventListener("click", () => {
    form.reset();
    selectCard(priceCards[0]);
    shiftChips.forEach((c) => {
      c.classList.remove("selected", "dimmed");
      c.setAttribute("aria-checked", "false");
    });
    turnoTrabajoInput.value = "";
    shiftPickerEmpty.classList.add("hidden");
    renderDayPicker();
    success.classList.add("hidden");
    form.classList.remove("hidden");
    document.getElementById("registro").scrollIntoView({ behavior: "smooth" });
  });

  // ---------- Sticky CTA ----------

  const stickyCta = document.getElementById("sticky-cta");
  const registroSection = document.getElementById("registro");
  const heroSection = document.querySelector(".hero");

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.target === heroSection) {
          stickyCta.classList.toggle("visible", !entry.isIntersecting);
        }
        if (entry.target === registroSection && entry.isIntersecting) {
          stickyCta.classList.remove("visible");
        }
      });
    },
    { threshold: 0.05 }
  );

  observer.observe(heroSection);
  observer.observe(registroSection);
})();
