const { app } = require("./src/utils");
const path = require("path");
const {
  router: dataRouter,
  trouverReservationParPreuve,
  reservationProofCookie,
  lireReservations,
  maxReservations,
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
    let reservationStatus = "";
    if (reservation) {
      const reservations = await lireReservations();
      const reservationIndex = reservations.findIndex(
        (entry) => entry.email.trim().toLowerCase() === reservation.email.trim().toLowerCase(),
      );
      if (reservationIndex !== -1) {
        reservationStatus = reservationIndex < maxReservations ? "reserved" : "waiting";
      }
    }
    return res.render(path.join(__dirname, "views", "reservation.ejs"), {
      reservationStatus,
      reservationAmount:
        reservation && Number.isFinite(Number(reservation.totalBuffets))
          ? Number(reservation.totalBuffets)
          : null,
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
