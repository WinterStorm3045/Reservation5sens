const { app } = require("./src/utils");
const path = require("path");
const {
  router: dataRouter,
  trouverReservationParPreuve,
  reservationProofCookie,
} = require("./src/data");
const dashboardRouter = require("./src/dashboard");

app.use("/data", dataRouter);
app.use("/dashboard", dashboardRouter);

app.get("/", (req, res) => {
  res.redirect("/Accueil");
});

app.get("/accueil", (req, res) => {
  res.render(path.join(__dirname, "views", "accueil.ejs"));
});

app.get("/informations", (req, res) => {
  res.render(path.join(__dirname, "views", "informations.ejs"));
});

app.get("/reservation", async (req, res, next) => {
  try {
    const reservation = await trouverReservationParPreuve(req.cookies?.[reservationProofCookie]);
    return res.render(path.join(__dirname, "views", "reservation.ejs"), {
      successMessage:
        req.query.success === "1" ? "Votre réservation a bien été enregistrée." : null,
      errorMessage: null,
      allergies: "",
      alreadyReserved: Boolean(reservation),
    });
  } catch (error) {
    return next(error);
  }
});



const port = process.env.Port || 3010;
app.listen(port, function () {
  console.log(`Serveur lancé sur le port ${port}`);
});
