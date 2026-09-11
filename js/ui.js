import { WILSONS_MENU, PLAN_PRICE, MONTH_MS, loadClaims, saveClaims } from "./data.js";

export class UI {
  constructor({ kitchens, onClaim, onNeedPointer }) {
    this.kitchens = kitchens;
    this.onClaim = onClaim;
    this.onNeedPointer = onNeedPointer;
    this.active = null;

    this.els = {
      boot: $("#boot"),
      bootBar: $("#bootBar"),
      cinema: $("#cinema"),
      enter: $("#enter"),
      inspect: $("#inspect"),
      prompt: $("#prompt"),
      promptText: $("#promptText"),
      crosshair: $("#crosshair"),
      online: $("#online"),
      radio: $("#radio"),
      sheetAbout: $("#sheetAbout"),
      sheetBoard: $("#sheetBoard"),
      sheetKitchen: $("#sheetKitchen"),
      sheetClaim: $("#sheetClaim"),
      sheetMenu: $("#sheetMenu"),
      chatDock: $("#chatDock"),
      boardList: $("#boardList"),
      plotGrid: $("#plotGrid"),
      kitchenHero: $("#kitchenHero"),
      kitchenAddr: $("#kitchenAddr"),
      kitchenName: $("#kitchenName"),
      kitchenMeta: $("#kitchenMeta"),
      kitchenBody: $("#kitchenBody"),
      chatLog: $("#chatLog"),
    };

    this.touch = document.documentElement.classList.contains("is-touch");
    bindTap($("#btnAbout"), () => this.open("sheetAbout"));
    bindTap($("#btnBoard"), () => this.openBoard());
    bindTap($("#btnClaimCta"), () => this.openClaim());
    bindTap($("#btnAboutClaim"), () => this.openClaim());
    bindTap($("#btnChat"), () => this.toggleChat());
    bindTap($("#btnMenu"), () => this.open("sheetMenu"));
    bindTap($("#menuOrder"), () => this.openKitchen(this.flagship()));
    bindTap($("#menuClaim"), () => this.openClaim());
    bindTap($("#menuBoard"), () => this.openBoard());
    bindTap($("#menuAbout"), () => this.open("sheetAbout"));
    bindTap($("#menuChat"), () => { this.closeAll(); this.toggleChat(); });
    bindTap($("#btnMusic"), () => {
      const r = this.els.radio;
      const on = r.dataset.collapsed === "true";
      r.dataset.collapsed = on ? "false" : "true";
      $("#btnMusic").setAttribute("aria-expanded", String(on));
    });
    for (const btn of document.querySelectorAll("[data-close]")) {
      bindTap(btn, () => this.closeAll());
    }
    for (const sheet of document.querySelectorAll(".sheet")) {
      sheet.addEventListener("click", (e) => {
        if (e.target === sheet) this.closeAll();
      });
    }
    bindTap(this.els.inspect, () => this.useNearby());
    bindTap($("#prompt"), () => this.useNearby());
    $("#claimForm").onsubmit = (e) => this.submitClaim(e);
    $("#chatForm").onsubmit = (e) => {
      e.preventDefault();
      const input = $("#chatInput");
      const text = input.value.trim();
      if (!text) return;
      this.pushChat("You", text);
      input.value = "";
    };

    this.pendingLogo = "";
    this.bindLookFields();
    this.seedChat();
    this.renderBoard();
    this.renderPlots();
  }

  bindLookFields() {
    for (const btn of document.querySelectorAll(".swatch")) {
      btn.onclick = () => {
        $("#claimColor").value = btn.dataset.color;
        $("#claimAccent").value = btn.dataset.accent;
      };
    }
    $("#claimLogo")?.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        this.pendingLogo = await readLogoFile(file);
        const preview = $("#logoPreview");
        preview.innerHTML = "";
        const img = document.createElement("img");
        img.src = this.pendingLogo;
        img.alt = "Logo preview";
        preview.appendChild(img);
      } catch {
        this.pendingLogo = "";
      }
    });
  }

  setProgress(p) {
    this.els.bootBar.style.width = `${Math.round(p * 100)}%`;
  }

  hideBoot() {
    this.els.boot.hidden = true;
  }

  showEnter() {
    this.els.enter.hidden = false;
    this.els.cinema.classList.add("is-out");
    setTimeout(() => { this.els.cinema.hidden = true; }, 800);
  }

  goLive(count) {
    this.els.online.dataset.state = "live";
    this.els.online.querySelector("span").textContent = `${count} on the street`;
  }

  flagship() {
    return this.kitchens.find((k) => k.id === "k1") || this.kitchens[0];
  }

  useNearby() {
    this.openKitchen(this.active || this.flagship());
  }

  syncUseBtn(k) {
    const use = document.getElementById("touchUse");
    if (!use) return;
    if (!k) {
      use.textContent = "Order Wilsons";
      return;
    }
    use.textContent = k.status === "open" ? "Lease this" : `Order ${k.name}`;
  }

  inspect(k) {
    if (!k) {
      this.els.inspect.hidden = true;
      this.els.prompt.hidden = true;
      this.active = null;
      this.syncUseBtn(null);
      return;
    }
    this.active = k;
    const addr = `Kitchen ${String(k.number).padStart(2, "0")}`;
    this.els.inspect.hidden = false;
    this.els.inspect.querySelector("[data-address]").textContent = addr;
    this.els.inspect.querySelector("[data-title]").textContent = k.name;
    this.els.inspect.querySelector("[data-owner]").textContent =
      k.status === "open" ? `$${PLAN_PRICE[k.plan]}/mo · available` : `${k.owner} · ${k.cuisine || "Food"}`;
    const tap = this.touch ? "Tap" : "Click";
    this.els.inspect.querySelector("[data-hint]").textContent =
      k.status === "open" ? `${tap} to lease` : `${tap} to order · ships to your door`;
    this.els.prompt.hidden = false;
    this.els.promptText.textContent =
      k.status === "open" ? `Claim kitchen ${k.number}` : `Order from ${k.name}`;
    this.syncUseBtn(k);
  }

  openKitchen(k) {
    this.onNeedPointer?.(false);
    if (k.status === "open") return this.openClaim(k.id);
    this.els.kitchenAddr.textContent = `Kitchen ${String(k.number).padStart(2, "0")}`;
    this.els.kitchenName.textContent = k.name;
    this.els.kitchenMeta.textContent = k.tagline;
    this.els.kitchenHero.classList.toggle("vacant", k.status !== "flagship");
    if (k.color) {
      const hex = `#${(k.color >>> 0).toString(16).padStart(6, "0")}`;
      this.els.kitchenHero.style.background = `linear-gradient(180deg, ${hex}, #141210 85%)`;
    } else {
      this.els.kitchenHero.style.background = "";
    }
    if (k.status === "flagship") {
      this.els.kitchenBody.innerHTML = `
        <p class="lede">Walked in from the hall. This is the first kitchen on the block — Wilsons ships take-and-bake pizza from Kansas City to your oven.</p>
        <div class="menu-grid">
          ${WILSONS_MENU.map((m) => `
            <article class="menu-item">
              <img src="${m.image}" alt="${m.name}" />
              <div>
                <h3>${m.name}</h3>
                <p>${m.desc}</p>
              </div>
              <div>
                <div class="price">${m.price}</div>
                <a class="btn btn-red" style="margin-top:8px;padding:8px 10px;font-size:12px" href="${m.url}" target="_blank" rel="noopener">Ship this</a>
              </div>
            </article>`).join("")}
        </div>
        <p class="ship-note">Orders ship Mon &amp; Tue from 1801 Quindaro Blvd, Kansas City. Free shipping on bundles. Arrives cold, fresh, ready to bake.</p>
        <a class="btn btn-gold" href="https://wilsonspizzaandgrill.net/collections/all" target="_blank" rel="noopener">Open the full Wilsons menu</a>
      `;
    } else {
      const href = k.url || "#";
      this.els.kitchenBody.innerHTML = `
        ${k.logo ? `<img class="shop-logo" src="${k.logo}" alt="${escapeHtml(k.name)} logo" />` : ""}
        <p class="lede">${escapeHtml(k.tagline)}</p>
        <p class="ship-note">${escapeHtml(k.owner)} claimed this storefront. When their kitchen is live, walking up here ships food to your door — same loop as Wilsons.</p>
        ${k.url ? `<a class="btn btn-gold" href="${href}" target="_blank" rel="noopener">Order from ${escapeHtml(k.name)}</a>` : `<p class="lede">Menu URL coming soon.</p>`}
        ${k.pin ? `<div class="pin-box"><p class="hud-kicker">Your lease PIN</p><strong>${escapeHtml(k.pin)}</strong><p>Only you can manage this shop. Save the PIN — you’ll need it with your email.</p><a class="btn btn-gold" href="/my.html?token=${encodeURIComponent(k.manageToken || "")}">Manage my kitchen</a></div>` : `<a class="btn btn-ghost" style="margin-top:10px" href="/my.html">Manage my kitchen</a>`}
      `;
    }
    this.open("sheetKitchen");
  }

  openBoard() {
    this.renderBoard();
    this.open("sheetBoard");
  }

  openClaim(selectId) {
    this.pendingLogo = "";
    const preview = $("#logoPreview");
    if (preview) preview.innerHTML = "<span>PNG or JPG · square works best</span>";
    const logoInput = $("#claimLogo");
    if (logoInput) logoInput.value = "";
    this.renderPlots(selectId);
    this.open("sheetClaim");
  }

  renderBoard() {
    const ranked = [...this.kitchens].sort((a, b) => b.orders - a.orders || a.number - b.number);
    this.els.boardList.innerHTML = ranked
      .map((k, i) => `
        <li>
          <span class="rank">${String(i + 1).padStart(2, "0")}</span>
          <div>
            <strong>${k.name}</strong>
            <em>${k.status === "open" ? "Available storefront" : k.tagline}</em>
          </div>
          <span class="stat">${k.orders.toLocaleString()} shipped</span>
        </li>`)
      .join("");
  }

  renderPlots(selectId) {
    const firstOpen = this.kitchens.find((k) => k.status === "open");
    const chosen = selectId || firstOpen?.id;
    this.els.plotGrid.innerHTML = this.kitchens
      .map((k) => {
        const taken = k.status !== "open";
        return `<button type="button" class="plot ${taken ? "is-taken" : ""} ${k.id === chosen ? "is-on" : ""}" data-id="${k.id}" ${taken ? "disabled" : ""}>
          <strong>Kitchen ${String(k.number).padStart(2, "0")}</strong>
          <small>${taken ? k.name : `$${PLAN_PRICE[k.plan]}/mo`}</small>
        </button>`;
      })
      .join("");
    this.selectedPlot = chosen;
    for (const btn of this.els.plotGrid.querySelectorAll(".plot:not(.is-taken)")) {
      btn.onclick = () => {
        this.selectedPlot = btn.dataset.id;
        for (const b of this.els.plotGrid.querySelectorAll(".plot")) b.classList.remove("is-on");
        btn.classList.add("is-on");
        const k = this.kitchens.find((x) => x.id === this.selectedPlot);
        if (k?.corner) document.querySelector('input[name="plan"][value="corner"]').checked = true;
      };
    }
  }

  async submitClaim(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const id = this.selectedPlot;
    const k = this.kitchens.find((x) => x.id === id);
    if (!k || k.status !== "open") {
      alert("Pick an open kitchen.");
      return;
    }
    const claim = {
      id,
      name: String(fd.get("name")).trim(),
      owner: String(fd.get("owner")).trim(),
      email: String(fd.get("email")).trim().toLowerCase(),
      cuisine: String(fd.get("cuisine")).trim(),
      url: String(fd.get("url") || "").trim(),
      tagline: String(fd.get("tagline") || "").trim() || `${fd.get("cuisine")} · ships to your door`,
      plan: String(fd.get("plan") || k.plan),
      color: parseHex(fd.get("color") || "#c41e3a"),
      accent: parseHex(fd.get("accent") || "#e2b657"),
      logo: this.pendingLogo || "",
      orders: 0,
      claimedAt: Date.now(),
      status: "active",
      startedAt: Date.now(),
      renewsAt: Date.now() + MONTH_MS,
      price: PLAN_PRICE[String(fd.get("plan") || k.plan)] || 249,
    };
    const btn = $("#btnPay");
    if (btn) { btn.disabled = true; btn.textContent = "Sending you to Stripe…"; }
    try {
      const r = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(claim),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Couldn’t start checkout.");
      if (!data.url) throw new Error("Stripe didn’t return a checkout link.");
      window.location.href = data.url;
    } catch (err) {
      alert(err.message || "Couldn’t start checkout.");
      if (btn) { btn.disabled = false; btn.textContent = "Pay for this spot"; }
    }
  }

  toggleChat() {
    this.els.chatDock.hidden = !this.els.chatDock.hidden;
  }

  open(id) {
    this.closeAll();
    this.onNeedPointer?.(false);
    this.els[id].hidden = false;
  }

  closeAll() {
    for (const id of ["sheetAbout", "sheetBoard", "sheetKitchen", "sheetClaim", "sheetMenu"]) {
      if (this.els[id]) this.els[id].hidden = true;
    }
    this.els.chatDock.hidden = true;
  }

  get sheetOpen() {
    return ["sheetAbout", "sheetBoard", "sheetKitchen", "sheetClaim", "sheetMenu"].some(
      (id) => this.els[id] && !this.els[id].hidden
    );
  }

  seedChat() {
    this.pushChat("Hall", "Wilsons is kitchen #1. Everything else is for lease.");
    this.pushChat("Visitor", "Does it actually ship?");
    this.pushChat("Wilsons", "Yes — walk up, order, we pack it in KC and send it to your door.");
  }

  pushChat(who, text) {
    const p = document.createElement("p");
    p.innerHTML = `<b>${who}</b> ${escapeHtml(text)}`;
    this.els.chatLog.appendChild(p);
    this.els.chatLog.scrollTop = this.els.chatLog.scrollHeight;
  }
}

export function bindTap(el, fn) {
  if (!el || el.dataset.tapBound === "1") return;
  el.dataset.tapBound = "1";
  let last = 0;
  const run = (e) => {
    e.preventDefault();
    e.stopPropagation();
    last = performance.now();
    fn(e);
  };
  el.addEventListener("pointerup", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    run(e);
  });
  el.addEventListener("click", (e) => {
    if (performance.now() - last < 450) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    run(e);
  });
}

function $(sel) {
  return document.querySelector(sel);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function parseHex(s) {
  const h = String(s || "").replace("#", "").trim();
  const n = parseInt(h, 16);
  return Number.isFinite(n) ? n : 0xc41e3a;
}

function rememberLease(claim) {
  try {
    const key = "kitchens.leaseAuth";
    const rows = JSON.parse(localStorage.getItem(key) || "[]");
    const next = rows.filter((r) => r.id !== claim.id);
    next.push({
      id: claim.id,
      email: claim.email,
      pin: claim.pin,
      token: claim.manageToken,
    });
    localStorage.setItem(key, JSON.stringify(next));
  } catch {}
}

function readLogoFile(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const size = 256;
      const c = document.createElement("canvas");
      c.width = size;
      c.height = size;
      const ctx = c.getContext("2d");
      const side = Math.min(img.width, img.height);
      const sx = (img.width - side) / 2;
      const sy = (img.height - side) / 2;
      ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/png"));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn’t read that image"));
    };
    img.src = url;
  });
}
