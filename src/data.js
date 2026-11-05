const express = require("express");
const fs = require("fs/promises");
const crypto = require("crypto");
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
  "allergies",
  "nombrePersonnes",
  "tarifsPersonnes",
  "totalBuffets",
  "resteACharge",
  "reservationProofHash",
];
const reservationProofCookie = "reservationProof";
const reservationProofMaxAge = 365 * 24 * 60 * 60 * 1000;
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
  return rows.slice(1).map((row) => {
    const reservation = Object.fromEntries(
      columns.map((column, index) => [column, row[index] || ""]),
    );
    const storedBalance = Number(reservation.resteACharge);
    if (reservation.resteACharge !== "" && Number.isFinite(storedBalance) && storedBalance >= 0) {
      reservation.resteACharge = String(storedBalance);
    } else if (reservation.paye === "oui") {
      reservation.resteACharge = "0";
    } else {
      reservation.resteACharge = reservation.totalBuffets || "";
    }
    return reservation;
  });
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
  await sauvegarderReservations(allReservations);
}

async function sauvegarderReservations(reservations) {
  await fs.mkdir(path.dirname(reservationsFile), { recursive: true });
  const lines = [
    encoderLigneCsv(headers),
    ...reservations.map((entry) =>
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

function mettreAJourReservation(emailActuel, modifications) {
  const operation = reservationQueue.then(async () => {
    const reservations = await lireReservations();
    const reservation = reservations.find(
      (entry) => entry.email.trim().toLowerCase() === emailActuel.trim().toLowerCase(),
    );
    if (!reservation) {
      return "not-found";
    }

    const autreReservation = reservations.some(
      (entry) =>
        entry !== reservation &&
        entry.email.trim().toLowerCase() === modifications.email.trim().toLowerCase(),
    );
    if (autreReservation) {
      return "email-conflict";
    }

    Object.assign(reservation, modifications);
    await sauvegarderReservations(reservations);
    return "updated";
  });
  reservationQueue = operation.then(
    () => undefined,
    () => undefined,
  );
  return operation;
}

function mettreAJourResteACharge(email, resteACharge) {
  const operation = reservationQueue.then(async () => {
    const reservations = await lireReservations();
    const reservation = reservations.find(
      (entry) => entry.email.trim().toLowerCase() === email.trim().toLowerCase(),
    );
    if (!reservation) {
      return false;
    }

    reservation.resteACharge = resteACharge;
    await sauvegarderReservations(reservations);
    return true;
  });
  reservationQueue = operation.then(
    () => undefined,
    () => undefined,
  );
  return operation;
}

async function trouverReservationParPreuve(token) {
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) {
    return null;
  }
  const tokenHash = crypto.createHash("sha256").update(token).digest();
  const reservations = await lireReservations();
  return reservations.find((reservation) => {
    if (!/^[a-f0-9]{64}$/.test(reservation.reservationProofHash || "")) {
      return false;
    }
    const storedHash = Buffer.from(reservation.reservationProofHash, "hex");
    return crypto.timingSafeEqual(tokenHash, storedHash);
  }) || null;
}

function lireChamp(form, name) {
  return typeof form[name] === "string" ? form[name].trim() : "";
}

function validerReservation(reservation) {
  const formFields = [
    "nom",
    "prenom",
    "email",
    "telephone",
    "nombrePersonnes",
    "tarifsPersonnes",
  ];
  if (formFields.some((field) => reservation[field].length === 0)) {
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
  if (reservation.allergies.length > 500) {
    return "Les allergies ne peuvent pas dépasser 500 caractères.";
  }
  if (
    !/^\d+$/.test(reservation.nombrePersonnes) ||
    !Number.isSafeInteger(Number(reservation.nombrePersonnes)) ||
    Number(reservation.nombrePersonnes) < 1 ||
    Number(reservation.nombrePersonnes) > 12
  ) {
    return "Le nombre de personnes doit être un entier compris entre 1 et 12.";
  }
  let tarifsPersonnes;
  try {
    tarifsPersonnes = JSON.parse(reservation.tarifsPersonnes);
  } catch {
    return "Veuillez sélectionner un tarif pour chaque personne.";
  }
  if (
    !Array.isArray(tarifsPersonnes) ||
    tarifsPersonnes.length !== Number(reservation.nombrePersonnes) ||
    tarifsPersonnes.some((tarif) => tarif !== "interne" && tarif !== "externe")
  ) {
    return "Veuillez sélectionner un tarif valide pour chaque personne.";
  }

  return null;
}

async function recevoirRequeteReservation(req, res, next) {
  const form = req.body && typeof req.body === "object" ? req.body : {};
  let alreadyReserved;
  try {
    alreadyReserved = Boolean(
      await trouverReservationParPreuve(req.cookies?.[reservationProofCookie]),
    );
  } catch (error) {
    return next(error);
  }
  const reservation = {
    nom: lireChamp(form, "nom"),
    prenom: lireChamp(form, "prenom"),
    email: lireChamp(form, "email"),
    telephone: lireChamp(form, "telephone"),
    allergies: lireChamp(form, "allergies"),
    nombrePersonnes: lireChamp(form, "nombrePersonnes"),
    tarifsPersonnes: lireChamp(form, "tarifsPersonnes"),
  };
  const validationError = validerReservation(reservation);
  if (validationError) {
    return res.status(400).render(path.join(__dirname, "../views/reservation.ejs"), {
      errorMessage: validationError,
      successMessage: null,
      allergies: reservation.allergies,
      alreadyReserved,
    });
  }

  const tarifsPersonnes = JSON.parse(reservation.tarifsPersonnes);
  reservation.totalBuffets = String(
    tarifsPersonnes.reduce(
      (total, tarif) => total + (tarif === "interne" ? 18 : 25),
      0,
    ),
  );
  reservation.resteACharge = reservation.totalBuffets;
  const proofToken = crypto.randomBytes(32).toString("hex");
  reservation.reservationProofHash = crypto.createHash("sha256").update(proofToken).digest("hex");
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
        allergies: reservation.allergies,
        alreadyReserved,
      });
    }
    res.cookie(reservationProofCookie, proofToken, {
      httpOnly: true,
      maxAge: reservationProofMaxAge,
      path: "/",
      sameSite: "lax",
      secure: req.secure,
    });
    return res.redirect("/reservation?success=1");
  } catch (error) {
    return next(error);
  }
}

router.post("/reservations", recevoirRequeteReservation);

router.get("/reservations/proof", async (req, res, next) => {
  try {
    const reservation = await trouverReservationParPreuve(req.cookies?.[reservationProofCookie]);
    if (!reservation) {
      return res.status(404).send("Aucune preuve de réservation n'est disponible dans ce navigateur.");
    }
    return res.render(
      path.join(__dirname, "../views/proof.ejs"),
      { reservation, tarifs: JSON.parse(reservation.tarifsPersonnes) },
      (error, html) => {
        if (error) {
          return next(error);
        }
        res.type("html");
        res.attachment("preuve-reservation-cinq-sens.html");
        return res.send(html);
      },
    );
  } catch (error) {
    return next(error);
  }
});

module.exports = {
  router,
  lireReservations,
  reservationsFile,
  mettreAJourResteACharge,
  mettreAJourReservation,
  trouverReservationParPreuve,
  reservationProofCookie,
};