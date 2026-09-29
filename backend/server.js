const express = require("express");
const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
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

  const db =
    JSON.parse(
      fs.readFileSync(DB_FILE, "utf8")
    );


  // Garantir que os arrays existam

  if (!Array.isArray(db.usuarios)) {
    db.usuarios = [];
  }

  if (!Array.isArray(db.pacientes)) {
    db.pacientes = [];
  }

  if (!Array.isArray(db.triagens)) {
    db.triagens = [];
  }

  if (!Array.isArray(db.consultas)) {
    db.consultas = [];
  }

  if (!db.tv_chamada) {
    db.tv_chamada = null;
  }

  if (!Array.isArray(db.tv_historico)) {
    db.tv_historico = [];
  }


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
    rg: req.body.rg,
    dataNascimento: req.body.dataNascimento,
    sexo: req.body.sexo,
    nomeMae: req.body.nomeMae,
    estadoCivil: req.body.estadoCivil,
    endereco: req.body.endereco,
    telefone: req.body.telefone,
    email: req.body.email,
    contatoEmergencia: req.body.contatoEmergencia,
    tipo: req.body.tipo,

    status: "triagem",

    createdAt: new Date(),

    alta: null
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

// BUSCAR PACIENTE PELO ID
app.get("/pacientes/:id", (req, res) => {
  const db = readDB();
  const id = Number(req.params.id);
  const paciente = db.pacientes.find(
    p => p.id === id
  );
  if (!paciente) {
    return res.status(404).json({
      erro: "Paciente não encontrado."
    });
  }
  res.json(paciente);
});


// ==========================================
// TRIAGEM
// ==========================================

app.post("/triagem", (req, res) => {

  const db = readDB();


  // ==========================================
  // DADOS RECEBIDOS
  // ==========================================

  const pacienteId =
    Number(req.body.pacienteId);

  const nome =
    req.body.nome;

  const sintoma =
    req.body.sintoma;

  const temperatura =
    req.body.temperatura;

  const alergia =
    req.body.alergia || "";

  const observacao =
    req.body.observacao || "";


  // ==========================================
  // VALIDAR PACIENTE
  // ==========================================

  if (!pacienteId) {

    return res.status(400).json({
      erro: "Paciente não informado."
    });

  }


  const paciente =
    db.pacientes.find(
      p => p.id === pacienteId
    );


  if (!paciente) {

    return res.status(404).json({
      erro: "Paciente não encontrado."
    });

  }


  // ==========================================
  // VERIFICAR STATUS
  // ==========================================

  if (paciente.status !== "triagem") {

    return res.status(400).json({
      erro:
        "Este paciente não está aguardando triagem."
    });

  }


  // ==========================================
  // CLASSIFICAÇÃO DE RISCO
  // ==========================================

  let risco =
    req.body.risco;


  if (temperatura >= 39) {

    risco = "vermelho";

  }

  else if (temperatura >= 38) {

    risco = "amarelo";

  }

  else if (!risco) {

    risco = "verde";

  }


  // ==========================================
  // CRIAR TRIAGEM
  // ==========================================

  const triagem = {

    id:
      Date.now(),

    pacienteId:
      paciente.id,

    nome:
      paciente.nome,

    sintoma:
      sintoma,

    temperatura:
      temperatura,

    alergia:
      alergia,

    observacao:
      observacao,

    risco:
      risco,

    status:
      "aguardando_medico",

    createdAt:
      new Date()

  };


  // ==========================================
  // SALVAR TRIAGEM
  // ==========================================

  db.triagens.push(
    triagem
  );


  /*
   * Agora o paciente deixa de estar
   * aguardando triagem.
   *
   * Isso faz com que ele desapareça
   * da fila do triagem.html.
   */

  paciente.status =
    "aguardando_medico";


  writeDB(db);


  // ==========================================
  // RESPONDER
  // ==========================================

  res.json({

    mensagem:
      "Triagem salva com sucesso.",

    triagem:
      triagem,

    paciente:
      paciente

  });

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

  const pacienteNome =
    req.body.paciente;

  const diagnostico =
    req.body.diagnostico || "";

  const medicacao =
    req.body.medicacao || "";

  const obs =
    req.body.obs || "";


  if (!pacienteNome) {

    return res.status(400).json({
      erro: "Paciente não informado."
    });

  }


  /*
   * Procura o paciente pelo nome.
   */

  const paciente =
    db.pacientes.find(
      p => p.nome === pacienteNome
    );


  if (!paciente) {

    return res.status(404).json({
      erro: "Paciente não encontrado."
    });

  }


  /*
   * Cria a consulta.
   */

  const consulta = {

    id: Date.now(),

    paciente: paciente.nome,

    pacienteId: paciente.id,

    diagnostico: diagnostico,

    medicacao: medicacao,

    obs: obs,

    createdAt: new Date()

  };


  db.consultas.push(consulta);


  /*
   * O paciente terminou a consulta
   * e agora pode seguir para a alta.
   */

  paciente.status =
    "aguardando_alta";


  writeDB(db);


  res.json({

    mensagem:
      "Consulta salva com sucesso.",

    consulta:
      consulta,

    paciente:
      paciente

  });

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

// REGISTRAR ALTA

app.post("/alta", (req, res) => {
  const db = readDB();
  const pacienteId = Number(req.body.pacienteId);
  const dataAlta = req.body.dataAlta;
  const observacoes = req.body.observacoes || "";

  if (!pacienteId) {
    return res.status(400).json({
      erro: "Paciente não informado."
    });
  }
  if (!dataAlta) {
    return res.status(400).json({
      erro: "Data da alta não informada."
    });
  }
  const paciente =
    db.pacientes.find(p => p.id === pacienteId);
  if (!paciente) {
    return res.status(404).json({
      erro: "Paciente não encontrado."
    });
  }

  if (paciente.status === "alta") {
    return res.status(400).json({
      erro: "Este paciente já recebeu alta."
    });
  }

  paciente.status = "alta";
  paciente.alta = {
    dataAlta: dataAlta,
    observacoes: observacoes,
    registradaEm: new Date()
  };
  writeDB(db);
  res.json({
    mensagem:
      "Alta registrada com sucesso.",
    paciente: paciente
  });
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

// GERAR PDF DA ALTA
app.get("/alta/:id/pdf", (req, res) => {
  const db = readDB();
  const pacienteId = Number(req.params.id);
  const paciente =
    db.pacientes.find(p => p.id === pacienteId);
  if (!paciente) {

    return res.status(404).json({
      erro: "Paciente não encontrado."
    });

  }


  /*
   * IMPORTANTE:
   *
   * O PDF somente pode ser gerado
   * se a alta já tiver sido registrada.
   */

  if (
    paciente.status !== "alta" ||
    !paciente.alta
  ) {

    return res.status(400).json({
      erro:
        "A alta deste paciente ainda não foi registrada."
    });

  }


  /*
   * Procura a triagem pelo nome.
   *
   * Seu sistema atual salva a triagem pelo nome,
   * então fazemos a associação dessa maneira.
   */

  const triagem =
    [...db.triagens]
      .reverse()
      .find(
        t => t.nome === paciente.nome
      );


  /*
   * Procura a consulta médica pelo nome.
   */

  const consulta =
    [...db.consultas]
      .reverse()
      .find(
        c => c.paciente === paciente.nome
      );


  /*
   * Cria o documento PDF.
   */

  const doc =
    new PDFDocument({
      size: "A4",
      margin: 50
    });


  /*
   * Nome do arquivo.
   */

  const nomeArquivo =
    `alta_${paciente.cpf || paciente.id}.pdf`;


  /*
   * Cabeçalhos da resposta.
   */

  res.setHeader(
    "Content-Type",
    "application/pdf"
  );

  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${nomeArquivo}"`
  );


  /*
   * Envia o PDF diretamente
   * para o navegador.
   */

  doc.pipe(res);


  // ==========================================
  // CABEÇALHO
  // ==========================================

  doc
    .fontSize(20)
    .font("Helvetica-Bold")
    .text(
      "DOCUMENTO DE ALTA DO PACIENTE",
      {
        align: "center"
      }
    );


  doc.moveDown();


  doc
    .fontSize(10)
    .font("Helvetica")
    .text(
      `Emitido em: ${new Date().toLocaleString("pt-BR")}`,
      {
        align: "center"
      }
    );


  doc.moveDown(2);


  // ==========================================
  // DADOS DO PACIENTE
  // ==========================================

  doc
    .fontSize(14)
    .font("Helvetica-Bold")
    .text("DADOS DO PACIENTE");


  doc.moveDown();


  doc
    .fontSize(11)
    .font("Helvetica");


  doc.text(
    `Nome completo: ${paciente.nome || "Não informado"}`
  );

  doc.text(
    `CPF: ${paciente.cpf || "Não informado"}`
  );

  doc.text(
    `RG: ${paciente.rg || "Não informado"}`
  );

  doc.text(
    `Data de nascimento: ${paciente.dataNascimento || "Não informado"}`
  );

  doc.text(
    `Sexo: ${paciente.sexo || "Não informado"}`
  );

  doc.text(
    `Nome da mãe: ${paciente.nomeMae || "Não informado"}`
  );

  doc.text(
    `Estado civil: ${paciente.estadoCivil || "Não informado"}`
  );

  doc.text(
    `Endereço: ${paciente.endereco || "Não informado"}`
  );

  doc.text(
    `Telefone: ${paciente.telefone || "Não informado"}`
  );

  doc.text(
    `E-mail: ${paciente.email || "Não informado"}`
  );

  doc.text(
    `Contato de emergência: ${paciente.contatoEmergencia || "Não informado"}`
  );

  doc.text(
    `Tipo de atendimento: ${paciente.tipo || "Não informado"}`
  );


  // ==========================================
  // TRIAGEM
  // ==========================================

  if (triagem) {

    doc.moveDown(2);

    doc
      .fontSize(14)
      .font("Helvetica-Bold")
      .text("TRIAGEM");

    doc.moveDown();

    doc
      .fontSize(11)
      .font("Helvetica");

    doc.text(
      `Sintoma: ${triagem.sintoma || "Não informado"}`
    );

    doc.text(
      `Temperatura: ${
        triagem.temperatura || "Não informado"
      }`
    );

    doc.text(
      `Alergias: ${
        triagem.alergia || "Não informado"
      }`
    );

    doc.text(
      `Classificação de risco: ${
        triagem.risco || "Não informado"
      }`
    );

    doc.text(
      `Observação da triagem: ${
        triagem.observacao || "Não informado"
      }`
    );

  }


  // ==========================================
  // CONSULTA MÉDICA
  // ==========================================

  if (consulta) {

    doc.moveDown(2);

    doc
      .fontSize(14)
      .font("Helvetica-Bold")
      .text("CONSULTA MÉDICA");

    doc.moveDown();

    doc
      .fontSize(11)
      .font("Helvetica");

    doc.text(
      `Diagnóstico: ${
        consulta.diagnostico || "Não informado"
      }`
    );

    doc.text(
      `Medicação: ${
        consulta.medicacao || "Não informado"
      }`
    );

    doc.text(
      `Observações: ${
        consulta.obs || "Não informado"
      }`
    );

  }


  // ==========================================
  // ALTA
  // ==========================================

  doc.moveDown(2);

  doc
    .fontSize(14)
    .font("Helvetica-Bold")
    .text("INFORMAÇÕES DA ALTA");

  doc.moveDown();

  doc
    .fontSize(11)
    .font("Helvetica");


  const dataAlta =
    new Date(
      paciente.alta.dataAlta
    ).toLocaleString("pt-BR");


  doc.text(
    `Data e hora da alta: ${dataAlta}`
  );


  doc.text(
    `Observações da alta: ${
      paciente.alta.observacoes ||
      "Nenhuma observação informada."
    }`
  );


  // ==========================================
  // RODAPÉ
  // ==========================================

  doc.moveDown(4);

  doc
    .fontSize(9)
    .fillColor("#666")
    .text(
      "Documento gerado automaticamente pelo sistema hospitalar.",
      {
        align: "center"
      }
    );


  /*
   * Finaliza o PDF.
   */

  doc.end();

});

// START
const PORT = process.env.PORT
            || 3000;
app.listen(PORT, () => {
  console.log(`Hospital rodando em http://localhost:3000`);
});
