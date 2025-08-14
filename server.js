// server.js
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import validator from "validator";
import path from "path";

dotenv.config();
const app = express();

const PORT = process.env.PORT || 8080;
const ALLOW_ORIGIN = (process.env.ALLOW_ORIGIN || "").trim();

// ✅ CORS setup (before Helmet, before routes)
const corsOptions = {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // Allow server-to-server/Postman
    if (origin === ALLOW_ORIGIN) return cb(null, true);
    return cb(new Error("Not allowed by CORS"));
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
  credentials: false
};
app.use(cors(corsOptions));
app.options("*", cors(corsOptions)); // Handle preflight globally

// ✅ Security
app.use(helmet({ crossOriginResourcePolicy: false }));

// ✅ Body parser
app.use(express.json({ limit: "100kb" }));

// ✅ Static files (PDF in public/)
app.use(express.static("public"));

// ✅ Rate limiting
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20
});
app.use("/api/", limiter);
app.use("/contact", limiter);

// ✅ Nodemailer setup
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 465),
  secure: Number(process.env.SMTP_PORT || 465) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

transporter.verify().then(
  () => console.log("✓ SMTP connection ready"),
  err => console.error("✗ SMTP error:", err.message)
);

// ✅ Health check
app.get("/health", (_, res) => res.json({ ok: true }));

// ✅ Contact form handler
const contactHandler = async (req, res) => {
  try {
    const { name, email, subject, message, website } = req.body || {};

    // Honeypot
    if (website) return res.status(200).json({ ok: true });

    if (!name || !email || !subject || !message) {
      return res
        .status(400)
        .json({ ok: false, error: "All fields are required." });
    }
    if (!validator.isEmail(email)) {
      return res.status(400).json({ ok: false, error: "Invalid email." });
    }
    if (
      name.length > 100 ||
      subject.length > 200 ||
      message.length > 5000
    ) {
      return res
        .status(400)
        .json({ ok: false, error: "Input too long." });
    }

    const from = process.env.FROM_EMAIL || process.env.SMTP_USER;
    const to = process.env.TO_EMAIL || process.env.SMTP_USER;

    const text = `
Name: ${name}
Email: ${email}
Subject: ${subject}

Message:
${message}
    `.trim();

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6">
        <h2>Hii there!!!</h2>
        <p><strong>Name:</strong> ${validator.escape(name)}</p>
        <p><strong>Email:</strong> ${validator.escape(email)}</p>
        <p><strong>Subject:</strong> ${validator.escape(subject)}</p>
        <p><strong>Message:</strong></p>
        <pre style="white-space:pre-wrap;background:#f7f7f9;padding:12px;border-radius:6px;border:1px solid #eee">${validator.escape(
          message
        )}</pre>
      </div>
    `;

    await transporter.sendMail({
      from,
      to,
      replyTo: email,
      subject: `Portfolio Contact: ${subject}`,
      text,
      html
    });

    res.json({ ok: true });
  } catch (err) {
    console.error("Email send error:", err);
    res.status(500).json({ ok: false, error: "Failed to send message." });
  }
};

// ✅ Contact routes
app.post("/contact", contactHandler);
app.post("/api/contact", contactHandler);

// ✅ Resume download with email notification
app.post("/download-resume", async (req, res) => {
  try {
    const from = process.env.FROM_EMAIL || process.env.SMTP_USER;
    const to = process.env.TO_EMAIL || process.env.SMTP_USER;

    await transporter.sendMail({
      from,
      to,
      subject: "Resume Downloaded",
      text: `Someone just downloaded your resume at ${new Date().toLocaleString()}.`,
      html: `<p>Someone just downloaded your resume at <b>${new Date().toLocaleString()}</b>.</p>`
    });

    // Generate absolute URL to PDF in /public
    const fileUrl = `${req.protocol}://${req.get("host")}/Karthi_B.pdf`;

    res.json({ fileUrl });
  } catch (err) {
    console.error("Resume notification error:", err);
    res
      .status(500)
      .json({ ok: false, error: "Failed to send resume notification." });
  }
});

app.listen(PORT, () => console.log(`Server running on :${PORT}`));
