const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const session = require("express-session");

const app = express();

app.use(express.json());
app.use(cors());

app.use(session({
  secret: "chave-secreta-do-sistema-hospitalar",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    maxAge: 8 * 60 * 60 * 1000
  }
}));

app.use(express.static(path.join(__dirname, "../frontend")));

const DB_FILE = path.join(__dirname, "db.json");

function readDB() {
  if (!fs.existsSync(DB_FILE)) {
    return {
      usuarios: [],
      pacientes: [],
      triagens: [],
      consultas: [],
      tv_chamada: null,
      tv_historico: []
    };
  }
  const db = JSON.parse(fs.readFileSync(DB_FILE));
  if (!db.tv_chamada) db.tv_chamada = null;
  if (!db.tv_historico) db.tv_historico = [];
  return db;
}

function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// LOGIN
app.post("/login", (req, res) => {
  const db = readDB();

  const user = db.usuarios.find(u =>
    u.usuario === req.body.usuario &&
    u.senha === req.body.senha
  );

  if (!user) {
    return res.status(401).json({
      erro: "Usuário ou senha inválidos"
    });
  }

  req.session.usuario = {
    usuario: user.usuario,
    tipo: user.tipo
  };

  res.json({
    usuario: user.usuario,
    tipo: user.tipo
  });
});

// ATENDIMENTO - cadastrar paciente
app.post("/atendimento", (req, res) => {
  const db = readDB();

  const paciente = {
    id: Date.now(),
    nome: req.body.nome,
    cpf: req.body.cpf,
    tipo: req.body.tipo,
    status: "triagem",
    createdAt: new Date()
  };

  db.pacientes.push(paciente);
  writeDB(db);

  res.json(paciente);
});

// LISTAR PACIENTES (triagem busca quem foi cadastrado no atendimento)
app.get("/pacientes", (req, res) => {
  const db = readDB();
  res.json(db.pacientes);
});

// TRIAGEM
app.post("/triagem", (req, res) => {
  const db = readDB();

  let risco = req.body.risco;

  if (req.body.temperatura >= 39) {
    risco = "vermelho";
  } else if (req.body.temperatura >= 38) {
    risco = "amarelo";
  } else if (!risco) {
    risco = "verde";
  }

  const triagem = {
    id: Date.now(),
    nome: req.body.nome,
    sintoma: req.body.sintoma,
    temperatura: req.body.temperatura,
    alergia: req.body.alergia,
    observacao: req.body.observacao,
    risco,
    status: "aguardando_medico",
    createdAt: new Date()
  };

  db.triagens.push(triagem);
  writeDB(db);

  res.json(triagem);
});

// LISTAR TRIAGENS
app.get("/triagens", (req, res) => {
  const db = readDB();
  res.json(db.triagens);
});

// ============ MÍDIA INDOOR - TV ============

// Função criada para enviar a chamada do paciente para a tela da TV.
// Serve para triagem chamar o paciente no guichê e para o médico chamar no consultório.
app.post("/tv/chamar", (req, res) => {
  const db = readDB();

  const chamada = {
    id: Date.now().toString(),
    localTipo: req.body.localTipo,
    localNumero: req.body.localNumero,
    paciente: req.body.paciente,
    hora: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  };

  db.tv_chamada = chamada;
  db.tv_historico.unshift(chamada);
  if (db.tv_historico.length > 5) db.tv_historico.pop();

  writeDB(db);
  res.json(chamada);
});

// Função criada para consultar a chamada atual e o histórico que será exibido na TV.
// Essa rota é usada para atualizar a tela automaticamente a cada poucos segundos.
app.get("/tv/chamada", (req, res) => {
  const db = readDB();
  res.json({
    chamada: db.tv_chamada,
    historico: db.tv_historico
  });
});

// LISTA DE MEDICAÇÕES
app.get("/lista-medicacoes", (req, res) => {
  res.json([
    "Dipirona",
    "Paracetamol",
    "Ibuprofeno",
    "Amoxicilina",
    "Azitromicina",
    "Loratadina",
    "Omeprazol",
    "Buscopan",
    "Dramin",
    "Soro fisiológico"
  ]);
});

// CONSULTA
app.post("/consulta", (req, res) => {
  const db = readDB();

  const consulta = {
    id: Date.now(),
    paciente: req.body.paciente,
    diagnostico: req.body.diagnostico,
    medicacao: req.body.medicacao,
    obs: req.body.obs,
    createdAt: new Date()
  };

  db.consultas.push(consulta);
  writeDB(db);

  res.json(consulta);
});

// ADMIN
app.post("/usuarios", (req, res) => {
  if (!req.session.usuario || req.session.usuario.tipo !== "admin") {
    return res.status(403).json({
      erro: "Acesso negado"
    });
  }

  const { usuario, senha, tipo } = req.body;

  if (!usuario || !senha || !tipo) {
    return res.status(400).json({
      erro: "Preencha todos os campos"
    });
  }

  const db = readDB();

  const existe = db.usuarios.some(
    u => u.usuario.toLowerCase() === usuario.toLowerCase()
  );

  if (existe) {
    return res.status(400).json({
      erro: "Esse usuário já existe"
    });
  }

  const novoUsuario = {
    id: Date.now(),
    usuario,
    senha,
    tipo
  };

  db.usuarios.push(novoUsuario);

  writeDB(db);

  res.json({
    mensagem: "Usuário cadastrado com sucesso",
    usuario: {
      id: novoUsuario.id,
      usuario: novoUsuario.usuario,
      tipo: novoUsuario.tipo
    }
  });
});

// MEDICAÇÕES
app.get("/medicacoes", (req, res) => {
  const db = readDB();
  res.json(db.consultas);
});

// FINALIZAR SESSÃO
app.post("/logout", (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).json({
        erro: "Não foi possível encerrar a sessão"
      });
    }

    res.json({
      mensagem: "Sessão encerrada"
    });
  });
});

// VERIFICAR SESSÃO
app.get("/sessao", (req, res) => {
  if (!req.session.usuario) {
    return res.status(401).json({
      logado: false
    });
  }

  res.json({
    logado: true,
    usuario: req.session.usuario
  });
});

// START
const PORT = process.env.PORT
            || 3000;
app.listen(PORT, () => {
  console.log(`Hospital rodando em http://localhost:3000`);
});
