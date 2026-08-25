(function () {
  const isConfigured =
    typeof SUPABASE_URL !== "undefined" &&
    !SUPABASE_URL.includes("TU-PROYECTO") &&
    typeof SUPABASE_ANON_KEY !== "undefined" &&
    !SUPABASE_ANON_KEY.includes("TU-ANON-KEY");

  const client = isConfigured
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

  const MINUTES_PER_VEHICLE = 25;

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
  const toggles = document.querySelectorAll("#toggle-tipo .toggle");

  toggles.forEach((btn) => {
    btn.addEventListener("click", () => {
      toggles.forEach((b) => {
        b.classList.remove("active");
        b.setAttribute("aria-checked", "false");
      });
      btn.classList.add("active");
      btn.setAttribute("aria-checked", "true");
      tipoInput.value = btn.dataset.tipo;
      precioInput.value = btn.dataset.precio;
      submitLabel.textContent = `Confirmar registro · $${btn.dataset.precio}`;
    });
  });

  document.querySelectorAll(".price-card").forEach((card) => {
    card.addEventListener("click", () => {
      const match = [...toggles].find((b) => b.dataset.tipo === card.dataset.tipo);
      if (match) match.click();
      document.getElementById("registro").scrollIntoView({ behavior: "smooth" });
    });
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorMsg.classList.add("hidden");

    const data = Object.fromEntries(new FormData(form).entries());
    data.precio = Number(data.precio);

    submitBtn.disabled = true;
    submitLabel.textContent = "Registrando...";

    try {
      let folio;

      if (client) {
        const { data: inserted, error } = await client
          .from("registros")
          .insert({
            nombre: data.nombre,
            telefono: data.telefono,
            tipo_auto: data.tipo_auto,
            precio: data.precio,
          })
          .select("id")
          .single();

        if (error) throw error;
        folio = inserted.id.slice(0, 8).toUpperCase();
        refreshStats();
      } else {
        console.warn("Supabase no está configurado (config.js). Guardando solo en consola.");
        folio = Math.random().toString(36).slice(2, 10).toUpperCase();
      }

      document.getElementById("success-nombre").textContent = data.nombre;
      document.getElementById("success-folio").textContent = folio;

      form.classList.add("hidden");
      success.classList.remove("hidden");
      success.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
      console.error(err);
      errorMsg.classList.remove("hidden");
    } finally {
      submitBtn.disabled = false;
      submitLabel.textContent = `Confirmar registro · $${data.precio}`;
    }
  });

  document.getElementById("reset-btn").addEventListener("click", () => {
    form.reset();
    toggles[0].click();
    success.classList.add("hidden");
    form.classList.remove("hidden");
    document.getElementById("registro").scrollIntoView({ behavior: "smooth" });
  });

  // ---------- Live stats ----------

  const statEspera = document.getElementById("stat-espera");
  const statHoy = document.getElementById("stat-hoy");
  const statTiempo = document.getElementById("stat-tiempo");

  function animateValue(el, to) {
    const from = Number(el.dataset.value || 0);
    if (from === to) return;
    el.dataset.value = to;
    const duration = 500;
    const start = performance.now();
    function step(now) {
      const progress = Math.min(1, (now - start) / duration);
      const value = Math.round(from + (to - from) * progress);
      el.textContent = value;
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  async function refreshStats() {
    if (!client) {
      statEspera.textContent = "—";
      statHoy.textContent = "—";
      statTiempo.textContent = "—";
      return;
    }

    try {
      // Lee un view agregado (registros_stats) en vez de la tabla registros
      // directo: así la página pública nunca puede pedir nombres/teléfonos,
      // solo los conteos. Ver supabase/schema.sql.
      const { data, error } = await client.from("registros_stats").select("en_espera, atendidos_hoy").single();
      if (error) throw error;

      const espera = data.en_espera || 0;
      animateValue(statEspera, espera);
      animateValue(statHoy, data.atendidos_hoy || 0);

      const minutos = espera * MINUTES_PER_VEHICLE;
      statTiempo.textContent = espera === 0 ? "0 min" : minutos < 60 ? `~${minutos} min` : `~${(minutos / 60).toFixed(1)} h`;
    } catch (err) {
      console.error("No se pudieron cargar las estadísticas", err);
    }
  }

  refreshStats();
  setInterval(refreshStats, 20000);

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
