const PLAN_PRICE = { stall: 149, kitchen: 249, corner: 399 };
const AUTH_KEY = "kitchens.leaseAuth";
const $ = (s, root = document) => root.querySelector(s);

const emailInput = $("#lookupEmail");
const pinInput = $("#lookupPin");
const err = $("#lookupErr");
const list = $("#leases");
let auth = { email: "", pin: "", token: "" };

$("#lookupForm").onsubmit = async (e) => {
  e.preventDefault();
  await lookup({
    email: emailInput.value.trim(),
    pin: pinInput.value.trim(),
  });
};

async function lookup(proof) {
  err.hidden = true;
  try {
    const r = await fetch("/api/lease/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(proof),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Couldn’t unlock that lease.");
    auth = {
      email: proof.email || auth.email,
      pin: proof.pin || auth.pin,
      token: data.token || proof.token || "",
    };
    if (auth.token) {
      const rows = readAuth().filter((r) => !data.leases.some((l) => l.id === r.id));
      for (const l of data.leases) {
        rows.push({ id: l.id, email: auth.email, pin: auth.pin, token: auth.token });
      }
      localStorage.setItem(AUTH_KEY, JSON.stringify(rows));
    }
    render(data.leases || []);
  } catch (ex) {
    err.hidden = false;
    err.textContent = ex.message;
    list.innerHTML = "";
  }
}

function render(leases) {
  if (!leases.length) {
    list.innerHTML = `<p class="lede">No kitchens on that email and PIN. <a href="/">Claim a spot on the street.</a></p>`;
    return;
  }
  list.innerHTML = leases.map((l) => card(l)).join("");
  for (const form of list.querySelectorAll("form[data-id]")) {
    form.onsubmit = (e) => save(e, form.dataset.id);
  }
  for (const btn of list.querySelectorAll("[data-cancel]")) {
    btn.onclick = () => cancel(btn.dataset.cancel);
  }
}

function card(l) {
  const cancelled = l.status === "cancelled";
  const renews = l.renewsAt ? new Date(l.renewsAt).toLocaleDateString() : "—";
  const price = l.price || PLAN_PRICE[l.plan] || 249;
  return `<article class="lease-card">
    <header>
      <p class="hud-kicker">Kitchen ${esc(String(l.id || "").replace("k", "").padStart(2, "0"))}</p>
      <h2>${esc(l.name || "Your kitchen")}</h2>
      <span class="badge badge-${esc(l.status || "active")}">${label(l.status)}</span>
    </header>
    <p class="lede">${esc(l.plan || "kitchen")} · $${price}/mo · ${cancelled ? "Cancelled" : `Renews ${renews}`}</p>
    ${cancelled ? "<p class='lede'>This shop is off the street. Claim a new spot anytime.</p>" : `
    <form data-id="${esc(l.id)}">
      <div class="field-row">
        <label>Restaurant name <input name="name" value="${esc(l.name || "")}" required /></label>
        <label>Your name <input name="owner" value="${esc(l.owner || "")}" required /></label>
      </div>
      <div class="field-row">
        <label>Cuisine <input name="cuisine" value="${esc(l.cuisine || "")}" /></label>
        <label>Order URL <input name="url" value="${esc(l.url || "")}" /></label>
      </div>
      <label>Pitch <input name="tagline" value="${esc(l.tagline || "")}" /></label>
      <div class="field-row">
        <label>Storefront <input type="color" name="color" value="${toHex(l.color, "#c41e3a")}" /></label>
        <label>Accent <input type="color" name="accent" value="${toHex(l.accent, "#e2b657")}" /></label>
      </div>
      <label>Plan
        <select name="plan">
          <option value="stall" ${l.plan === "stall" ? "selected" : ""}>Stall · $149/mo</option>
          <option value="kitchen" ${l.plan === "kitchen" ? "selected" : ""}>Kitchen · $249/mo</option>
          <option value="corner" ${l.plan === "corner" ? "selected" : ""}>Corner · $399/mo</option>
        </select>
      </label>
      <label>Replace logo
        <input type="file" name="logoFile" accept="image/*" />
      </label>
      <button class="btn btn-gold" type="submit">Save changes</button>
      <p class="email-status" data-status hidden></p>
    </form>
    <button type="button" class="ghost" data-cancel="${esc(l.id)}">Cancel subscription</button>`}
  </article>`;
}

function proof(id) {
  return { id, email: auth.email, pin: auth.pin, token: auth.token };
}

async function save(e, id) {
  e.preventDefault();
  const form = e.target;
  const status = form.querySelector("[data-status]");
  status.hidden = false;
  const fd = new FormData(form);
  const payload = {
    ...proof(id),
    name: fd.get("name"),
    owner: fd.get("owner"),
    cuisine: fd.get("cuisine"),
    url: fd.get("url"),
    tagline: fd.get("tagline"),
    plan: fd.get("plan"),
    color: parseInt(String(fd.get("color")).replace("#", ""), 16),
    accent: parseInt(String(fd.get("accent")).replace("#", ""), 16),
  };
  const file = form.querySelector('input[name="logoFile"]')?.files?.[0];
  if (file) payload.logo = await readLogo(file);
  try {
    const r = await fetch("/api/lease/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Couldn’t save.");
    status.textContent = "Saved. Refresh the street to see it.";
  } catch (ex) {
    status.textContent = ex.message;
  }
}

async function cancel(id) {
  if (!confirm("Cancel this lease? The shop comes off the street.")) return;
  const r = await fetch("/api/lease/cancel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(proof(id)),
  });
  const data = await r.json();
  if (!r.ok) {
    alert(data.error || "Couldn’t cancel.");
    return;
  }
  lookup(proof(id));
}

function label(s) {
  return ({ active: "Active", past_due: "Past due", paused: "Paused", cancelled: "Cancelled" }[s] || s || "Active");
}

function toHex(n, fallback) {
  if (n == null || n === "") return fallback;
  return `#${Number(n).toString(16).padStart(6, "0")}`;
}

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function readAuth() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_KEY) || "[]");
  } catch {
    return [];
  }
}

function readLogo(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = 256;
      c.height = 256;
      const ctx = c.getContext("2d");
      const side = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 256, 256);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/png"));
    };
    img.onerror = reject;
    img.src = url;
  });
}

const params = new URLSearchParams(location.search);
const saved = readAuth()[0];
if (params.get("token")) {
  lookup({ token: params.get("token") });
} else if (saved?.email && saved?.pin) {
  emailInput.value = saved.email;
  pinInput.value = saved.pin;
  lookup({ email: saved.email, pin: saved.pin, token: saved.token });
}
