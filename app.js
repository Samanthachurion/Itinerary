// Italy Itinerary
// You add a place + address. Each stop is located on the map, grouped by city,
// and put in a "nearest next stop" order so the trip flows from place to place.

const STORE = "italy-itinerary-stops";
const KEY_STORE = "italy-itinerary-gmaps-key";
const COLORS = ["#009246", "#ce2b37", "#1f6feb", "#b8860b", "#8a3ffc", "#0f8b8d", "#d9480f", "#c2255c"];

let stops = load();
let map, info, overlays = [], markerById = {};

const $ = (id) => document.getElementById(id);

// ---------- Saving ----------
function load() {
  try { return JSON.parse(localStorage.getItem(STORE)) || []; } catch { return []; }
}
function save() {
  try { localStorage.setItem(STORE, JSON.stringify(stops)); } catch {}
}
function getKey() {
  let saved = "";
  try { saved = localStorage.getItem(KEY_STORE) || ""; } catch {}
  return (window.GOOGLE_MAPS_API_KEY || "").trim() || saved.trim();
}

// ---------- Finding an address ----------
async function geocode(address) {
  if (window.google?.maps?.Geocoder) {
    try { return await geocodeGoogle(address); } catch (e) { /* fall back below */ }
  }
  return geocodeOSM(address);
}

function geocodeGoogle(address) {
  return new Promise((resolve, reject) => {
    new google.maps.Geocoder().geocode(
      { address, componentRestrictions: { country: "IT" }, region: "it" },
      (results, status) => {
        const r = results && results[0];
        if (status !== "OK" || !r || r.types.includes("country")) return reject(new Error(status));
        const part = (t) => r.address_components.find((c) => c.types.includes(t))?.long_name;
        resolve({
          formatted: r.formatted_address,
          city: part("locality") || part("postal_town") || part("administrative_area_level_3") || part("administrative_area_level_2") || "Other",
          lat: r.geometry.location.lat(),
          lng: r.geometry.location.lng(),
        });
      }
    );
  });
}

// Free OpenStreetMap lookup, used when there's no Google key (or Geocoding API is off)
async function geocodeOSM(address) {
  const url = "https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=1&countrycodes=it&q=" + encodeURIComponent(address);
  const res = await fetch(url, { headers: { "Accept-Language": "it,en" } });
  const [r] = await res.json();
  if (!r) throw new Error("not found");
  const a = r.address || {};
  return {
    formatted: r.display_name,
    city: a.city || a.town || a.village || a.municipality || a.county || "Other",
    lat: +r.lat,
    lng: +r.lon,
  };
}

// ---------- Organizing ----------
function km(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Start from the first item, then keep going to the closest one not visited yet
function nearestOrder(items) {
  if (items.length < 3) return items.slice();
  const left = items.slice(1), out = [items[0]];
  while (left.length) {
    const last = out[out.length - 1];
    let best = 0;
    left.forEach((p, i) => { if (km(last, p) < km(last, left[best])) best = i; });
    out.push(left.splice(best, 1)[0]);
  }
  return out;
}

// Group stops by city, order the cities, then order the stops inside each city
function organize() {
  const byCity = {};
  [...stops].sort((a, b) => a.added - b.added).forEach((s) => (byCity[s.city] ||= []).push(s));

  const groups = Object.entries(byCity).map(([city, list]) => ({
    city,
    stops: list,
    lat: list.reduce((t, s) => t + s.lat, 0) / list.length,
    lng: list.reduce((t, s) => t + s.lng, 0) / list.length,
  }));

  return nearestOrder(groups).map((g, i) => ({
    ...g,
    color: COLORS[i % COLORS.length],
    stops: nearestOrder(g.stops),
  }));
}

function directionsLink(list) {
  const ll = (s) => `${s.lat},${s.lng}`;
  if (list.length === 1) return `https://www.google.com/maps/search/?api=1&query=${ll(list[0])}`;
  const mid = list.slice(1, -1).map(ll).join("|");
  return `https://www.google.com/maps/dir/?api=1&travelmode=walking&origin=${ll(list[0])}&destination=${ll(list[list.length - 1])}` +
    (mid ? `&waypoints=${encodeURIComponent(mid)}` : "");
}

// ---------- Drawing the list ----------
const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtKm = (d) => (d < 1 ? `${Math.round(d * 1000)} m` : `${d.toFixed(1)} km`);

function render() {
  const groups = organize();
  const box = $("groups");

  $("summary").textContent = stops.length
    ? `${stops.length} stop${stops.length > 1 ? "s" : ""} in ${groups.length} cit${groups.length > 1 ? "ies" : "y"}`
    : "";

  if (!stops.length) {
    box.innerHTML = `<p class="empty">No stops yet. Add your first place above.</p>`;
  } else {
    let n = 0;
    box.innerHTML = groups.map((g) => `
      <div class="group">
        <div class="groupHead">
          <div class="cityName"><span class="dot" style="background:${g.color}"></span>${esc(g.city)}</div>
          <a class="go" href="${directionsLink(g.stops)}" target="_blank" rel="noopener">Open in Google Maps ↗</a>
        </div>
        <ol class="stops">
          ${g.stops.map((s, i) => {
            n++;
            const hop = i > 0 ? `<li class="hop">↓ ${fmtKm(km(g.stops[i - 1], s))}</li>` : "";
            return `${hop}
            <li class="stop" data-id="${s.id}">
              <span class="num" style="background:${g.color}">${n}</span>
              <div class="stopBody">
                <div class="stopName">${esc(s.name)}</div>
                <div class="stopAddr">${esc(s.formatted)}</div>
                ${s.note ? `<div class="stopNote">${esc(s.note)}</div>` : ""}
              </div>
              <button class="del" data-del="${s.id}" title="Remove" aria-label="Remove ${esc(s.name)}">×</button>
            </li>`;
          }).join("")}
        </ol>
      </div>`).join("");
  }

  drawMap(groups);
}

// ---------- Drawing the map ----------
function drawMap(groups) {
  if (!map) return;
  overlays.forEach((o) => o.setMap(null));
  overlays = [];
  markerById = {};
  if (!stops.length) { map.setCenter({ lat: 42.5, lng: 12.5 }); map.setZoom(5.5); return; }

  const bounds = new google.maps.LatLngBounds();
  let n = 0;
  groups.forEach((g) => {
    const path = [];
    g.stops.forEach((s) => {
      n++;
      const pos = { lat: s.lat, lng: s.lng };
      path.push(pos);
      bounds.extend(pos);
      const m = new google.maps.Marker({
        map, position: pos, title: s.name,
        label: { text: String(n), color: "#fff", fontWeight: "700", fontSize: "12px" },
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: 13, fillColor: g.color, fillOpacity: 1, strokeColor: "#fff", strokeWeight: 2 },
      });
      m.addListener("click", () => openInfo(s, m));
      overlays.push(m);
      markerById[s.id] = m;
    });
    if (path.length > 1) {
      overlays.push(new google.maps.Polyline({ map, path, strokeColor: g.color, strokeOpacity: 0.8, strokeWeight: 3 }));
    }
  });

  if (stops.length === 1) { map.setCenter(bounds.getCenter()); map.setZoom(15); }
  else map.fitBounds(bounds, 50);
}

function openInfo(s, marker) {
  info.setContent(`<div style="color:#1f2328;max-width:220px"><strong>${esc(s.name)}</strong><br><small>${esc(s.formatted)}</small>${s.note ? `<br><em>${esc(s.note)}</em>` : ""}</div>`);
  info.open({ map, anchor: marker });
}

// Called by the Google Maps script once it loads
window.initMap = function () {
  map = new google.maps.Map($("map"), {
    center: { lat: 42.5, lng: 12.5 }, zoom: 5.5,
    mapTypeControl: false, streetViewControl: false, fullscreenControl: true,
  });
  info = new google.maps.InfoWindow();
  $("mapNote").hidden = true;
  render();
};

// Google calls this if the key is wrong or not allowed on this website
window.gm_authFailure = function () {
  $("mapNote").hidden = false;
  $("mapNote").textContent = "Google Maps rejected the API key. Check the key, that Maps JavaScript API is enabled, and that this website is allowed.";
  $("keyBox").open = true;
};

function loadGoogleMaps() {
  const key = getKey();
  if (!key) { $("keyBox").open = true; return; }
  $("keyInput").value = key;
  const s = document.createElement("script");
  s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&callback=initMap&loading=async&region=IT&v=weekly`;
  s.async = true;
  s.onerror = () => { $("mapNote").textContent = "Couldn't load Google Maps. Check your internet connection."; };
  document.head.appendChild(s);
}

// ---------- Buttons and forms ----------
function message(text, kind = "") {
  $("msg").textContent = text;
  $("msg").className = "msg " + kind;
}

$("add").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("name").value.trim();
  const address = $("address").value.trim();
  const note = $("note").value.trim();
  if (!name || !address) return;

  $("addBtn").disabled = true;
  message("Finding address…");
  try {
    const place = await geocode(address);
    stops.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name, note, address, added: Date.now(), ...place });
    save();
    render();
    $("add").reset();
    $("name").focus();
    message(`Added "${name}" in ${place.city}.`, "ok");
    const m = markerById[stops[stops.length - 1].id];
    if (m) openInfo(stops[stops.length - 1], m);
  } catch {
    message("Couldn't find that address in Italy. Try adding the city, e.g. \"Via Roma 1, Firenze\".", "err");
  } finally {
    $("addBtn").disabled = false;
  }
});

$("groups").addEventListener("click", (e) => {
  const del = e.target.closest("[data-del]");
  if (del) {
    stops = stops.filter((s) => s.id !== del.dataset.del);
    save();
    render();
    return;
  }
  const li = e.target.closest(".stop");
  if (li && map) {
    const s = stops.find((x) => x.id === li.dataset.id);
    const m = markerById[li.dataset.id];
    if (s && m) { map.panTo(m.getPosition()); map.setZoom(Math.max(map.getZoom(), 15)); openInfo(s, m); }
  }
});

$("clear").addEventListener("click", () => {
  if (!stops.length || !confirm("Remove all stops from your itinerary?")) return;
  stops = [];
  save();
  render();
});

$("keyForm").addEventListener("submit", (e) => {
  e.preventDefault();
  try { localStorage.setItem(KEY_STORE, $("keyInput").value.trim()); } catch {}
  location.reload();
});

render();
loadGoogleMaps();
