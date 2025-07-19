const BACKEND_URL = "http://localhost:5000";
let conversationHistory = [];
let currentUtterance = null;

const micBtn = document.getElementById("mic-btn");
const micDots = document.getElementById("mic-dots");

// ✅ Get JWT token
function getAuthHeaders() {
  const token = localStorage.getItem("token");
  if (!token) {
    alert("Not logged in. Redirecting...");
    window.location.href = "auth.html";
  }
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`
  };
}

// ✅ Append message
function appendMessage(sender, text) {
  const chatWindow = document.getElementById("chat-window");
  const div = document.createElement("div");
  div.className = `message ${sender}`;
// Detect links in the text and convert to clickable
  const linkedText = text.replace(
    /(https?:\/\/[^\s]+)/g,
    '<a href="$1" target="_blank" style="color:#3b82f6;">$1</a>'
  );
  div.innerHTML = linkedText; // 👈 render as HTML
 // div.textContent = text;
  chatWindow.appendChild(div);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

// ✅ Speak out text
function speakMessage(text) {
  if (currentUtterance && window.speechSynthesis.speaking) {
    window.speechSynthesis.cancel();
  }
   currentUtterance = new SpeechSynthesisUtterance(
    text.replace(/https?:\/\/\S+/g, "") // 👈 remove links
  );
  currentUtterance.lang = "en-US";
  window.speechSynthesis.speak(currentUtterance);
}

// ✅ Send user message
async function sendUserMessage(userInput) {
  appendMessage("user", userInput);
  conversationHistory.push({ role: "user", content: userInput });
  document.getElementById("text-answer").value = "";

  try {
    const res = await fetch(`${BACKEND_URL}/api/chat`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ history: conversationHistory })
    });
    const data = await res.json();
    appendMessage("system", data.reply);
    speakMessage(data.reply);
    conversationHistory.push({ role: "assistant", content: data.reply });
  } catch (err) {
    console.error("Chat error:", err);
    appendMessage("system", "❌ Error communicating with server.");
  }
}

// ✅ Mic button logic
micBtn.onclick = () => {
  if (!("webkitSpeechRecognition" in window)) {
    alert("Speech recognition not supported.");
    return;
 
  }
      // 🛑 Stop any ongoing TTS before starting mic
  if (window.speechSynthesis.speaking) {
    window.speechSynthesis.cancel();
  }
  const recognition = new webkitSpeechRecognition();
  recognition.lang = "en-US";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  micBtn.classList.add("recording");
  micDots.style.display = "inline"; // show dots
  recognition.start();

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    sendUserMessage(transcript);
  };
  recognition.onerror = (e) => alert("Speech error: " + e.error);
  recognition.onend = () => {
    micBtn.classList.remove("recording");
    micDots.style.display = "none"; // hide dots
  };
};

// ✅ Send button
document.getElementById("send-btn").onclick = () => {
  const input = document.getElementById("text-answer").value.trim();
  if (input) sendUserMessage(input);
};

// ✅ Enter key
document.getElementById("text-answer").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    const input = e.target.value.trim();
    if (input) sendUserMessage(input);
  }
});

// ✅ Logout
function logout() {
  localStorage.clear();
  alert("Logged out.");
  window.location.href = "auth.html";
}

// ✅ Auto fetch first question
window.addEventListener("DOMContentLoaded", async () => {
  try {
    const res = await fetch(`${BACKEND_URL}/api/chat`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ history: [] })
    });
    const data = await res.json();
    appendMessage("system", data.reply);
    speakMessage(data.reply);
    conversationHistory.push({ role: "assistant", content: data.reply });
  } catch (err) {
    console.error("Error fetching first question:", err);
  }
});

// ==================== DELETE CHAT FUNCTION ====================

// ✅ Function to delete chat
async function deleteChat(chatId) {
  if (!confirm("Are you sure you want to delete this conversation?")) return;

  try {
    const res = await fetch(`${BACKEND_URL}/api/chat/${chatId}`, {
      method: "DELETE",
      headers: getAuthHeaders()
    });
    const data = await res.json();

    if (res.ok) {
      alert("✅ Conversation deleted.");
      loadChatHistory(); // Refresh the chat history
    } else {
      alert("❌ Failed to delete: " + data.error);
    }
  } catch (err) {
    console.error("Delete error:", err);
    alert("❌ Delete failed.");
  }
}
// ==================== LOAD CHAT HISTORY ====================

// ✅ Function to load chat history
async function loadChatHistory() {
  const historyDiv = document.getElementById("chat-history");
  historyDiv.innerHTML = "<p>Loading chat history...</p>";

  try {
    const res = await fetch(`${BACKEND_URL}/api/chat-history`, {
      method: "GET",
      headers: getAuthHeaders()
    });
    const chats = await res.json();

    if (res.ok && chats.length > 0) {
      let html = "";
      chats.forEach((chat, index) => {
        html += `<div class="conversation-card">
                  <strong>Conversation ${index + 1}</strong>
                  <button class="delete-btn" onclick="deleteChat('${chat._id}')">🗑 Delete</button>`;
        chat.messages.forEach((msg) => {
          html += `<div class="message ${msg.role}">${msg.content}
                    <div class="timestamp">${new Date(msg.timestamp).toLocaleString()}</div>
                    </div>`;
        });
        html += `</div>`;
      });
      historyDiv.innerHTML = html;
    } else {
      historyDiv.innerHTML = "<p>No chat history found.</p>";
    }
  } catch (err) {
    console.error("History fetch error:", err);
    historyDiv.innerHTML = "<p>Failed to load chat history.</p>";
  }
}

// Ensure chat history loads on page load
window.addEventListener("DOMContentLoaded", loadChatHistory);