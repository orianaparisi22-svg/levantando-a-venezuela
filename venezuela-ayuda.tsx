import { useState, useEffect, useRef, useCallback } from "react";

// Leaflet loaded via CDN in useEffect
let L = null;

// ─────────────────────────────────────────────
// FIREBASE CONFIG — reemplaza con tus credenciales
// de Firebase Console > Project Settings > Your apps
// ─────────────────────────────────────────────
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyD3J1AmB4vTvj9I21AUG2RT528r8JM4yFM",
  authDomain:        "levantando-a-venezuela.firebaseapp.com",
  projectId:         "levantando-a-venezuela",
  storageBucket:     "levantando-a-venezuela.firebasestorage.app",
  messagingSenderId: "76236415114",
  appId:             "1:76236415114:web:c0223da724c1f766688d73",
};
const COLLECTION = "reportes";

// Load Firebase SDK via CDN once
let db = null;
let fbLoaded = false;
let fbCallbacks = [];

function loadFirebase(cb) {
  if (fbLoaded && db) { cb(db); return; }
  fbCallbacks.push(cb);
  if (document.getElementById("firebase-app")) return;

  const sdks = [
    { id: "firebase-app",       src: "https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js" },
    { id: "firebase-firestore", src: "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js" },
  ];

  let loaded = 0;
  sdks.forEach(({ id, src }) => {
    const s = document.createElement("script");
    s.id = id; s.src = src;
    s.onload = () => {
      loaded++;
      if (loaded === sdks.length) {
        const app = window.firebase.initializeApp(FIREBASE_CONFIG);
        db = window.firebase.firestore(app);
        fbLoaded = true;
        fbCallbacks.forEach(fn => fn(db));
        fbCallbacks = [];
      }
    };
    document.head.appendChild(s);
  });
}

const CITIES = [
  "Distrito Capital (Caracas)", "La Guaira", "Amazonas", "Anzoátegui",
  "Apure", "Aragua", "Barinas", "Bolívar", "Carabobo", "Cojedes",
  "Delta Amacuro", "Falcón", "Guárico", "Lara", "Mérida", "Miranda",
  "Monagas", "Nueva Esparta", "Portuguesa", "Sucre", "Táchira",
  "Trujillo", "Yaracuy", "Zulia", "Otra zona"
];

const HELP_TYPES = [
  { id: "rescate", label: "🆘 Rescate bajo escombros", color: "#DC2626" },
  { id: "escombros", label: "🪨 Mover / retirar escombros", color: "#B45309" },
  { id: "medico", label: "🏥 Atención médica", color: "#9333EA" },
  { id: "agua", label: "💧 Agua potable", color: "#2563EB" },
  { id: "comida", label: "🍞 Comida", color: "#D97706" },
  { id: "medicinas", label: "💊 Medicinas y primeros auxilios", color: "#7C3AED" },
  { id: "albergue", label: "🏠 Alojamiento", color: "#059669" },
  { id: "transporte", label: "🚗 Transporte / Evacuación", color: "#0891B2" },
  { id: "mascota", label: "🐾 Rescate de mascota", color: "#92400E" },
  { id: "comunicacion", label: "📡 Comunicación / Noticias", color: "#64748B" },
  { id: "otro", label: "🤝 Otra necesidad", color: "#475569" },
];

const OFFER_TYPES = [
  { id: "rescate", label: "🦺 Soy rescatista profesional" },
  { id: "escombros", label: "🪨 Puedo mover / retirar escombros" },
  { id: "medico", label: "👨‍⚕️ Atención médica (médico/enfermero)" },
  { id: "agua", label: "💧 Suministro de agua potable" },
  { id: "comida", label: "🍞 Suministro de comida" },
  { id: "medicinas", label: "💊 Medicinas y material de primeros auxilios" },
  { id: "transporte", label: "🚗 Tengo vehículo disponible" },
  { id: "albergue", label: "🏠 Puedo alojar personas" },
  { id: "mascota", label: "🐾 Rescate / albergue de mascotas" },
  { id: "dinero", label: "💰 Puedo donar dinero o recursos" },
  { id: "coordinacion", label: "📋 Coordinación / logística" },
  { id: "comunicacion", label: "📡 Comunicación / difusión de info" },
  { id: "otro", label: "🤝 Otro tipo de ayuda" },
];

const URGENCY = [
  { id: "critico", label: "CRÍTICO — Riesgo de vida", color: "#DC2626", bg: "#FEE2E2" },
  { id: "urgente", label: "URGENTE — Necesito ayuda hoy", color: "#D97706", bg: "#FEF3C7" },
  { id: "necesario", label: "NECESARIO — En los próximos días", color: "#2563EB", bg: "#DBEAFE" },
];

// Data comes from Firebase — no local seed needed

function timeAgo(ts) {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  return `hace ${Math.floor(hrs / 24)}d`;
}

function Badge({ urgency }) {
  const u = URGENCY.find(x => x.id === urgency);
  if (!u) return null;
  return (
    <span style={{
      background: u.bg, color: u.color, border: `1px solid ${u.color}`,
      borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 700,
      letterSpacing: "0.04em", textTransform: "uppercase"
    }}>{u.label}</span>
  );
}

function HelpChip({ helpTypeId }) {
  const h = HELP_TYPES.find(x => x.id === helpTypeId) || OFFER_TYPES.find(x => x.id === helpTypeId);
  if (!h) return null;
  return (
    <span style={{
      background: "#F1F5F9", color: "#334155", borderRadius: 20,
      padding: "3px 10px", fontSize: 12, fontWeight: 600
    }}>{h.label}</span>
  );
}

// Load Leaflet CSS + JS once
function useLeaflet(cb) {
  useEffect(() => {
    if (window._leafletReady) { cb(); return; }
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
    document.head.appendChild(link);
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
    script.onload = () => { window._leafletReady = true; L = window.L; cb(); };
    document.head.appendChild(script);
  }, []);
}

function LeafletMap({ items, onSelect }) {
  const mapRef = useRef(null);
  const instanceRef = useRef(null);
  const markersRef = useRef([]);
  const [ready, setReady] = useState(!!window._leafletReady);

  useLeaflet(() => { L = window.L; setReady(true); });

  useEffect(() => {
    if (!ready || !mapRef.current) return;
    if (!instanceRef.current) {
      instanceRef.current = L.map(mapRef.current, { zoomControl: true, scrollWheelZoom: false })
        .setView([10.48, -66.9], 10);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors", maxZoom: 18
      }).addTo(instanceRef.current);
    }

    // Clear old markers
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    items.forEach(item => {
      if (!item.lat || !item.lng) return;
      const isNeed = item.type === "need";
      const color = isNeed ? "#DC2626" : "#059669";
      const svgIcon = L.divIcon({
        className: "",
        html: `<svg width="28" height="36" viewBox="0 0 28 36" xmlns="http://www.w3.org/2000/svg">
          <path d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.268 21.732 0 14 0z" fill="${color}" stroke="white" stroke-width="2"/>
          <circle cx="14" cy="14" r="6" fill="white"/>
        </svg>`,
        iconSize: [28, 36],
        iconAnchor: [14, 36],
        popupAnchor: [0, -36]
      });
      const marker = L.marker([item.lat, item.lng], { icon: svgIcon })
        .addTo(instanceRef.current)
        .bindPopup(`
          <div style="font-family:sans-serif;min-width:180px">
            <div style="font-weight:700;font-size:14px;margin-bottom:4px">${item.name}</div>
            <div style="font-size:12px;color:#64748B;margin-bottom:4px">📍 ${item.city}${item.address ? " · " + item.address : ""}</div>
            <div style="font-size:12px;color:#334155">${item.description ? item.description.slice(0, 80) + "…" : ""}</div>
            <div style="margin-top:8px;font-size:12px;font-weight:600;color:${color}">
              ${isNeed ? "🆘 Necesita ayuda" : "🤝 Voluntario"}
            </div>
          </div>
        `);
      marker.on("click", () => onSelect(item));
      markersRef.current.push(marker);
    });

    // Fit bounds if items exist
    const withCoords = items.filter(i => i.lat && i.lng);
    if (withCoords.length > 0) {
      const bounds = L.latLngBounds(withCoords.map(i => [i.lat, i.lng]));
      instanceRef.current.fitBounds(bounds.pad(0.3), { maxZoom: 13 });
    }
  }, [ready, items]);

  return (
    <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid #CBD5E1", position: "relative" }}>
      {!ready && (
        <div style={{ height: 240, background: "#E8F4FD", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748B", fontSize: 13 }}>
          Cargando mapa…
        </div>
      )}
      <div ref={mapRef} style={{ height: 240, display: ready ? "block" : "none" }} />
      <div style={{ position: "absolute", bottom: 8, left: 8, zIndex: 1000, display: "flex", gap: 8, background: "rgba(255,255,255,0.9)", borderRadius: 8, padding: "4px 10px", fontSize: 11, boxShadow: "0 1px 4px rgba(0,0,0,0.15)" }}>
        <span><span style={{ color: "#DC2626", fontWeight: 700 }}>●</span> Necesita ayuda</span>
        <span><span style={{ color: "#059669", fontWeight: 700 }}>●</span> Voluntario</span>
      </div>
    </div>
  );
}

// Geocode an address string in Venezuela using Nominatim
async function geocodeAddress(address, city) {
  const query = `${address}, ${city}, Venezuela`;
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=ve`,
      { headers: { "Accept-Language": "es" } }
    );
    const data = await res.json();
    if (data && data[0]) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch (e) {}
  return null;
}

// City fallback coords
const CITY_COORDS = {
  "Distrito Capital (Caracas)": [10.4806, -66.9036],
  "La Guaira": [10.6010, -66.9353],
  "Amazonas": [3.7439, -66.1084],
  "Anzoátegui": [9.2900, -63.9853],
  "Apure": [7.6907, -68.5738],
  "Aragua": [10.0638, -67.2839],
  "Barinas": [8.6231, -70.2064],
  "Bolívar": [8.1208, -63.5460],
  "Carabobo": [10.1620, -68.0077],
  "Cojedes": [9.3826, -68.3353],
  "Delta Amacuro": [8.8220, -61.1760],
  "Falcón": [11.4032, -69.6398],
  "Guárico": [8.7493, -66.2354],
  "Lara": [10.0682, -69.3574],
  "Mérida": [8.5897, -71.1440],
  "Miranda": [10.2319, -66.4308],
  "Monagas": [9.3327, -63.0145],
  "Nueva Esparta": [10.9966, -63.9117],
  "Portuguesa": [9.0940, -69.0960],
  "Sucre": [10.4792, -63.4196],
  "Táchira": [7.9154, -72.1418],
  "Trujillo": [9.3680, -70.4280],
  "Yaracuy": [10.3390, -68.8145],
  "Zulia": [10.6914, -71.9067],
  "Otra zona": [8.0, -66.0],
};

function Card({ item, onAction, isTakenByMe }) {
  const isNeed = item.type === "need";
  const borderColor = isNeed
    ? (item.urgency === "critico" ? "#DC2626" : item.urgency === "urgente" ? "#D97706" : "#2563EB")
    : "#059669";
  const responders = item.responders || 0;
  const isTaken = isTakenByMe;

  return (
    <div style={{
      background: "white", borderRadius: 10, padding: "14px 16px",
      borderLeft: `4px solid ${borderColor}`,
      boxShadow: "0 1px 3px rgba(0,0,0,0.08)", marginBottom: 10
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
            {isNeed && <Badge urgency={item.urgency} />}
            <HelpChip helpTypeId={item.helpType} />
            {item.fromAbroad && (
              <span style={{ fontSize: 11, color: "#7C3AED", background: "#F3E8FF", borderRadius: 4, padding: "2px 6px" }}>
                📍 Reportado desde el exterior
              </span>
            )}
          </div>
          <div style={{ fontWeight: 700, fontSize: 15, color: "#0F172A", marginBottom: 2 }}>{item.name}</div>
          <div style={{ fontSize: 12, color: "#64748B", marginBottom: 6 }}>
            📍 {item.city} · {item.address} · {timeAgo(item.timestamp)}
          </div>
          <div style={{ fontSize: 13, color: "#334155", lineHeight: 1.5 }}>{item.description}</div>
          {item.fromAbroad && item.abroadNote && (
            <div style={{ fontSize: 11, color: "#7C3AED", marginTop: 4, fontStyle: "italic" }}>{item.abroadNote}</div>
          )}
        </div>
      </div>

      {isNeed && responders > 0 && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          marginTop: 10, padding: "8px 12px", borderRadius: 8,
          background: "#F0FDF4", border: "1px solid #BBF7D0"
        }}>
          <div style={{ display: "flex" }}>
            {Array.from({ length: Math.min(responders, 5) }).map((_, i) => (
              <div key={i} style={{
                width: 24, height: 24, borderRadius: "50%",
                background: `hsl(${140 + i * 30}, 55%, 42%)`,
                border: "2px solid white", marginLeft: i > 0 ? -7 : 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11
              }}>🤝</div>
            ))}
          </div>
          <span style={{ fontSize: 13, color: "#166534", fontWeight: 600 }}>
            {responders} persona{responders !== 1 ? "s" : ""} {responders !== 1 ? "se han sumado" : "se ha sumado"} a ayudar
          </span>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        <a href={`tel:${item.contact}`} style={{
          background: "#0F172A", color: "white", borderRadius: 6,
          padding: "6px 14px", fontSize: 12, fontWeight: 600, textDecoration: "none"
        }}>
          📞 {item.contact}
        </a>
        {isNeed && (
          <button onClick={() => onAction(item)} style={{
            background: isTaken ? "#059669" : "#DC2626", color: "white", borderRadius: 6,
            padding: "6px 14px", fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", gap: 6, transition: "background 0.2s"
          }}>
            <span>{isTaken ? "✅ Me sumé" : "🤝 Me encargo"}</span>
            {responders > 0 && (
              <span style={{
                background: "rgba(255,255,255,0.3)", borderRadius: 10,
                padding: "1px 7px", fontSize: 11, fontWeight: 800
              }}>{responders}</span>
            )}
          </button>
        )}
        {!isNeed && (
          <button onClick={() => onAction(item)} style={{
            background: "#059669", color: "white", borderRadius: 6,
            padding: "6px 14px", fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer"
          }}>
            ✉️ Contactar
          </button>
        )}
      </div>
    </div>
  );
}

function NeedForm({ onSubmit, onCancel }) {
  const [form, setForm] = useState({
    name: "", city: "", address: "", helpType: "", urgency: "",
    description: "", contact: "", fromAbroad: false, abroadNote: ""
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const valid = form.name && form.city && form.helpType && form.urgency && form.description && form.contact;

  return (
    <div style={{ background: "white", borderRadius: 12, padding: 20, boxShadow: "0 4px 20px rgba(0,0,0,0.12)" }}>
      <h3 style={{ margin: "0 0 16px", color: "#0F172A", fontSize: 17 }}>🆘 Publicar solicitud de ayuda</h3>
      <label style={lStyle}>¿Quién necesita ayuda?</label>
      <input style={iStyle} placeholder="Nombre o descripción (ej. Familia López)" value={form.name} onChange={e => set("name", e.target.value)} />

      <label style={lStyle}>Ciudad / Zona</label>
      <select style={iStyle} value={form.city} onChange={e => set("city", e.target.value)}>
        <option value="">Selecciona...</option>
        {CITIES.map(c => <option key={c}>{c}</option>)}
      </select>

      <label style={lStyle}>Dirección aproximada o referencia</label>
      <input style={iStyle} placeholder="Ej: Sector Los Corales, cerca del mercado principal" value={form.address} onChange={e => set("address", e.target.value)} />
      <div style={{ fontSize: 11, color: "#64748B", marginTop: -10, marginBottom: 14 }}>
        💡 Mientras más detallada la dirección, más fácil ubicarlos en el mapa.
      </div>

      <label style={lStyle}>¿Qué necesita?</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        {HELP_TYPES.map(h => (
          <button key={h.id} onClick={() => set("helpType", h.id)} style={{
            padding: "6px 12px", borderRadius: 20, fontSize: 13, cursor: "pointer",
            border: `2px solid ${form.helpType === h.id ? h.color : "#E2E8F0"}`,
            background: form.helpType === h.id ? h.color + "20" : "white",
            color: form.helpType === h.id ? h.color : "#475569", fontWeight: form.helpType === h.id ? 700 : 400
          }}>{h.label}</button>
        ))}
      </div>

      <label style={lStyle}>Urgencia</label>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
        {URGENCY.map(u => (
          <button key={u.id} onClick={() => set("urgency", u.id)} style={{
            padding: "10px 14px", borderRadius: 8, fontSize: 13, cursor: "pointer", textAlign: "left",
            border: `2px solid ${form.urgency === u.id ? u.color : "#E2E8F0"}`,
            background: form.urgency === u.id ? u.bg : "white",
            color: form.urgency === u.id ? u.color : "#475569", fontWeight: form.urgency === u.id ? 700 : 400
          }}>{u.label}</button>
        ))}
      </div>

      <label style={lStyle}>Descripción (qué pasó, cuántas personas)</label>
      <textarea style={{ ...iStyle, height: 80, resize: "vertical" }} placeholder="Describe la situación con el mayor detalle posible..." value={form.description} onChange={e => set("description", e.target.value)} />

      <label style={lStyle}>Teléfono de contacto (WhatsApp preferiblemente)</label>
      <input style={iStyle} placeholder="+58 412 555 0000" value={form.contact} onChange={e => set("contact", e.target.value)} />

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: form.fromAbroad ? 10 : 16 }}>
        <input type="checkbox" id="abroad" checked={form.fromAbroad} onChange={e => set("fromAbroad", e.target.checked)} />
        <label htmlFor="abroad" style={{ fontSize: 13, color: "#475569", cursor: "pointer" }}>
          Estoy reportando desde el exterior (en nombre de alguien allá)
        </label>
      </div>
      {form.fromAbroad && (
        <>
          <label style={lStyle}>¿Desde dónde reportas?</label>
          <input style={iStyle} placeholder="Ej: Familiar en Miami" value={form.abroadNote} onChange={e => set("abroadNote", e.target.value)} />
        </>
      )}

      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={onCancel} style={{
          flex: 1, padding: "12px", borderRadius: 8, border: "1px solid #E2E8F0",
          background: "white", color: "#64748B", fontWeight: 600, cursor: "pointer", fontSize: 14
        }}>Cancelar</button>
        <button disabled={!valid} onClick={() => onSubmit(form)} style={{
          flex: 2, padding: "12px", borderRadius: 8, border: "none",
          background: valid ? "#DC2626" : "#E2E8F0", color: valid ? "white" : "#94A3B8",
          fontWeight: 700, cursor: valid ? "pointer" : "default", fontSize: 14
        }}>Publicar solicitud 🆘</button>
      </div>
    </div>
  );
}

function VolunteerForm({ onSubmit, onCancel }) {
  const [form, setForm] = useState({ name: "", city: "", helpType: "", description: "", contact: "" });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const valid = form.name && form.city && form.helpType && form.description && form.contact;

  return (
    <div style={{ background: "white", borderRadius: 12, padding: 20, boxShadow: "0 4px 20px rgba(0,0,0,0.12)" }}>
      <h3 style={{ margin: "0 0 16px", color: "#0F172A", fontSize: 17 }}>🤝 Registrarme como voluntario</h3>
      <label style={lStyle}>Tu nombre</label>
      <input style={iStyle} placeholder="Nombre completo" value={form.name} onChange={e => set("name", e.target.value)} />

      <label style={lStyle}>¿Dónde puedes ayudar?</label>
      <select style={iStyle} value={form.city} onChange={e => set("city", e.target.value)}>
        <option value="">Selecciona...</option>
        {CITIES.map(c => <option key={c}>{c}</option>)}
      </select>

      <label style={lStyle}>¿Qué puedes ofrecer?</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        {OFFER_TYPES.map(h => (
          <button key={h.id} onClick={() => set("helpType", h.id)} style={{
            padding: "6px 12px", borderRadius: 20, fontSize: 13, cursor: "pointer",
            border: `2px solid ${form.helpType === h.id ? "#059669" : "#E2E8F0"}`,
            background: form.helpType === h.id ? "#DCFCE7" : "white",
            color: form.helpType === h.id ? "#059669" : "#475569", fontWeight: form.helpType === h.id ? 700 : 400
          }}>{h.label}</button>
        ))}
      </div>

      <label style={lStyle}>Describe qué puedes hacer</label>
      <textarea style={{ ...iStyle, height: 70, resize: "vertical" }} placeholder="Ej: Tengo camioneta 4x4 y puedo mover 8 personas..." value={form.description} onChange={e => set("description", e.target.value)} />

      <label style={lStyle}>Teléfono / WhatsApp</label>
      <input style={iStyle} placeholder="+58 412 555 0000" value={form.contact} onChange={e => set("contact", e.target.value)} />

      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={onCancel} style={{
          flex: 1, padding: "12px", borderRadius: 8, border: "1px solid #E2E8F0",
          background: "white", color: "#64748B", fontWeight: 600, cursor: "pointer", fontSize: 14
        }}>Cancelar</button>
        <button disabled={!valid} onClick={() => onSubmit(form)} style={{
          flex: 2, padding: "12px", borderRadius: 8, border: "none",
          background: valid ? "#059669" : "#E2E8F0", color: valid ? "white" : "#94A3B8",
          fontWeight: 700, cursor: valid ? "pointer" : "default", fontSize: 14
        }}>Registrarme como voluntario 🤝</button>
      </div>
    </div>
  );
}

const lStyle = { display: "block", fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.05em" };
const iStyle = { width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 14, color: "#0F172A", marginBottom: 14, boxSizing: "border-box", outline: "none", fontFamily: "inherit" };

export default function App() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("todos");
  const [form, setForm] = useState(null);
  const [filter, setFilter] = useState("todos");
  const [selectedCity, setSelectedCity] = useState("Todas");
  const [toast, setToast] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [takenIds, setTakenIds] = useState(new Set()); // track locally what this user took

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  // Real-time listener from Firestore
  useEffect(() => {
    loadFirebase((firestore) => {
      const unsub = firestore
        .collection(COLLECTION)
        .orderBy("timestamp", "desc")
        .limit(200)
        .onSnapshot(snap => {
          const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          setItems(docs);
          setLoading(false);
        }, err => {
          console.error("Firestore error:", err);
          setLoading(false);
        });
      return unsub;
    });
  }, []);

  const saveToFirestore = async (data) => {
    return new Promise((resolve) => {
      loadFirebase(async (firestore) => {
        try {
          const ref = await firestore.collection(COLLECTION).add(data);
          resolve(ref.id);
        } catch (e) {
          console.error("Save error:", e);
          resolve(null);
        }
      });
    });
  };

  const updateInFirestore = async (id, data) => {
    loadFirebase((firestore) => {
      firestore.collection(COLLECTION).doc(id).update(data).catch(console.error);
    });
  };

  const handleNeedSubmit = async (f) => {
    setForm(null);
    showToast("⏳ Publicando solicitud…");
    const fallback = CITY_COORDS[f.city] || [8.0, -66.0];
    const doc = {
      ...f, type: "need", timestamp: Date.now(), status: "activo",
      lat: fallback[0], lng: fallback[1], responders: 0
    };
    const docId = await saveToFirestore(doc);
    showToast("✅ Solicitud publicada. Ubicando en el mapa…");
    if (f.address && docId) {
      const coords = await geocodeAddress(f.address, f.city);
      if (coords) updateInFirestore(docId, coords);
    }
  };

  const handleVolunteerSubmit = async (f) => {
    setForm(null);
    showToast("⏳ Registrando voluntario…");
    const fallback = CITY_COORDS[f.city] || [8.0, -66.0];
    const doc = {
      ...f, type: "volunteer", timestamp: Date.now(), status: "disponible",
      lat: fallback[0], lng: fallback[1]
    };
    const docId = await saveToFirestore(doc);
    showToast("✅ Te registraste como voluntario. Ubicando en el mapa…");
    if (docId && (f.address || f.city)) {
      const coords = await geocodeAddress(f.address || f.city, f.city);
      if (coords) updateInFirestore(docId, coords);
    }
  };

  const handleAction = (item) => {
    if (item.type === "need") {
      if (takenIds.has(item.id)) {
        showToast("Ya te sumaste a este caso.");
        return;
      }
      setTakenIds(prev => new Set([...prev, item.id]));
      updateInFirestore(item.id, { responders: (item.responders || 0) + 1 });
      showToast(`✅ ¡Gracias! Te sumaste a ayudar a ${item.name}. Contáctalos: ${item.contact}`);
    } else {
      showToast(`📞 Contacta a ${item.name} en: ${item.contact}`);
    }
  };

  const needs = items.filter(i => i.type === "need");
  const volunteers = items.filter(i => i.type === "volunteer");

  const displayed = items.filter(i => {
    if (tab === "necesitan" && i.type !== "need") return false;
    if (tab === "voluntarios" && i.type !== "volunteer") return false;
    if (filter !== "todos" && i.helpType !== filter) return false;
    if (selectedCity !== "Todas" && i.city !== selectedCity) return false;
    return true;
  }).sort((a, b) => {
    const urgOrder = { critico: 0, urgente: 1, necesario: 2 };
    if (a.type === "need" && b.type === "need") {
      return (urgOrder[a.urgency] || 3) - (urgOrder[b.urgency] || 3);
    }
    return b.timestamp - a.timestamp;
  });

  const criticalCount = needs.filter(n => n.urgency === "critico" && n.status === "activo").length;

  return (
    <div style={{ fontFamily: "'Inter', -apple-system, sans-serif", background: "#F8FAFC", minHeight: "100vh", maxWidth: 640, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ background: "#0F172A", padding: "16px 20px 0", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <div>
            <div style={{ color: "#F8FAFC", fontWeight: 800, fontSize: 18, letterSpacing: "-0.02em" }}>
              🇻🇪 Levantando a Venezuela
            </div>
            <div style={{ color: "#94A3B8", fontSize: 12, marginTop: 1 }}>Terremoto · Junio 2026</div>
          </div>
          <div style={{ textAlign: "right" }}>
            {criticalCount > 0 && (
              <div style={{ background: "#DC2626", color: "white", borderRadius: 6, padding: "4px 10px", fontSize: 12, fontWeight: 700 }}>
                ⚠️ {criticalCount} caso{criticalCount > 1 ? "s" : ""} crítico{criticalCount > 1 ? "s" : ""}
              </div>
            )}
            <div style={{ color: "#64748B", fontSize: 11, marginTop: 4 }}>
              {needs.length} solicitudes · {volunteers.length} voluntarios
            </div>
          </div>
        </div>
        {/* Tabs */}
        <div style={{ display: "flex", gap: 0 }}>
          {[
            { id: "todos", label: "Todos" },
            { id: "necesitan", label: `🆘 Necesitan (${needs.length})` },
            { id: "voluntarios", label: `🤝 Voluntarios (${volunteers.length})` },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              flex: 1, padding: "10px 0", border: "none", cursor: "pointer",
              background: "transparent", color: tab === t.id ? "#F8FAFC" : "#64748B",
              fontWeight: tab === t.id ? 700 : 400, fontSize: 13,
              borderBottom: tab === t.id ? "2px solid #3B82F6" : "2px solid transparent"
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: "16px 16px 100px" }}>
        {/* Map */}
        {!form && (
          <div style={{ marginBottom: 16 }}>
            <LeafletMap items={displayed.filter(i => i.lat)} onSelect={setSelectedItem} />
            {selectedItem && (
              <div style={{ background: "white", borderRadius: 8, padding: 12, marginTop: 8, border: "1px solid #E2E8F0" }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#0F172A" }}>{selectedItem.name}</div>
                <div style={{ fontSize: 12, color: "#64748B" }}>{selectedItem.city} · {selectedItem.address || selectedItem.description?.slice(0, 60) + "..."}</div>
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <a href={`tel:${selectedItem.contact}`} style={{ fontSize: 12, color: "#2563EB", fontWeight: 600 }}>📞 {selectedItem.contact}</a>
                  <button onClick={() => setSelectedItem(null)} style={{ fontSize: 12, color: "#94A3B8", background: "none", border: "none", cursor: "pointer" }}>✕ cerrar</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Filter bar */}
        {!form && (
          <div style={{ display: "flex", gap: 8, marginBottom: 14, overflowX: "auto", paddingBottom: 4 }}>
            <select style={{ ...iStyle, marginBottom: 0, flex: "0 0 auto", fontSize: 12, padding: "6px 10px" }}
              value={selectedCity} onChange={e => setSelectedCity(e.target.value)}>
              <option>Todas</option>
              {CITIES.map(c => <option key={c}>{c}</option>)}
            </select>
            <select style={{ ...iStyle, marginBottom: 0, flex: "0 0 auto", fontSize: 12, padding: "6px 10px" }}
              value={filter} onChange={e => setFilter(e.target.value)}>
              <option value="todos">Todo tipo</option>
              {HELP_TYPES.map(h => <option key={h.id} value={h.id}>{h.label}</option>)}
            </select>
          </div>
        )}

        {/* Form */}
        {form === "need" && <NeedForm onSubmit={handleNeedSubmit} onCancel={() => setForm(null)} />}
        {form === "volunteer" && <VolunteerForm onSubmit={handleVolunteerSubmit} onCancel={() => setForm(null)} />}

        {/* List */}
        {!form && (
          <>
            {loading && (
              <div style={{ textAlign: "center", padding: "40px 20px", color: "#94A3B8" }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>⏳</div>
                Conectando con la base de datos…
              </div>
            )}
            {!loading && displayed.length === 0 && (
              <div style={{ textAlign: "center", padding: "40px 20px", color: "#94A3B8" }}>
                No hay publicaciones con estos filtros.
              </div>
            )}
            {displayed.map(item => (
              <Card key={item.id} item={item} onAction={handleAction} isTakenByMe={takenIds.has(item.id)} />
            ))}
          </>
        )}
      </div>

      {/* Bottom CTA */}
      {!form && (
        <div style={{
          position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
          width: "100%", maxWidth: 640, background: "white",
          borderTop: "1px solid #E2E8F0", padding: "12px 16px",
          display: "flex", gap: 10, zIndex: 100
        }}>
          <button onClick={() => setForm("need")} style={{
            flex: 1, padding: "14px", borderRadius: 10, border: "none",
            background: "#DC2626", color: "white", fontWeight: 800, fontSize: 15, cursor: "pointer"
          }}>🆘 Necesito ayuda</button>
          <button onClick={() => setForm("volunteer")} style={{
            flex: 1, padding: "14px", borderRadius: 10, border: "none",
            background: "#059669", color: "white", fontWeight: 800, fontSize: 15, cursor: "pointer"
          }}>🤝 Puedo ayudar</button>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: 80, left: "50%", transform: "translateX(-50%)",
          background: "#0F172A", color: "white", borderRadius: 10,
          padding: "12px 20px", fontSize: 14, fontWeight: 600, zIndex: 200,
          boxShadow: "0 4px 20px rgba(0,0,0,0.3)", maxWidth: 320, textAlign: "center"
        }}>{toast}</div>
      )}

      {/* Footer */}
      <div style={{
        textAlign: "center", padding: "24px 16px 110px",
        color: "#94A3B8", fontSize: 12
      }}>
        Creado con 🤍 por <span style={{ fontWeight: 700, color: "#64748B" }}>Oriana Parisi</span>
      </div>
    </div>
  );
}
