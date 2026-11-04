require("dotenv").config();

const bcrypt = require("bcrypt");
const fs = require("fs/promises");
const path = require("path");
const readline = require("readline");
const { createInterface } = require("readline/promises");
const { parseCsv, encoderLigneCsv } = require("../src/csv");

const adminsFile = process.env.ADMINS_CSV_PATH
  ? path.resolve(process.env.ADMINS_CSV_PATH)
  : path.join(__dirname, "../data/admins.csv");
const headers = ["username", "passwordHash"];

function demanderMotDePasse() {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") {
    return Promise.reject(new Error("Lance ce script depuis un terminal interactif."));
  }

  return new Promise((resolve, reject) => {
    let password = "";
    const handleKeypress = (character, key = {}) => {
      if (key.ctrl && key.name === "c") {
        process.stdin.off("keypress", handleKeypress);
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdout.write("\n");
        reject(new Error("Création annulée."));
      } else if (key.name === "return" || key.name === "enter") {
        process.stdin.off("keypress", handleKeypress);
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdout.write("\n");
        resolve(password);
      } else if (key.name === "backspace") {
        password = Array.from(password).slice(0, -1).join("");
      } else if (character && !key.ctrl && !key.meta) {
        password += character;
      }
    };

    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("keypress", handleKeypress);
    process.stdout.write("Mot de passe (saisie masquée) : ");
  });
}

async function lireAdministrateurs() {
  let content;
  try {
    content = await fs.readFile(adminsFile, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return { columns: [], admins: [] };
    }
    throw error;
  }

  const rows = parseCsv(content.replace(/^\uFEFF/, ""));
  if (rows.length === 0) {
    return { columns: [], admins: [] };
  }

  const columns = rows[0];
  if (!headers.every((header) => columns.includes(header))) {
    throw new Error("Le fichier admins.csv doit contenir username,passwordHash.");
  }
  return {
    columns,
    admins: rows.slice(1).map((row) =>
      Object.fromEntries(columns.map((column, index) => [column, row[index] || ""])),
    ),
  };
}

async function creerAdministrateur() {
  const prompt = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  let username;
  try {
    username = (await prompt.question("Identifiant administrateur : ")).trim();
  } finally {
    prompt.close();
  }

  if (username.length === 0 || username.length > 100 || /[\r\n]/.test(username)) {
    throw new Error("L’identifiant doit contenir entre 1 et 100 caractères.");
  }

  const password = await demanderMotDePasse();
  if (password.length === 0 || Buffer.byteLength(password, "utf8") > 72) {
    throw new Error("Le mot de passe ne peut pas être vide ni dépasser 72 octets.");
  }

  const { columns, admins } = await lireAdministrateurs();
  await fs.mkdir(path.dirname(adminsFile), { recursive: true });
  const passwordHash = await bcrypt.hash(password, 12);
  const existingAdminIndex = admins.findIndex(
    (admin) => admin.username.toLowerCase() === username.toLowerCase(),
  );
  const updatedAdmin = { username, passwordHash };

  if (existingAdminIndex === -1) {
    admins.push(updatedAdmin);
  } else {
    admins[existingAdminIndex] = { ...admins[existingAdminIndex], ...updatedAdmin };
  }

  const csvColumns = columns.length > 0 ? columns : headers;
  const lines = [
    encoderLigneCsv(csvColumns),
    ...admins.map((admin) => encoderLigneCsv(csvColumns.map((column) => admin[column] || ""))),
  ];
  const temporaryFile = `${adminsFile}.${process.pid}.tmp`;
  try {
    await fs.writeFile(temporaryFile, `${lines.join("\n")}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await fs.rename(temporaryFile, adminsFile);
  } catch (error) {
    await fs.rm(temporaryFile, { force: true });
    throw error;
  }
  console.log(
    `Administrateur « ${username} » ${existingAdminIndex === -1 ? "ajouté" : "mis à jour"} dans data/admins.csv.`,
  );
}

creerAdministrateur().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
