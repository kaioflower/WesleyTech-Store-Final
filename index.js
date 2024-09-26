const express = require("express");
const session = require("express-session")
const fs = require("fs")
const path = require("path")
const iniciacaoApp = require("firebase/app")
const autenticador = require('firebase/auth')
const admin = require("firebase-admin");
const serviceAccount = require("./keys.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const uid = "8kwtLTa6jCca4Hq2ENKumTnnnHj1";

admin.auth().setCustomUserClaims(uid, { isAdmin: true })
  .then(() => {
    console.log(`Papel de administrador atribuído ao usuário: ${uid}`);
  })
  .catch((error) => {
    console.error("Erro ao atribuir papel de administrador:", error);
  });


  const firebaseConfig = {
    apiKey: "AIzaSyDP6lumK6qEfcJSLUYGupgW0x-mhfHHz54",
    authDomain: "trabalho-automa.firebaseapp.com",
    projectId: "trabalho-automa",
    storageBucket: "trabalho-automa.appspot.com",
    messagingSenderId: "908289836854",
    appId: "1:908289836854:web:657afc84de830f81a95597",
    measurementId: "G-J4NZD2LHZW"
  };



const appFireBase = iniciacaoApp.initializeApp(firebaseConfig);
const auth = autenticador.getAuth(appFireBase);
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
  if (req.session && req.session.user) {
    next();
  } else {
    res.status(401).send("Acesso negado: Você precisa estar autenticado para acessar esta página.");
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

app.post("/authenticated", async (req, res) => {
  const { email, password } = req.body;
  try {
    // Fazer login com Firebase Authentication
    const userCredential = await autenticador.signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Obtém o token do usuário para verificar as claims
    const idToken = await user.getIdTokenResult();

    // Armazena os dados do usuário e o token na sessão
    req.session.user = {
      uid: user.uid,
      email: user.email,
      token: idToken.token, // Salva o token na sessão
      isAdmin: idToken.claims.isAdmin || false, // Verifica se o usuário tem a claim de administrador
    };
    res.redirect("/home");
  } catch (error) {
    console.error("Erro ao fazer login:", error);
    res.status(500).send("Erro ao fazer login");
  }
});

const checkAdmin = async (req, res, next) => {
  if (req.session && req.session.user) {
    try {
      const idToken = req.session.user.token; 
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      if (decodedToken.isAdmin) {
        next(); 
      } else {
        res.status(403).send("Acesso negado: Você precisa ser administrador.");
      }
    } catch (error) {
      console.error("Erro ao verificar claims:", error);
      res.status(500).send("Erro interno do servidor.");
    }
  } else {
    res.status(401).send("Usuário não autenticado.");
  }
};



// Exibe o formulário para criar um novo administrador
app.get("/admin/create", checkAuth, checkAdmin, (req, res) => {
  res.render("create-admin");
});


app.get("/admin", checkAdmin,checkAdmin, (req, res) => {
  res.send("Bem-vindo à página de administrador!");
});

// Logout
app.get("/logout", (req, res) => {
  req.session.destroy();
  res.send("Usuário deslogado com sucesso!");
});

// Página inicial para usuários autenticados
app.get("/home", checkAuth, checkAdmin, (req, res) => {
  res.render("home", {
    produtos,
    user: req.session.user,
    isAdmin: req.session.user.isAdmin, // Use a propriedade da sessão
  });
});


app.get("/produto/:id", checkAuth, checkAdmin, (req, res) => {
  const id = parseInt(req.params.id); // Converte o ID para um número
  if (isNaN(id)) return res.status(400).send("ID inválido"); // Verifica se o ID é um número válido

  const produto = produtos.find((p) => p.id === id); // Busca o produto pelo ID
  if (!produto) return res.status(404).send("Produto não encontrado");

  res.render("produto", {
    produto,
    isAdmin: req.session.user.isAdmin, // Use a propriedade da sessão
    user: req.session.user, // Mantenha o usuário
  });
});


// Editar um produto (somente para administradores)
app.get("/produto/:id/editar", checkAuth, (req, res) => {
  if (req.session.user.isAdmin) {
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
  if (req.session.user.isAdmin) {
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
app.get("/compra/:id", checkAuth,checkAdmin, (req, res) => {
  const produto = produtos.find((p) => p.id === parseInt(req.params.id));
  if (!produto) return res.status(404).send("Produto não encontrado");

  res.render("compra", {
    produto,
    user: req.session.user,
    isAdmin: idToken.claims.isAdmin || false
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
