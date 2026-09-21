const API_BASE_URL = "http://localhost:3000";

document.getElementById('register-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = document.getElementById('email').value.trim();
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  const errorEl = document.getElementById('error-message');
  errorEl.style.display = 'none';

  try {
    const response = await fetch(`${API_BASE_URL}/api/register`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, username, password })
    });

    const data = await response.json();

    if (!response.ok) {
      errorEl.textContent = data.error || "Registration failed";
      errorEl.style.display = 'block';
      return;
    }

    window.location.href = "/login";
  } catch (err) {
    console.error("Registration error:", err);
    errorEl.textContent = "Could not reach the server.";
    errorEl.style.display = 'block';
  }
});