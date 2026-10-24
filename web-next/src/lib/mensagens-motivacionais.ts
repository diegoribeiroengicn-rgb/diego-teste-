// Mensagens exibidas na tela de login, uma por acesso (rotação aleatória).
// Texto editável pela Administração na versão final — esta lista é o
// conteúdo inicial enquanto essa tela de configuração não existe.
export const MENSAGENS_MOTIVACIONAIS: string[] = [
  "Cada análise concluída é uma obra mais perto de sair do papel.",
  "Precisão hoje é menos retrabalho amanhã.",
  "Qualidade técnica não é detalhe — é a base de tudo que vem depois.",
  "Um prazo cumprido é a confiança do cliente se renovando.",
  "Revisar com atenção é também uma forma de respeito pelo projeto.",
  "O padrão que você mantém hoje é o padrão que a Tecnoplano entrega amanhã.",
  "Projetos bem analisados evitam problemas que custariam muito mais depois.",
  "Sua atenção aos detalhes é invisível quando dá certo — e decisiva quando não dá.",
];

export function mensagemAleatoria(): string {
  return MENSAGENS_MOTIVACIONAIS[
    Math.floor(Math.random() * MENSAGENS_MOTIVACIONAIS.length)
  ];
}
