require('dotenv').config();

const express = require('express');
const mysql = require('mysql');
const bodyParser = require('body-parser');
const cors = require('cors');
const PDFDocument = require('pdfkit');

const app = express();
const port = process.env.PORT || 3000;

const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

db.connect((err) => {
    if (err) {
        throw err;
    }
    console.log('Conectado ao MySQL');
});

app.use(bodyParser.json());
app.use(cors());

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Erro interno do servidor');
});

//POSTS 
// Realizar o registro do usuario no banco
app.post('/register', (req, res) => {
    const { nome, email, senha } = req.body;

    if (!nome || !email || !senha) {
        return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
    }

    db.query('INSERT INTO usuarios (nome, email, senha) VALUES (?, ?, ?)', [nome, email, senha], (err, result) => {
        if (err) {
            console.error('Erro ao inserir usuário:', err.message);
            return res.status(500).json({ error: 'Erro interno ao registrar usuário' });
        }
        console.log('Usuário registrado com sucesso');
        return res.status(201).json({ message: 'Usuário registrado com sucesso' });
    });
});

// buscar o registro do usuario no banco
app.post('/login', (req, res) => {
    const { email, senha } = req.body;

    db.query('SELECT * FROM usuarios WHERE email = ? AND senha = ?', [email, senha], (err, result) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        if (result.length > 0) {
            return res.json({ id: result[0].id, nome: result[0].nome });
        } else {
            return res.status(401).json({ error: 'Credenciais inválidas' });
        }
    });
});

// Realizar o registro do novo projeto do usuario no banco
app.post('/projects', (req, res) => {
    const { nomeProjeto, idGestor, objetivoProjeto, informacoesProjeto } = req.body;

    if (!nomeProjeto || !idGestor || !objetivoProjeto || !informacoesProjeto) {
    return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
    }

    const queryProjeto = `
    INSERT INTO projeto (IdGestor, nomeProjeto, objetivoProjeto, informacoesProjeto)
    VALUES (?, ?, ?, ?)
    `;

    db.query(queryProjeto, [idGestor, nomeProjeto, objetivoProjeto, informacoesProjeto], (err, result) => {
    if (err) {
        console.error('Erro ao criar projeto:', err.message);
        return res.status(500).json({ error: 'Erro interno ao criar projeto' });
    }

    const projetoId = result.insertId; 

    const queryProjetoUsuario = `
        INSERT INTO projetousuario (idProjeto, idUsuario)
        VALUES (?, ?)
    `;

    db.query(queryProjetoUsuario, [projetoId, idGestor], (err) => {
        if (err) {
        console.error('Erro ao associar gestor ao projeto:', err.message);
        return res.status(500).json({ error: 'Erro interno ao associar gestor ao projeto' });
        }

        console.log('Projeto criado com sucesso!');
        console.log('Gestor associado ao projeto com sucesso!');

        return res.status(201).json({
        projetoId: projetoId,
        associacaoId: result.insertId // ID da associação na ProjetoUsuario
        });
    });
    });
});

// Realizar o registro de uma nova tarefa no banco
app.post('/tasks', (req, res) => {
    const { nomeTarefa, infoTarefa, idProjeto, idPercurso, idQuadro, idDesignado } = req.body;

    if (!nomeTarefa || !idProjeto || !idPercurso || !idQuadro || !idDesignado) {
        return res.status(400).json({ error: 'Todos os campos obrigatórios devem ser preenchidos' });
    }

    // Busca o status do percurso
    const getPercursoStatusQuery = `
        SELECT status
        FROM Percurso
        WHERE idPercurso = ?
    `;

    db.query(getPercursoStatusQuery, [idPercurso], (err, percursoResult) => {
        if (err) {
            console.error('Erro ao buscar o status do percurso:', err.message);
            return res.status(500).json({ error: 'Erro interno ao buscar o status do percurso' });
        }

        if (percursoResult.length === 0) {
            return res.status(404).json({ error: 'Percurso não encontrado' });
        }

        const percursoStatus = percursoResult[0].status;

        // Busca o maior valor de sequencia das tarefas dentro do quadro
        const getMaxSequenciaQuery = `
            SELECT COALESCE(MAX(sequencia), 0) AS maxSequencia
            FROM tarefas
            WHERE idQuadro = ?
        `;

        db.query(getMaxSequenciaQuery, [idQuadro], (err, sequenciaResult) => {
            if (err) {
                console.error('Erro ao buscar a maior sequência:', err.message);
                return res.status(500).json({ error: 'Erro interno ao buscar a maior sequência' });
            }

            const maxSequencia = sequenciaResult[0].maxSequencia;
            const newSequencia = maxSequencia + 1;

            const insertQuery = `
                INSERT INTO tarefas (nomeTarefa, infoTarefa, idProjeto, idPercurso, idQuadro, idDesignado, status, sequencia)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `;

            db.query(insertQuery, [nomeTarefa, infoTarefa, idProjeto, idPercurso, idQuadro, idDesignado, percursoStatus, newSequencia], (err, result) => {
                if (err) {
                    console.error('Erro ao adicionar tarefa:', err.message);
                    return res.status(500).json({ error: 'Erro interno ao adicionar tarefa' });
                }

                console.log('Tarefa adicionada com sucesso');
                return res.status(201).json({ message: 'Tarefa adicionada com sucesso', tarefaId: result.insertId });
            });
        });
    });
});

// Realizar o registro de um novo relatório no banco
app.post('/reports', (req, res) => {
    const { idUsuario, idProjeto, nomeRelatorio, nomeProjeto } = req.body;

    if (!idUsuario || !idProjeto || !nomeRelatorio || !nomeProjeto) {
        return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
    }

    const query = `
        INSERT INTO relatorios (idUsuario, idProjeto, nomeRelatorio, nomeProjeto)
        VALUES (?, ?, ?, ?)
    `;

    db.query(query, [idUsuario, idProjeto, nomeRelatorio, nomeProjeto], (err, result) => {
        if (err) {
            console.error('Erro ao adicionar relatório:', err.message);
            return res.status(500).json({ error: 'Erro interno ao adicionar relatório' });
        }

        console.log('Relatório adicionado com sucesso');
        return res.status(201).json({ message: 'Relatório adicionado com sucesso', relatorioId: result.insertId });
    });
});

// Realiza o registro de novo percurso
app.post('/novopercurso', async (req, res) => {
    const { nomePercurso, idProjeto, dataInicial, dataFinal } = req.body;
  
    if (!nomePercurso || !idProjeto || !dataInicial || !dataFinal) {
        return res.status(400).send('Dados obrigatórios não fornecidos');
    }
  
    try {
        // Determina o status do percurso com base na data de início
        const today = new Date().toISOString().split('T')[0];
        const status = (dataInicial === today) ? 'Aberto' : 'Em Espera';
        
        const queryInsertPercurso = `
            INSERT INTO Percurso (idProjeto, dataInicio, dataFinal, nomePercurso, status) 
            VALUES (?, ?, ?, ?, ?)
        `;
      
        // Iniciando a transação
        db.beginTransaction((err) => {
            if (err) {
                return res.status(500).send('Erro ao iniciar transação');
            }
  
            db.query(queryInsertPercurso, [idProjeto, dataInicial, dataFinal, nomePercurso, status], (err, result) => {
                if (err) {
                    return db.rollback(() => {
                        res.status(500).send('Erro ao registrar percurso');
                    });
                }
  
                const idPercurso = result.insertId;
  
                const queryInsertQuadro = `
                    INSERT INTO quadro (nomeTabela, idPercurso, idProjeto, sequencia) 
                    VALUES 
                        ('A Fazer', ?, ?, 1),
                        ('Em Processo', ?, ?, 2),
                        ('Feito', ?, ?, 3)
                `;
  
                db.query(queryInsertQuadro, [idPercurso, idProjeto, idPercurso, idProjeto, idPercurso, idProjeto], (err, result) => {
                    if (err) {
                        return db.rollback(() => {
                            res.status(500).send('Erro ao criar quadros padrão');
                        });
                    }
  
                    db.commit((err) => {
                        if (err) {
                            return db.rollback(() => {
                                res.status(500).send('Erro ao confirmar transação');
                            });
                        }
  
                        res.status(201).send('Percurso e quadros padrão registrados com sucesso');
                    });
                });
            });
        });
    } catch (error) {
        res.status(500).send('Erro ao processar a solicitação');
    }
});

// Endpoint para buscar usuários por nome e/ou email
app.post('/busca-membros', (req, res) => {
    const { nome, email } = req.body;
    
    if (!nome && !email) {
        return res.status(400).json({ message: 'Nome ou Email deve ser fornecido.' });
    }
    
    let query = 'SELECT id, nome, email FROM usuarios WHERE';
    let params = [];

    if (nome) {
        query += ' nome LIKE ?';
        params.push(`%${nome}%`);
    }
    if (email) {
        if (nome) query += ' AND';
        query += ' email LIKE ?';
        params.push(`%${email}%`);
    }

    db.query(query, params, (err, results) => {
        if (err) {
            console.error('Erro ao buscar usuários:', err.message);
            return res.status(500).json({ message: 'Erro ao buscar usuários.' });
        }
        res.json(results);
    });
});

// Endpoint para adicionar um membro ao projeto
app.post('/projeto/add-membro', async (req, res) => {
    const { idProjeto, idUsuario } = req.body;

    console.log('informações chegando: ', idProjeto, idUsuario);
    if (!idProjeto || !idUsuario) {
        return res.status(400).json({ message: 'ID do projeto e ID do usuário são obrigatórios.' });
    }

    const query = `
        INSERT INTO projetousuario (idProjeto, idUsuario) 
        VALUES (?, ?)
    `;

    db.query(query, [idProjeto, idUsuario], (err, result) => {
        if (err) {
            console.error('Erro ao adicionar membro:', err.message);
            return res.status(500).json({ error: 'Erro interno ao adicionar membro' });
        }

        console.log('Membro adicionado com sucesso');
        return res.status(201).json({ message: 'Membro adicionado com sucesso', tarefaId: result.insertId });
    });

});

// Endpoint adicionar grupo a um percurso
app.post('/grupo', async (req, res) => {
    const { idProjeto, idPercurso, nomeTabela } = req.body;

    console.log('informações chegando: ', idProjeto, idPercurso, nomeTabela);
    if (!idProjeto || !idPercurso || !nomeTabela) {
        return res.status(400).json({ message: 'Preencher todos os campos que são obrigatórios.' });
    }

    // Busca o maior valor de sequencia do quadro dentro do percurso
    const getMaxSequenciaQuery = `
        SELECT COALESCE(MAX(sequencia), 0) AS maxSequencia
        FROM quadro
        WHERE idPercurso = ?
    `;

    db.query(getMaxSequenciaQuery, [idPercurso], (err, result) => {
        if (err) {
            console.error('Erro ao buscar a maior sequência:', err.message);
            return res.status(500).json({ error: 'Erro interno ao buscar a maior sequência' });
        }

        const maxSequencia = result[0].maxSequencia;
        const newSequencia = maxSequencia + 1;

        const insertQuery = `
            INSERT INTO quadro (idProjeto, idPercurso, nomeTabela, sequencia) 
            VALUES (?, ?, ?, ?)
        `;

        db.query(insertQuery, [idProjeto, idPercurso, nomeTabela, newSequencia], (err, result) => {
            if (err) {
                console.error('Erro ao adicionar grupo:', err.message);
                return res.status(500).json({ error: 'Erro interno ao adicionar grupo' });
            }

            console.log('Grupo adicionado com sucesso');
            return res.status(201).json({ message: 'Grupo adicionado com sucesso' });
        });
    });
});



//GETS 
// Buscar membros do projeto
app.get('/membro/:projectId', (req, res) => {
    const projectId = req.params.projectId;
    const query = `
        SELECT 
            u.nome, 
            u.email,
            u.id
        FROM 
            usuarios u
        JOIN
            projetousuario pu ON u.id = pu.idUsuario
        WHERE 
            pu.idProjeto = ?
    `;

    db.query(query, [projectId], (err, results) => {
        if (err) {
            console.error('Erro ao buscar membro do projeto:', err.message);
            return res.status(500).json({ error: 'Erro interno ao buscar membros do projeto' });
        }

        return res.json(results);
    });

});

// Realizar a busca do percurso vigente no projeto do usuario no banco
app.get('/project-current-percurso/:projectId', (req, res) => {
    const projectId = req.params.projectId;
    
    const query = `
        SELECT 
            idPercurso, 
            nomePercurso
        FROM 
            Percurso 
        WHERE 
            idProjeto = ? 
            AND dataInicio <= CURDATE() 
            AND dataFinal >= CURDATE()
        LIMIT 1
    `;

    db.query(query, [projectId], (err, result) => {
        if (err) {
            console.error('Erro ao buscar percurso vigente:', err.message);
            return res.status(500).json({ error: 'Erro interno ao buscar percurso vigente' });
        }

        if (result.length > 0) {
            return res.json(result[0]);
        } else {
            return res.status(404).json({ error: 'Nenhum percurso vigente encontrado para este projeto' });
        }
    });
});

// Realizar a busca do percurso vigente e futuros no projeto do usuario no banco
app.get('/project-percursos-future/:projectId', (req, res) => {
    const projectId = req.params.projectId;
    
    const query = `
          SELECT 
            idPercurso, 
            nomePercurso
        FROM 
            Percurso 
        WHERE 
            idProjeto = ? 
            AND status = 'Aberto' OR status = 'Em Espera'
    `;

    db.query(query, [projectId], (err, result) => {
        if (err) {
            console.error('Erro ao buscar percurso vigente:', err.message);
            return res.status(500).json({ error: 'Erro interno ao buscar percurso vigente' });
        }
        return res.json(result);
    });
});

// Realizar a busca dos projetos do usuario no banco independente do perfil
app.get('/user-all-projects/:userId', (req, res) => {
    const userId = req.params.userId;

    const query = `
        SELECT 
            p.idProjeto, 
            p.nomeProjeto, 
            p.IdGestor
        FROM 
            projeto p
        JOIN 
            projetousuario pu ON p.idProjeto = pu.idProjeto
        WHERE 
            pu.idUsuario = ?
    `;

    db.query(query, [userId], (err, results) => {
        if (err) {
            console.error('Erro ao buscar projetos do usuário:', err.message);
            return res.status(500).json({ error: 'Erro interno ao buscar projetos do usuário' });
        }

        return res.json(results);
    });
});

// Realizar a busca dos grupos dentro do percurso
app.get('/project-percurso-quadros/:projectId/:percursoId', (req, res) => {
    const projectId = req.params.projectId;
    const percursoId = req.params.percursoId;

    const query = `
        SELECT idQuadro, nomeTabela
        FROM quadro
        WHERE idProjeto = ? AND idPercurso = ?
    `;

    db.query(query, [projectId, percursoId], (err, results) => {
        if (err) {
            console.error('Erro ao buscar quadros do projeto e percurso:', err.message);
            return res.status(500).json({ error: 'Erro interno ao buscar quadros do projeto e percurso' });
        }

        return res.json(results);
    });
});

// Realizar a busca tarefas que o usuario é o designado (TELA INICIAL)
app.get('/tasks/:userId', (req, res) => {
    const userId = req.params.userId;

    const query = `
        SELECT idTarefa, nomeTarefa, status 
        FROM tarefas 
        WHERE idDesignado = ? && status != "Em Espera"
        ORDER BY idTarefa DESC 
        LIMIT 2
    `;

    db.query(query, [userId], (err, results) => {
        if (err) {
            console.error('Erro ao buscar tarefas:', err.message);
            return res.status(500).json({ error: 'Erro interno ao buscar tarefas' });
        }

        return res.json(results);
    });
});

// Realizar a busca no banco dos projetos que o usuario participa (TELA INICIAL)
app.get('/projects/:userId', (req, res) => {
    const userId = req.params.userId;

    const query = `
        SELECT 
            p.idProjeto, 
            p.nomeProjeto, 
            p.idGestor,
            u.nome AS nomeGestor
        FROM 
            projeto p
        JOIN 
            projetousuario pu ON p.idProjeto = pu.idProjeto
        JOIN 
            usuarios u ON p.IdGestor = u.id
        WHERE 
            pu.idUsuario = ?
        ORDER BY 
            p.idProjeto DESC 
        LIMIT 2
    `;

    db.query(query, [userId], (err, results) => {
        if (err) {
            console.error('Erro ao buscar projetos:', err.message);
            return res.status(500).json({ error: 'Erro interno ao buscar projetos' });
        }

        return res.json(results);
    });
});

// Realizar a busca tarefas que o usuario é o designado (TELA TAREFAS)
app.get('/user-tasks/:userId', (req, res) => {
    const userId = req.params.userId;

    const query = `
        SELECT idTarefa, nomeTarefa, status 
        FROM tarefas 
        WHERE idDesignado = ? && status != "Em Espera"
    `;

    db.query(query, [userId], (err, results) => {
        if (err) {
            console.error('Erro ao buscar tarefas do usuário:', err.message);
            return res.status(500).json({ error: 'Erro interno ao buscar tarefas do usuário' });
        }

        return res.json(results);
    });
});

// Realizar a busca no banco dos projetos que o usuario participa (TELA PROJETOS)
app.get('/user-projects/:userId', (req, res) => {
    const userId = req.params.userId;

    const query = `
        SELECT 
            p.idProjeto, 
            p.nomeProjeto, 
            p.idGestor,
            u.nome AS nomeGestor
        FROM 
            projeto p
        JOIN 
            projetousuario pu ON p.idProjeto = pu.idProjeto
        JOIN 
            usuarios u ON p.IdGestor = u.id
        WHERE 
            pu.idUsuario = ?
    `;

    db.query(query, [userId], (err, results) => {
        if (err) {
            console.error('Erro ao buscar projetos do usuário:', err.message);
            return res.status(500).json({ error: 'Erro interno ao buscar projetos do usuário' });
        }

        return res.json(results);
    });
});

// Realiza a busca no banco de todos os membros de um projeto
app.get('/project-members/:projectId', (req, res) => {
    const projectId = req.params.projectId;

    // Consulta para obter o gestor do projeto
    const queryGestor = `
        SELECT 
            u.id, 
            u.nome
        FROM 
            projeto p
        JOIN 
            usuarios u ON p.IdGestor = u.id
        WHERE 
            p.idProjeto = ?
    `;

    // Consulta para obter os membros do projeto, exceto o gestor
    const queryMembros = `
        SELECT 
            u.id, 
            u.nome
        FROM 
            projetousuario pu
        JOIN 
            usuarios u ON pu.idUsuario = u.id
        WHERE 
            pu.idProjeto = ? 
            AND pu.idUsuario != (SELECT IdGestor FROM projeto WHERE idProjeto = ?)
    `;

    db.query(queryGestor, [projectId], (errGestor, resultGestor) => {
        if (errGestor) {
            console.error('Erro ao buscar gestor do projeto:', errGestor.message);
            return res.status(500).json({ error: 'Erro interno ao buscar gestor do projeto' });
        }

        if (resultGestor.length === 0) {
            return res.status(404).json({ error: 'Projeto não encontrado' });
        }

        const gestor = resultGestor[0];

        db.query(queryMembros, [projectId, projectId], (errMembros, resultMembros) => {
            if (errMembros) {
                console.error('Erro ao buscar membros do projeto:', errMembros.message);
                return res.status(500).json({ error: 'Erro interno ao buscar membros do projeto' });
            }

            const membros = resultMembros;
            const resultadoFinal = [gestor, ...membros];

            return res.json(resultadoFinal);
        });
    });
});

// buscar relatórios usuario mas somente se for gestor
app.get('/user-reports/:userId', (req, res) => {
    const userId = req.params.userId;

    const query = `
        SELECT 
            r.idRelatorio,
            r.nomeRelatorio,
            r.dataRelatorio,
            p.idProjeto,
            p.nomeProjeto
        FROM 
            relatorios r
        JOIN 
            projeto p ON r.idProjeto = p.idProjeto
        WHERE 
            p.IdGestor = ?
    `;

    db.query(query, [userId], (err, results) => {
        if (err) {
            console.error('Erro ao buscar relatórios do usuário gestor:', err.message);
            return res.status(500).json({ error: 'Erro interno ao buscar relatórios do usuário gestor' });
        }

        return res.json(results);
    });
});

// buscar projetos usuario mas somente se for gestor
app.get('/user-projects-gestor/:userId', (req, res) => {
    const userId = req.params.userId;

    const query = `
        SELECT idProjeto, nomeProjeto
        FROM projeto
        WHERE IdGestor = ?
    `;

    db.query(query, [userId], (err, results) => {
        if (err) {
            console.error('Erro ao buscar projetos do usuário gestor:', err.message);
            return res.status(500).json({ error: 'Erro interno ao buscar projetos do usuário gestor' });
        }

        return res.json(results);
    });
});

// Endpoint para buscar informações de uma tarefa específica
app.get('/detalhesTarefas/:idTarefa', (req, res) => {
    const idTarefa = req.params.idTarefa;

    const query = `
        SELECT 
            t.idTarefa, t.nomeTarefa, t.infoTarefa, t.idProjeto, t.idPercurso, t.idQuadro, t.idDesignado, t.status,
            p.nomeProjeto, p.IdGestor,
            pe.nomePercurso,
            u.nome,
            q.nomeTabela
        FROM tarefas t
        JOIN projeto p ON t.idProjeto = p.idProjeto
        JOIN Percurso pe ON t.idPercurso = pe.idPercurso
        JOIN usuarios u ON t.idDesignado = u.id
        JOIN quadro q on t.idQuadro = q.idQuadro
        WHERE t.idTarefa = ?
    `;

    db.query(query, [idTarefa], (err, result) => {
        if (err) {
            console.error('Erro ao buscar informações da tarefa:', err.message);
            return res.status(500).json({ error: 'Erro interno ao buscar informações da tarefa' });
        }
    
        if (result.length === 0) {
            return res.status(404).json({ error: 'Tarefa não encontrada' });
        }
    
        res.json(result[0]);
    });
});

// Endpoint para buscar todos os percursos de um projeto
app.get('/project-percursos-det/:projectId', (req, res) => {
    const projectId = req.params.projectId;

    const query = `
        SELECT 
            idPercurso, 
            nomePercurso, 
            DATE_FORMAT(dataInicio, '%d-%m-%Y') AS dataInicio, 
            DATE_FORMAT(dataFinal, '%d-%m-%Y') AS dataFinal, 
            status 
        FROM 
            Percurso 
        WHERE 
            idProjeto = ?
    `;

    db.query(query, [projectId], (err, results) => {
        if (err) {
            console.error('Erro ao buscar percursos do projeto:', err.message);
            return res.status(500).json({ error: 'Erro interno ao buscar percursos do projeto' });
        }

        return res.json(results);
    });
});

// Endpoint para buscar todos os percursos de um projeto
app.get('/project-percursos-modal/:projectId', (req, res) => {
    const projectId = req.params.projectId;

    const query = `
        SELECT 
            idPercurso, 
            nomePercurso 
        FROM 
            Percurso 
        WHERE 
            idProjeto = ?
    `;

    db.query(query, [projectId], (err, results) => {
        if (err) {
            console.error('Erro ao buscar percursos do projeto:', err.message);
            return res.status(500).json({ error: 'Erro interno ao buscar percursos do projeto' });
        }

        return res.json(results);
    });
});

// Endpoint para buscar as iniciais dos 3 primeiros membros da equipe de um projeto
app.get('/project-members-initials/:projectId', (req, res) => {
    const projectId = req.params.projectId;

    // Consulta para obter os 3 primeiros membros do projeto em ordem alfabética
    const query = `
        SELECT 
            nome
        FROM 
            usuarios u
        JOIN 
            projetousuario pu ON u.id = pu.idUsuario
        WHERE 
            pu.idProjeto = ?
        ORDER BY 
            nome
    `;

    db.query(query, [projectId], (err, results) => {
        if (err) {
            console.error('Erro ao buscar iniciais dos membros da equipe do projeto:', err.message);
            return res.status(500).json({ error: 'Erro interno ao buscar iniciais dos membros da equipe do projeto' });
        }

        return res.json(results);
    });
});

// Endpoint para obter informações do projeto, número de percursos e número de membros
app.get('/project-info/:projectId', (req, res) => {
    const projectId = req.params.projectId;

    const projectQuery = `
      SELECT 
        nomeProjeto, 
        objetivoProjeto, 
        informacoesProjeto 
      FROM 
        projeto 
      WHERE 
        idProjeto = ?
    `;
  
    const percursosQuery = `
      SELECT 
        COUNT(*) AS numPercursos 
      FROM 
        Percurso 
      WHERE 
        idProjeto = ?
    `;
  
    const membrosQuery = `
      SELECT 
        COUNT(*) AS numMembros 
      FROM 
        projetousuario 
      WHERE 
        idProjeto = ?
    `;
  
    Promise.all([
      new Promise((resolve, reject) => {
        db.query(projectQuery, [projectId], (err, results) => {
          if (err) {
            reject(err);
          } else {
            resolve(results[0]);
          }
        });
      }),
      new Promise((resolve, reject) => {
        db.query(percursosQuery, [projectId], (err, results) => {
          if (err) {
            reject(err);
          } else {
            resolve(results[0].numPercursos);
          }
        });
      }),
      new Promise((resolve, reject) => {
        db.query(membrosQuery, [projectId], (err, results) => {
          if (err) {
            reject(err);
          } else {
            resolve(results[0].numMembros);
          }
        });
      })
    ])
    .then(([projectInfo, numPercursos, numMembros]) => {
      res.json({
        nomeProjeto: projectInfo.nomeProjeto,
        objetivoProjeto: projectInfo.objetivoProjeto,
        informacoesProjeto: projectInfo.informacoesProjeto,
        numPercursos,
        numMembros
      });
    })
    .catch(err => {
      console.error('Erro ao buscar informações do projeto:', err.message);
      res.status(500).json({ error: 'Erro interno ao buscar informações do projeto' });
    });
});

// Endpoint para devolver o nome do projeto
app.get('/projetoNome/:projectId', (req, res) => {
    const projectId = req.params.projectId;

    const query = `
        SELECT 
            nomeProjeto
        FROM 
            projeto
        WHERE
            idProjeto = ?
    `;

    db.query(query, [projectId], (err, results) => {
        if (err) {
            console.error('Erro ao buscar o nome do projeto:', err.message);
            return res.status(500).json({ error: 'Erro interno ao buscar nome do projeto' });
        }

        if (results.length === 0) {
            return res.status(404).json({ error: 'Projeto não encontrado' });
        }

        return res.json(results[0]);
    });
});

// Endpoint para devolver o percurso
app.get('/nomePercurso/:percursoId', (req, res) => {
    const percursoId = req.params.percursoId;

    const query = `
        SELECT 
            idPercurso, 
            nomePercurso,
            status
        FROM 
            Percurso 
        WHERE 
            idPercurso = ?
    `;

    db.query(query, [percursoId], (err, results) => {
        if (err) {
            console.error('Erro ao buscar o percurso:', err.message);
            return res.status(500).json({ error: 'Erro interno ao buscar o percurso' });
        }

        res.json(results[0]);
    });
});

// Endpoint para devolver o projeto
app.get('/projeto-par/:projectId', (req, res) => {
    const projectId = req.params.projectId;

    const query = `
        SELECT 
            idProjeto,
            nomeProjeto,
            IdGestor
        FROM 
            projeto
        WHERE
            idProjeto = ?
    `;

    db.query(query, [projectId], (err, results) => {
        if (err) {
            console.error('Erro ao buscar o nome do projeto:', err.message);
            return res.status(500).json({ error: 'Erro interno ao buscar nome do projeto' });
        }

        return res.json(results[0]);
    });
});

// Endpoint para devolver as informações do percurso
app.get('/percurso-info/:percursoId', (req, res) => {
    const percursoId = req.params.percursoId;
  
    const query = `
      SELECT 
        nomePercurso, 
        dataInicio,
        dataFinal
      FROM 
        Percurso 
      WHERE 
        idPercurso = ?
    `;
  
    db.query(query, [percursoId], (err, results) => {
      if (err) {
        console.error('Erro ao buscar o percurso:', err.message);
        return res.status(500).json({ error: 'Erro interno ao buscar o percurso' });
      }
  
      res.json(results[0]);
    });
});

// Endpoint para devolver o nome do projeto e o nome do percurso
app.get('/PROJETO_PERCURSO-nomes/:idProjeto/:idPercurso', (req, res) => {
    const { idProjeto, idPercurso } = req.params;

    const query = `
        SELECT 
            p.nomeProjeto, 
            pr.nomePercurso, 
            p.IdGestor
        FROM 
            projeto p
        JOIN 
            Percurso pr ON p.idProjeto = pr.idProjeto
        WHERE 
            p.idProjeto = ? 
            AND pr.idPercurso = ?
    `;

    db.query(query, [idProjeto, idPercurso], (err, result) => {
        if (err) {
            console.error('Erro ao buscar nome do projeto e do percurso:', err.message);
            return res.status(500).json({ error: 'Erro interno ao buscar nome do projeto e do percurso' });
        }

        if (result.length > 0) {
            return res.json(result[0]);
        } else {
            return res.status(404).json({ error: 'Projeto ou percurso não encontrado' });
        }
    });
});

// Endpoint para devolver o grupos de um percurso
app.get('/percurso-grupo/:percursoId', (req, res) => {
    const percursoId = req.params.percursoId;

    const query = `
        SELECT 
            idQuadro, 
            nomeTabela, 
            sequencia
        FROM 
            quadro 
        WHERE 
            idPercurso = ?
        ORDER BY 
            sequencia ASC
    `;

    db.query(query, [percursoId], (err, results) => {
        if (err) {
            console.error('Erro ao buscar os quadros:', err.message);
            return res.status(500).json({ error: 'Erro interno ao buscar os quadros' });
        }

        res.json(results);
    });
});

// Endpoint para obter as tarefas de um quadro específico
app.get('/quadro-tarefas/:idQuadro', (req, res) => {
    const idQuadro = req.params.idQuadro;

    const query = `
        SELECT 
            idTarefa, 
            nomeTarefa, 
            sequencia
        FROM 
            tarefas 
        WHERE 
            idQuadro = ?
        ORDER BY 
            sequencia ASC
    `;

    db.query(query, [idQuadro], (err, results) => {
        if (err) {
            console.error('Erro ao buscar as tarefas:', err.message);
            return res.status(500).json({ error: 'Erro interno ao buscar as tarefas' });
        }

        res.json(results);
    });
});

// Endpoint para verificar se existe algum percurso aberto em um projeto
app.get('/percursoAberto/:idProjeto', (req, res) => {
    const idProjeto = req.params.idProjeto;

    const query = `
        SELECT 
            p.idPercurso, 
            p.nomePercurso, 
            proj.nomeProjeto 
        FROM 
            Percurso p
        JOIN 
            projeto proj ON p.idProjeto = proj.idProjeto
        WHERE 
            p.idProjeto = ? 
            AND p.status = 'Aberto'
        LIMIT 1
    `;

    db.query(query, [idProjeto], (err, results) => {
        if (err) {
            console.error('Erro ao buscar percurso aberto:', err.message);
            return res.status(500).json({ error: 'Erro interno ao buscar percurso aberto' });
        }
        
        if (results.length > 0) {
            res.json(results[0]);
        } else {
            res.json({ message: 'Não possui percurso com status Aberto' });
        }
    });
});

// Endpoint para devolver o nome de um grupo
app.get('/grup-name/:grupoid', (req, res) => {
    const grupoid = req.params.grupoid;

    const query = `
        SELECT 
            idQuadro, 
            nomeTabela, 
            sequencia
        FROM 
            quadro 
        WHERE 
            idQuadro = ?
    `;

    db.query(query, [grupoid], (err, results) => {
        if (err) {
            console.error('Erro ao buscar o grupo:', err.message);
            return res.status(500).json({ error: 'Erro interno ao buscar o grupo' });
        }

        res.json(results[0]);
    });
});

// Endpoint para gerar o PDF
app.get('/relatorio', async (req, res) => {
    const { idProjeto, nomeProjeto } = req.query; // Assume que idProjeto e nomeProjeto são passados como query parameters

    // Função para realizar consultas no banco de dados usando async/await
    const queryAsync = (query, params) => {
        return new Promise((resolve, reject) => {
            db.query(query, params, (err, results) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(results);
                }
            });
        });
    };

    try {
        // Consulta ao banco de dados para obter o objetivo, informações do projeto e gestor
        const projetoResults = await queryAsync(
            'SELECT p.objetivoProjeto, p.informacoesProjeto, u.nome AS nomeGestor, u.email AS emailGestor ' +
            'FROM projeto AS p ' +
            'JOIN usuarios AS u ON p.IdGestor = u.id ' +
            'WHERE p.idProjeto = ?', [idProjeto]
        );

        if (projetoResults.length === 0) {
            res.status(404).send('Projeto não encontrado');
            return;
        }

        const { objetivoProjeto, informacoesProjeto, nomeGestor, emailGestor } = projetoResults[0];

        // Consulta ao banco de dados para obter os percursos do projeto
        const percursos = await queryAsync(
            'SELECT idPercurso, nomePercurso, dataInicio, dataFinal, status ' +
            'FROM Percurso ' +
            'WHERE idProjeto = ?', [idProjeto]
        );

        // Consulta para obter informações dos membros
        const membros = await queryAsync(
            'SELECT u.nome, u.email, COUNT(t.idTarefa) AS qtdTarefas, COUNT(t.idTarefa) / COUNT(DISTINCT t.idPercurso) AS mediaTarefas ' +
            'FROM usuarios AS u ' +
            'JOIN tarefas AS t ON u.id = t.idDesignado ' +
            'WHERE t.idProjeto = ? ' +
            'GROUP BY u.id', [idProjeto]
        );

        // Consulta para obter o total de tarefas designadas no projeto
        const totalTarefasResults = await queryAsync(
            'SELECT COUNT(*) AS totalTarefas ' +
            'FROM tarefas ' +
            'WHERE idProjeto = ?', [idProjeto]
        );

        const totalTarefas = totalTarefasResults[0].totalTarefas;

        // Nome do arquivo
        const dataAtual = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-'); // Formato: DD-MM-YYYY
        const nomeArquivo = `${nomeProjeto}-${dataAtual}.pdf`;

        // Set up PDFKit document
        const doc = new PDFDocument();

        // Set up the response to be a PDF
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=${nomeArquivo}`);

        // Pipe the PDF into the response
        doc.pipe(res);

        // Add content to the PDF
        doc.fontSize(25).text('RELATÓRIO PROJETO', { align: 'center' });

        doc.moveDown();
        doc.font('Helvetica-Bold').fontSize(12).text('INFORMAÇÕES DO PROJETO', { bold: true, align: 'left' });
        doc.moveDown(); // Pula uma linha

        const posicaoOriginalX = doc.x; // Salva a posição original X antes de desenhar a tabela

        doc.font('Helvetica-Bold').text('Nome:', { continued: true });
        doc.font('Helvetica').text(nomeProjeto, { align: 'justify' });
        doc.moveDown(); // Pula uma linha

        doc.font('Helvetica-Bold').text('Gestor:', { continued: true });
        doc.font('Helvetica').text(`${nomeGestor} (${emailGestor})`, { align: 'justify' });
        doc.moveDown(); // Pula uma linha

        // Adicionar mais informações do projeto se necessário
        doc.font('Helvetica-Bold').text(`Objetivo do Projeto:`, { align: 'justify' });
        doc.font('Helvetica').text(`${objetivoProjeto}`, { align: 'justify' });
        doc.moveDown(); // Pula uma linha
        doc.font('Helvetica-Bold').text(`Informações adicionais: `, { align: 'justify' });
        doc.font('Helvetica').text(`${informacoesProjeto}`, { align: 'justify' });
        
        // Subtítulo e tabela de percursos
        doc.moveDown(); // Pula uma linha
        doc.font('Helvetica-Bold').fontSize(12).text('Percursos do Projeto:', { bold: true, align: 'left' });
        doc.moveDown(); // Pula uma linha

        // Desenhar tabela de percursos manualmente
        const tableTop = doc.y + 10; // Posição inicial da tabela após o conteúdo anterior
        const rowHeight = 20;
        const col1Width = 200;
        const colWidth = (doc.page.width - 100 - col1Width - 60) / 2; // Ajuste para a largura da coluna de status

         // Headers da tabela
         doc.font('Helvetica-Bold').text('Nome', 100, tableTop);
         doc.font('Helvetica-Bold').text('Data de Início', 278, tableTop);
         doc.font('Helvetica-Bold').text('Data de Término', 378, tableTop);
         doc.font('Helvetica-Bold').text('Status', 375 + colWidth, tableTop); // Ajuste para a coluna de status

        // Linha abaixo dos headers
        doc.moveTo(100, tableTop + 15).lineTo(100 + col1Width + colWidth * 2, tableTop + 15).stroke();

        // Preencher dados dos percursos
        percursos.forEach((percurso, index) => {
            const yPos = tableTop + (index + 1) * rowHeight + 15;

            // Ajuste do nome do percurso para quebrar linha se for muito longo
            const nomePercursoLines = doc.font('Helvetica').fontSize(10).widthOfString(percurso.nomePercurso);
            doc.font('Helvetica').fontSize(12).text(percurso.nomePercurso, 100, yPos, { width: col1Width, height: nomePercursoLines * 12 });

            doc.text(percurso.dataInicio.toLocaleDateString('pt-BR'), 300, yPos);
            doc.text(percurso.dataFinal.toLocaleDateString('pt-BR'), 400, yPos);
            doc.text(percurso.status, 350 + colWidth, yPos);
        });

        doc.moveDown(); // Pula uma linha
        // Restaura a posição X original após desenhar a tabela
        doc.x = posicaoOriginalX;
        doc.moveDown(); // Pula uma linha

        // TOTAL DE TAREFAS DESIGNADAS NO PROJETO
        doc.font('Helvetica-Bold').text('TOTAL DE TAREFAS DESIGNADAS NO PROJETO: ', { continued: true });
        doc.font('Helvetica').text(totalTarefas, { align: 'justify' });
        doc.moveDown(); // Pula uma linha
        
        // INFORMAÇÕES DOS MEMBROS
        doc.font('Helvetica-Bold').fontSize(12).text('INFORMAÇÕES DOS MEMBROS', { bold: true, align: 'left' });
        doc.moveDown(); // Pula uma linha
        doc.moveDown(); // Pula uma linha
        
        // Headers da tabela de membros
        doc.font('Helvetica-Bold').text('Nome', 100, doc.y+15);
        doc.font('Helvetica-Bold').text('Email', 220, doc.y-15);
        doc.font('Helvetica-Bold').text('Quant. Tarefas Designadas', 310, doc.y-15);
        doc.font('Helvetica-Bold').text('Média por Percurso', 475, doc.y-15);

        // Linha abaixo dos headers
        doc.moveTo(100, doc.y + 10).lineTo(550, doc.y + 10).stroke();

        // Preencher dados dos membros
        membros.forEach((membro, index) => {
            const yPos = doc.y + (index + 1) * rowHeight + 15;

            doc.font('Helvetica').fontSize(12).text(membro.nome, 100, yPos);
            doc.text(membro.email, 220, yPos);
            doc.text(membro.qtdTarefas, 400, yPos);
            doc.text(membro.mediaTarefas.toFixed(2), 480, yPos); // Fixar 2 casas decimais para a média
        });

        doc.moveDown(); // Pula uma linha

        

        // Finalize the PDF and end the stream
        doc.end();

    } catch (err) {
        console.error('Erro ao gerar o relatório:', err);
        res.status(500).send('Erro ao gerar o relatório');
    }
});

// Endpoint para gerar o PDF
app.get('/relatorio-Percurso', async (req, res) => {
    const { idProjeto, idPercurso, nomeProjeto } = req.query;

    // Função para realizar consultas no banco de dados usando async/await
    const queryAsync = (query, params) => {
        return new Promise((resolve, reject) => {
            db.query(query, params, (err, results) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(results);
                }
            });
        });
    };

    try {
        // Consulta ao banco de dados para obter o objetivo, informações do projeto e gestor
        const projetoResults = await queryAsync(
            'SELECT p.objetivoProjeto, p.informacoesProjeto, u.nome AS nomeGestor, u.email AS emailGestor ' +
            'FROM projeto AS p ' +
            'JOIN usuarios AS u ON p.IdGestor = u.id ' +
            'WHERE p.idProjeto = ?', [idProjeto]
        );

        if (projetoResults.length === 0) {
            res.status(404).send('Projeto não encontrado');
            return;
        }

        const { objetivoProjeto, informacoesProjeto, nomeGestor, emailGestor } = projetoResults[0];

        // Consulta ao banco de dados para obter informações do percurso
        const percursoResults = await queryAsync(
            'SELECT nomePercurso, dataInicio, dataFinal ' +
            'FROM Percurso ' +
            'WHERE idPercurso = ?', [idPercurso]
        );

        if (percursoResults.length === 0) {
            res.status(404).send('Percurso não encontrado');
            return;
        }

        const { nomePercurso, dataInicio, dataFinal } = percursoResults[0];

        // Consulta para obter o total de tarefas designadas no percurso
        const totalTarefasResults = await queryAsync(
            'SELECT COUNT(*) AS totalTarefas ' +
            'FROM tarefas ' +
            'WHERE idPercurso = ?', [idPercurso]
        );

        const totalTarefas = totalTarefasResults[0].totalTarefas;

        // Consulta para obter informações dos membros no percurso
        const membros = await queryAsync(
            'SELECT u.nome, COUNT(t.idTarefa) AS qtdTarefas ' +
            'FROM usuarios AS u ' +
            'JOIN tarefas AS t ON u.id = t.idDesignado ' +
            'WHERE t.idPercurso = ? ' +
            'GROUP BY u.id', [idPercurso]
        );

        // Consulta para obter informações dos quadros e das tarefas dentro do percurso
        const quadros = await queryAsync(
            'SELECT q.idQuadro, q.nomeTabela ' +
            'FROM quadro AS q ' +
            'WHERE q.idPercurso = ? ' +
            'ORDER BY q.sequencia', [idPercurso]
        );

        const tarefasPorQuadro = await queryAsync(
            'SELECT q.idQuadro, q.nomeTabela AS nomeQuadro, t.nomeTarefa, t.sequencia ' +
            'FROM quadro AS q ' +
            'LEFT JOIN tarefas AS t ON q.idQuadro = t.idQuadro ' +
            'WHERE q.idPercurso = ? ' +
            'ORDER BY q.sequencia, t.sequencia', [idPercurso]
        );

        // Nome do arquivo
        const dataAtual = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-'); // Formato: DD-MM-YYYY
        const nomeArquivo = `${nomeProjeto}-${dataAtual}.pdf`;

        // Set up PDFKit document
        const doc = new PDFDocument();

        // Set up the response to be a PDF
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=${nomeArquivo}`);

        // Pipe the PDF into the response
        doc.pipe(res);

        // Add content to the PDF
        doc.fontSize(25).text('RELATÓRIO DE PERCURSO', { align: 'center' });

        doc.moveDown();
        doc.font('Helvetica-Bold').fontSize(12).text('INFORMAÇÕES DO PROJETO', { bold: true, align: 'left' });
        doc.moveDown(); // Pula uma linha

        const posicaoOriginalX = doc.x; // Salva a posição original X antes de desenhar a tabela

        doc.font('Helvetica-Bold').text('Nome:', { continued: true });
        doc.font('Helvetica').text(nomeProjeto, { align: 'justify' });
        doc.moveDown(); // Pula uma linha

        doc.font('Helvetica-Bold').text('Gestor:', { continued: true });
        doc.font('Helvetica').text(`${nomeGestor} (${emailGestor})`, { align: 'justify' });
        doc.moveDown(); // Pula uma linha

        doc.font('Helvetica-Bold').text('Objetivo do Projeto:', { align: 'justify' });
        doc.font('Helvetica').text(`${objetivoProjeto}`, { align: 'justify' });
        doc.moveDown(); // Pula uma linha

        doc.font('Helvetica-Bold').text('Informações adicionais:', { align: 'justify' });
        doc.font('Helvetica').text(`${informacoesProjeto}`, { align: 'justify' });

        // Subtítulo e informações do percurso
        doc.moveDown(); // Pula uma linha
        doc.font('Helvetica-Bold').fontSize(12).text('INFORMAÇÕES DO PERCURSO', { bold: true, align: 'left' });
        doc.moveDown(); // Pula uma linha

        doc.font('Helvetica-Bold').text('Nome:', { continued: true });
        doc.font('Helvetica').text(nomePercurso, { align: 'justify' });
        doc.moveDown(); // Pula uma linha

        doc.font('Helvetica-Bold').text('Data Inicial:', { continued: true });
        doc.font('Helvetica').text(new Date(dataInicio).toLocaleDateString('pt-BR'), { align: 'justify' });
        doc.moveDown(); // Pula uma linha

        doc.font('Helvetica-Bold').text('Data Final:', { continued: true });
        doc.font('Helvetica').text(new Date(dataFinal).toLocaleDateString('pt-BR'), { align: 'justify' });

        // Total de tarefas designadas no percurso
        doc.moveDown(); // Pula uma linha
        doc.font('Helvetica-Bold').text('TOTAL DE TAREFAS DESIGNADAS NO PERCURSO:', { continued: true });
        doc.font('Helvetica').text(totalTarefas, { align: 'justify' });

        // Membros dentro do percurso
        doc.moveDown(); // Pula uma linha
        doc.font('Helvetica-Bold').fontSize(12).text('Membros Dentro do Percurso:', { bold: true, align: 'left' });
        doc.moveDown(); // Pula uma linha

        // Definir rowHeight para a tabela
        const rowHeight = 20;

        // Headers da tabela de membros
        const startX = 100;
        doc.font('Helvetica-Bold').text('Nome', startX);
        doc.font('Helvetica-Bold').text('Quantidade de Tarefas Designadas', 300, doc.y-16);

        // Linha abaixo dos headers
        doc.moveTo(startX, doc.y + 10).lineTo(550, doc.y + 10).stroke();

        // Preencher dados dos membros
        membros.forEach((membro, index) => {
            const yPos = doc.y + 15;

            doc.font('Helvetica').fontSize(12).text(membro.nome, startX, yPos);
            doc.text(membro.qtdTarefas, 300, yPos);
        });

        // Reseta a posição vertical
        doc.moveDown(2); // Pula duas linhas para resetar a posição

        doc.x = posicaoOriginalX;

        // Tarefas dentro do percurso e seus grupos
        doc.font('Helvetica-Bold').fontSize(12).text('Tarefas Dentro do Percurso e Seus Grupos:', { bold: true, align: 'left' });
        doc.moveDown();

        quadros.forEach(quadro => {
            doc.font('Helvetica-Bold').fontSize(12).text(quadro.nomeTabela, { indent: 20 });

            const tarefasNoQuadro = tarefasPorQuadro.filter(tarefa => tarefa.idQuadro === quadro.idQuadro);
            
            tarefasNoQuadro.forEach(tarefa => {
                if (tarefa.nomeTarefa) {
                    doc.moveDown();
                    doc.font('Helvetica').fontSize(12).text(`- ${tarefa.nomeTarefa}`, { indent: 40 });
                    doc.moveDown();
                }else{
                    doc.moveDown();
                    doc.font('Helvetica').fontSize(12).text('NÃO HÁ TAREFA NESSE GRUPO', { indent: 40 });
                    doc.moveDown();
                }
            });

            doc.moveDown();
        });


        // Finalize the PDF and end the stream
        doc.end();

    } catch (err) {
        console.error('Erro ao gerar o relatório:', err);
        if (!res.headersSent) {
            res.status(500).send('Erro ao gerar o relatório');
        }
    }
});



//PUTS 

// Endpoint para atualizar os dados de uma tarefa
app.put('/tasks/:taskId', (req, res) => {
    const taskId = req.params.taskId;
    const { nomeTarefa, infoTarefa, idProjeto, idPercurso, idQuadro, idDesignado } = req.body;

    if (!nomeTarefa || !infoTarefa || !idProjeto || !idPercurso || !idQuadro || !idDesignado) {
        return res.status(400).json({ error: 'Todos os campos obrigatórios devem ser preenchidos' });
    }

    // Verificar o idQuadro atual da tarefa
    const getIdQuadroAtualQuery = `
        SELECT idQuadro
        FROM tarefas
        WHERE idTarefa = ?
    `;

    db.query(getIdQuadroAtualQuery, [taskId], (err, result) => {
        if (err) {
            console.error('Erro ao buscar o idQuadro atual da tarefa:', err.message);
            return res.status(500).json({ error: 'Erro interno ao buscar o idQuadro atual da tarefa' });
        }

        const idQuadroAtual = result[0].idQuadro;

        // Se o idQuadro foi alterado, atualizar a sequência
        if (idQuadro !== idQuadroAtual) {
            // Buscar o maior valor de sequência do novo idQuadro
            const getMaxSequenciaQuery = `
                SELECT COALESCE(MAX(sequencia), 0) AS maxSequencia
                FROM Tarefas
                WHERE idQuadro = ?
            `;

            db.query(getMaxSequenciaQuery, [idQuadro], (err, result) => {
                if (err) {
                    console.error('Erro ao buscar a maior sequência do novo idQuadro:', err.message);
                    return res.status(500).json({ error: 'Erro interno ao buscar a maior sequência do novo idQuadro' });
                }

                const maxSequencia = result[0].maxSequencia + 1;

                // Atualizar a tarefa com o novo idQuadro e sequência
                const updateQuery = `
                    UPDATE tarefas 
                    SET nomeTarefa = ?, infoTarefa = ?, idProjeto = ?, idPercurso = ?, idQuadro = ?, idDesignado = ?, sequencia = ?
                    WHERE idTarefa = ?
                `;

                db.query(updateQuery, [nomeTarefa, infoTarefa, idProjeto, idPercurso, idQuadro, idDesignado, maxSequencia, taskId], (err, result) => {
                    if (err) {
                        console.error('Erro ao atualizar tarefa:', err.message);
                        return res.status(500).json({ error: 'Erro interno ao atualizar tarefa' });
                    }

                    console.log('Tarefa atualizada com sucesso');
                    return res.status(200).json({ message: 'Tarefa atualizada com sucesso' });
                });
            });
        } else {
            // Se não houve mudança no idQuadro, apenas atualizar os dados da tarefa
            const updateQuery = `
                UPDATE tarefas 
                SET nomeTarefa = ?, infoTarefa = ?, idProjeto = ?, idPercurso = ?, idQuadro = ?, idDesignado = ?
                WHERE idTarefa = ?
            `;

            db.query(updateQuery, [nomeTarefa, infoTarefa, idProjeto, idPercurso, idQuadro, idDesignado, taskId], (err, result) => {
                if (err) {
                    console.error('Erro ao atualizar tarefa:', err.message);
                    return res.status(500).json({ error: 'Erro interno ao atualizar tarefa' });
                }

                console.log('Tarefa atualizada com sucesso');
                return res.status(200).json({ message: 'Tarefa atualizada com sucesso' });
            });
        }
    });
});

app.put('/mod-desig-tesk/:idRemovido', (req, res) => {
    const idRemovido = req.params.idRemovido;
    const { idGestor} = req.body;

    const query = `
        UPDATE tarefas 
        SET idDesignado = ?
        WHERE idDesignado = ?
    `;

    db.query(query, [idGestor, idRemovido], (err, result) => {
        if (err) {
            console.error('Erro ao atualizar tarefa:', err.message);
            return res.status(500).json({ error: 'Erro interno ao atualizar tarefa' });
        }

        console.log('Tarefa atualizada com sucesso');
        return res.status(200).json({ message: 'Tarefa atualizada com sucesso' });
    });
});

app.put('/project-alter/:project', (req, res) => {
    const project = req.params.project;
    const { nomeProjeto, objetivoProjeto, informacoesProjeto} = req.body;

    if (!nomeProjeto || !objetivoProjeto || !informacoesProjeto ) {
        return res.status(400).json({ error: 'Todos os campos obrigatórios devem ser preenchidos' });
    }

    console.log(project, nomeProjeto, objetivoProjeto, informacoesProjeto);

    const query = `
        UPDATE projeto 
        SET nomeProjeto = ?, objetivoProjeto = ?, informacoesProjeto = ?
        WHERE idProjeto = ?
    `;

    db.query(query, [nomeProjeto, objetivoProjeto, informacoesProjeto, project], (err, result) => {
        if (err) {
            console.error('Erro ao atualizar projeto:', err.message);
            return res.status(500).json({ error: 'Erro interno ao atualizar projeto' });
        }

        console.log('Projeto atualizada com sucesso');
        return res.status(200).json({ message: 'Projeto atualizada com sucesso' });
    });
});

// Para atualizar os dados do percurso
app.put('/percurso-atualizar/:percursoId', (req, res) => {
    const percursoId = req.params.percursoId;
    const { nomePercurso, dataFinal } = req.body;

    if (!nomePercurso || !dataFinal) {
        return res.status(400).json({ error: 'Todos os campos obrigatórios devem ser preenchidos' });
    }

    const query = `
        UPDATE Percurso 
        SET nomePercurso = ?, dataFinal = ?
        WHERE idPercurso = ?;
    `;

    db.query(query, [nomePercurso, dataFinal, percursoId], (err, result) => {
        if (err) {
            console.error('Erro ao atualizar percurso:', err.message);
            return res.status(500).json({ error: 'Erro interno ao atualizar percurso' });
        }

        // Verifica e atualiza o status do Percurso baseado na data atual
        const currentDate = new Date().toISOString().split('T')[0]; // Obtém a data atual no formato YYYY-MM-DD

        const updateStatusQuery = `
            UPDATE Percurso
            SET status = CASE
                            WHEN dataFinal < '${currentDate}' THEN 'Fechado'
                            WHEN dataInicio <= '${currentDate}' THEN 'Aberto'
                            ELSE 'Em Espera'
                          END
            WHERE idPercurso = ?;
        `;

        db.query(updateStatusQuery, [percursoId], (err, result) => {
            if (err) {
                console.error('Erro ao atualizar status do percurso:', err.message);
                return res.status(500).json({ error: 'Erro interno ao atualizar status do percurso' });
            }

            console.log('Percurso atualizado com sucesso');
            return res.status(200).json({ message: 'Percurso atualizado com sucesso' });
        });
    });
});

// Para atualizar o nome do grupo
app.put('/grupo-atualizado/:idgrupo', (req, res) => {
    const idgrupo = req.params.idgrupo;
    const { nomeGrupo} = req.body;

    if (!nomeGrupo) {
        return res.status(400).json({ error: 'Todos os campos obrigatórios devem ser preenchidos' });
    }

    const query = `
        UPDATE quadro 
        SET nomeTabela = ?
        WHERE idQuadro = ?
    `;

    db.query(query, [nomeGrupo, idgrupo], (err, result) => {
        if (err) {
            console.error('Erro ao atualizar grupo:', err.message);
            return res.status(500).json({ error: 'Erro interno ao atualizar grupo' });
        }

        console.log('Grupo atualizada com sucesso');
        return res.status(200).json({ message: 'Grupo atualizada com sucesso' });
    });
});

// Endpoint para atualizar as tarefas
app.put('/atualizarTarefas', (req, res) => {
    const tarefas = req.body;

    if (!Array.isArray(tarefas) || tarefas.length === 0) {
        return res.status(400).json({ error: 'A lista de tarefas deve ser fornecida e não pode estar vazia.' });
    }

    // Início de uma transação
    db.beginTransaction(err => {
        if (err) {
            console.error('Erro ao iniciar a transação:', err.message);
            return res.status(500).json({ error: 'Erro interno ao iniciar a transação' });
        }

        const updateQueries = tarefas.map(tarefa => {
            const query = `
                UPDATE tarefas
                SET idQuadro = ?, sequencia = ?
                WHERE idTarefa = ?;
            `;
            const params = [tarefa.idQuadro, tarefa.sequencia, tarefa.idTarefa];

            return new Promise((resolve, reject) => {
                db.query(query, params, (err, result) => {
                    if (err) {
                        return reject(err);
                    }
                    resolve(result);
                });
            });
        });

        // Executar todas as queries de atualização em paralelo
        Promise.all(updateQueries)
            .then(results => {
                // Commit a transação
                db.commit(err => {
                    if (err) {
                        return db.rollback(() => {
                            console.error('Erro ao fazer commit da transação:', err.message);
                            return res.status(500).json({ error: 'Erro interno ao fazer commit da transação' });
                        });
                    }

                    console.log('Tarefas atualizadas com sucesso');
                    return res.status(200).json({ message: 'Tarefas atualizadas com sucesso' });
                });
            })
            .catch(err => {
                // Rollback a transação em caso de erro
                db.rollback(() => {
                    console.error('Erro ao atualizar tarefas:', err.message);
                    return res.status(500).json({ error: 'Erro interno ao atualizar tarefas' });
                });
            });
    });
});

// Endpoint para atualizar os grupos
app.put('/atualizarGrupos', (req, res) => {
    const grupos = req.body;

    if (!Array.isArray(grupos) || grupos.length === 0) {
        return res.status(400).json({ error: 'A lista de grupos deve ser fornecida e não pode estar vazia.' });
    }

    // Início de uma transação
    db.beginTransaction(err => {
        if (err) {
            console.error('Erro ao iniciar a transação:', err.message);
            return res.status(500).json({ error: 'Erro interno ao iniciar a transação' });
        }

        const updateQueries = grupos.map(grupo => {
            const query = `
                UPDATE quadro
                SET sequencia = ?
                WHERE idQuadro = ?;
            `;
            const params = [grupo.sequencia, grupo.idQuadro];

            return new Promise((resolve, reject) => {
                db.query(query, params, (err, result) => {
                    if (err) {
                        return reject(err);
                    }
                    resolve(result);
                });
            });
        });

        // Executar todas as queries de atualização em paralelo
        Promise.all(updateQueries)
            .then(results => {
                // Commit a transação
                db.commit(err => {
                    if (err) {
                        return db.rollback(() => {
                            console.error('Erro ao fazer commit da transação:', err.message);
                            return res.status(500).json({ error: 'Erro interno ao fazer commit da transação' });
                        });
                    }

                    console.log('Grupos atualizados com sucesso');
                    return res.status(200).json({ message: 'Grupos atualizados com sucesso' });
                });
            })
            .catch(err => {
                // Rollback a transação em caso de erro
                db.rollback(() => {
                    console.error('Erro ao atualizar grupos:', err.message);
                    return res.status(500).json({ error: 'Erro interno ao atualizar grupos' });
                });
            });
    });
});


//DELETE
// Endpoint para excluir um membro
app.delete('/membro/:membroId', (req, res) => {
    const membroId = req.params.membroId;

    const query = `
        DELETE 
        FROM 
            projetousuario 
        WHERE 
            idUsuario = ?
    `;

    db.query(query, [membroId], (err, result) => {
        if (err) {
            console.error('Erro ao excluir membro:', err);
            res.status(500).send('Erro ao excluir membro');
            return;
        }
        res.send('Membro excluído com sucesso');
    });
});




app.listen(port, () => {
    console.log(`Servidor rodando na porta ${port}`);
});