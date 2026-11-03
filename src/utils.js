require("dotenv").config();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const path = require("path");
const fs = require("fs");

const express = require("express");
const session = require("express-session");
const cookieParser = require("cookie-parser");

const app = express();
const publicFolder = path.join(__dirname, "../public");
app.use(express.static(publicFolder));

//app.use = import pr coté client
app.use(express.json({ limit: "3mb" })); // Permet aussi l'envoi d'images de profil
app.use(express.urlencoded({ extended: true })); // Permet de lire les données des formulaires
app.use(cookieParser()); // Permet de lire les cookies
app.set("view engine", "ejs"); // use ejs as the view engine
app.set("views", path.join(__dirname, "../views/pages"));

// configure les sessions
app.use(
  session({
    secret: process.env.TokenSecretKey,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: parseInt(process.env.UserSessionTimeout),
      secure: false, // Set to true if using HTTPS
      sameSite: "lax",
    },
  }),
);

module.exports = { app, bcrypt, jwt, fs };