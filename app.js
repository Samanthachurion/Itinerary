// Italy Itinerary
// You add a place + address. Each stop is located on the map, grouped by city,
// and put in a "nearest next stop" order so the trip flows from place to place.

const OLD_STORE = "italy-itinerary-stops"; // before trips existed: one list of stops
const TRIPS_STORE = "italy-itinerary-trips";
const CURRENT_STORE = "italy-itinerary-current-trip";
const KEY_STORE = "italy-itinerary-gmaps-key";
const CLOSED_STORE = "italy-itinerary-closed-cities";
const COLORS = ["#009246", "#ce2b37", "#1f6feb", "#b8860b", "#8a3ffc", "#0f8b8d", "#d9480f", "#c2255c"];

let trips = loadTrips();
let trip = trips.find((t) => t.id === read(CURRENT_STORE)) || trips[0] || addTrip();
let stops = trip.stops;
let closedCities = loadClosed(); // city folders the user has closed
let map, info, overlays = [], markerById = {};

const $ = (id) => document.getElementById(id);

// ---------- Saving ----------
// Trips live in this browser only, so everyone who opens the site gets their own trips.
function read(k) { try { return localStorage.getItem(k); } catch { return null; } }
function write(k, v) { try { localStorage.setItem(k, v); } catch {} }

function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function loadTrips() {
  try {
    const list = JSON.parse(read(TRIPS_STORE));
    if (Array.isArray(list)) return list;
  } catch {}
  // First visit after the update: move the old stop list into a trip
  let old = [];
  try { old = JSON.parse(read(OLD_STORE)) || []; } catch {}
  return old.length ? [{ id: newId(), name: "My Italy trip", stops: old, updated: Date.now() }] : [];
}

function addTrip(name = "", list = []) {
  const t = { id: newId(), name, stops: list, updated: Date.now() };
  trips.push(t);
  return t;
}

// Every change is saved right away to the open trip
function save() {
  trip.stops = stops;
  trip.updated = Date.now();
  write(TRIPS_STORE, JSON.stringify(trips));
  write(CURRENT_STORE, trip.id);
}
function loadClosed() {
  try { return new Set(JSON.parse(localStorage.getItem(CLOSED_STORE)) || []); } catch { return new Set(); }
}
function saveClosed() {
  try { localStorage.setItem(CLOSED_STORE, JSON.stringify([...closedCities])); } catch {}
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
      <details class="folder" data-city="${esc(g.city)}" style="--city:${g.color}" ${closedCities.has(g.city) ? "" : "open"}>
        <summary class="folderHead">
          <span class="folderIcon" aria-hidden="true"></span>
          <span class="cityName">${esc(g.city)}</span>
          <span class="count">${g.stops.length} stop${g.stops.length > 1 ? "s" : ""}</span>
        </summary>
        <div class="folderBody">
        <a class="go" href="${directionsLink(g.stops)}" target="_blank" rel="noopener">Open ${esc(g.city)} in Google Maps ↗</a>
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
        </div>
      </details>`).join("");
  }

  renderTrips();
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

// ---------- Suggestions while typing the place name ----------
// Uses Google Places when it's turned on for the key, otherwise the free Photon (OpenStreetMap) search.
let picked = null;            // the place chosen from the list, with its address and location
let options = [], active = -1, typingTimer, searchNo = 0, sessionToken = null, googlePlacesOK = true;

function cityFrom(part) {
  return part("locality") || part("postal_town") || part("administrative_area_level_3") || part("administrative_area_level_2") || "Other";
}

async function suggestGoogle(text) {
  const { AutocompleteSuggestion, AutocompleteSessionToken } = await google.maps.importLibrary("places");
  sessionToken ||= new AutocompleteSessionToken();
  const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
    input: text, includedRegionCodes: ["it"], language: "en", sessionToken,
  });
  return suggestions.filter((s) => s.placePrediction).slice(0, 5).map(({ placePrediction: p }) => ({
    title: p.mainText?.text || p.text.text,
    subtitle: p.secondaryText?.text || "",
    resolve: async () => {
      const place = p.toPlace();
      await place.fetchFields({ fields: ["formattedAddress", "location", "addressComponents"] });
      sessionToken = null;
      const part = (t) => place.addressComponents?.find((c) => c.types.includes(t))?.longText;
      return { formatted: place.formattedAddress, city: cityFrom(part), lat: place.location.lat(), lng: place.location.lng() };
    },
  }));
}

async function suggestPhoton(text) {
  // Box around Italy, then keep only Italian results
  const res = await fetch("https://photon.komoot.io/api/?limit=10&bbox=6.6,35.4,18.6,47.1&q=" + encodeURIComponent(text));
  const data = await res.json();
  return data.features.filter((f) => f.properties.countrycode === "IT").slice(0, 5).map((f) => {
    const p = f.properties;
    const street = [p.street, p.housenumber].filter(Boolean).join(" ");
    const city = p.city || (["city", "town", "village"].includes(p.type) ? p.name : "") || p.county || p.state || "Other";
    const title = p.name || street || city;
    const formatted = [...new Set([title, street, [p.postcode, city].filter(Boolean).join(" ")].filter(Boolean))].join(", ");
    return {
      title,
      subtitle: [street, city].filter(Boolean).join(", "),
      resolve: async () => ({ formatted, city, lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] }),
    };
  });
}

async function findSuggestions(text) {
  if (googlePlacesOK && window.google?.maps?.importLibrary) {
    try { return await suggestGoogle(text); }
    catch { googlePlacesOK = false; } // Places API not enabled for this key; use the free search instead
  }
  return suggestPhoton(text);
}

function showSuggestions(list) {
  options = list;
  active = -1;
  const box = $("suggest");
  box.innerHTML = list.map((s, i) =>
    `<li role="option" data-i="${i}"><strong>${esc(s.title)}</strong>${s.subtitle ? `<span>${esc(s.subtitle)}</span>` : ""}</li>`).join("");
  box.hidden = !list.length;
  $("name").setAttribute("aria-expanded", String(!!list.length));
}

function hideSuggestions() {
  searchNo++; // ignore any search still on its way
  showSuggestions([]);
}

function highlight(i) {
  active = (i + options.length) % options.length;
  [...$("suggest").children].forEach((li, n) => li.classList.toggle("active", n === active));
  $("suggest").children[active]?.scrollIntoView({ block: "nearest" });
}

async function choose(i) {
  const s = options[i];
  if (!s) return;
  hideSuggestions();
  $("name").value = s.title;
  $("address").value = s.subtitle || s.title;
  message("Getting the address…");
  try {
    picked = await s.resolve();
    $("address").value = picked.formatted;
    message("Address filled in. Add a note if you like, then click Add.", "ok");
    if (map) { map.panTo({ lat: picked.lat, lng: picked.lng }); map.setZoom(Math.max(map.getZoom(), 14)); }
    $("note").focus();
  } catch {
    picked = null;
    message("Couldn't get that address. Please type it in.", "err");
  }
}

$("name").addEventListener("input", () => {
  clearTimeout(typingTimer);
  const text = $("name").value.trim();
  if (text.length < 3) return hideSuggestions();
  typingTimer = setTimeout(async () => {
    const mine = ++searchNo;
    try {
      const list = await findSuggestions(text);
      if (mine === searchNo) showSuggestions(list);
    } catch { /* no suggestions; the user can still type the address */ }
  }, 300);
});

$("name").addEventListener("keydown", (e) => {
  if ($("suggest").hidden) return;
  if (e.key === "ArrowDown") { e.preventDefault(); highlight(active + 1); }
  else if (e.key === "ArrowUp") { e.preventDefault(); highlight(active - 1); }
  else if (e.key === "Enter" && active >= 0) { e.preventDefault(); choose(active); }
  else if (e.key === "Escape") hideSuggestions();
});

// mousedown (not click) so the list doesn't close before the tap registers
$("suggest").addEventListener("mousedown", (e) => {
  const li = e.target.closest("li");
  if (li) { e.preventDefault(); choose(+li.dataset.i); }
});
$("name").addEventListener("blur", () => setTimeout(hideSuggestions, 150));
$("address").addEventListener("input", () => { picked = null; });

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
    const place = picked && address === picked.formatted ? picked : await geocode(address);
    if (closedCities.delete(place.city)) saveClosed();
    stops.push({ id: newId(), name, note, address, added: Date.now(), ...place });
    save();
    render();
    $("add").reset();
    picked = null;
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

// Remember which city folders are open or closed
$("groups").addEventListener("toggle", (e) => {
  const f = e.target.closest(".folder");
  if (!f) return;
  if (f.open) closedCities.delete(f.dataset.city); else closedCities.add(f.dataset.city);
  saveClosed();
}, true);

$("clear").addEventListener("click", () => {
  if (!stops.length || !confirm("Remove all stops from this trip?")) return;
  stops = [];
  save();
  render();
});

$("keyForm").addEventListener("submit", (e) => {
  e.preventDefault();
  try { localStorage.setItem(KEY_STORE, $("keyInput").value.trim()); } catch {}
  location.reload();
});

// ---------- Trips ----------
const tripLabel = (t) => t.name || "Untitled trip";

function tripMessage(text, kind = "ok") {
  $("tripMsg").textContent = text;
  $("tripMsg").className = "msg " + kind;
}

function renderTrips() {
  $("tripList").innerHTML = [...trips].sort((a, b) => b.updated - a.updated).map((t) => `
    <li class="trip ${t.id === trip.id ? "current" : ""}" data-trip="${t.id}">
      <div class="tripInfo">
        <div class="tripTitle">${esc(tripLabel(t))}</div>
        <div class="muted">${t.stops.length} stop${t.stops.length === 1 ? "" : "s"}${t.id === trip.id ? " · open now" : ""}</div>
      </div>
      <button class="del" data-deltrip="${t.id}" title="Delete trip" aria-label="Delete ${esc(tripLabel(t))}">×</button>
    </li>`).join("");
}

function openTrip(t) {
  // Drop the trip we're leaving if it was never named and has no stops
  if (trip !== t && !trip.name && !trip.stops.length) trips = trips.filter((x) => x !== trip);
  trip = t;
  stops = t.stops;
  $("tripName").value = trip.name;
  save();
  render();
  message("");
}

$("tripForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = $("tripName").value.trim();
  if (!name) { tripMessage("Give your trip a name first.", "err"); $("tripName").focus(); return; }
  trip.name = name;
  save();
  render();
  tripMessage(`Saved "${name}".`);
});

$("newTrip").addEventListener("click", () => {
  openTrip(addTrip());
  tripMessage("New trip started. Give it a name and add your first stop.");
  $("tripName").focus();
});

$("tripList").addEventListener("click", (e) => {
  const del = e.target.closest("[data-deltrip]");
  if (del) {
    const t = trips.find((x) => x.id === del.dataset.deltrip);
    if (!t || !confirm(`Delete "${tripLabel(t)}" and all its stops?`)) return;
    trips = trips.filter((x) => x !== t);
    if (t === trip) { trip = trips[0] || addTrip(); stops = trip.stops; $("tripName").value = trip.name; }
    save();
    render();
    tripMessage(`Deleted "${tripLabel(t)}".`);
    return;
  }
  const li = e.target.closest("[data-trip]");
  const t = li && trips.find((x) => x.id === li.dataset.trip);
  if (t && t !== trip) { openTrip(t); tripMessage(`Opened "${tripLabel(t)}".`); }
});

// Share: the whole trip goes into the link, so it works without a server.
// Whoever opens the link gets their own copy to change as they like.
function encodeTrip(t) {
  const data = { n: t.name, s: t.stops.map((s) => [s.name, s.note || "", s.formatted, s.city, +s.lat.toFixed(6), +s.lng.toFixed(6)]) };
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function decodeTrip(code) {
  const bin = atob(code.replace(/-/g, "+").replace(/_/g, "/"));
  const data = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
  const now = Date.now();
  return {
    name: String(data.n || "Shared trip"),
    stops: data.s.map(([name, note, formatted, city, lat, lng], i) => ({
      id: newId() + i, name: String(name), note: String(note || ""), address: String(formatted),
      formatted: String(formatted), city: String(city || "Other"), lat: +lat, lng: +lng, added: now + i,
    })).filter((s) => isFinite(s.lat) && isFinite(s.lng)),
  };
}

$("share").addEventListener("click", async () => {
  if (!stops.length) { tripMessage("Add a stop before sharing.", "err"); return; }
  const link = location.href.split("#")[0] + "#trip=" + encodeTrip(trip);
  try {
    await navigator.clipboard.writeText(link);
    tripMessage("Link copied. Whoever opens it gets their own copy of this trip.");
  } catch {
    prompt("Copy this link and send it:", link);
  }
});

// Opening a shared link adds a copy of that trip to this browser
function importFromLink() {
  const m = location.hash.match(/^#trip=([\w-]+)/);
  if (!m) return;
  history.replaceState(null, "", location.pathname + location.search);
  try {
    const shared = decodeTrip(m[1]);
    openTrip(addTrip(shared.name, shared.stops));
    tripMessage(`Added "${tripLabel(trip)}" to your trips. Changes you make won't affect the person who shared it.`);
  } catch {
    tripMessage("That share link looks broken. Ask for a new one.", "err");
  }
}

save();
$("tripName").value = trip.name;
render();
importFromLink();
window.addEventListener("hashchange", importFromLink);
loadGoogleMaps();
