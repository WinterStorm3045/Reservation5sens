const express = require("express");
const fs = require("fs/promises");
const path = require("path");
const { parseCsv, encoderLigneCsv } = require("./csv");

const router = express.Router();
const reservationsFile = process.env.RESERVATIONS_CSV_PATH
  ? path.resolve(process.env.RESERVATIONS_CSV_PATH)
  : path.join(__dirname, "../data/reservations.csv");
const requiredHeaders = ["nom", "prenom", "email", "telephone"];
const headers = [
  "nom",
  "prenom",
  "email",
  "telephone",
  "nombrePersonnes",
  "nombreBoissons",
];
let reservationQueue = Promise.resolve();

async function lireReservations() {
  let content;
  try {
    content = await fs.readFile(reservationsFile, "utf8");
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
  if (!requiredHeaders.every((header) => columns.includes(header))) {
    throw new Error("Le fichier CSV des réservations ne contient pas les colonnes attendues.");
  }
  return rows.slice(1).map((row) =>
    Object.fromEntries(columns.map((column, index) => [column, row[index] || ""])),
  );
}

async function verifierReservation(email) {
  const reservations = await lireReservations();
  const normalizedEmail = email.trim().toLowerCase();
  return reservations.some(
    (reservation) => reservation.email.trim().toLowerCase() === normalizedEmail,
  );
}

async function ajouterReservation(reservation) {
  await fs.mkdir(path.dirname(reservationsFile), { recursive: true });

  let existingReservations = [];
  try {
    const existingContent = await fs.readFile(reservationsFile, "utf8");
    if (existingContent.length > 0) {
      existingReservations = await lireReservations();
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  const allReservations = [...existingReservations, reservation];
  const lines = [
    encoderLigneCsv(headers),
    ...allReservations.map((entry) =>
      encoderLigneCsv(headers.map((header) => entry[header] ?? "")),
    ),
  ];
  const temporaryFile = `${reservationsFile}.${process.pid}.tmp`;
  try {
    await fs.writeFile(temporaryFile, `${lines.join("\n")}\n`, "utf8");
    await fs.rename(temporaryFile, reservationsFile);
  } catch (error) {
    await fs.rm(temporaryFile, { force: true });
    throw error;
  }
}

function lireChamp(form, name) {
  return typeof form[name] === "string" ? form[name].trim() : "";
}

function validerReservation(reservation) {
  if (headers.some((field) => reservation[field].length === 0)) {
    return "Tous les champs sont obligatoires.";
  }
  if (reservation.nom.length > 120 || reservation.prenom.length > 120) {
    return "Le nom et le prénom ne peuvent pas dépasser 120 caractères.";
  }
  if (reservation.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reservation.email)) {
    return "Veuillez saisir une adresse e-mail valide.";
  }
  if (reservation.telephone.length > 40) {
    return "Le numéro de téléphone ne peut pas dépasser 40 caractères.";
  }
  if (!/^\d+$/.test(reservation.nombrePersonnes) || !Number.isSafeInteger(Number(reservation.nombrePersonnes)) || Number(reservation.nombrePersonnes) < 1) {
    return "Le nombre de personnes doit être un entier supérieur ou égal à 1.";
  }
  if (!/^\d+$/.test(reservation.nombreBoissons) || !Number.isSafeInteger(Number(reservation.nombreBoissons))) {
    return "Le nombre total de boissons doit être un entier positif ou nul.";
  }
  return null;
}

async function recevoirRequeteReservation(req, res, next) {
  const form = req.body && typeof req.body === "object" ? req.body : {};
  const reservation = {
    nom: lireChamp(form, "nom"),
    prenom: lireChamp(form, "prenom"),
    email: lireChamp(form, "email"),
    telephone: lireChamp(form, "telephone"),
    nombrePersonnes: lireChamp(form, "nombrePersonnes"),
    nombreBoissons: lireChamp(form, "nombreBoissons"),
  };
  const validationError = validerReservation(reservation);
  if (validationError) {
    return res.status(400).render(path.join(__dirname, "../views/reservation.ejs"), {
      errorMessage: validationError,
      successMessage: null,
    });
  }

  const operation = reservationQueue.then(async () => {
    if (await verifierReservation(reservation.email)) {
      return false;
    }
    await ajouterReservation(reservation);
    return true;
  });
  reservationQueue = operation.then(
    () => undefined,
    () => undefined,
  );

  try {
    const added = await operation;
    if (!added) {
      return res.status(409).render(path.join(__dirname, "../views/reservation.ejs"), {
        errorMessage: "Une réservation existe déjà avec cette adresse e-mail.",
        successMessage: null,
      });
    }
    return res.redirect("/reservation?success=1");
  } catch (error) {
    return next(error);
  }
}

router.post("/reservations", recevoirRequeteReservation);

module.exports = { router, lireReservations, reservationsFile };