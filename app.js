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

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorMsg.classList.add("hidden");

    const data = Object.fromEntries(new FormData(form).entries());
    data.precio = Number(data.precio);

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
