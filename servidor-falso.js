// Servidor de mentira para a versão de demonstração (GitHub Pages, que não tem servidor).
// Responde às mesmas rotas /api/... do worker, guardando tudo no navegador de quem está vendo.
// Usa as mesmas regras do jogo (logica.js). Não serve para a promoção de verdade.

import * as L from './logica.js';
import { PERGUNTAS_PADRAO } from './perguntas-padrao.js';

const CHAVE = 'quizDemoBanco';
const SENHA_DEMO = 'demonstracao';

class Erro extends Error {
  constructor(status, mensagem) { super(mensagem); this.status = status; }
}

function bancoNovo() {
  return {
    config: L.mesclarConfig(null),
    perguntas: PERGUNTAS_PADRAO.map(([texto, opcoes], i) => ({ id: i + 1, texto, opcoes, correta: 0 })),
    proximoId: PERGUNTAS_PADRAO.length + 1,
    participantes: {}, numeros: {}, sessoes: {}
  };
}
function carregar() {
  try { return JSON.parse(localStorage.getItem(CHAVE)) || bancoNovo(); } catch (e) { return bancoNovo(); }
}
const db = carregar();
const salvar = () => { try { localStorage.setItem(CHAVE, JSON.stringify(db)); } catch (e) {} };
const novoToken = () => crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
const todos = o => Object.values(o);
function embaralhar(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

const fetchOriginal = window.fetch.bind(window);
window.fetch = async (entrada, opcoes = {}) => {
  const url = new URL(typeof entrada === 'string' ? entrada : entrada.url, location.href);
  if (!url.pathname.startsWith('/api/')) return fetchOriginal(entrada, opcoes);
  const partes = url.pathname.slice('/api/'.length).split('/').filter(Boolean).map(decodeURIComponent);
  const metodo = (opcoes.method || 'GET').toUpperCase();
  const corpo = opcoes.body ? JSON.parse(opcoes.body) : {};
  const auth = new Headers(opcoes.headers).get('Authorization') || '';
  const sessao = auth.startsWith('Bearer ') ? db.sessoes[auth.slice(7)] : null;
  await new Promise(r => setTimeout(r, 150)); // imita o tempo da internet
  try {
    const dados = rotear(metodo, partes, corpo, sessao, url);
    salvar();
    return new Response(JSON.stringify(dados), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    if (!(e instanceof Erro)) console.error(e);
    return new Response(JSON.stringify({ erro: e.message }), { status: e.status || 500, headers: { 'Content-Type': 'application/json' } });
  }
};

function rotear(metodo, partes, c, s, url) {
  const rota = partes.join('/');
  if (metodo === 'GET' && rota === 'config') return db.config;
  if (metodo === 'GET' && partes[0] === 'convite') {
    const p = todos(db.participantes).find(x => x.codigo === String(partes[1] || '').toUpperCase());
    return { primeiroNome: p ? L.primeiroNome(p.nome) : null };
  }
  if (metodo === 'POST' && rota === 'cadastrar') return cadastrar(c);
  if (metodo === 'POST' && rota === 'admin/entrar') {
    if (c.senha !== SENHA_DEMO) throw new Erro(401, `Senha incorreta. Na demonstração a senha é "${SENHA_DEMO}".`);
    const t = novoToken();
    db.sessoes[t] = { admin: true };
    return { token: t };
  }
  if (metodo === 'POST' && rota === 'sair') return { ok: true };
  if (partes[0] === 'admin') {
    if (!s?.admin) throw new Erro(401, 'Entre com a senha do administrador.');
    return admin(metodo, partes.slice(1), c, url);
  }
  const p = s?.uid && db.participantes[s.uid];
  if (!p) throw new Erro(401, 'Cadastre-se para jogar.');
  if (rota === 'minhaConta') return minhaConta(p);
  if (rota === 'proximaPergunta') return proximaPergunta(p);
  if (rota === 'responder') return responder(p, Number(c.opcao));
  if (rota === 'usarDica') return usarDica(p);
  throw new Erro(404, 'Rota não encontrada.');
}

function cadastrar(c) {
  const cfg = db.config;
  const nome = String(c.nome || '').trim().replace(/\s+/g, ' ').slice(0, 80);
  const telefone = String(c.telefone || '').replace(/\D/g, '');
  if (nome.length < 3) throw new Erro(400, 'Digite seu nome completo.');
  if (telefone.length !== 11 || telefone[2] !== '9') throw new Erro(400, 'Digite seu WhatsApp com DDD, ex.: (11) 91234-5678.');
  if (c.maiorIdade !== true) throw new Erro(403, `Você precisa ter ${cfg.idadeMinima} anos ou mais para participar.`);
  if (c.aceite !== true) throw new Erro(400, 'Aceite o regulamento e a política de privacidade.');
  const lista = todos(db.participantes);
  if (lista.some(p => p.telefone === telefone)) {
    throw new Erro(409, 'Esse WhatsApp já está cadastrado. Para entrar neste celular, use o seu link de acesso (fica em "Minha conta" no celular onde você se cadastrou).');
  }
  const padrinho = lista.find(p => p.codigo === String(c.ref || '').toUpperCase());
  let codigo;
  do { codigo = L.novoCodigo(); } while (lista.some(p => p.codigo === codigo));
  const uid = crypto.randomUUID(), agora = Date.now();
  db.participantes[uid] = {
    uid, nome, telefone, codigo, indicado_por: padrinho?.uid || null, indicacao_creditada: false,
    nivel: 1, pergunta: 0, fila: [], dica: null, ultimo_anuncio_em: agora, niveis_desde_anuncio: 0,
    total_numeros: 0, criado_em: agora
  };
  const t = novoToken();
  db.sessoes[t] = { uid };
  return { token: t };
}

function minhaConta(p) {
  return {
    nome: p.nome, telefone: p.telefone, nivel: p.nivel, codigo: p.codigo,
    numeros: todos(db.numeros).filter(n => n.uid === p.uid).sort((a, b) => a.criado_em - b.criado_em)
      .map(n => ({ numero: n.numero, origem: n.origem })),
    indicados: todos(db.participantes).filter(x => x.indicado_por === p.uid)
      .map(x => ({ nome: L.primeiroNome(x.nome), valido: x.indicacao_creditada }))
  };
}

const perguntaAtual = p => db.perguntas.find(q => q.id === p.fila[p.pergunta]);

function proximaPergunta(p) {
  const cfg = db.config;
  if (!p.fila.length || !p.fila.every(id => db.perguntas.some(q => q.id === id))) {
    if (!db.perguntas.length) throw new Erro(409, 'Nenhuma pergunta cadastrada ainda.');
    p.fila = embaralhar(db.perguntas.map(q => q.id)).slice(0, cfg.perguntasPorNivel);
    p.pergunta = 0;
    p.dica = null;
  }
  const q = perguntaAtual(p);
  return {
    nivel: p.nivel, pergunta: p.pergunta, total: p.fila.length, texto: q.texto, opcoes: q.opcoes,
    dica: p.dica, numeros: p.total_numeros,
    proximoMarco: Math.ceil(p.nivel / cfg.niveisPorNumero) * cfg.niveisPorNumero
  };
}

function responder(p, opcao) {
  const cfg = db.config;
  const q = perguntaAtual(p);
  if (!q) throw new Erro(409, 'Carregue a pergunta novamente.');
  if (opcao !== q.correta) return { resultado: 'errada' };
  p.dica = null;
  if (p.pergunta + 1 < p.fila.length) { p.pergunta++; return { resultado: 'certa' }; }

  const concluido = p.nivel, agora = Date.now(), ganhos = [];
  const usados = new Set(Object.keys(db.numeros));
  const darNumero = (uid, origem) => {
    let n;
    do { n = L.numerosDistintos(1)[0]; } while (usados.has(n));
    usados.add(n);
    db.numeros[n] = { numero: n, uid, origem, criado_em: agora };
    return n;
  };
  if (concluido % cfg.niveisPorNumero === 0) ganhos.push(darNumero(p.uid, `Nível ${concluido} concluído`));
  if (p.indicado_por && !p.indicacao_creditada && concluido >= cfg.nivelIndicacao) {
    const padrinho = db.participantes[p.indicado_por];
    if (padrinho) {
      for (let i = 0; i < cfg.numerosPorIndicacao; i++) darNumero(padrinho.uid, `Indicação: ${L.primeiroNome(p.nome)}`);
      padrinho.total_numeros += cfg.numerosPorIndicacao;
    }
    p.indicacao_creditada = true;
  }
  p.total_numeros += ganhos.length;
  p.niveis_desde_anuncio++;
  const mostrarAnuncio = L.precisaAnuncio(p.ultimo_anuncio_em, p.niveis_desde_anuncio, cfg, agora);
  if (mostrarAnuncio) { p.ultimo_anuncio_em = agora; p.niveis_desde_anuncio = 0; }
  p.nivel++;
  p.pergunta = 0;
  p.fila = [];
  return {
    resultado: 'certa', nivelConcluido: concluido, ganhos, mostrarAnuncio,
    faltam: cfg.niveisPorNumero - (concluido % cfg.niveisPorNumero)
  };
}

function usarDica(p) {
  if (!p.dica) {
    const q = perguntaAtual(p);
    if (!q) throw new Erro(409, 'Carregue a pergunta novamente.');
    p.dica = L.escolherEliminadas(q.opcoes.length, q.correta);
  }
  return { eliminadas: p.dica };
}

function admin(metodo, [recurso, id, acao], c, url) {
  const lista = todos(db.participantes);
  if (metodo === 'GET' && recurso === 'resumo') {
    return {
      participantes: lista.length, numeros: Object.keys(db.numeros).length,
      indicacoes: lista.filter(p => p.indicado_por && p.indicacao_creditada).length, perguntas: db.perguntas.length
    };
  }
  if (metodo === 'PUT' && recurso === 'config') {
    for (const [k, padrao] of Object.entries(L.CONFIG_PADRAO)) {
      if (!(k in c)) continue;
      db.config[k] = typeof padrao === 'number' ? Math.max(1, parseInt(c[k], 10) || padrao) : String(c[k]).trim().slice(0, 200);
    }
    return db.config;
  }
  if (recurso === 'perguntas') {
    const validar = () => {
      const texto = String(c.texto || '').trim();
      const opcoes = Array.isArray(c.opcoes) ? c.opcoes.map(o => String(o).trim()) : [];
      if (!texto || opcoes.length !== 4 || opcoes.some(o => !o)) throw new Erro(400, 'Preencha a pergunta e as 4 opções.');
      return { texto, opcoes, correta: Number(c.correta) };
    };
    if (metodo === 'GET') return [...db.perguntas].sort((a, b) => a.texto.localeCompare(b.texto));
    if (metodo === 'POST' && id === 'padrao') {
      if (db.perguntas.length) throw new Erro(409, 'Já existem perguntas cadastradas.');
      db.perguntas = bancoNovo().perguntas;
      return { ok: true };
    }
    if (metodo === 'POST' && !id) { db.perguntas.push({ id: db.proximoId++, ...validar() }); return { ok: true }; }
    if (metodo === 'PUT' && id) { Object.assign(db.perguntas.find(q => q.id === Number(id)), validar()); return { ok: true }; }
    if (metodo === 'DELETE' && id) {
      if (db.perguntas.length <= db.config.perguntasPorNivel) throw new Erro(409, `Mantenha pelo menos ${db.config.perguntasPorNivel} perguntas.`);
      db.perguntas = db.perguntas.filter(q => q.id !== Number(id));
      return { ok: true };
    }
  }
  if (recurso === 'participantes') {
    if (metodo === 'GET' && !id) {
      return lista.sort((a, b) => b.criado_em - a.criado_em).map(p => ({
        uid: p.uid, nome: p.nome, telefone: p.telefone, nivel: p.nivel, total_numeros: p.total_numeros, criado_em: p.criado_em,
        indicado_por_nome: db.participantes[p.indicado_por]?.nome || null,
        indicacoes: lista.filter(x => x.indicado_por === p.uid && x.indicacao_creditada).length
      }));
    }
    if (metodo === 'POST' && id && acao === 'acesso') {
      for (const [t, s] of Object.entries(db.sessoes)) if (s.uid === id) delete db.sessoes[t];
      const t = novoToken();
      db.sessoes[t] = { uid: id };
      return { token: t };
    }
  }
  if (metodo === 'GET' && recurso === 'numeros') {
    const comDono = n => ({ ...n, nome: db.participantes[n.uid]?.nome, telefone: db.participantes[n.uid]?.telefone });
    if (id) {
      const n = String(id).replace(/\D/g, '').padStart(5, '0').slice(-5);
      return db.numeros[n] ? comDono(db.numeros[n]) : { numero: n, naoEncontrado: true };
    }
    const lista = todos(db.numeros).sort((a, b) => a.criado_em - b.criado_em).map(comDono);
    return url.searchParams.get('todos') === '1' ? lista : lista.reverse().slice(0, 100);
  }
  throw new Erro(404, 'Rota não encontrada.');
}
