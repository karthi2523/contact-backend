import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import validator from "validator";

dotenv.config();
const app = express();

// --- Config ---
const PORT = process.env.PORT || 8080;
const ALLOW_ORIGIN = (process.env.ALLOW_ORIGIN || "").split(",").map(s => s.trim()).filter(Boolean);

// --- Middleware ---
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(express.json({ limit: "100kb" }));

// CORS: allow specific origins (dev + prod)
app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true); // allow curl/postman
      if (ALLOW_ORIGIN.includes(origin)) return cb(null, true);
      cb(new Error("Not allowed by CORS"));
    }
  })
);

// Basic rate limiting
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 min
  max: 20,             // 20 requests/min/IP
});
app.use("/api/", limiter);

// --- Mail transporter ---
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,               // e.g., smtp.gmail.com
  port: Number(process.env.SMTP_PORT || 465),
  secure: Number(process.env.SMTP_PORT || 465) === 465, // true for 465
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// Optional verify on boot (helpful while deploying)
transporter.verify().then(
  () => console.log("✓ SMTP connection ready"),
  (err) => console.error("✗ SMTP error:", err.message)
);

// --- Routes ---
app.get("/health", (_, res) => res.json({ ok: true }));

app.post("/api/contact", async (req, res) => {
  try {
    const { name, email, subject, message, website } = req.body || {};

    // Honeypot (spam bots often fill hidden fields). If filled, pretend success.
    if (website) return res.status(200).json({ ok: true });

    // Validate
    if (!name || !email || !subject || !message) {
      return res.status(400).json({ ok: false, error: "All fields are required." });
    }
    if (!validator.isEmail(email)) {
      return res.status(400).json({ ok: false, error: "Invalid email." });
    }
    // length limits
    if (name.length > 100 || subject.length > 200 || message.length > 5000) {
      return res.status(400).json({ ok: false, error: "Input too long." });
    }

    const from = process.env.FROM_EMAIL || process.env.SMTP_USER;
    const to = process.env.TO_EMAIL || process.env.SMTP_USER;

    const text = `
Help me:

Name: ${name}
Email: ${email}
Subject: ${subject}

Message:
${message}
`.trim();

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6">
        <h2>New Portfolio Contact</h2>
        <p><strong>Name:</strong> ${validator.escape(name)}</p>
        <p><strong>Email:</strong> ${validator.escape(email)}</p>
        <p><strong>Subject:</strong> ${validator.escape(subject)}</p>
        <p><strong>Message:</strong></p>
        <pre style="white-space:pre-wrap;background:#f7f7f9;padding:12px;border-radius:6px;border:1px solid #eee">${validator.escape(message)}</pre>
      </div>
    `;

    await transporter.sendMail({
      from,
      to,
      replyTo: email, // so you can reply directly
      subject: `Portfolio Contact: ${subject}`,
      text,
      html
    });

    res.json({ ok: true });
  } catch (err) {
    console.error("Email send error:", err);
    res.status(500).json({ ok: false, error: "Failed to send message." });
  }
});

// --- Start ---
app.listen(PORT, () => console.log(`Server running on :${PORT}`));
