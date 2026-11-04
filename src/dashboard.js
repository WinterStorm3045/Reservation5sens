const express = require("express");
const fs = require("fs/promises");
const path = require("path");
const bcrypt = require("bcrypt");
const { lireReservations, reservationsFile, mettreAJourResteACharge } = require("./data");
const { parseCsv, encoderLigneCsv } = require("./csv");

const router = express.Router();
const adminsFile = process.env.ADMINS_CSV_PATH
  ? path.resolve(process.env.ADMINS_CSV_PATH)
  : path.join(__dirname, "../data/admins.csv");
const adminHeaders = ["username", "passwordHash"];
const reservationHeaders = [
  "nom",
  "prenom",
  "email",
  "telephone",
  "nombrePersonnes",
  "tarifsPersonnes",
  "totalBuffets",
  "resteACharge",
];
const loginView = path.join(__dirname, "../views/adminLogin.ejs");
const dashboardView = path.join(__dirname, "../views/dashboard.ejs");

router.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

async function lireAdministrateurs() {
  let content;
  try {
    content = await fs.readFile(adminsFile, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const rows = parseCsv(content.replace(/^\uFEFF/, ""));
  if (rows.length === 0) {
    return [];
  }

  const columns = rows[0];
  if (!adminHeaders.every((header) => columns.includes(header))) {
    throw new Error("Le fichier admins.csv doit contenir username et passwordHash.");
  }
  return rows.slice(1).map((row) =>
    Object.fromEntries(columns.map((column, index) => [column, row[index] || ""])),
  );
}

function estAuthentifie(req) {
  return Boolean(req.session && req.session.adminUsername);
}

function exigerAuthentification(req, res, next) {
  if (!estAuthentifie(req)) {
    return res.redirect("/dashboard/login");
  }
  return next();
}

function protegerFormulesCsv(value) {
  const text = String(value || "");
  return /^[\t\r ]*[=+\-@]/.test(text) ? `'${text}` : text;
}

function creerCsvReservations(reservations) {
  const rows = [encoderLigneCsv(reservationHeaders)];
  for (const reservation of reservations) {
    rows.push(
      encoderLigneCsv(
        reservationHeaders.map((header) => protegerFormulesCsv(reservation[header])),
      ),
    );
  }
  return `${rows.join("\r\n")}\r\n`;
}

router.get("/login", (req, res) => {
  if (estAuthentifie(req)) {
    return res.redirect("/dashboard");
  }
  return res.render(loginView, { errorMessage: null });
});

router.post("/login", async (req, res, next) => {
  const form = req.body && typeof req.body === "object" ? req.body : {};
  const username = typeof form.username === "string" ? form.username.trim() : "";
  const password = typeof form.password === "string" ? form.password : "";

  if (!username || !password) {
    return res.status(400).render(loginView, {
      errorMessage: "Saisis ton identifiant et ton mot de passe.",
    });
  }

  try {
    const admins = await lireAdministrateurs();
    const admin = admins.find(
      (entry) => entry.username.toLowerCase() === username.toLowerCase(),
    );
    if (!admin || !(await bcrypt.compare(password, admin.passwordHash))) {
      return res.status(401).render(loginView, {
        errorMessage: "Identifiant ou mot de passe incorrect.",
      });
    }

    return req.session.regenerate((error) => {
      if (error) {
        return next(error);
      }
      req.session.adminUsername = admin.username;
      return req.session.save((saveError) => {
        if (saveError) {
          return next(saveError);
        }
        return res.redirect("/dashboard");
      });
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/logout", exigerAuthentification, (req, res, next) => {
  req.session.destroy((error) => {
    if (error) {
      return next(error);
    }
    res.clearCookie("connect.sid");
    return res.redirect("/dashboard/login");
  });
});

router.post("/balance", exigerAuthentification, async (req, res, next) => {
  const form = req.body && typeof req.body === "object" ? req.body : {};
  const email = typeof form.email === "string" ? form.email.trim() : "";
  const resteACharge = typeof form.resteACharge === "string" ? form.resteACharge.trim() : "";
  if (!email || !/^\d+(?:[.,]\d{1,2})?$/.test(resteACharge)) {
    return res.status(400).send("La réservation ou le reste à charge est invalide.");
  }

  try {
    const amount = Number(resteACharge.replace(",", "."));
    if (!Number.isFinite(amount) || amount < 0) {
      return res.status(400).send("Le reste à charge doit être un montant positif ou nul.");
    }
    const updated = await mettreAJourResteACharge(email, String(amount));
    if (!updated) {
      return res.status(404).send("Réservation introuvable.");
    }
    return res.redirect("/dashboard");
  } catch (error) {
    return next(error);
  }
});

router.get("/", exigerAuthentification, async (req, res, next) => {
  try {
    const reservations = await lireReservations();
    return res.render(dashboardView, {
      reservations,
      adminUsername: req.session.adminUsername,
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/download", exigerAuthentification, async (req, res, next) => {
  try {
    const reservations = await lireReservations();
    const csv = creerCsvReservations(reservations);
    res.type("text/csv; charset=utf-8");
    res.attachment(path.basename(reservationsFile));
    return res.send(`\uFEFF${csv}`);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
