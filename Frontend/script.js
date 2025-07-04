// ✅ Mental Health Interview Chatbot (Full script.js with all features: Step 1–6)

let alreadyScored = false;
let chatEnded = false;
let crisisDetected = false;
let conversationHistory = [];
let currentUtterance = null;

const chatWindow = document.getElementById("chat-window");
const inputBox = document.getElementById("text-answer");
const micBtn = document.getElementById("mic-btn");
const sendBtn = document.getElementById("send-btn");
const listeningDots = document.getElementById("listening-dots");
const spokenText = document.getElementById("spoken-text");

function appendMessage(sender, text) {
  const msg = document.createElement("div");
  msg.className = `message ${sender}`;
  msg.textContent = text;
  chatWindow.appendChild(msg);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function speakMessage(text, options = {}) {
  if (currentUtterance && window.speechSynthesis.speaking) {
    window.speechSynthesis.cancel();
  }
  currentUtterance = new SpeechSynthesisUtterance(text);
  currentUtterance.lang = "en-US";
  if (options.pitch) currentUtterance.pitch = options.pitch;
  if (options.rate) currentUtterance.rate = options.rate;
  window.speechSynthesis.speak(currentUtterance);
}

function appendHelpButton() {
  const container = document.createElement("div");
  container.className = "message system";
  container.style.marginTop = "10px";

  const messageText = document.createElement("p");
  messageText.textContent = "If you need immediate help or support, please click the button below:";
  container.appendChild(messageText);

  const button = document.createElement("button");
  button.textContent = "Get Help";
  button.style.padding = "8px 12px";
  button.style.fontSize = "1rem";
  button.style.cursor = "pointer";
  button.onclick = () => {
    window.open("https://suicidepreventionlifeline.org/", "_blank");
  };

  container.appendChild(button);
  chatWindow.appendChild(container);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function appendLocalizedHelpButtons() {
  appendHelpButton();
  const info = document.createElement("p");
  info.className = "message system";
  info.textContent = "In Bangladesh, you can call the National Counseling Helpline at 1098. You may also reach out to organizations like BAMH or BPS.";
  chatWindow.appendChild(info);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function disableInput() {
  inputBox.disabled = true;
  micBtn.disabled = true;
  sendBtn.disabled = true;
}

async function askForClarification(question, answer) {
  try {
    const res = await fetch("http://localhost:3000/clarify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, answer })
    });
    const data = await res.json();
    return data.clarification;
  } catch (err) {
    console.error("Clarify error:", err);
    return null;
  }
}

async function sendUserMessage(userInput) {
  if (!userInput.trim() || chatEnded) return;

  appendMessage("user", userInput);
  conversationHistory.push({ role: "user", content: userInput, time: new Date().toISOString() });
  inputBox.value = "";
  spokenText.textContent = "";

  // 🔴 Step 6: Crisis keyword detection
  const crisisKeywords = ["kill myself", "suicide", "want to die", "end my life", "hurt myself", "jump", "self-harm"];
  const isUserCrisis = crisisKeywords.some(word => userInput.toLowerCase().includes(word));

  if (isUserCrisis && !crisisDetected) {
    crisisDetected = true;
    chatEnded = true;
    disableInput();

    const msg1 = "I'm so sorry you're feeling that way. Your safety matters, and you're not alone.";
    const msg2 = "Please consider reaching out to a mental health professional or a crisis service near you.";

    appendMessage("system", msg1);
    speakMessage(msg1, { pitch: 0.8, rate: 0.85 });
    appendMessage("system", msg2);
    speakMessage(msg2, { pitch: 0.8, rate: 0.85 });
    appendLocalizedHelpButtons();

    return;
  }

  try {
    const res = await fetch("http://localhost:3000/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ history: conversationHistory })
    });

    const data = await res.json();
    const reply = data.reply || "(No reply)";

    if (reply.trim().toLowerCase() === "end") {
      alreadyScored = true;
      chatEnded = true;

      const hasCrisisWarning = conversationHistory.some(msg =>
        msg.role === "assistant" && (
          msg.content.includes("I cannot continue the interview") ||
          msg.content.includes("seek immediate help") ||
          msg.content.includes("crisis hotline")
        )
      );

      if (hasCrisisWarning || crisisDetected) {
        const msg = "Because of the serious nature of your responses, I’m not generating a PHQ-9 score. Please seek support from a professional right away.";
        appendMessage("system", msg);
        speakMessage(msg);
        appendLocalizedHelpButtons();
        return;
      }

      appendMessage("system", "Thank you for completing the interview. Calculating your PHQ-9 score...");
      speakMessage("Thank you for completing the interview. Calculating your PHQ-9 score...");

      const userAnswers = conversationHistory.filter(msg => msg.role === "user").map(msg => msg.content);
      console.log("User answers for scoring:", userAnswers);

      const scoreRes = await fetch("http://localhost:3000/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: userAnswers })
      });

      const scoreData = await scoreRes.json();
      const summary = `Your PHQ-9 score is ${scoreData.total}. Severity level: ${scoreData.result}.`;
      appendMessage("system", summary);
      speakMessage(summary);
      return;
    }

    appendMessage("system", reply);
    speakMessage(reply);
    conversationHistory.push({ role: "assistant", content: reply, time: new Date().toISOString() });

    // Optional: Ask for clarification if user answer vague (you can enable this later)
    /*
    if (conversationHistory.length >= 2) {
      const lastQuestion = conversationHistory[conversationHistory.length - 2].content;
      const clarification = await askForClarification(lastQuestion, userInput);
      if (clarification) {
        appendMessage("system", clarification);
        speakMessage(clarification);
        conversationHistory.push({ role: "assistant", content: clarification, time: new Date().toISOString() });
      }
    }
    */

  } catch (err) {
    appendMessage("system", "Error: " + err.message);
  }
}

micBtn.onclick = () => {
  if (window.speechSynthesis.speaking) window.speechSynthesis.cancel();
  if (!("webkitSpeechRecognition" in window)) {
    alert("Speech recognition not supported in this browser.");
    return;
  }
  const recognition = new webkitSpeechRecognition();
  recognition.lang = "en-US";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  listeningDots.style.display = "block";
  recognition.start();
  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    spokenText.textContent = "You said: " + transcript;
    inputBox.value = transcript;
    listeningDots.style.display = "none";
    sendUserMessage(transcript);
  };
  recognition.onerror = (e) => {
    listeningDots.style.display = "none";
    alert("Speech error: " + e.error);
  };
  recognition.onend = () => {
    listeningDots.style.display = "none";
  };
};

sendBtn.onclick = () => {
  const input = inputBox.value.trim();
  if (input) sendUserMessage(input);
};

inputBox.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    const input = inputBox.value.trim();
    if (input) sendUserMessage(input);
  }
});

window.addEventListener("DOMContentLoaded", () => {
  const welcome = "Hello, I'm here to understand your mental well-being. Let's start our conversation.";
  appendMessage("system", welcome);
  speakMessage(welcome);
  conversationHistory.push({ role: "assistant", content: welcome, time: new Date().toISOString() });
});
