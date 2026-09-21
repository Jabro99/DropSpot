// State


const ZOOM_LEVELS = [5,8,10,12,16,18,20];
const ZOOM_RADIUS_MILES = [220, 150, 90, 35, 12, 3, 0.75];
const LOCATION_REFRESH_MS = 12000;
const SAVED_ZOOM_KEY = "dropspot-map-zoom";
const savedZoom = Number.parseInt(localStorage.getItem(SAVED_ZOOM_KEY) || "", 10);
const initialZoom = Number.isFinite(savedZoom) && ZOOM_LEVELS.includes(savedZoom) ? savedZoom : 18;
let lastKnownPosition = null;
let userMarker = null;
let contentRadiusCircle = null;
const CONTENT_UNLOCK_RADIUS_METRES = 75;

// Map


map = L.map('map', {
  center: [51.505, -0.09],
  zoom: initialZoom,
  zoomControl: false,
  scrollWheelZoom: false,
  wheelDebounceTime: 80,
  wheelPxPerZoomLevel: 180,
});

L.tileLayer(`https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png?key=${window.CARTO_API_KEY}`, {
  attribution: '© CartoDB',
  subdomains: 'abcd',
  maxZoom: 20
}).addTo(map);



// Map Zoom Functionality
map.getContainer().addEventListener('wheel', (e) => {
  e.preventDefault();
  const current = map.getZoom();
  const idx = ZOOM_LEVELS.reduce((best, lvl, i) =>
    Math.abs(lvl - current) < Math.abs(ZOOM_LEVELS[best] - current) ? i : best, 0);
  const next = e.deltaY < 0
    ? Math.min(idx + 1, ZOOM_LEVELS.length - 1)
    : Math.max(idx - 1, 0);
  if (next !== idx) map.setZoom(ZOOM_LEVELS[next]);
}, { passive: false });

const zoomSlider = document.getElementById("zoom-slider");

zoomSlider.addEventListener("input", () => {
    const idx = Number(zoomSlider.value);
    map.setZoom(ZOOM_LEVELS[idx]);
});


// Keep slider synchronised with map

map.on("zoomend", () => {

    const current = map.getZoom();

    const idx = ZOOM_LEVELS.reduce(
        (best, lvl, i) =>
            Math.abs(lvl - current) < Math.abs(ZOOM_LEVELS[best] - current)
                ? i
                : best,
        0
    );

    zoomSlider.value = idx;
});



// Map Icons


function makeSpotIcon() {
  return L.divIcon({
    className: '',
    html: '<div class="spot-dot"></div>',
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    popupAnchor: [0, -10]
  });
}



function makePlacedSpotIcon() {
  return L.divIcon({
    className: '',
    html: `
      <div class="placed-spot">
        <div class="placed-spot-ring"></div>
        <div class="spot-dot"></div>
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16]
  });
}

function makeHotspotIcon() {
  return L.divIcon({
    className: '',
    html: '<div class="hotspot-dot"></div>',
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    popupAnchor: [0, -10]
  });
}



function makeYouIcon() {
  return L.divIcon({
    className: '',
    html: '<div class="you-dot"></div>',
    iconSize: [18, 18],
    iconAnchor: [9, 9]
  });
}
 // change in future to only dynamically load hotspots in zoom range for performance optimisation
async function fetchHotspots() {
  const response = await fetch(`${"http://localhost:3000"}/api/hotspots`)

  if (!response.ok) {
    throw new Error("Failed to fetch hotspots");
  }

  const data = await response.json();
  return data;
}

async function loadHotspots() {
  const hotspots = await fetchHotspots();
  displayHotspots(hotspots);
}

let currentHotspotMarkers = []

function displayHotspots(hotspots) {
  currentHotspotMarkers.forEach(marker => map.removeLayer(marker));
  currentHotspotMarkers = [];

  hotspots.forEach(hotspot => {
    const popupHtml = `
      <div class="popup-title">Hotspot #${escHtml(hotspot.id)}</div>
      <div class="popup-subtitle">${escHtml(hotspot.address || "Address unavailable")}</div>

      <div class="popup-comments" id="hotspot-comments-${hotspot.id}">
        Loading comments...
      </div>
    `;

    const marker = L.marker(
      [Number(hotspot.latitude), Number(hotspot.longitude)],
      { icon: makeHotspotIcon() }
    ).bindPopup(popupHtml);

    marker.on('popupopen', async () => {
      const comments = await fetchHotspotComments(hotspot.id);

      const container = document.getElementById(
        `hotspot-comments-${hotspot.id}`
      );

      if (!container) return;

      if (comments.length === 0) {
        container.innerHTML = `
          <div class="popup-no-comments">
            No comments yet.
          </div>
        `;
        return;
      }

      container.innerHTML = comments
        .map(c => `
          <div class="hotspot-comment">
            <div class="comment-author">
              By: ${escHtml(c.username)}
            </div>

            <div class="comment-text">
              ${escHtml(c.comment)}
            </div>

            <div class="comment-date">
              ${escHtml(formatDate(c.created_at))}
            </div>
          </div>
        `)
        .join('');
    });

    marker.addTo(map);
    currentHotspotMarkers.push(marker);
  });
}



async function fetchHotspotComments(hotspotId) {
  const response = await fetch(`http://localhost:3000/api/hotspots/${hotspotId}/comments`);

  if (!response.ok) {
    throw new Error("Failed to fetch hotspot comments");
  }
  
  return response.json();
}




async function fetchNearbySpots(lat, lng) {
  const params = new URLSearchParams( {
    lat: lat,
    lng: lng
  })

  const response = await fetch(`${"http://localhost:3000"}/api/spots?${params}`)

  if (!response.ok) {
    throw new Error("Failed to fetch nearby spots");
  }

  const data = await response.json();
  return data;
}

async function loadNearbySpots(lat, lng) {
  const spots = await fetchNearbySpots(lat, lng);
  displayCurrentSpots(spots);
}

let currentMarkers = []

function displayCurrentSpots(spots) {
  currentMarkers.forEach(marker => map.removeLayer(marker));
  currentMarkers = []

  spots.forEach(spot => {
    const popupHtml = `
      <div class="popup-title">${escHtml(spot.title)}</div>
      <div class="popup-author">By: ${escHtml(spot.username)}</div>
      <div class="popup-description">${escHtml(spot.description)}</div>
      <div class="popup-meta">${escHtml(formatDate(spot.created_at))}</div>
    `;

    const marker = L.marker([Number(spot.latitude), Number(spot.longitude)], { icon: makeSpotIcon()})
      .bindPopup(popupHtml);
    marker.addTo(map);
    currentMarkers.push(marker);
  })
}



async function refreshNearbySpots() {
  if (!lastKnownPosition) {
    return;
  }

  const center = map.getCenter();
  const result = await fetchNearbySpots(center.lat, center.lng);
}




function applyLocationUpdate(lat, lng, recenter) {
  lastKnownPosition = { lat, lng };

  if (userMarker) {
    map.removeLayer(userMarker);
  }

  if (contentRadiusCircle) {
    map.removeLayer(contentRadiusCircle);
  }

  userMarker = L.marker([lat, lng], { icon: makeYouIcon(), zIndexOffset: 1000 }).addTo(map);
  contentRadiusCircle = L.circle([lat, lng], {
    radius: CONTENT_UNLOCK_RADIUS_METRES,
    color: '#e8ff47',
    weight: 1.5,
    opacity: 0.9,
    dashArray: '6 6',
    fillColor: '#e8ff47',
    fillOpacity: 0.08,
    interactive: false
  }).addTo(map);

  if (recenter) {
    map.flyTo([lat, lng], map.getZoom(), { duration: 1.2 });
  }
  console.log("user location", lat, lng);
}


function refreshUserLocation(options = {}) {
  const { recenter = false } = options;

  if (!navigator.geolocation) {
    console.warn('Geolocation not supported on this browser.');
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude: lat, longitude: lng } = pos.coords;
      applyLocationUpdate(lat, lng, recenter);
      loadNearbySpots(lat, lng);
    },
    () => {
        console.warn('Could not get location.');
    },
    {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 10000
    }
  );
}

/*
setInterval(() => {
  refreshUserLocation();
}, LOCATION_REFRESH_MS);
*/

// ── Locate user ──
function locateMe(options = {}) {
  const { recenter = true } = options;

  if (!navigator.geolocation) return console.warn('Geolocation not supported.');
  refreshUserLocation({ recenter });
}



function openSpotModal() {
  if (!lastKnownPosition) {
    locateMe();
    return;
  }

  pendingLatLng = lastKnownPosition;
  console.log(pendingLatLng);
  document.getElementById('modal-coords');
  document.getElementById('spot-title').value = '';
  document.getElementById('spot-description').value = '';
  document.getElementById('spot-modal').classList.add('open');
  setTimeout(() => document.getElementById('spot-title').focus(), 150);
}

function closeModal() {
  document.getElementById('spot-modal').classList.remove('open');
  pendingLatLng = null;
}

// Close modal on overlay click
document.getElementById('spot-modal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeModal();
});



async function handleSaveSpot() {
  const title = document.getElementById('spot-title').value.trim();
  const description = document.getElementById('spot-description').value.trim();

  if (!title || !description) {
    toast("Add both a title and description.");
    return;
  }

  // Use your existing stored location
  const lat = lastKnownPosition.lat;
  const lng = lastKnownPosition.lng;

  const result = await saveSpot(title, description, lat, lng);


  if (!result) {
    return;
  }

  if (result.kind == "comment") {
    console.log("Added as comment to nearby hotspot");
  }
  else {
    console.log("Spot saved!");
  }

  await loadNearbySpots(lat,lng);
  await loadHotspots();
  closeModal();
}

async function saveSpot(title, description, lat, lng) {
  try {
    const response = await fetch(`${"http://localhost:3000"}/api/spots`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        title: title,
        description: description,
        latitude: lat,
        longitude: lng
      })
    });

    const data = await response.json()

    if  (!response.ok) {
      throw new Error("Failed to save spot");
    }

    return data;

  } catch (error) {
    console.error("Error saving spot:", error);
    alert("Failed to save spot.");
    return null;
  }
}


async function logOut() {
  try {
    const response = await fetch(`${"http://localhost:3000"}/api/logout`, {
      method: "POST",
      credentials: "include",
    });

    const data = await response.json()

    if (!response.ok) {
      throw new Error("Failed to log out");
    }

    window.location.href = "/login";
    
  } catch (error) {
    console.error("Error logging out", error);
  }
};


function accountSettings() {
  window.location.href = "/account";
}


function escHtml(str) {
  return String(str ?? "")
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}


document.getElementById("locate-btn").addEventListener("click", locateMe);
document.getElementById("drop-spot-btn").addEventListener("click", openSpotModal);
document.getElementById("logout-btn").addEventListener("click", logOut);
document.getElementById("account-settings-btn").addEventListener("click", accountSettings);

document.getElementById("cancel-modal-btn").addEventListener("click", closeModal);
document.getElementById("save-spot-btn").addEventListener("click", handleSaveSpot);


refreshUserLocation({ recenter: true });
loadHotspots();


