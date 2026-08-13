import { useState, useEffect, useCallback, useRef } from "react";
import {
  Plus,
  MapPin,
  Trash2,
  Pencil,
  X,
  Check,
  ChevronDown,
  ChevronRight,
  Compass,
  Clock,
  ImageOff,
} from "lucide-react";

// Shim for the Claude-artifact `window.storage` API, backed by localStorage,
// so this app works standalone (e.g. running locally via Vite).
if (typeof window !== "undefined" && !window.storage) {
  window.storage = {
    async get(key) {
      const raw = localStorage.getItem(key);
      return raw === null ? null : { key, value: raw, shared: false };
    },
    async set(key, value) {
      localStorage.setItem(key, value);
      return { key, value, shared: false };
    },
    async delete(key) {
      localStorage.removeItem(key);
      return { key, deleted: true, shared: false };
    },
    async list(prefix = "") {
      const keys = Object.keys(localStorage).filter((k) => k.startsWith(prefix));
      return { keys, prefix, shared: false };
    },
  };
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// Looks up a free, no-key-required representative photo for a place name via
// Wikipedia's public search API. Returns a thumbnail URL, or null if nothing
// suitable was found (the caller falls back to a styled placeholder).
async function fetchPlaceImage(query) {
  if (!query || !query.trim()) return null;
  try {
    const url =
      "https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=" +
      encodeURIComponent(query) +
      "&gsrlimit=1&gsrnamespace=0&prop=pageimages&piprop=thumbnail&pithumbsize=900&format=json&origin=*";
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const pages = data && data.query && data.query.pages;
    if (!pages) return null;
    const page = Object.values(pages)[0];
    return (page && page.thumbnail && page.thumbnail.source) || null;
  } catch (e) {
    return null;
  }
}

function formatShort(d) {
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00");
  if (Number.isNaN(dt.getTime())) return "—";
  const day = dt.getDate();
  const mon = dt.toLocaleString("en-US", { month: "short" }).toUpperCase();
  return `${day} ${mon}`;
}

function formatRange(s, e) {
  if (!s && !e) return "Dates TBD";
  if (s && e) return `${formatShort(s)} – ${formatShort(e)}`;
  return formatShort(s || e);
}

function formatTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

function makeSeedTrip() {
  const dest = (name, startDate, endDate, activities) => ({
    id: uid(),
    name,
    startDate,
    endDate,
    activities: activities.map(([name, date, time, notes]) => ({ id: uid(), name, date, time, notes })),
  });

  return {
    id: uid(),
    name: "Goa",
    startDate: "2026-11-20",
    endDate: "2026-11-24",
    notes: "Coastal getaway — forts, beaches, and long dinners.",
    destinations: [
      dest("Panaji", "2026-11-20", "2026-11-21", [
        ["City sightseeing", "2026-11-20", "10:00", "Walk through the Latin Quarter and riverfront promenade."],
      ]),
      dest("Baga Beach", "2026-11-21", "2026-11-22", [
        ["Swimming", "2026-11-21", "09:00", ""],
        ["Water sports", "2026-11-21", "11:30", "Jet ski and parasailing at the beach shacks."],
      ]),
      dest("Fort Aguada", "2026-11-22", "2026-11-23", [
        ["Fort visit", "2026-11-22", "16:00", "Explore the 17th-century Portuguese fort and lighthouse."],
        ["Photography", "2026-11-22", "17:30", "Sunset shots over the Arabian Sea from the ramparts."],
      ]),
      dest("Goa", "2026-11-23", "2026-11-24", [
        ["Dinner / restaurant visit", "2026-11-23", "20:00", "Seafood dinner by the water to close out the trip."],
      ]),
    ],
  };
}

export default function TripPlanner() {
  const [trips, setTrips] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const [showNewTrip, setShowNewTrip] = useState(false);
  const [newTrip, setNewTrip] = useState({ name: "", startDate: "", endDate: "", notes: "" });

  const [editingTrip, setEditingTrip] = useState(false);
  const [tripDraft, setTripDraft] = useState(null);

  const [showNewDest, setShowNewDest] = useState(false);
  const [newDest, setNewDest] = useState({ name: "", startDate: "", endDate: "" });
  const [editingDestId, setEditingDestId] = useState(null);
  const [destDraft, setDestDraft] = useState(null);

  const [addingActivityFor, setAddingActivityFor] = useState(null);
  const [newActivity, setNewActivity] = useState({ name: "", date: "", time: "", notes: "" });
  const [editingActivity, setEditingActivity] = useState(null);
  const [activityDraft, setActivityDraft] = useState(null);

  const [collapsedDest, setCollapsedDest] = useState({});
  const [confirmDeleteTrip, setConfirmDeleteTrip] = useState(null);
  const [confirmDeleteDest, setConfirmDeleteDest] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get("trips", false);
        if (res && res.value) {
          const parsed = JSON.parse(res.value);
          if (parsed && parsed.length > 0) {
            setTrips(parsed);
            setLoaded(true);
            return;
          }
        }
        // No trips saved yet — seed with an example so the app isn't empty on first open.
        const seeded = [makeSeedTrip()];
        setTrips(seeded);
        try {
          await window.storage.set("trips", JSON.stringify(seeded), false);
        } catch (e) {
          // ignore — seed will still show for this session
        }
      } catch (e) {
        // no saved trips yet — seed with an example
        const seeded = [makeSeedTrip()];
        setTrips(seeded);
        try {
          await window.storage.set("trips", JSON.stringify(seeded), false);
        } catch (err) {
          // ignore
        }
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const persist = useCallback(async (next) => {
    setTrips(next);
    try {
      const result = await window.storage.set("trips", JSON.stringify(next), false);
      if (!result) setSaveError("Your last change may not have saved.");
      else setSaveError(null);
    } catch (e) {
      setSaveError("Your last change may not have saved.");
    }
  }, []);

  // Tracks which trip/destination ids currently have an image fetch in
  // flight, so the effect below never fires two requests for the same item.
  const fetchingImages = useRef(new Set());

  // Whenever a trip or destination doesn't have an `image` field yet
  // (undefined = never tried), look one up automatically. Result is cached
  // on the item itself (null = tried, nothing found) and persisted, so it
  // only ever fetches once per place.
  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;

    async function run() {
      for (const trip of trips) {
        const tripKey = "trip:" + trip.id;
        if (trip.image === undefined && !fetchingImages.current.has(tripKey)) {
          fetchingImages.current.add(tripKey);
          const url = await fetchPlaceImage(trip.name);
          fetchingImages.current.delete(tripKey);
          if (cancelled) return;
          setTrips((prev) => {
            const next = prev.map((t) => (t.id === trip.id ? { ...t, image: url } : t));
            window.storage.set("trips", JSON.stringify(next), false).catch(() => {});
            return next;
          });
        }
        for (const dest of trip.destinations) {
          const destKey = "dest:" + dest.id;
          if (dest.image === undefined && !fetchingImages.current.has(destKey)) {
            fetchingImages.current.add(destKey);
            const url = await fetchPlaceImage(dest.name);
            fetchingImages.current.delete(destKey);
            if (cancelled) return;
            setTrips((prev) => {
              const next = prev.map((t) =>
                t.id === trip.id
                  ? { ...t, destinations: t.destinations.map((d) => (d.id === dest.id ? { ...d, image: url } : d)) }
                  : t
              );
              window.storage.set("trips", JSON.stringify(next), false).catch(() => {});
              return next;
            });
          }
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [trips, loaded]);

  const selected = trips.find((t) => t.id === selectedId) || null;

  function updateTrip(tripId, fn) {
    const next = trips.map((t) => (t.id === tripId ? fn(t) : t));
    persist(next);
  }

  // ---- Trip CRUD ----
  function createTrip() {
    if (!newTrip.name.trim()) return;
    const trip = {
      id: uid(),
      name: newTrip.name.trim(),
      startDate: newTrip.startDate,
      endDate: newTrip.endDate,
      notes: newTrip.notes.trim(),
      destinations: [],
    };
    const next = [trip, ...trips];
    persist(next);
    setSelectedId(trip.id);
    setNewTrip({ name: "", startDate: "", endDate: "", notes: "" });
    setShowNewTrip(false);
  }

  function startEditTrip() {
    setTripDraft({ ...selected });
    setEditingTrip(true);
  }

  function saveTripEdit() {
    if (!tripDraft.name.trim()) return;
    updateTrip(selected.id, () => ({ ...tripDraft, name: tripDraft.name.trim() }));
    setEditingTrip(false);
    setTripDraft(null);
  }

  function deleteTrip(id) {
    const next = trips.filter((t) => t.id !== id);
    persist(next);
    if (selectedId === id) setSelectedId(null);
    setConfirmDeleteTrip(null);
  }

  // ---- Destination CRUD ----
  function addDestination() {
    if (!newDest.name.trim()) return;
    const dest = { id: uid(), name: newDest.name.trim(), startDate: newDest.startDate, endDate: newDest.endDate, activities: [] };
    updateTrip(selected.id, (t) => ({ ...t, destinations: [...t.destinations, dest] }));
    setNewDest({ name: "", startDate: "", endDate: "" });
    setShowNewDest(false);
  }

  function startEditDest(dest) {
    setDestDraft({ ...dest });
    setEditingDestId(dest.id);
  }

  function saveDestEdit() {
    if (!destDraft.name.trim()) return;
    updateTrip(selected.id, (t) => ({
      ...t,
      destinations: t.destinations.map((d) => (d.id === destDraft.id ? { ...destDraft, name: destDraft.name.trim() } : d)),
    }));
    setEditingDestId(null);
    setDestDraft(null);
  }

  function deleteDestination(destId) {
    updateTrip(selected.id, (t) => ({ ...t, destinations: t.destinations.filter((d) => d.id !== destId) }));
    setConfirmDeleteDest(null);
  }

  // ---- Activity CRUD ----
  function addActivity(destId) {
    if (!newActivity.name.trim()) return;
    const activity = { id: uid(), ...newActivity, name: newActivity.name.trim() };
    updateTrip(selected.id, (t) => ({
      ...t,
      destinations: t.destinations.map((d) => (d.id === destId ? { ...d, activities: [...d.activities, activity] } : d)),
    }));
    setNewActivity({ name: "", date: "", time: "", notes: "" });
    setAddingActivityFor(null);
  }

  function startEditActivity(destId, activity) {
    setActivityDraft({ ...activity });
    setEditingActivity({ destId, actId: activity.id });
  }

  function saveActivityEdit() {
    if (!activityDraft.name.trim()) return;
    const { destId, actId } = editingActivity;
    updateTrip(selected.id, (t) => ({
      ...t,
      destinations: t.destinations.map((d) =>
        d.id === destId
          ? { ...d, activities: d.activities.map((a) => (a.id === actId ? { ...activityDraft, name: activityDraft.name.trim() } : a)) }
          : d
      ),
    }));
    setEditingActivity(null);
    setActivityDraft(null);
  }

  function deleteActivity(destId, actId) {
    updateTrip(selected.id, (t) => ({
      ...t,
      destinations: t.destinations.map((d) => (d.id === destId ? { ...d, activities: d.activities.filter((a) => a.id !== actId) } : d)),
    }));
  }

  function sortedActivities(activities) {
    return [...activities].sort((a, b) => {
      const da = a.date || "9999", db = b.date || "9999";
      if (da !== db) return da.localeCompare(db);
      return (a.time || "99:99").localeCompare(b.time || "99:99");
    });
  }

  return (
    <div className="tp-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;0,9..144,700;1,9..144,500&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');

        .tp-root {
          --ink: #1B2A4A;
          --ink-soft: #4A5A78;
          --paper: #FAF6ED;
          --paper-alt: #F0E8D4;
          --paper-card: #FFFDF7;
          --gold: #D98F2B;
          --gold-soft: #F3DBA8;
          --teal: #3F7268;
          --teal-soft: #DCEAE5;
          --rust: #BB4A2C;
          --line: #D8CDB0;
          font-family: 'Inter', sans-serif;
          background:
            radial-gradient(circle at 0% 0%, rgba(217,143,43,0.07), transparent 40%),
            radial-gradient(circle at 100% 15%, rgba(63,114,104,0.08), transparent 45%),
            var(--paper);
          color: var(--ink);
          min-height: 100vh;
          width: 100%;
          box-sizing: border-box;
        }
        .tp-root * { box-sizing: border-box; }

        .tp-header {
          padding: 28px 32px 20px;
          border-bottom: 1px solid var(--line);
          display: flex;
          align-items: baseline;
          gap: 14px;
          flex-wrap: wrap;
        }
        .tp-logo {
          font-family: 'Fraunces', serif;
          font-weight: 700;
          font-size: 28px;
          letter-spacing: -0.01em;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .tp-tagline {
          font-size: 13px;
          color: var(--ink-soft);
          font-style: italic;
          font-family: 'Fraunces', serif;
        }

        .tp-shell {
          display: flex;
          gap: 0;
          align-items: flex-start;
        }

        .tp-sidebar {
          width: 300px;
          flex-shrink: 0;
          padding: 24px 18px;
          border-right: 1px dashed var(--line);
          min-height: calc(100vh - 90px);
        }

        .tp-newbtn {
          width: 100%;
          background: var(--ink);
          color: var(--paper);
          border: none;
          border-radius: 8px;
          padding: 12px 14px;
          font-family: 'Inter', sans-serif;
          font-weight: 600;
          font-size: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          cursor: pointer;
          transition: transform 0.12s ease, background 0.15s ease;
        }
        .tp-newbtn:hover { background: #263A61; transform: translateY(-1px); }

        .tp-stub {
          position: relative;
          background: var(--paper-card);
          border: 1px solid var(--line);
          border-radius: 10px;
          padding: 14px 14px 12px;
          margin-top: 14px;
          cursor: pointer;
          transition: box-shadow 0.15s ease, transform 0.12s ease, border-color 0.15s ease;
        }
        .tp-stub:hover { transform: translateY(-2px); box-shadow: 0 6px 16px rgba(27,42,74,0.10); }
        .tp-stub.active { border-color: var(--gold); box-shadow: 0 6px 18px rgba(217,143,43,0.22); }
        .tp-stub { animation: tp-fade-in 0.3s ease; }
        .tp-stub-name {
          font-family: 'Fraunces', serif;
          font-weight: 600;
          font-size: 17px;
          margin: 0 0 6px;
          padding-right: 54px;
          line-height: 1.25;
        }
        .tp-stub-dates {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11px;
          color: var(--ink-soft);
          letter-spacing: 0.03em;
        }
        .tp-stub-count {
          font-size: 11px;
          color: var(--teal);
          margin-top: 6px;
          font-weight: 600;
        }
        .tp-stamp {
          position: absolute;
          top: 12px;
          right: 12px;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          border: 1.5px dashed var(--gold);
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 9px;
          font-weight: 600;
          color: var(--gold);
          text-align: center;
          line-height: 1.1;
        }

        .tp-empty-side {
          margin-top: 20px;
          font-size: 13px;
          color: var(--ink-soft);
          text-align: center;
          padding: 20px 10px;
        }

        .tp-form {
          background: var(--paper-card);
          border: 1px solid var(--line);
          border-radius: 10px;
          padding: 14px;
          margin-top: 14px;
        }
        .tp-form-title {
          font-family: 'Fraunces', serif;
          font-weight: 600;
          font-size: 14px;
          margin-bottom: 10px;
        }
        .tp-input, .tp-textarea {
          width: 100%;
          border: 1px solid var(--line);
          border-radius: 6px;
          padding: 8px 10px;
          font-family: 'Inter', sans-serif;
          font-size: 13px;
          margin-bottom: 8px;
          background: var(--paper);
          color: var(--ink);
        }
        .tp-input:focus, .tp-textarea:focus, .tp-input:focus-visible {
          outline: 2px solid var(--gold);
          outline-offset: 1px;
        }
        .tp-textarea { resize: vertical; min-height: 50px; font-family: 'Inter', sans-serif; }
        .tp-row2 { display: flex; gap: 8px; }
        .tp-row2 .tp-input { flex: 1; }
        .tp-label { font-size: 11px; color: var(--ink-soft); font-weight: 600; margin-bottom: 3px; display: block; text-transform: uppercase; letter-spacing: 0.04em; }

        .tp-formbtns { display: flex; gap: 8px; margin-top: 4px; }
        .tp-btn {
          border: none;
          border-radius: 6px;
          padding: 8px 14px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          font-family: 'Inter', sans-serif;
          transition: opacity 0.15s ease;
        }
        .tp-btn:hover { opacity: 0.85; }
        .tp-btn-primary { background: var(--teal); color: white; }
        .tp-btn-ghost { background: transparent; color: var(--ink-soft); border: 1px solid var(--line); }
        .tp-btn-danger { background: var(--rust); color: white; }
        .tp-btn-gold { background: var(--gold); color: white; }

        .tp-detail { flex: 1; padding: 32px 40px; min-width: 0; }

        .tp-empty-main {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 80px 20px;
          color: var(--ink-soft);
        }
        .tp-empty-main h2 {
          font-family: 'Fraunces', serif;
          font-size: 24px;
          color: var(--ink);
          margin: 14px 0 6px;
        }

        .tp-trip-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 20px;
          padding-bottom: 22px;
          border-bottom: 2px solid var(--ink);
          margin-bottom: 24px;
        }
        .tp-trip-name {
          font-family: 'Fraunces', serif;
          font-weight: 700;
          font-size: 34px;
          margin: 0 0 8px;
          letter-spacing: -0.01em;
        }
        .tp-trip-range {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 12px;
          background: var(--teal-soft);
          color: var(--teal);
          padding: 5px 10px;
          border-radius: 20px;
          font-weight: 600;
        }
        .tp-trip-notes {
          margin-top: 12px;
          font-size: 14px;
          color: var(--ink-soft);
          max-width: 60ch;
          line-height: 1.55;
        }
        .tp-headbtns { display: flex; gap: 8px; flex-shrink: 0; }
        .tp-iconbtn {
          background: transparent;
          border: 1px solid var(--line);
          border-radius: 6px;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          color: var(--ink-soft);
          transition: all 0.15s ease;
        }
        .tp-iconbtn:hover { border-color: var(--ink); color: var(--ink); }
        .tp-iconbtn.danger:hover { border-color: var(--rust); color: var(--rust); }

        .tp-perforation {
          border: none;
          border-top: 2px dashed var(--line);
          margin: 28px 0;
          position: relative;
        }

        .tp-dest {
          background: var(--paper-card);
          border: 1px solid var(--line);
          border-radius: 12px;
          padding: 18px 20px;
          margin-bottom: 18px;
          animation: tp-fade-in 0.3s ease;
        }
        .tp-dest-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          cursor: pointer;
        }
        .tp-dest-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-family: 'Fraunces', serif;
          font-weight: 600;
          font-size: 19px;
        }
        .tp-dest-dates {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11px;
          color: var(--ink-soft);
          margin-left: 26px;
          margin-top: 2px;
        }
        .tp-dest-actions { display: flex; gap: 6px; align-items: center; }

        .tp-activities { margin-top: 14px; padding-left: 26px; }
        .tp-activity {
          display: flex;
          gap: 12px;
          padding: 10px 0;
          border-top: 1px solid var(--paper-alt);
        }
        .tp-activity:first-child { border-top: none; }
        .tp-act-time {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11px;
          color: var(--gold);
          font-weight: 600;
          width: 68px;
          flex-shrink: 0;
          padding-top: 2px;
        }
        .tp-act-body { flex: 1; min-width: 0; }
        .tp-act-name { font-weight: 600; font-size: 14px; }
        .tp-act-date { font-family: 'IBM Plex Mono', monospace; font-size: 10px; color: var(--ink-soft); margin-left: 8px; }
        .tp-act-notes { font-size: 12.5px; color: var(--ink-soft); margin-top: 3px; line-height: 1.4; }
        .tp-act-actions { display: flex; gap: 4px; flex-shrink: 0; }

        .tp-add-inline {
          margin-left: 26px;
          margin-top: 10px;
          background: transparent;
          border: 1px dashed var(--line);
          color: var(--ink-soft);
          border-radius: 8px;
          padding: 8px 12px;
          font-size: 12.5px;
          font-weight: 600;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .tp-add-inline:hover { border-color: var(--gold); color: var(--gold); }

        .tp-dest-empty { font-size: 12.5px; color: var(--ink-soft); margin-top: 10px; padding-left: 26px; font-style: italic; }

        .tp-confirm {
          background: #FBEAE3;
          border: 1px solid var(--rust);
          border-radius: 8px;
          padding: 10px 12px;
          margin-top: 10px;
          font-size: 12.5px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          color: #7A2E17;
        }

        .tp-save-error {
          font-size: 12px;
          color: var(--rust);
          padding: 6px 32px 0;
        }

        @keyframes tp-shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes tp-fade-in {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .tp-img-skeleton {
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, var(--paper-alt) 25%, #fff 50%, var(--paper-alt) 75%);
          background-size: 200% 100%;
          animation: tp-shimmer 1.4s ease-in-out infinite;
        }
        .tp-img-fallback {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          background:
            radial-gradient(circle at 30% 20%, rgba(217,143,43,0.35), transparent 55%),
            radial-gradient(circle at 75% 75%, rgba(63,114,104,0.4), transparent 55%),
            var(--ink);
          color: var(--gold-soft);
        }

        /* ---- Sidebar trip stub (postcard style) ---- */
        .tp-stub { padding: 0; overflow: hidden; }
        .tp-stub-media {
          position: relative;
          width: 100%;
          height: 92px;
          overflow: hidden;
          background: var(--paper-alt);
        }
        .tp-stub-media img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
          transition: transform 0.35s ease;
        }
        .tp-stub:hover .tp-stub-media img { transform: scale(1.06); }
        .tp-stub-media::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, rgba(27,42,74,0) 55%, rgba(27,42,74,0.55) 100%);
        }
        .tp-stub-body { padding: 12px 14px 12px; }
        .tp-stub-name { padding-right: 0; }
        .tp-stamp {
          top: auto;
          bottom: 8px;
          right: 10px;
          background: rgba(250,246,237,0.92);
          z-index: 1;
        }

        /* ---- Trip hero banner ---- */
        .tp-hero.tp-trip-head {
          border-bottom: none;
          padding-bottom: 0;
        }
        .tp-hero {
          position: relative;
          border-radius: 14px;
          overflow: hidden;
          margin-bottom: 24px;
          min-height: 200px;
          display: flex;
          align-items: flex-end;
          animation: tp-fade-in 0.35s ease;
        }
        .tp-hero-media {
          position: absolute;
          inset: 0;
        }
        .tp-hero-media img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .tp-hero-media::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, rgba(27,42,74,0.08) 0%, rgba(27,42,74,0.55) 65%, rgba(27,42,74,0.86) 100%);
        }
        .tp-hero-content {
          position: relative;
          width: 100%;
          padding: 22px 24px 20px;
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 20px;
          color: #fff;
        }
        .tp-hero .tp-trip-name { color: #fff; }
        .tp-hero .tp-trip-range { background: rgba(250,246,237,0.16); color: #fff; backdrop-filter: blur(2px); }
        .tp-hero .tp-trip-notes { color: rgba(255,255,255,0.85); }
        .tp-hero .tp-iconbtn { border-color: rgba(255,255,255,0.4); color: rgba(255,255,255,0.9); }
        .tp-hero .tp-iconbtn:hover { border-color: #fff; color: #fff; }
        .tp-hero-credit {
          position: absolute;
          bottom: 8px;
          right: 12px;
          font-size: 10px;
          color: rgba(255,255,255,0.55);
          font-family: 'IBM Plex Mono', monospace;
          letter-spacing: 0.02em;
        }

        /* ---- Destination thumbnail ---- */
        .tp-dest-row { display: flex; gap: 14px; align-items: flex-start; }
        .tp-dest-thumb {
          width: 64px;
          height: 64px;
          border-radius: 10px;
          overflow: hidden;
          flex-shrink: 0;
          background: var(--paper-alt);
        }
        .tp-dest-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }

        @media (max-width: 760px) {
          .tp-shell { flex-direction: column; }
          .tp-sidebar { width: 100%; border-right: none; border-bottom: 1px dashed var(--line); }
          .tp-detail { padding: 24px 18px; }
          .tp-trip-name { font-size: 26px; }
        }
      `}</style>

      <div className="tp-header">
        <div className="tp-logo">
          <Compass size={26} strokeWidth={2.2} color="var(--gold)" />
          Waypoint
        </div>
        <div className="tp-tagline">Plan the roads, remember the reasons.</div>
      </div>

      {saveError && <div className="tp-save-error">{saveError}</div>}

      <div className="tp-shell">
        <aside className="tp-sidebar">
          <button className="tp-newbtn" onClick={() => setShowNewTrip((v) => !v)}>
            <Plus size={16} /> New trip
          </button>

          {showNewTrip && (
            <div className="tp-form">
              <div className="tp-form-title">Start a new trip</div>
              <label className="tp-label" htmlFor="tp-new-name">Trip name</label>
              <input id="tp-new-name" className="tp-input" placeholder="e.g. Kerala Backwaters" value={newTrip.name} onChange={(e) => setNewTrip({ ...newTrip, name: e.target.value })} autoFocus />
              <div className="tp-row2">
                <div style={{ flex: 1 }}>
                  <label className="tp-label">Start date</label>
                  <input type="date" className="tp-input" value={newTrip.startDate} onChange={(e) => setNewTrip({ ...newTrip, startDate: e.target.value })} />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="tp-label">End date</label>
                  <input type="date" className="tp-input" value={newTrip.endDate} onChange={(e) => setNewTrip({ ...newTrip, endDate: e.target.value })} />
                </div>
              </div>
              <label className="tp-label">Notes</label>
              <textarea className="tp-textarea" placeholder="Why this trip, what to remember..." value={newTrip.notes} onChange={(e) => setNewTrip({ ...newTrip, notes: e.target.value })} />
              <div className="tp-formbtns">
                <button className="tp-btn tp-btn-primary" onClick={createTrip}><Check size={14} /> Create</button>
                <button className="tp-btn tp-btn-ghost" onClick={() => { setShowNewTrip(false); setNewTrip({ name: "", startDate: "", endDate: "", notes: "" }); }}><X size={14} /> Cancel</button>
              </div>
            </div>
          )}

          {loaded && trips.length === 0 && !showNewTrip && (
            <div className="tp-empty-side">No trips yet. Create your first one above.</div>
          )}

          {trips.map((t) => (
            <div key={t.id} className={`tp-stub ${t.id === selectedId ? "active" : ""}`} onClick={() => { setSelectedId(t.id); setEditingTrip(false); }}>
              <div className="tp-stub-media">
                {t.image === undefined && <div className="tp-img-skeleton" />}
                {t.image === null && (
                  <div className="tp-img-fallback"><Compass size={22} /></div>
                )}
                {t.image && <img src={t.image} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = "none"; }} />}
                <div className="tp-stamp">{formatShort(t.startDate).split(" ")[0] || "TBD"}<br />{formatShort(t.startDate).split(" ")[1] || ""}</div>
              </div>
              <div className="tp-stub-body">
                <div className="tp-stub-name">{t.name}</div>
                <div className="tp-stub-dates">{formatRange(t.startDate, t.endDate)}</div>
                <div className="tp-stub-count">{t.destinations.length} destination{t.destinations.length !== 1 ? "s" : ""}</div>
              </div>
            </div>
          ))}
        </aside>

        <main className="tp-detail">
          {!selected && (
            <div className="tp-empty-main">
              <Compass size={40} color="var(--gold)" />
              <h2>No trip selected</h2>
              <p>Pick a trip on the left, or start a new one — every good journey starts with a blank itinerary.</p>
            </div>
          )}

          {selected && !editingTrip && (
            <>
              <div className="tp-hero tp-trip-head">
                <div className="tp-hero-media">
                  {selected.image === undefined && <div className="tp-img-skeleton" />}
                  {selected.image === null && (
                    <div className="tp-img-fallback"><Compass size={44} /></div>
                  )}
                  {selected.image && (
                    <img src={selected.image} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                  )}
                </div>
                <div className="tp-hero-content">
                  <div>
                    <h1 className="tp-trip-name">{selected.name}</h1>
                    <span className="tp-trip-range">{formatRange(selected.startDate, selected.endDate)}</span>
                    {selected.notes && <div className="tp-trip-notes">{selected.notes}</div>}
                  </div>
                  <div className="tp-headbtns">
                    <button className="tp-iconbtn" title="Edit trip" onClick={startEditTrip}><Pencil size={15} /></button>
                    <button className="tp-iconbtn danger" title="Delete trip" onClick={() => setConfirmDeleteTrip(selected.id)}><Trash2 size={15} /></button>
                  </div>
                </div>
                {selected.image && <div className="tp-hero-credit">Photo via Wikipedia</div>}
              </div>

              {confirmDeleteTrip === selected.id && (
                <div className="tp-confirm">
                  <span>Delete "{selected.name}" and all its destinations? This can't be undone.</span>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button className="tp-btn tp-btn-danger" onClick={() => deleteTrip(selected.id)}>Delete</button>
                    <button className="tp-btn tp-btn-ghost" onClick={() => setConfirmDeleteTrip(null)}>Cancel</button>
                  </div>
                </div>
              )}

              {selected.destinations.length === 0 && (
                <p className="tp-dest-empty" style={{ paddingLeft: 0, marginBottom: 18 }}>No destinations yet — where are you headed first?</p>
              )}

              {selected.destinations.map((d, i) => (
                <div key={d.id}>
                  {i > 0 && <hr className="tp-perforation" />}
                  <div className="tp-dest">
                    {editingDestId === d.id ? (
                      <div>
                        <label className="tp-label">Destination name</label>
                        <input className="tp-input" value={destDraft.name} onChange={(e) => setDestDraft({ ...destDraft, name: e.target.value })} autoFocus />
                        <div className="tp-row2">
                          <div style={{ flex: 1 }}>
                            <label className="tp-label">Arrive</label>
                            <input type="date" className="tp-input" value={destDraft.startDate} onChange={(e) => setDestDraft({ ...destDraft, startDate: e.target.value })} />
                          </div>
                          <div style={{ flex: 1 }}>
                            <label className="tp-label">Depart</label>
                            <input type="date" className="tp-input" value={destDraft.endDate} onChange={(e) => setDestDraft({ ...destDraft, endDate: e.target.value })} />
                          </div>
                        </div>
                        <div className="tp-formbtns">
                          <button className="tp-btn tp-btn-primary" onClick={saveDestEdit}><Check size={14} /> Save</button>
                          <button className="tp-btn tp-btn-ghost" onClick={() => { setEditingDestId(null); setDestDraft(null); }}><X size={14} /> Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="tp-dest-head tp-dest-row" onClick={() => setCollapsedDest({ ...collapsedDest, [d.id]: !collapsedDest[d.id] })}>
                          <div className="tp-dest-thumb">
                            {d.image === undefined && <div className="tp-img-skeleton" />}
                            {d.image === null && (
                              <div className="tp-img-fallback"><ImageOff size={18} /></div>
                            )}
                            {d.image && <img src={d.image} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = "none"; }} />}
                          </div>
                          <div style={{ flex: 1, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                            <div>
                              <div className="tp-dest-title">
                                {collapsedDest[d.id] ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                                <MapPin size={17} color="var(--rust)" />
                                {d.name}
                              </div>
                              <div className="tp-dest-dates">{formatRange(d.startDate, d.endDate)}</div>
                            </div>
                            <div className="tp-dest-actions" onClick={(e) => e.stopPropagation()}>
                              <button className="tp-iconbtn" title="Edit destination" onClick={() => startEditDest(d)}><Pencil size={14} /></button>
                              <button className="tp-iconbtn danger" title="Delete destination" onClick={() => setConfirmDeleteDest(d.id)}><Trash2 size={14} /></button>
                            </div>
                          </div>
                        </div>

                        {confirmDeleteDest === d.id && (
                          <div className="tp-confirm">
                            <span>Remove "{d.name}" and its activities?</span>
                            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                              <button className="tp-btn tp-btn-danger" onClick={() => deleteDestination(d.id)}>Delete</button>
                              <button className="tp-btn tp-btn-ghost" onClick={() => setConfirmDeleteDest(null)}>Cancel</button>
                            </div>
                          </div>
                        )}

                        {!collapsedDest[d.id] && (
                          <>
                            {d.activities.length > 0 && (
                              <div className="tp-activities">
                                {sortedActivities(d.activities).map((a) =>
                                  editingActivity && editingActivity.destId === d.id && editingActivity.actId === a.id ? (
                                    <div key={a.id} style={{ padding: "10px 0" }}>
                                      <input className="tp-input" value={activityDraft.name} onChange={(e) => setActivityDraft({ ...activityDraft, name: e.target.value })} placeholder="Activity" autoFocus />
                                      <div className="tp-row2">
                                        <input type="date" className="tp-input" value={activityDraft.date} onChange={(e) => setActivityDraft({ ...activityDraft, date: e.target.value })} />
                                        <input type="time" className="tp-input" value={activityDraft.time} onChange={(e) => setActivityDraft({ ...activityDraft, time: e.target.value })} />
                                      </div>
                                      <textarea className="tp-textarea" placeholder="Notes" value={activityDraft.notes} onChange={(e) => setActivityDraft({ ...activityDraft, notes: e.target.value })} />
                                      <div className="tp-formbtns">
                                        <button className="tp-btn tp-btn-primary" onClick={saveActivityEdit}><Check size={14} /> Save</button>
                                        <button className="tp-btn tp-btn-ghost" onClick={() => { setEditingActivity(null); setActivityDraft(null); }}><X size={14} /> Cancel</button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="tp-activity" key={a.id}>
                                      <div className="tp-act-time">{a.time ? formatTime(a.time) : <Clock size={13} />}</div>
                                      <div className="tp-act-body">
                                        <span className="tp-act-name">{a.name}</span>
                                        {a.date && <span className="tp-act-date">{formatShort(a.date)}</span>}
                                        {a.notes && <div className="tp-act-notes">{a.notes}</div>}
                                      </div>
                                      <div className="tp-act-actions">
                                        <button className="tp-iconbtn" title="Edit activity" onClick={() => startEditActivity(d.id, a)}><Pencil size={13} /></button>
                                        <button className="tp-iconbtn danger" title="Delete activity" onClick={() => deleteActivity(d.id, a.id)}><Trash2 size={13} /></button>
                                      </div>
                                    </div>
                                  )
                                )}
                              </div>
                            )}
                            {d.activities.length === 0 && addingActivityFor !== d.id && (
                              <div className="tp-dest-empty">No activities planned here yet.</div>
                            )}

                            {addingActivityFor === d.id ? (
                              <div style={{ marginLeft: 26, marginTop: 10 }}>
                                <input className="tp-input" placeholder="Activity name" value={newActivity.name} onChange={(e) => setNewActivity({ ...newActivity, name: e.target.value })} autoFocus />
                                <div className="tp-row2">
                                  <input type="date" className="tp-input" value={newActivity.date} onChange={(e) => setNewActivity({ ...newActivity, date: e.target.value })} />
                                  <input type="time" className="tp-input" value={newActivity.time} onChange={(e) => setNewActivity({ ...newActivity, time: e.target.value })} />
                                </div>
                                <textarea className="tp-textarea" placeholder="Notes (optional)" value={newActivity.notes} onChange={(e) => setNewActivity({ ...newActivity, notes: e.target.value })} />
                                <div className="tp-formbtns">
                                  <button className="tp-btn tp-btn-primary" onClick={() => addActivity(d.id)}><Check size={14} /> Add activity</button>
                                  <button className="tp-btn tp-btn-ghost" onClick={() => { setAddingActivityFor(null); setNewActivity({ name: "", date: "", time: "", notes: "" }); }}><X size={14} /> Cancel</button>
                                </div>
                              </div>
                            ) : (
                              <button className="tp-add-inline" onClick={() => setAddingActivityFor(d.id)}>
                                <Plus size={13} /> Add activity
                              </button>
                            )}
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}

              {showNewDest ? (
                <div className="tp-form" style={{ marginTop: selected.destinations.length ? 0 : 4 }}>
                  <div className="tp-form-title">Add a destination</div>
                  <input className="tp-input" placeholder="e.g. Alleppey" value={newDest.name} onChange={(e) => setNewDest({ ...newDest, name: e.target.value })} autoFocus />
                  <div className="tp-row2">
                    <div style={{ flex: 1 }}>
                      <label className="tp-label">Arrive</label>
                      <input type="date" className="tp-input" value={newDest.startDate} onChange={(e) => setNewDest({ ...newDest, startDate: e.target.value })} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label className="tp-label">Depart</label>
                      <input type="date" className="tp-input" value={newDest.endDate} onChange={(e) => setNewDest({ ...newDest, endDate: e.target.value })} />
                    </div>
                  </div>
                  <div className="tp-formbtns">
                    <button className="tp-btn tp-btn-primary" onClick={addDestination}><Check size={14} /> Add</button>
                    <button className="tp-btn tp-btn-ghost" onClick={() => { setShowNewDest(false); setNewDest({ name: "", startDate: "", endDate: "" }); }}><X size={14} /> Cancel</button>
                  </div>
                </div>
              ) : (
                <button className="tp-btn tp-btn-gold" style={{ marginTop: 8 }} onClick={() => setShowNewDest(true)}>
                  <Plus size={14} /> Add destination
                </button>
              )}
            </>
          )}

          {selected && editingTrip && tripDraft && (
            <div className="tp-form" style={{ maxWidth: 480 }}>
              <div className="tp-form-title">Edit trip</div>
              <label className="tp-label">Trip name</label>
              <input className="tp-input" value={tripDraft.name} onChange={(e) => setTripDraft({ ...tripDraft, name: e.target.value })} autoFocus />
              <div className="tp-row2">
                <div style={{ flex: 1 }}>
                  <label className="tp-label">Start date</label>
                  <input type="date" className="tp-input" value={tripDraft.startDate} onChange={(e) => setTripDraft({ ...tripDraft, startDate: e.target.value })} />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="tp-label">End date</label>
                  <input type="date" className="tp-input" value={tripDraft.endDate} onChange={(e) => setTripDraft({ ...tripDraft, endDate: e.target.value })} />
                </div>
              </div>
              <label className="tp-label">Notes</label>
              <textarea className="tp-textarea" value={tripDraft.notes} onChange={(e) => setTripDraft({ ...tripDraft, notes: e.target.value })} />
              <div className="tp-formbtns">
                <button className="tp-btn tp-btn-primary" onClick={saveTripEdit}><Check size={14} /> Save changes</button>
                <button className="tp-btn tp-btn-ghost" onClick={() => { setEditingTrip(false); setTripDraft(null); }}><X size={14} /> Cancel</button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
