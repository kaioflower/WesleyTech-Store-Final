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

const uid = "KdKjGLhGvOerqxEg4RiQMbOuHjx1";

admin.auth().setCustomUserClaims(uid, { isAdmin: true })
  .then(() => {
    console.log(`Papel de administrador atribuído ao usuário: ${uid}`);
  })
  .catch((error) => {
    console.error("Erro ao atribuir papel de administrador:", error);
  });


  const firebaseConfig = {
    apiKey: "AIzaSyC2PgxITpOoVWo06oNGBZzy0nn3AIRcMro",
    authDomain: "wesleytechstore-1452a.firebaseapp.com",
    projectId: "wesleytechstore-1452a",
    storageBucket: "wesleytechstore-1452a.appspot.com",
    messagingSenderId: "308723096223",
    appId: "1:308723096223:web:8a1498fa3ee1258c9160aa",
    measurementId: "G-C0B9B246XZ"
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

const produtos = JSON.parse(
  fs.readFileSync(path.join(__dirname, "produtos.json")),
);

const checkAuth = (req, res, next) => {
  if (req.session && req.session.user) {
    next();
  } else {
    res.status(401).send("Acesso negado: Você precisa estar autenticado para acessar esta página.");
  }
};


app.get("/", (req, res) => {
  res.render("login"); 
});



app.post("/authenticated", async (req, res) => {
  const { email, password } = req.body;
  try {
    const userCredential = await autenticador.signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    const idToken = await user.getIdTokenResult();
    
     req.session.user = {
      uid: user.uid,
      email: user.email,
      token: idToken.token,
      isAdmin: idToken.claims.isAdmin || false,
    };
    const promocoesPath = path.join(__dirname, 'promocoes.json');
    const promocoes = JSON.parse(fs.readFileSync(promocoesPath, 'utf-8'));
    req.session.promocoes = promocoes;
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


app.post("/admin/cadastroAdmin", checkAuth, checkAdmin, async (req, res) => {
  const { email, password } = req.body;

  try {
    const userRecord = await admin.auth().createUser({
      email,
      password,
    });
    await admin.auth().setCustomUserClaims(userRecord.uid, { isAdmin: true });
    res.redirect('/home?msg=Usuário criado com sucesso!');
  } catch (error) {
    console.error("Erro ao criar novo administrador:", error);
    res.status(500).send("Erro ao criar novo administrador.");
  }
});



app.get("/admin/cadastroAdmin", checkAuth, checkAdmin, (req, res) => {
  res.render("create-admin");
});

const multer = require('multer');


const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, './public/images');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname)); 
  },
});

const upload = multer({ storage: storage });

app.post("/admin/cadastro/produto", checkAuth, checkAdmin, upload.single('foto'), (req, res) => {
  const { nome, descricao, preco, categoria } = req.body;
  const imagemUrl = req.file ? `./images/${req.file.filename}` : '';

  const novoProduto = {
    id: produtos.length + 1,
    nome,
    descricao,
    preco: parseFloat(preco),
    categoria,
    imagemUrl,
    disponibilidade: 999,
  };

  produtos.push(novoProduto);
  fs.writeFileSync(path.join(__dirname, "produtos.json"), JSON.stringify(produtos, null, 2));

  res.redirect('/home?msg=Produto cadastrado com sucesso!');
});

app.get("/admin/cadastro/produto", checkAuth, checkAdmin, (req, res) => {
  res.render("cadastro", { user: req.session.user });
});



app.get("/admin", checkAdmin,checkAdmin, (req, res) => {
  res.send("Bem-vindo à página de administrador!");
});

app.get("/logout", (req, res) => {
  req.session.destroy();
  res.render("login");
});

app.get("/home", checkAuth, (req, res) => {
  const paginaAtual = parseInt(req.query.page) || 1;
  const produtosPorPagina = 20;
  const ordenar = req.query.ordenar || 'titulo';
  const produtosOrdenados = [...produtos].sort((a, b) => {
    if (ordenar === 'preco') return a.preco - b.preco;
    return a.nome.localeCompare(b.nome);
  });
  const inicio = (paginaAtual - 1) * produtosPorPagina;
  const fim = inicio + produtosPorPagina;
  const produtosPaginados = produtosOrdenados.slice(inicio, fim);

  const totalPaginas = Math.ceil(produtosOrdenados.length / produtosPorPagina);
  const paginas = Array.from({ length: totalPaginas }, (_, i) => i + 1);
  const promocoes = req.session.promocoes || [];  
  req.session.promocoes = promocoes;
  res.render('home', {
    produtos: produtosPaginados,
    paginaAtual,
    paginas,
    promocoes,
    user: req.session.user,
    isAdmin: req.session.user.isAdmin
  });
});


app.get("/produto/:id", checkAuth, (req, res) => {
  const id = parseInt(req.params.id); 
  if (isNaN(id)) return res.status(400).send("ID inválido"); 

  const produto = produtos.find((p) => p.id === id); 
  if (!produto) return res.status(404).send("Produto não encontrado");

  res.render("produto", {
    produto,
    isAdmin: req.session.user.isAdmin, 
    user: req.session.user,
  });
});


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

app.get("/admin/excluir/produto/:id", checkAuth, checkAdmin, (req, res) => {
  const produtoId = parseInt(req.params.id); // Pega o ID do produto a ser excluído
  const index = produtos.findIndex(produto => produto.id === produtoId); // Localiza o índice do produto

  if (index !== -1) {
    produtos.splice(index, 1); // Remove o produto do array
    fs.writeFileSync(path.join(__dirname, "produtos.json"), JSON.stringify(produtos, null, 2)); // Atualiza o JSON
    res.redirect('/home?msg=Produto excluído com sucesso!'); // Redireciona após a exclusão
  } else {
    res.status(404).send("Produto não encontrado"); // Caso não encontre o produto
  }
});



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

app.get("/compra/:id", checkAuth,checkAdmin, (req, res) => {
  const produto = produtos.find((p) => p.id === parseInt(req.params.id));
  if (!produto) return res.status(404).send("Produto não encontrado");

  res.render("compra", {
    produto,
    user: req.session.user,
    isAdmin: idToken.claims.isAdmin || false
  });
});

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

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});


app.get('/admin/cadastro/promocao', checkAuth, checkAdmin, (req, res) => {
  const promocoes = req.session.promocoes || []; 
  res.render('admin-promocoes', {
    promocoes: promocoes, 
    user: req.session.user 
  });
});


app.post('/admin/cadastro/promocao', checkAuth, checkAdmin, upload.single('media'), (req, res) => {
  const { titulo, descricao, dataFim } = req.body;
  const mediaUrl = req.file ? `/uploads/${req.file.filename}` : null;
  const tipo = req.file.mimetype.startsWith('image') ? 'imagem' : 'video';

  const novaPromocao = {
    id: promocoes.length + 1,
    titulo,
    descricao,
    mediaUrl,
    tipo,
    dataFim: dataFim || null
  };

  promocoes.push(novaPromocao);
  fs.writeFileSync(path.join(__dirname, 'promocoes.json'), JSON.stringify(promocoes, null, 2));

  res.redirect('/');
});


// Rota para exibir o formulário de edição da promoção
app.get('/admin/promocoes/:id/editar', checkAuth, checkAdmin, (req, res) => {
  const promocaoId = parseInt(req.params.id);
  
  // Carregar promoções do arquivo JSON
  const promocoesPath = path.join(__dirname, 'promocoes.json');
  const promocoes = JSON.parse(fs.readFileSync(promocoesPath, 'utf-8'));

  // Encontrar a promoção pelo ID
  const promocao = promocoes.find(p => p.id === promocaoId);

  if (!promocao) {
    return res.status(404).send('Promoção não encontrada.');
  }

  // Renderiza a página de edição com os dados da promoção
  res.render('editar-promocao', { promocao });
});

// Rota para processar a edição da promoção
app.post('/admin/promocoes/:id/editar', checkAuth, checkAdmin, upload.single('media'), (req, res) => {
  const promocaoId = parseInt(req.params.id);
  
  // Carregar promoções do arquivo JSON
  const promocoesPath = path.join(__dirname, 'promocoes.json');
  const promocoes = JSON.parse(fs.readFileSync(promocoesPath, 'utf-8'));

  // Encontrar a promoção pelo ID
  const promocaoIndex = promocoes.findIndex(p => p.id === promocaoId);

  if (promocaoIndex === -1) {
    return res.status(404).send('Promoção não encontrada.');
  }

  // Atualizar os dados da promoção
  const { titulo, descricao, dataFim } = req.body;
  const mediaUrl = req.file ? `/uploads/${req.file.filename}` : promocoes[promocaoIndex].mediaUrl; // Mantém a mídia original se nenhuma nova for enviada
  const tipo = req.file ? (req.file.mimetype.startsWith('image') ? 'imagem' : 'video') : promocoes[promocaoIndex].tipo;

  // Atualizando a promoção
  promocoes[promocaoIndex] = {
    ...promocoes[promocaoIndex],  // Mantém os dados antigos
    titulo,
    descricao,
    mediaUrl,
    tipo,
    dataFim: dataFim || promocoes[promocaoIndex].dataFim  // Se a dataFim não for fornecida, mantém a anterior
  };

  // Salvar as promoções atualizadas no arquivo JSON
  fs.writeFileSync(promocoesPath, JSON.stringify(promocoes, null, 2));

  // Redirecionar de volta para a página de promoções ou home
  res.redirect('/home?msg=Promoção editada com sucesso!');
});
