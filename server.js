const express = require("express");
const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(express.static("public"));

const genAI = new GoogleGenerativeAI(process.env.MDCAT_Bot);

app.post("/chat", async (req, res) => {
  try {
    const userMessage = req.body.message;
    const subject = req.body.subject || "All";
    const mode = req.body.mode || "chat";
    const language = req.body.language || "roman_urdu";
    const year = req.body.year || "any";

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const languageInstruction = language === "english"
      ? "Answer in clear, simple English."
      : "Roman Urdu mein jawab do — simple aur clear.";

    let subjectInstruction = "Biology, Chemistry, Physics, English, aur Logical Reasoning";
    if (subject === "Biology")           subjectInstruction = "sirf Biology";
    if (subject === "Chemistry")         subjectInstruction = "sirf Chemistry";
    if (subject === "Physics")           subjectInstruction = "sirf Physics";
    if (subject === "English")           subjectInstruction = "sirf English";
    if (subject === "Logical Reasoning") subjectInstruction = "sirf Logical Reasoning";

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

Sawal: [question yahan]

A) [option]
B) [option]
C) [option]
D) [option]

Sirf sawal aur options do — jawab mat batao abhi.
${languageInstruction} (scientific/technical terms English mein rakho).
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
- Part 1: function
- Part 2: function
- Part 3: function
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
Agar student past papers ke baare mein pooche, Practice MCQ mode suggest karo.
Student ka sawal: ${userMessage}
      `;
    }

    const result = await model.generateContent(prompt);
    const reply = result.response.text();
    res.json({ reply });

  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).json({ reply: "Thodi der baad try karo — server busy hai! 🙏" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`MDCAT Bot chal raha hai — port ${PORT} pe!`);
});
