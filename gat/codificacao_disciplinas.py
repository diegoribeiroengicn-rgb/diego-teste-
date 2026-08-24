"""
Central de Codificação — mapeamento entre as disciplinas cadastradas no
sistema (`gat.config.DISCIPLINAS`) e o código numérico de especialidade/
subespecialidade definido no procedimento oficial PR-PRO-002 "Codificação
de Documentação Técnica" (Rio Galeão), usado para montar o segmento DDD
do número da AT no Resumo de Conclusão (`AT-NNN-AA-PPP-DDD-RR`).

Este módulo só fornece a *semente* inicial (migração `codigos_disciplina`)
— depois de aplicada, a lista passa a ser gerida pela Central de
Codificação (Administração > Central de Codificação), como qualquer outro
cadastro; editar este dicionário não afeta um banco já migrado.

Algumas disciplinas do cadastro atual mapeiam para o mesmo código porque
representam a mesma especialidade do PR-PRO-002 (ex.: variações de
grafia/acento já existentes no cadastro, como "TELEMATICA"/"TELEMÁTICA" ou
"HIDROSSANTÁRIO"/"HIDROSSANITÁRIO"). "TELECOM / ESPECIAIS" foi deixada sem
código por não ter uma especialidade correspondente clara no procedimento
— o Resumo de Conclusão omite o segmento DDD nesse caso, sem travar a
geração (ver `gat.resumo_conclusao.montar_numero_at`).
"""

from __future__ import annotations

# disciplina -> (código, descrição no PR-PRO-002)
CODIGOS_DISCIPLINA_SEED: dict[str, tuple[str | None, str | None]] = {
    "GERAL": ("000", "Geral"),
    "ARQUITETURA": ("200", "Arquitetura — Geral"),
    "PAISAGISMO": ("203", "Paisagismo"),
    "SINALIZAÇÃO VERTICAL": ("204", "Sinalização Vertical/Comunicação Visual"),
    "SINALIZAÇÃO HORIZONTAL": ("221", "Sinalização Horizontal"),
    "ESTRUTURA": ("300", "Estrutura — Geral"),
    "ESTRUTURA (MC)": ("300", "Estrutura — Geral"),
    "ELÉTRICA": ("400", "Elétrica/Eletromecânica/Eletrônica — Geral"),
    "SPDA": ("402", "Aterramento/Sistema de Proteção Contra Descargas Atmosféricas"),
    "AR CONDICIONADO": ("432", "Sistema de Ar Condicionado e Ventilação"),
    "HVAC": ("432", "Sistema de Ar Condicionado e Ventilação"),
    "EXAUSTÃO": ("416", "Exaustão e Ventilação"),
    "TELEFONIA": ("470", "Telefonia"),
    "TELEMÁTICA": ("490", "Rede Telemática"),
    "TELEMATICA": ("490", "Rede Telemática"),
    "SDAI": ("494", "Detecção e Alarme de Incêndio"),
    "HIDRÁULICA": ("500", "Hidráulica/Saneamento — Geral"),
    "ÁGUAS PLUVIAIS": ("502", "Águas Pluviais"),
    "HIDROSSANTÁRIO": ("500", "Hidráulica/Saneamento — Geral"),
    "HIDROSSANITÁRIO": ("500", "Hidráulica/Saneamento — Geral"),
    "ESGOTO": ("550", "Rede de Esgoto área externa"),
    "INCÊNDIO": ("600", "Instalações e Equipamentos de Contra Incêndio — Geral"),
    "COMBATE A INCÊNDIO": ("600", "Instalações e Equipamentos de Contra Incêndio — Geral"),
    "SOM": ("463", "Sonorização"),
    "DRENAGEM": ("102", "Drenagem (Microdrenagem)"),
    "PAVIMENTAÇÃO": ("105", "Pavimentação"),
    "GEOMÉTRICO": ("010", "Projetos (Geométrico/Perfil Longitudinal/Seções Transversais)"),
    "CERCAMENTO": ("106", "Muros e Cercas"),
    "INFRAESTRUTURA": ("100", "Infraestrutura — Geral"),
    "LUMINOTECNICA": ("412", "Luminotécnica"),
    "TOPOGRAFIA": ("101", "Topografia"),
    # Sem código correspondente claro no PR-PRO-002 — fica pendente de
    # definição na Central de Codificação (Administração).
    "TELECOM / ESPECIAIS": (None, None),
    "ART/RRT": (None, None),
    "CIVIL": (None, None),
    "SONDAGEM": (None, None),
}
