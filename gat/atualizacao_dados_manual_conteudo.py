"""Conteúdo dos capítulos do Manual do Sistema sobre a atualização de
dados pela planilha oficial, a correção do número da AT no Resumo de
Conclusão (Central de Codificação) e a atualização automática dos
dashboards — usado apenas para semear a migração correspondente. Depois
de publicado, o conteúdo passa a ser gerido pela Administração do Manual,
como qualquer outro capítulo."""

from __future__ import annotations

_CONTEUDO_IMPORTACAO_PLANILHA = (
    "Em Configurações > Atualização por Planilha, um usuário autorizado pode enviar a planilha oficial "
    "\"Controle GAT Projetos\" (abas PROJ_PREST e PROJ_CESS) para atualizar Prestadores e Cessionários quando "
    "os analistas ainda não tiverem preenchido diretamente no sistema. O preenchimento direto continua sendo "
    "o fluxo principal — a planilha é um complemento, nunca uma substituição do banco.\n\n"
    "**Quando usar**\n\n"
    "Sempre que uma planilha mais atualizada existir fora do sistema e for preciso trazer esses dados sem "
    "digitar tudo de novo manualmente.\n\n"
    "**Como a importação decide se atualiza ou cria um registro novo**\n\n"
    "Cada linha da planilha é identificada pela combinação código + disciplina + revisão + nº AT (a mesma "
    "combinação que identifica uma análise no dia a dia). Se já existir um registro ativo com essa "
    "combinação, ele é atualizado; se não existir, um novo registro é criado. Nada é apagado, nenhuma tabela "
    "é recriada e nenhum registro já arquivado é alterado — se a combinação só existir entre os arquivados, "
    "a linha é apenas sinalizada no relatório, nunca reaproveitada.\n\n"
    "**Prévia antes de qualquer gravação**\n\n"
    "Depois de selecionar a planilha e clicar em \"Validar planilha\", o sistema mostra uma prévia completa "
    "— quantos registros seriam lidos, novos, atualizados, sem mudança, já arquivados (ignorados) e com "
    "inconsistência, mais as colunas da planilha que não foram reconhecidas — antes de gravar qualquer coisa "
    "no banco.\n\n"
    "**Campo vazio nunca apaga um dado já cadastrado**\n\n"
    "Um campo vazio ou em branco na planilha nunca substitui um valor já preenchido no sistema — só um valor "
    "efetivamente preenchido na planilha entra automaticamente como preenchimento.\n\n"
    "**Conflito de informação**\n\n"
    "Quando o sistema e a planilha têm valores diferentes e não vazios para o mesmo campo do mesmo registro, "
    "isso NUNCA é resolvido silenciosamente: a prévia lista cada conflito, mostrando o valor do sistema e o "
    "valor da planilha lado a lado, e por padrão o valor do sistema é mantido — só é substituído se você "
    "escolher explicitamente \"Usar planilha\" para aquele campo.\n\n"
    "**Confirmação e backup automático**\n\n"
    "Nada é gravado até você clicar em \"Confirmar atualização\" (ou \"Cancelar\" para descartar a prévia). "
    "Antes de aplicar, o sistema cria automaticamente um backup completo do banco; se qualquer erro ocorrer "
    "durante a gravação, o estado anterior é restaurado automaticamente — a importação nunca deixa o banco "
    "parcialmente atualizado.\n\n"
    "**Relatório e histórico**\n\n"
    "Ao final, um relatório mostra, separadamente para Prestadores e para Cessionários, quantos registros "
    "foram lidos, novos, atualizados, quantos conflitos foram tratados, quantos ficaram sem mudança, "
    "ignorados (já arquivados) ou com inconsistência. Toda importação — bem-sucedida ou não — fica registrada "
    "no Histórico de importações, com data/hora, usuário, arquivo e os mesmos números; a área também sempre "
    "mostra a data da última atualização por planilha."
)

_CONTEUDO_CENTRAL_CODIFICACAO = (
    "O número completo da AT exibido no Resumo de Conclusão da Análise segue o padrão oficial "
    "AT-NNN-AA-PPP-DDD-RR, onde: NNN-AA é o nº AT já cadastrado na análise (ex.: 0303/26); PPP é o código do "
    "Prestador ou Cessionário; DDD é o código da disciplina; RR é a revisão, com dois dígitos. "
    "Exemplo: AT-0303-26-P256-400-01.\n\n"
    "**De onde vem o código da disciplina (DDD)**\n\n"
    "O código DDD vem da Central de Codificação (Administração > Central de Codificação), que segue o "
    "procedimento oficial PR-PRO-002 \"Codificação de Documentação Técnica\" — o mesmo código de "
    "especialidade usado na codificação de desenhos e documentos técnicos do Rio Galeão (ex.: 400 para "
    "Elétrica, 600 para Contra Incêndio). O sistema já vem com o código de cada disciplina do cadastro "
    "pré-preenchido a partir desse procedimento; um administrador pode revisar, corrigir ou completar essa "
    "tabela a qualquer momento.\n\n"
    "**Disciplina sem código cadastrado**\n\n"
    "O número da AT nunca fica incorreto nem trava a geração do Resumo de Conclusão por falta do código de "
    "disciplina: quando a disciplina da análise ainda não tem um código definido na Central de Codificação, "
    "o segmento DDD é simplesmente omitido do número — nunca preenchido com \"None\" ou um valor inventado "
    "— e um aviso aparece no próprio pop-up do Resumo indicando qual disciplina precisa de código. Assim que "
    "o código for cadastrado, os próximos Resumos gerados para essa disciplina já saem completos."
)

_CONTEUDO_DASHBOARDS_DINAMICOS = (
    "Todos os cards, KPIs, contadores e gráficos do sistema — Página Inicial, Dashboards de Prestadores e "
    "Cessionários, Visão Geral, Visão do Gestor, KPIs dos Analistas e o Relatório Excel exportável pela "
    "barra lateral — são calculados a partir dos dados atuais do banco a cada tela aberta, nunca de um valor "
    "salvo antecipadamente. Ao salvar qualquer alteração válida em uma análise (mudança de status, entrada "
    "ou saída de HOLD, cancelamento, nova análise, etc.), os indicadores afetados já refletem o novo estado "
    "assim que a tela seguinte é exibida — sem precisar reiniciar a aplicação, sair e entrar novamente ou "
    "atualizar o banco manualmente."
)

CAPITULOS_ATUALIZACAO_DADOS: list[tuple[str, str]] = [
    ("Atualização de Dados pela Planilha Oficial", _CONTEUDO_IMPORTACAO_PLANILHA),
    ("Central de Codificação e o Número da AT", _CONTEUDO_CENTRAL_CODIFICACAO),
    ("Atualização Automática dos Dashboards", _CONTEUDO_DASHBOARDS_DINAMICOS),
]
