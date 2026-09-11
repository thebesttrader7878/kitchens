const KEY = "kitchens.admin";

const $ = (s) => document.querySelector(s);
const loginEl = $("#login");
const appEl = $("#app");
const loginErr = $("#loginErr");

function headers() {
  return {
    "Content-Type": "application/json",
    "X-Admin-Key": sessionStorage.getItem(KEY) || "",
  };
}

async function api(path, opts = {}) {
  const r = await fetch(path, { ...opts, headers: { ...headers(), ...(opts.headers || {}) } });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401) {
    sessionStorage.removeItem(KEY);
    showLogin("Sign in again.");
    throw new Error("Sign in.");
  }
  if (!r.ok) throw new Error(data.error || "Request failed.");
  return data;
}

function showLogin(msg) {
  appEl.hidden = true;
  loginEl.hidden = false;
  if (msg) {
    loginErr.hidden = false;
    loginErr.textContent = msg;
  }
}

function showApp() {
  loginEl.hidden = true;
  appEl.hidden = false;
  loadKitchens();
  loadEmails();
}

$("#loginForm").onsubmit = async (e) => {
  e.preventDefault();
  const password = $("#password").value;
  loginErr.hidden = true;
  try {
    const data = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    }).then((r) => r.json());
    if (!data.ok) throw new Error("Wrong password.");
    sessionStorage.setItem(KEY, password);
    showApp();
  } catch (err) {
    loginErr.hidden = false;
    loginErr.textContent = err.message;
  }
};

for (const btn of document.querySelectorAll(".dash-top [data-tab]")) {
  btn.onclick = () => {
    for (const b of document.querySelectorAll(".dash-top [data-tab]")) b.classList.remove("is-on");
    btn.classList.add("is-on");
    for (const p of document.querySelectorAll(".dash-panel")) {
      p.classList.toggle("is-on", p.dataset.panel === btn.dataset.tab);
    }
  };
}

async function loadKitchens() {
  const claims = await api("/api/claims");
  const rows = $("#kitchenRows");
  const byId = Object.fromEntries(claims.map((c) => [c.id, c]));
  const live = claims.filter((c) => c.status === "active" || c.status === "past_due");
  const mrr = live.reduce((s, c) => s + Number(c.price || 0), 0);
  $("#mrr").textContent = `${live.length} live · $${mrr}/mo`;
  const slots = Array.from({ length: 11 }, (_, i) => `k${i + 1}`);
  rows.innerHTML = slots
    .map((id, i) => {
      const n = String(i + 1).padStart(2, "0");
      if (id === "k1") {
        return `<tr><td data-label="#">${n}</td><td data-label="Shop">Wilsons</td><td data-label="Owner">Wilson family</td><td data-label="Plan">Flagship</td><td data-label="Status"><span class="badge badge-active">Owned</span></td><td data-label="Renews">—</td><td></td></tr>`;
      }
      const c = byId[id];
      if (!c) {
        return `<tr><td data-label="#">${n}</td><td data-label="Shop">Available</td><td data-label="Owner">—</td><td data-label="Plan">—</td><td data-label="Status"><span class="badge">Open</span></td><td data-label="Renews">—</td><td></td></tr>`;
      }
      const renews = c.renewsAt ? new Date(c.renewsAt).toLocaleDateString() : "—";
      return `<tr>
        <td data-label="#">${n}</td>
        <td data-label="Shop">${esc(c.name)}<br><small>${esc(c.email || "")}${c.pin ? ` · PIN ${esc(c.pin)}` : ""}</small></td>
        <td data-label="Owner">${esc(c.owner || "")}</td>
        <td data-label="Plan">
          <select data-plan="${id}">
            <option value="stall" ${c.plan === "stall" ? "selected" : ""}>Stall $149</option>
            <option value="kitchen" ${c.plan === "kitchen" ? "selected" : ""}>Kitchen $249</option>
            <option value="corner" ${c.plan === "corner" ? "selected" : ""}>Corner $399</option>
          </select>
        </td>
        <td data-label="Status"><span class="badge badge-${esc(c.status || "active")}">${label(c.status)}</span></td>
        <td data-label="Renews">${renews}<br><small>$${c.price || 0}/mo</small></td>
        <td class="row-actions" data-label="Actions">
          <button class="ghost" data-act="renew" data-id="${id}">Mark paid</button>
          ${c.status === "paused"
            ? `<button class="ghost" data-act="resume" data-id="${id}">Resume</button>`
            : `<button class="ghost" data-act="pause" data-id="${id}">Pause</button>`}
          <button class="ghost" data-act="cancel" data-id="${id}">Cancel</button>
        </td>
      </tr>`;
    })
    .join("");
  for (const btn of rows.querySelectorAll("[data-act]")) {
    btn.onclick = async () => {
      const action = btn.dataset.act;
      if (action === "cancel" && !confirm("Cancel this lease? The shop comes off the street.")) return;
      await api("/api/admin/lease", {
        method: "POST",
        body: JSON.stringify({ id: btn.dataset.id, action }),
      });
      loadKitchens();
    };
  }
  for (const sel of rows.querySelectorAll("[data-plan]")) {
    sel.onchange = async () => {
      await api("/api/admin/lease", {
        method: "POST",
        body: JSON.stringify({ id: sel.dataset.plan, action: "plan", plan: sel.value }),
      });
      loadKitchens();
    };
  }
}

function label(s) {
  return ({ active: "Active", past_due: "Past due", paused: "Paused", cancelled: "Cancelled" }[s] || s || "Active");
}

async function loadEmails() {
  const emails = await api("/api/emails");
  const list = $("#emailList");
  if (!emails.length) {
    list.innerHTML = "<li>No emails yet.</li>";
    return;
  }
  list.innerHTML = emails
    .slice()
    .reverse()
    .map((e) => {
      const when = e.at ? new Date(e.at).toLocaleString() : "";
      return `<li><span>${esc(e.email)}<br><small>${esc(when)}</small></span>
        <button class="ghost" data-email="${esc(e.email)}">Remove</button></li>`;
    })
    .join("");
  for (const btn of list.querySelectorAll("[data-email]")) {
    btn.onclick = async () => {
      await api(`/api/emails?email=${encodeURIComponent(btn.dataset.email)}`, { method: "DELETE" });
      loadEmails();
    };
  }
  list.dataset.csv = emails.map((e) => e.email).join("\n");
}

$("#btnExport").onclick = async () => {
  const emails = await api("/api/emails");
  const lines = ["email,joined", ...emails.map((e) => `${e.email},${e.at ? new Date(e.at).toISOString() : ""}`)];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "kitchens-emails.csv";
  a.click();
};

$("#pwForm").onsubmit = async (e) => {
  e.preventDefault();
  const status = $("#pwStatus");
  status.hidden = false;
  try {
    const password = $("#newPassword").value;
    await api("/api/password", { method: "POST", body: JSON.stringify({ password }) });
    sessionStorage.setItem(KEY, password);
    status.textContent = "Password saved.";
    $("#newPassword").value = "";
  } catch (err) {
    status.textContent = err.message;
  }
};

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

if (sessionStorage.getItem(KEY)) {
  api("/api/emails").then(showApp).catch(() => showLogin());
}
