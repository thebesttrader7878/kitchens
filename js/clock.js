const TZ = "America/Chicago";

export function missouriNow() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TZ,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      month: "numeric",
      day: "numeric",
      year: "numeric",
      hourCycle: "h23",
    })
      .formatToParts(new Date())
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value])
  );
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  const second = Number(parts.second);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const year = Number(parts.year);
  const frac = hour + minute / 60 + second / 3600;
  const start = Date.UTC(year, 0, 0);
  const today = Date.UTC(year, month - 1, day);
  const dayOfYear = Math.round((today - start) / 86400000);
  const season = Math.cos(((dayOfYear - 172) / 365) * Math.PI * 2);
  const sunrise = 6.7 - 0.85 * season;
  const sunset = 18.9 + 1.95 * season;
  return { hour, minute, second, frac, sunrise, sunset, year, month, day };
}

export function missouriLabel() {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date());
}

function smooth(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a || 1)));
  return t * t * (3 - 2 * t);
}

export function missouriSky() {
  const { frac, sunrise, sunset } = missouriNow();
  let day = 0;
  if (frac >= sunrise + 1 && frac <= sunset - 1) day = 1;
  else if (frac > sunrise - 0.6 && frac < sunrise + 1) day = smooth(sunrise - 0.6, sunrise + 1, frac);
  else if (frac > sunset - 1 && frac < sunset + 0.7) day = 1 - smooth(sunset - 1, sunset + 0.7, frac);
  const span = Math.max(0.2, sunset - sunrise);
  const u = Math.max(0, Math.min(1, (frac - sunrise) / span));
  const elev = day > 0 ? Math.sin(u * Math.PI) : 0;
  return { day, elev, u, frac, sunrise, sunset };
}
