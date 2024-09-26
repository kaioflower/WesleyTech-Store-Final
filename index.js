const express = require("express");
const session = require("express-session");
const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

const serviceAccount = require("./keys.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const app = express();

app.use(express.static(path.join(__dirname, "public")));
app.set("view engine", "pug");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(
  session({
    secret: "super-secret-key",
    resave: true,
    saveUninitialized: true,
  }),
);

// Carregamento de dados do arquivo produtos.json
const produtos = JSON.parse(
  fs.readFileSync(path.join(__dirname, "produtos.json")),
);

// Middleware para verificar se o usuário está autenticado
const checkAuth = (req, res, next) => {
  if (req.session.user) {
    next();
  } else {
    res.status(401).send("Usuário Não Autorizado! Faça login.");
  }
};

// Rota inicial de login
app.get("/", (req, res) => {
  res.render("login"); // Renderiza a página de login
});

// Registro de novo usuário no Firebase
app.post("/register", (req, res) => {
  const { email, password } = req.body;
  admin
    .auth()
    .createUser({ email, password })
    .then((userRecord) => {
      console.log("Usuário criado com sucesso:", userRecord.uid);
      res.send("Usuário registrado com sucesso");
    })
    .catch((error) => {
      console.error("Erro ao criar usuário:", error);
      res.status(500).send("Falha no registro do usuário");
    });
});

app.post("/authenticated", (req, res) => {
  const { email, password } = req.body;
  admin
    .auth()
    .getUserByEmail(email)
    .then((userRecord) => {
      if (password === "admin123") {
        req.session.user = userRecord;
        res.redirect("/home");
      } else {
        res.status(401).send("Usuário ou senha inválidos");
      }
    })
    .catch((error) => {
      console.error("Erro ao autenticar usuário:", error);
      res.status(401).send("Usuário ou senha inválidos");
    });
});

// Logout
app.get("/logout", (req, res) => {
  req.session.destroy();
  res.send("Usuário deslogado com sucesso!");
});

// Página inicial para usuários autenticados
app.get("/home", checkAuth, (req, res) => {
  res.render("home", {
    produtos,
    user: req.session.user,
  });
});

// Exibir um produto
app.get("/produto/:id", checkAuth, (req, res) => {
  const id = parseInt(req.params.id); // Converte o ID para um número
  if (isNaN(id)) return res.status(400).send("ID inválido"); // Verifica se o ID é um número válido

  const produto = produtos.find((p) => p.id === id); // Busca o produto pelo ID
  if (!produto) return res.status(404).send("Produto não encontrado");

  res.render("produto", {
    produto,
    isAdmin: req.session.user.customClaims && req.session.user.customClaims.isAdmin,
    user: req.session.user,
  });
});


// Editar um produto (somente para administradores)
app.get("/produto/:id/editar", checkAuth, (req, res) => {
  if (req.session.user.customClaims && req.session.user.customClaims.isAdmin) {
    const produto = produtos.find((p) => p.id === parseInt(req.params.id));
    if (!produto) return res.status(404).send("Produto não encontrado");

    res.render("editar-produto", { produto });
  } else {
    res
      .status(403)
      .send("Acesso negado: você não tem permissão para editar produtos.");
  }
});

// Atualizar um produto (somente para administradores)
app.post("/produto/:id/editar", checkAuth, (req, res) => {
  if (req.session.user.customClaims && req.session.user.customClaims.isAdmin) {
    const produto = produtos.find((p) => p.id === parseInt(req.params.id));
    if (!produto) return res.status(404).send("Produto não encontrado");

    produto.nome = req.body.nome;
    produto.descricao = req.body.descricao;
    produto.preco = parseFloat(req.body.preco);
    produto.categoria = req.body.categoria;
    produto.disponibilidade = req.body.disponibilidade;

    fs.writeFileSync(
      path.join(__dirname, "produtos.json"),
      JSON.stringify(produtos, null, 2),
    );

    res.redirect(`/produto/${produto.id}`);
  } else {
    res
      .status(403)
      .send("Acesso negado: você não tem permissão para editar produtos.");
  }
});

// Página de compra
app.get("/compra/:id", checkAuth, (req, res) => {
  const produto = produtos.find((p) => p.id === parseInt(req.params.id));
  if (!produto) return res.status(404).send("Produto não encontrado");

  res.render("compra", {
    produto,
    user: req.session.user,
  });
});

// Finalizar compra
app.post("/finalizar-compra/:id", checkAuth, (req, res) => {
  const produto = produtos.find((p) => p.id === parseInt(req.params.id));
  if (!produto) return res.status(404).send("Produto não encontrado");

  if (produto.disponibilidade <= 0)
    return res.status(400).send("Produto esgotado.");

  produto.disponibilidade -= 1;

  const compra = {
    produto: produto.nome,
    preco: produto.preco,
    comprador: req.session.user.email,
    data: new Date().toLocaleString(),
  };

  fs.writeFileSync(
    path.join(__dirname, "produtos.json"),
    JSON.stringify(produtos, null, 2),
  );
  console.log(`Compra realizada: ${JSON.stringify(compra)}`);

  res.render("compra-finalizada", {
    produto,
    user: req.session.user,
    compra,
  });
});

// Iniciar o servidor
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});
