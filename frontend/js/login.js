const API_BASE_URL = "http://localhost:3000";

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const errorEl = document.getElementById('error-message');
  errorEl.style.display = 'none';

  try {
    const response = await fetch(`${API_BASE_URL}/api/login`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();

    if (!response.ok) {
      errorEl.textContent = data.error || "Login failed";
      errorEl.style.display = 'block';
      return;
    }

    window.location.href = "/home";
  } catch (err) {
    console.error("Login error:", err);
    errorEl.textContent = "Could not reach the server.";
    errorEl.style.display = 'block';
  }
});