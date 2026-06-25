const express = require("express");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const crypto = require("crypto");
const { JSONFilePreset } = require("lowdb/node");
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(express.static("public"));

const genAI = new GoogleGenerativeAI(process.env.MDCAT_Bot);

// ─── Database Setup (permanent storage) ──────────────────────────────────────
let db;
async function initDB() {
  db = await JSONFilePreset("db.json", { users: {} });
}
initDB();

// ─── In-memory sessions (token -> { email, name }) ───────────────────────────
const sessions = {};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 100_000, 64, "sha512").toString("hex");
}

function generateToken() {
  return crypto.randomBytes(48).toString("hex");
}

function requireAuth(req, res, next) {
  const token = req.headers["x-session-token"];
  if (!token || !sessions[token]) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  req.session = sessions[token];
  next();
}

// ─── SIGNUP ───────────────────────────────────────────────────────────────────
app.post("/auth/signup", async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: "Sab fields bharo!" });
  }

  await db.read();
  if (db.data.users[email]) {
    return res.status(409).json({ error: "Yeh email already registered hai!" });
  }

  const salt = crypto.randomBytes(16).toString("hex");
  const passwordHash = hashPassword(password, salt);
  db.data.users[email] = { name, passwordHash, salt, createdAt: new Date().toISOString() };
  await db.write();

  const token = generateToken();
  sessions[token] = { email, name, createdAt: Date.now() };
  res.json({ token, name, email });
});

// ─── LOGIN ────────────────────────────────────────────────────────────────────
app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;

  await db.read();
  const user = db.data.users[email];
  if (!user) {
    return res.status(401).json({ error: "Email ya password ghalat hai!" });
  }

  const hash = hashPassword(password, user.salt);
  if (hash !== user.passwordHash) {
    return res.status(401).json({ error: "Email ya password ghalat hai!" });
  }

  const token = generateToken();
  sessions[token] = { email, name: user.name, createdAt: Date.now() };
  res.json({ token, name: user.name, email });
});

// ─── LOGOUT ───────────────────────────────────────────────────────────────────
app.post("/auth/logout", (req, res) => {
  const token = req.headers["x-session-token"];
  if (token) delete sessions[token];
  res.json({ ok: true });
});

// ─── CHAT (protected + streaming) ────────────────────────────────────────────
app.post("/chat", requireAuth, async (req, res) => {
  try {
    const userMessage = req.body.message;
    const subject     = req.body.subject  || "All";
    const mode        = req.body.mode     || "chat";
    const language    = req.body.language || "roman_urdu";
    const year        = req.body.year     || "any";

const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const languageInstruction = language === "english"
      ? "Answer in clear, simple English."
      : "Roman Urdu mein jawab do — simple aur clear.";

    let subjectInstruction = "Biology, Chemistry, Physics, English, aur Logical Reasoning";
    if (subject === "Biology")            subjectInstruction = "sirf Biology";
    if (subject === "Chemistry")          subjectInstruction = "sirf Chemistry";
    if (subject === "Physics")            subjectInstruction = "sirf Physics";
    if (subject === "English")            subjectInstruction = "sirf English";
    if (subject === "Logical Reasoning")  subjectInstruction = "sirf Logical Reasoning";

    const yearInstruction = year !== "any"
      ? `Question MDCAT ${year} past paper style mein banana.`
      : "MDCAT style question banana.";

    let prompt;

    if (mode === "mcq") {
      prompt = `
Tu ek MDCAT preparation assistant hai Pakistan ke medical students ke liye.
Ek MDCAT-style MCQ banao — ${subjectInstruction} se.
${yearInstruction}

Format bilkul yeh follow karo:

**Sawal:** [question yahan]

A) [option]
B) [option]
C) [option]
D) [option]

⏱ Recommended time: 1 minute

Sirf sawal aur options do — jawab mat batao abhi.
${languageInstruction} (scientific/technical terms English mein rakho).
Agar koi equation ho to LaTeX format mein likho: $E = mc^2$
      `;
    } else if (mode === "mcq_answer") {
      prompt = `
Tu ek MDCAT preparation assistant hai.
Yeh tha sawal: ${req.body.previousQuestion}
Student ka jawab: ${userMessage}

Batao ke jawab sahi hai ya ghalat.
Phir:
1. Sahi answer explain karo
2. Ghalat options kyun ghalat hain — ek line mein har ek ke liye
3. Agar Biology hai — koi diagram ya labeled structure text mein describe karo agar helpful ho
${languageInstruction}
Agar equation ho to LaTeX format mein likho.
      `;
    } else if (mode === "diagram") {
      prompt = `
Tu ek MDCAT Biology expert hai.
Student ne diagram/structure maanga hai: ${userMessage}

Text mein ek clear labeled diagram banao using ASCII art ya structured list.
Phir har part ki function bhi explain karo.
${languageInstruction}

Format:
[Structure Name]
├── Part 1 → function
├── Part 2 → function
└── Part 3 → function
      `;
    } else if (mode === "weightage") {
      prompt = `
Tu ek MDCAT expert hai.
${subjectInstruction} ka MDCAT mein topic-wise weightage batao.
Table format mein likho:
Topic | Approximate % | Important Subtopics

Phir top 3 most important topics highlight karo.
${languageInstruction}
      `;
    } else {
      prompt = `
Tu ek MDCAT preparation assistant hai Pakistan ke medical students ke liye.
Sirf MDCAT related sawaalon ka jawab do — ${subjectInstruction}.
${languageInstruction}
Agar Biology question hai aur diagram helpful hoga, text mein simple labeled structure bhi do.
Agar koi equation ho to LaTeX format mein likho: $F = ma$
Agar student past papers ke baare mein pooche, Practice MCQ mode suggest karo.
Student ka sawal: ${userMessage}
      `;
    }

    // Streaming response
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const result = await model.generateContentStream(prompt);

    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) {
        res.write(`data: ${JSON.stringify({ text })}\n\n`);
      }
    }

    res.write("data: [DONE]\n\n");
    res.end();

  } catch (error) {
    console.error("Error:", error.message);
    res.write(`data: ${JSON.stringify({ text: "Try in a while — server is busy!" })}\n\n`);
    res.write("data: [DONE]\n\n");
    res.end();
  }
});

app.listen(3000, () => {
  console.log("MDCAT Bot is Running on — port 3000!");
});