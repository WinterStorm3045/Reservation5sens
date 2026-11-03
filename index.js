const { app } = require("./src/utils");
const path = require("path");
const { router: dataRouter } = require("./src/data");
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

app.get("/reservation", (req, res) => {
  res.render(path.join(__dirname, "views", "reservation.ejs"), {
    successMessage:
      req.query.success === "1" ? "Votre réservation a bien été enregistrée." : null,
    errorMessage: null,
  });
});



const port = process.env.Port || 4000;
app.listen(port, function () {
  console.log(`Serveur lancé sur le port ${port}`);
});
