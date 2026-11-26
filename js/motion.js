// ============================================================
// MOTION.JS — gerak halus & interaksi UI (tidak menyentuh data/API)
// Dimuat SETELAH app.js. Murni tampilan: aman dihapus tanpa merusak fungsi.
// ============================================================
(function () {
  "use strict";
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (s, r = document) => r.querySelector(s);
  const header = $(".site-header");
  const links = $(".nav-links");
  if (!header || !links) return;

  // 1) Header: transparan di atas banner, solid saat halaman digulir
  const onScroll = () => header.classList.toggle("scrolled", window.scrollY > 24);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // 2) Garis emas penanda menu aktif yang meluncur antar menu
  const ink = document.createElement("span");
  ink.className = "nav-ink";
  links.appendChild(ink);
  function moveInk() {
    const a = links.querySelector("a.active");
    if (!a || !a.offsetWidth) { ink.style.width = "0px"; return; }
    ink.style.width = a.offsetWidth - 22 + "px";
    ink.style.transform = "translateX(" + (a.offsetLeft + 11) + "px)";
  }

  // 3) Bilah emas di puncak layar setiap kali berpindah halaman
  const bar = document.createElement("div");
  bar.className = "route-bar";
  document.body.appendChild(bar);
  function onRoute() {
    requestAnimationFrame(moveInk);
    if (reduce) return;
    bar.classList.remove("go");
    void bar.offsetWidth;
    bar.classList.add("go");
  }
  window.addEventListener("hashchange", onRoute);
  window.addEventListener("resize", moveInk);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(moveInk);

  // 4) Judul hero muncul kata demi kata
  function splitHero() {
    const h = $("#hero-title");
    if (!h || h.dataset.split) return;
    const text = h.textContent.trim();
    h.dataset.split = "1";
    h.setAttribute("aria-label", text);
    h.innerHTML = text.split(/\s+/).map((w, i) =>
      '<span class="w" aria-hidden="true"><span style="--i:' + i + '">' + w + "</span></span>").join(" ");
  }
  splitHero();
  document.addEventListener("DOMContentLoaded", () => { splitHero(); moveInk(); });
  window.addEventListener("load", moveInk);

  // 5) Kartu & blok muncul bertahap saat masuk layar (termasuk konten yang dimuat belakangan)
  if (!reduce && "IntersectionObserver" in window && $("main")) {
    const SEL = ".news-card, .card, .guru-card, .sec-head, .tab-sidebar, table, .cta-in";
    const io = new IntersectionObserver(entries => {
      let n = 0;
      entries.forEach(en => {
        if (!en.isIntersecting) return;
        const el = en.target;
        io.unobserve(el);
        el.style.setProperty("--d", (n++ % 8) * 70 + "ms");
        el.classList.add("in");
        // Lepas kelas animasi setelah selesai agar efek hover kartu tidak tertahan
        setTimeout(() => { el.classList.remove("rv", "in"); el.style.removeProperty("--d"); }, 1100 + n * 70);
      });
    }, { threshold: 0.08, rootMargin: "0px 0px -4% 0px" });
    const tag = el => { if (el.dataset.rv) return; el.dataset.rv = "1"; el.classList.add("rv"); io.observe(el); };
    const scan = node => {
      if (node.nodeType !== 1) return;
      if (node.matches(SEL)) tag(node);
      node.querySelectorAll(SEL).forEach(tag);
    };
    new MutationObserver(list => list.forEach(r => r.addedNodes.forEach(scan)))
      .observe($("main"), { childList: true, subtree: true });
    scan($("main"));
  }

  // 6) Lightbox untuk foto Galeri
  const lb = document.createElement("div");
  lb.className = "lightbox";
  lb.innerHTML = '<button type="button" aria-label="Tutup">&times;</button><figure><img alt=""><figcaption></figcaption></figure>';
  document.body.appendChild(lb);
  document.addEventListener("click", e => {
    const img = e.target.closest("#galeri-grid img.thumb");
    if (img) {
      const cap = img.parentElement.querySelector("p");
      lb.querySelector("img").src = img.src.replace(/sz=w\d+/, "sz=w2000");
      lb.querySelector("figcaption").textContent = cap ? cap.textContent : "";
      lb.classList.add("open");
    } else if (e.target.closest(".lightbox")) {
      lb.classList.remove("open");
    }
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape") lb.classList.remove("open"); });

  // 7) Tombol WhatsApp melayang (nomor mengikuti Pengaturan Website di portal)
  const fab = document.createElement("button");
  fab.type = "button";
  fab.className = "fab-wa";
  fab.setAttribute("aria-label", "Hubungi admin lewat WhatsApp");
  fab.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a9 9 0 0 0-7.7 13.6L3 21l4.5-1.2A9 9 0 1 0 12 3z"/><path d="M9 8.5c0 3.5 3 6.5 6.5 6.5l1-1.6-2.1-1-1 .8c-.9-.4-1.7-1.2-2.1-2.1l.8-1-1-2.1z"/></svg>';
  fab.addEventListener("click", () => {
    const n = (typeof SCHOOL !== "undefined" && SCHOOL.whatsapp || "").replace(/\D/g, "");
    if (n) window.open("https://wa.me/" + n, "_blank", "noopener");
  });
  document.body.appendChild(fab);
})();
