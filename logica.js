// Regras do jogo sem acesso ao banco de dados.

export const CONFIG_PADRAO = {
  premio: 'iPhone 15 Pro Max 256 GB',
  dataSorteio: '', // vazio = o site não mostra data nem contagem

  extracao: 'Loteria Federal',
  certificado: '',
  idadeMinima: 13,
  perguntasPorNivel: 3,
  niveisPorNumero: 5,
  nivelIndicacao: 1,
  numerosPorIndicacao: 1,
  minutosEntreAnuncios: 10,
  niveisEntreAnuncios: 10
};

export function mesclarConfig(c) {
  return { ...CONFIG_PADRAO, ...(c || {}) };
}

function embaralhar(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Dica "50/50": duas opções erradas que somem da tela.
export function escolherEliminadas(totalOpcoes, correta) {
  const erradas = Array.from({ length: totalOpcoes }, (_, i) => i).filter(i => i !== correta);
  return embaralhar(erradas).slice(0, Math.min(2, erradas.length - 1)).sort((a, b) => a - b);
}

// O anúncio aparece na troca de nível quando passar X minutos OU Y níveis desde o último.
export function precisaAnuncio(ultimoAnuncioEm, niveisDesdeAnuncio, cfg, agora) {
  return agora - ultimoAnuncioEm >= cfg.minutosEntreAnuncios * 60000 || niveisDesdeAnuncio >= cfg.niveisEntreAnuncios;
}

// Números de 5 dígitos (00000–99999). A regra de apuração vem do regulamento aprovado.
export function numerosDistintos(qtd) {
  const s = new Set();
  while (s.size < qtd) s.add(String(Math.floor(Math.random() * 100000)).padStart(5, '0'));
  return [...s];
}

export function novoCodigo() {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += c[Math.floor(Math.random() * c.length)];
  return s;
}

export const primeiroNome = n => String(n).trim().split(/\s+/)[0];
