const express = require("express");
const path = require("path");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.post("/analyze", async (req, res) => {
  const { productName } = req.body || {};

  if (!productName || typeof productName !== "string") {
    return res.status(400).json({
      error: "Please provide a valid productName in the request body."
    });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({
      error:
        "Missing GEMINI_API_KEY. Add it to your environment variables (required for Render deployment)."
    });
  }

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      systemInstruction:
        "You are an expert shopping assistant. Use grounded web search results to compare current prices and sentiment. Always return valid JSON only.",
      tools: [{ googleSearchRetrieval: {} }]
    });

    const prompt = `Analyze this product: "${productName}".

Tasks:
1) Search the web for CURRENT pricing from major retailers.
2) Provide at least 3 prices from different major retailers.
3) Summarize Reddit and expert-review sentiment.
4) Provide a concise recommendation: \"Buy\" or \"Wait\" with a one-paragraph reason.

Return ONLY valid JSON with this shape:
{
  "productName": "string",
  "priceComparison": [
    { "store": "string", "price": "string", "url": "string" }
  ],
  "valueSummary": {
    "sentiment": "string",
    "recommendation": "Buy or Wait",
    "reasoning": "string"
  }
}`;

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json"
      }
    });

    const raw = result.response.text();

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (_error) {
      const cleaned = raw
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/```$/i, "")
        .trim();
      parsed = JSON.parse(cleaned);
    }

    return res.json(parsed);
  } catch (error) {
    console.error("Gemini analyze error:", error);

    return res.status(500).json({
      error:
        "Unable to analyze product right now. Please try again shortly.",
      details: error?.message || "Unknown error"
    });
  }
});

app.listen(PORT, () => {
  console.log(`Flash AI Shopping Assistant running on port ${PORT}`);
});
