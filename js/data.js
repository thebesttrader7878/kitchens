export const STORAGE_KEY = "kitchens.claims.v3";

export const WILSONS_MENU = [
  {
    name: "3-Pack 18th Street Special",
    desc: "Pepperoni, sausage, beef, ham, mushrooms, onions, olives & peppers.",
    price: "$89.99",
    url: "https://wilsonspizzaandgrill.net/products/3-pack-18th-street-special-pizzas-triple-loaded-legend",
    image: "https://wilsonspizzaandgrill.net/cdn/shop/files/Screenshot2026-03-27at10.56.29AM.png?v=1774627004&width=400",
  },
  {
    name: "3-Pack Just Meat",
    desc: "Triple meat overload — pure protein for the table.",
    price: "$89.99",
    url: "https://wilsonspizzaandgrill.net/products/3-pack-just-meat-pizzas-triple-meat-overload",
    image: "https://wilsonspizzaandgrill.net/cdn/shop/files/Screenshot2026-03-27at11.44.37AM.png?v=1774629895&width=400",
  },
  {
    name: "3-Pack Pepperoni",
    desc: "Classic piles of pepperoni on never-frozen dough.",
    price: "$89.99",
    url: "https://wilsonspizzaandgrill.net/products/3-pack-pepperoni-pizzas-triple-pepperoni-pack",
    image: "https://wilsonspizzaandgrill.net/cdn/shop/files/Screenshot2026-03-27at11.46.55AM.png?v=1774630030&width=400",
  },
  {
    name: "Triple Delight Variety",
    desc: "Three flavors in one box. Something for everyone.",
    price: "$89.99",
    url: "https://wilsonspizzaandgrill.net/products/wilson-s-triple-delight-take-bake-variety-pack",
    image: "https://wilsonspizzaandgrill.net/cdn/shop/files/IMG_1869.jpg?v=1762392855&width=400",
  },
  {
    name: "Kansas City Special — 4 Pack",
    desc: "Four gourmet pies for game day.",
    price: "$129.99",
    url: "https://wilsonspizzaandgrill.net/products/kansas-city-special-4-pack-pizza-deal",
    image: "https://wilsonspizzaandgrill.net/cdn/shop/files/Screenshot2026-03-27at10.56.29AM.png?v=1774627004&width=400",
  },
  {
    name: "Chiefs Special — 5 Pack",
    desc: "Five loaded pies. Best value on the street.",
    price: "$149.99",
    url: "https://wilsonspizzaandgrill.net/products/chiefs-special-5-pack-pizza-deal",
    image: "https://wilsonspizzaandgrill.net/cdn/shop/files/Screenshot2026-03-27at10.56.29AM.png?v=1774627004&width=400",
  },
];

// Local kitchen front is -Z. South row faces the plaza (world -Z). North row faces +Z.
const SOUTH = 0;
const NORTH = Math.PI;

/** Front of each kitchen faces the plaza (z = 0). */
export function baseKitchens() {
  return [
    {
      id: "k1",
      number: 1,
      name: "Wilsons",
      owner: "Wilson family",
      cuisine: "Pizza",
      tagline: "Kansas City take-and-bake. Shipped to your door.",
      status: "flagship",
      plan: "corner",
      color: 0xc41e3a,
      accent: 0xe2b657,
      orders: 1127,
      url: "https://wilsonspizzaandgrill.net/collections/all",
      x: -10,
      z: 16.5,
      w: 14,
      d: 10,
      facing: SOUTH,
      corner: true,
    },
    stall(2, 2, 16.5, SOUTH, false),
    stall(3, 10, 16.5, SOUTH, false),
    stall(4, 18, 16.5, SOUTH, false),
    stall(5, 26, 16.5, SOUTH, true),
    stall(6, -10, -16.5, NORTH, true),
    stall(7, -2, -16.5, NORTH, false),
    stall(8, 6, -16.5, NORTH, false),
    stall(9, 14, -16.5, NORTH, false),
    stall(10, 22, -16.5, NORTH, false),
    stall(11, 30, -16.5, NORTH, true),
  ];
}

function stall(number, x, z, facing, corner) {
  return {
    id: `k${number}`,
    number,
    name: "Available",
    owner: "",
    cuisine: "",
    tagline: "Pay for this storefront. Ship real food.",
    status: "open",
    plan: corner ? "corner" : "kitchen",
    color: 0x3a342c,
    accent: 0xe2b657,
    orders: 0,
    url: "",
    x,
    z,
    w: corner ? 8 : 6.5,
    d: 9,
    facing,
    corner,
  };
}

export const PLAN_PRICE = { stall: 149, kitchen: 249, corner: 399 };
export const MONTH_MS = 30 * 24 * 60 * 60 * 1000;
export const LIVE_STATUSES = new Set(["active", "past_due"]);

export function loadClaims() {
  try {
    localStorage.removeItem("kitchens.claims.v1");
    localStorage.removeItem("kitchens.claims.v2");
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveClaims(claims) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(claims));
}

export async function fetchRemoteClaims() {
  try {
    const r = await fetch("/api/claims");
    if (!r.ok) return loadClaims();
    const claims = await r.json();
    if (Array.isArray(claims)) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(claims));
      return claims;
    }
  } catch {}
  return loadClaims();
}

export function applyClaims(kitchens, claims) {
  for (const k of kitchens) {
    if (k.status === "flagship") continue;
    const claim = claims.find((c) => c.id === k.id && LIVE_STATUSES.has(c.status || "active"));
    if (!claim) {
      k.status = "open";
      k.name = "Available";
      k.owner = "";
      k.logo = "";
      continue;
    }
    Object.assign(k, {
      status: "claimed",
      name: claim.name,
      owner: claim.owner,
      cuisine: claim.cuisine,
      tagline: claim.tagline || `${claim.cuisine} · ships to your door`,
      url: claim.url || "",
      plan: claim.plan || k.plan,
      color: claim.color || hashColor(claim.name),
      accent: claim.accent || 0xe2b657,
      logo: claim.logo || "",
      orders: claim.orders || 0,
      email: claim.email || "",
    });
  }
  return kitchens;
}

export function mergeKitchens() {
  return applyClaims(baseKitchens(), loadClaims());
}

export function hashColor(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  const r = 80 + (h & 0x7f);
  const g = 50 + ((h >> 8) & 0x6f);
  const b = 40 + ((h >> 16) & 0x5f);
  return (r << 16) | (g << 8) | b;
}
