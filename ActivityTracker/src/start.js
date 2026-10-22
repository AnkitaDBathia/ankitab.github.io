// Keep dependency-load errors visible even if a CDN is unavailable.
import("./app.js").catch((error) => {
  const root = document.getElementById("root");
  root.replaceChildren();
  const message = document.createElement("p");
  message.className = "setup";
  message.setAttribute("role", "alert");
  message.textContent = `Could not load My Journey. Check your internet connection and Supabase configuration, then reload. ${error.message}`;
  root.append(message);
});
