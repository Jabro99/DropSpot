const API_BASE_URL = "http://localhost:3000";

async function loadAccountData() {
  try {
    const [spotsRes, commentsRes] = await Promise.all([
      fetch(`${API_BASE_URL}/api/me/spots`, { credentials: "include" }),
      fetch(`${API_BASE_URL}/api/me/comments`, { credentials: "include" }),
    ]);

    const spots = await spotsRes.json();
    const comments = await commentsRes.json();

    renderSpots(spots);
    renderComments(comments);
  } catch (err) {
    console.error("Error loading account data:", err);
  }



}function renderSpots(spots) {
  const container = document.getElementById('my-spots-list');
  container.innerHTML = spots.map(spot => `
    <div class="spot-card">
      <div class="spot-meta">
        <span>${spot.is_active ? 'Active' : 'Expired'}</span>
        <span>${escHtml(formatDate(spot.created_at))}</span>
      </div>
      <div class="spot-text">${escHtml(spot.title)}</div>
      <div class="spot-text">${escHtml(spot.description)}</div>
    </div>
  `).join('');
}

function renderComments(comments) {
  const container = document.getElementById('my-comments-list');
  container.innerHTML = comments.map(c => `
    <div class="spot-card">
      <div class="spot-meta">
        <span>${c.is_active ? 'Active' : 'Expired'}</span>
        <span>${escHtml(formatDate(c.created_at))}</span>
      </div>
      <div class="spot-text">On: ${escHtml(c.hotspot_title || 'Hotspot')}</div>
      <div class="spot-text">${escHtml(c.comment)}</div>
    </div>
  `).join('');
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function escHtml(str) {
  return String(str ?? "")
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
async function loadUserInfo() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/me`, { credentials: "include" });
    if (!response.ok) {
      window.location.href = "/login";
      return;
    }
    const user = await response.json();
    document.getElementById('user-email').textContent = user.email;
  } catch (err) {
    console.error("Error loading user info:", err);
  }
}

document.getElementById('logout-btn').addEventListener('click', async () => {
  await fetch(`${API_BASE_URL}/api/logout`, { method: "POST", credentials: "include" });
  window.location.href = "/login";
});


document.getElementById("back-home-btn").addEventListener("click", () => {
    window.location.href = "/home";
});

loadUserInfo();
loadAccountData();