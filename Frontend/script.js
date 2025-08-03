const BACKEND_URL = "http://localhost:5000";
let conversationHistory = [];
let currentUtterance = null;

// --- Get DOM references ---
const micBtn = document.getElementById("mic-btn");
const micDots = document.getElementById("mic-dots");
const chatWindow = document.getElementById("chat-window");

// --- JWT Helper ---
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

// --- Append Message ---
function appendMessage(sender, text) {
  if (!chatWindow) return;
  const div = document.createElement("div");
  div.className = `message ${sender}`;
  // Detect links in the text and convert to clickable
  const linkedText = text.replace(
    /(https?:\/\/[^\s]+)/g,
    '<a href="$1" target="_blank" style="color:#3b82f6;">$1</a>'
  );
  div.innerHTML = linkedText;
  chatWindow.appendChild(div);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

// --- Speak out text ---
function speakMessage(text) {
  if (currentUtterance && window.speechSynthesis.speaking) {
    window.speechSynthesis.cancel();
  }
  currentUtterance = new SpeechSynthesisUtterance(
    text.replace(/https?:\/\/\S+/g, "") // remove links
  );
  currentUtterance.lang = "en-US";
  window.speechSynthesis.speak(currentUtterance);
}

// --- Clear Chat Window ---
function clearChatWindow() {
  if (chatWindow) chatWindow.innerHTML = "";
}

// --- Send user message ---
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

    // Optionally, if interview ends, you might want to disable further input.
    // if (/END/i.test(data.reply)) { ... }

  } catch (err) {
    console.error("Chat error:", err);
    appendMessage("system", "❌ Error communicating with server.");
  }
}

// --- Start New Interview ---
async function startNewInterview() {
  clearChatWindow();
  conversationHistory = [];
  try {
    const chatRes = await fetch(`${BACKEND_URL}/api/chat`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ history: [] })
    });
    const data = await chatRes.json();
    appendMessage("system", data.reply);
    speakMessage(data.reply);
    conversationHistory = [{ role: "assistant", content: data.reply }];
  } catch (err) {
    appendMessage("system", "❌ Unable to start the conversation.");
  }
}

// --- Resume last unfinished chat or start new interview ---
async function showLastOrResume() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/chat-history`, {
      method: "GET",
      headers: getAuthHeaders()
    });
    const chats = await res.json();

    // Find the latest unfinished chat (no score yet)
    let last = null;
    for (let chat of chats) {
      const finished = chat.messages.some(
        m => m.role === "assistant" && m.content.includes("PHQ-9 Total Score")
      );
      if (!finished) {
        last = chat;
        break;
      }
    }
    // If all are finished, fallback to most recent
    if (!last && chats.length > 0) {
      last = chats[0];
    }

    if (!last || (last.messages.some(m => m.role === "assistant" && m.content.includes("PHQ-9 Total Score")))) {
      // Start a fresh interview
      await startNewInterview();
    } else {
      // Resume last unfinished conversation
      conversationHistory = last.messages.map(m => ({
        role: m.role,
        content: m.content
      }));
      clearChatWindow();
      for (const msg of conversationHistory) {
        appendMessage(msg.role === "assistant" ? "system" : "user", msg.content);
      }
    }
  } catch (err) {
    await startNewInterview();
  }
}




// --- DOMContentLoaded ---
window.addEventListener("DOMContentLoaded", async () => {
  // Nav button handlers
  const newBtn = document.getElementById("new-interview-btn");
  if (newBtn) newBtn.onclick = () => startNewInterview();

  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) logoutBtn.onclick = () => logout();

  

  // If user just logged in (fresh login), start a new interview
  if (chatWindow) {
    
    if (sessionStorage.getItem("justLoggedIn") === "true") {
      await startNewInterview();
      sessionStorage.setItem("justLoggedIn", "false");
    } else {
      await showLastOrResume();
    }
  }
  if (document.getElementById("chat-history")) {
    loadChatHistory();
  }
});

// --- Mic Button logic ---
if (micBtn && micDots) {
  micBtn.onclick = () => {
    if (!("webkitSpeechRecognition" in window)) {
      alert("Speech recognition not supported.");
      return;
    }
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
    }
    const recognition = new webkitSpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    micBtn.classList.add("recording");
    micDots.style.display = "inline";
    recognition.start();

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      sendUserMessage(transcript);
    };
    recognition.onerror = (e) => alert("Speech error: " + e.error);
    recognition.onend = () => {
      micBtn.classList.remove("recording");
      micDots.style.display = "none";
    };
  };
}

// --- Send Button ---
const sendBtn = document.getElementById("send-btn");
if (sendBtn) {
  sendBtn.onclick = () => {
    const input = document.getElementById("text-answer").value.trim();
    if (input) sendUserMessage(input);
  };
}

// --- Enter Key ---
const answerBox = document.getElementById("text-answer");
if (answerBox) {
  answerBox.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const input = e.target.value.trim();
      if (input) sendUserMessage(input);
    }
  });
}

// --- Logout ---
function logout() {
  sessionStorage.removeItem("justLoggedIn");
  localStorage.clear();
  alert("Logged out.");
  window.location.href = "auth.html";
}

// ==================== DELETE CHAT FUNCTION ====================
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
async function loadChatHistory() {
  const historyDiv = document.getElementById("chat-history");
  if (!historyDiv) return;
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
