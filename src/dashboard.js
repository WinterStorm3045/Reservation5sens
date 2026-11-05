const express = require("express");
const fs = require("fs/promises");
const path = require("path");
const bcrypt = require("bcrypt");
const {
  lireReservations,
  reservationsFile,
  mettreAJourResteACharge,
  mettreAJourReservation,
  supprimerReservation,
  maxReservationPeople,
  maxReservations,
} = require("./data");
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
  "allergies",
  "nombrePersonnes",
  "tarifsPersonnes",
  "totalBuffets",
  "resteACharge",
  "statut",
];
const loginView = path.join(__dirname, "../views/adminLogin.ejs");
const dashboardView = path.join(__dirname, "../views/dashboard.ejs");
const proofView = path.join(__dirname, "../views/proof.ejs");

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
  for (const [index, reservation] of reservations.entries()) {
    const status = obtenirStatutReservation(reservation, index);
    rows.push(
      encoderLigneCsv(
        reservationHeaders.map((header) =>
          protegerFormulesCsv(header === "statut" ? status : reservation[header]),
        ),
      ),
    );
  }
  return `${rows.join("\r\n")}\r\n`;
}

function obtenirStatutReservation(reservation, index) {
  if (index >= maxReservations) {
    return "en attente";
  }
  return reservation.resteACharge !== "" && Number(reservation.resteACharge) === 0
    ? "payé"
    : "réservé";
}

function lireTarifsAdmin(tarifsPersonnes, nombrePersonnes) {
  let tarifs = [];
  if (!tarifsPersonnes) {
    tarifs = [];
  } else {
    try {
      const parsed = JSON.parse(tarifsPersonnes);
      if (Array.isArray(parsed)) {
        tarifs = parsed;
      }
    } catch {
      tarifs = [];
    }
  }

  const parsedCount = Number(nombrePersonnes);
  const count =
    Number.isInteger(parsedCount) && parsedCount >= 1 && parsedCount <= maxReservationPeople
      ? parsedCount
      : Math.min(Math.max(tarifs.length, 1), maxReservationPeople);
  const tarifsAdmin = Array.from({ length: count }, (_, index) => {
    const tarif = tarifs[index];
    if (tarif === "externe" || tarif === "exterieur") {
      return "exterieur";
    }
    return tarif === "offert" ? "offert" : "reduit";
  });
  const prix = { exterieur: 25, reduit: 18, offert: 0 };
  const totalBuffets = tarifsAdmin.reduce((total, tarif) => total + prix[tarif], 0);
  return { nombrePersonnesAdmin: count, tarifsAdmin, totalBuffets };
}

function lireTarifsPreuve(tarifsPersonnes) {
  try {
    const tarifs = JSON.parse(tarifsPersonnes);
    return Array.isArray(tarifs)
      ? tarifs.map((tarif) =>
          tarif === "interne" || tarif === "reduit" ? "reduit" : tarif === "offert" ? "offert" : "exterieur",
        )
      : [];
  } catch {
    return [];
  }
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

router.post("/reservation", exigerAuthentification, async (req, res, next) => {
  const form = req.body && typeof req.body === "object" ? req.body : {};
  const originalEmail = typeof form.originalEmail === "string" ? form.originalEmail.trim() : "";
  const reservation = {
    nom: typeof form.nom === "string" ? form.nom.trim() : "",
    prenom: typeof form.prenom === "string" ? form.prenom.trim() : "",
    email: typeof form.email === "string" ? form.email.trim() : "",
    telephone: typeof form.telephone === "string" ? form.telephone.trim() : "",
    allergies: typeof form.allergies === "string" ? form.allergies.trim() : "",
    nombrePersonnes:
      typeof form.nombrePersonnes === "string" ? form.nombrePersonnes.trim() : "",
    resteACharge: typeof form.resteACharge === "string" ? form.resteACharge.trim() : "",
  };
  const nombrePersonnes = Number(reservation.nombrePersonnes);
  const tarifs = Number.isInteger(nombrePersonnes) && nombrePersonnes >= 1 && nombrePersonnes <= maxReservationPeople
    ? Array.from({ length: nombrePersonnes }, (_, index) => form[`tarifPersonne${index}`])
    : [];
  const montantValide = (value) => value === "" || /^\d+(?:[.,]\d{1,2})?$/.test(value);

  if (!originalEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(originalEmail)) {
    return res.status(400).send("La réservation à modifier est invalide.");
  }
  if (
    !reservation.nom ||
    reservation.nom.length > 120 ||
    !reservation.prenom ||
    reservation.prenom.length > 120 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reservation.email) ||
    reservation.email.length > 254 ||
    !reservation.telephone ||
    reservation.telephone.length > 40 ||
    reservation.allergies.length > 500
  ) {
    return res.status(400).send("Vérifiez les coordonnées et les allergies de la réservation.");
  }
  if (
    nombrePersonnes >= 1 &&
    nombrePersonnes <= maxReservationPeople &&
    tarifs.length === nombrePersonnes &&
    tarifs.every((tarif) => ["exterieur", "reduit", "offert"].includes(tarif))
  ) {
    if (!montantValide(reservation.resteACharge)) {
      return res.status(400).send("Le reste à charge doit être positif et comporter au plus deux décimales.");
    }
    try {
      const prix = { exterieur: 25, reduit: 18, offert: 0 };
      const totalBuffets = String(tarifs.reduce((total, tarif) => total + prix[tarif], 0));
      const result = await mettreAJourReservation(originalEmail, {
        nom: reservation.nom,
        prenom: reservation.prenom,
        email: reservation.email,
        telephone: reservation.telephone,
        allergies: reservation.allergies,
        nombrePersonnes: String(nombrePersonnes),
        tarifsPersonnes: JSON.stringify(tarifs),
        totalBuffets,
        resteACharge:
          reservation.resteACharge === ""
            ? ""
            : reservation.resteACharge.replace(",", "."),
      });
      if (result === "not-found") {
        return res.status(404).send("Réservation introuvable.");
      }
      if (result === "email-conflict") {
        return res.status(409).send("Cette adresse e-mail est déjà utilisée par une autre réservation.");
      }
      return res.redirect("/dashboard?saved=1");
    } catch (error) {
      return next(error);
    }
  }
  return res.status(400).send(
    `Le nombre de participants doit être compris entre 1 et ${maxReservationPeople}, avec un tarif valide par personne.`,
  );
});

router.post("/reservation/delete", exigerAuthentification, async (req, res, next) => {
  const form = req.body && typeof req.body === "object" ? req.body : {};
  const email = typeof form.email === "string" ? form.email.trim() : "";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).send("La réservation à supprimer est invalide.");
  }

  try {
    const deleted = await supprimerReservation(email);
    if (!deleted) {
      return res.status(404).send("Réservation introuvable.");
    }
    return res.redirect("/dashboard?deleted=1");
  } catch (error) {
    return next(error);
  }
});

router.get("/proof", exigerAuthentification, async (req, res, next) => {
  const email = typeof req.query.email === "string" ? req.query.email.trim() : "";
  if (!email) {
    return res.status(400).send("Adresse e-mail de réservation manquante.");
  }

  try {
    const reservations = await lireReservations();
    const index = reservations.findIndex(
      (reservation) => reservation.email.trim().toLowerCase() === email.toLowerCase(),
    );
    if (index === -1) {
      return res.status(404).send("Réservation introuvable.");
    }
    const reservation = reservations[index];
    return res.render(
      proofView,
      {
        reservation,
        tarifs: lireTarifsPreuve(reservation.tarifsPersonnes),
        status: obtenirStatutReservation(reservation, index),
      },
      (error, html) => {
        if (error) {
          return next(error);
        }
        res.type("html");
        res.attachment("preuve-achat-cinq-sens.html");
        return res.send(html);
      },
    );
  } catch (error) {
    return next(error);
  }
});

router.get("/", exigerAuthentification, async (req, res, next) => {
  try {
    const reservations = await lireReservations();
    return res.render(dashboardView, {
      reservations: reservations.map((reservation, index) => ({
        ...reservation,
        ...lireTarifsAdmin(reservation.tarifsPersonnes, reservation.nombrePersonnes),
        status: obtenirStatutReservation(reservation, index),
      })),
      adminUsername: req.session.adminUsername,
      successMessage:
        req.query.saved === "1"
          ? "La réservation a bien été mise à jour."
          : req.query.deleted === "1"
            ? "La réservation a été supprimée."
            : null,
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
