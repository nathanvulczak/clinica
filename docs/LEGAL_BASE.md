# Base documental: CliniCore

Os textos publicos em `/termos` e `/privacidade` sao uma base de produto. Eles nao substituem revisao juridica, adequacao ao controlador/operador e definicao das bases legais de cada clinica.

## Retencao

A clinica deve definir o prazo de retencao por categoria de dado e respeitar obrigacoes profissionais, fiscais, contratuais e reguladoras. O sistema registra a politica em `clinic_compliance_settings`; a exclusao nao deve apagar historico de auditoria quando houver obrigacao de preservacao.

## Titulares

Solicitacoes de acesso, exportacao, retificacao, eliminacao ou restricao devem ser registradas em `data_subject_requests`, com responsavel, status, prazo e resolucao. A equipe deve verificar identidade antes de exportar dados.

## Incidentes

Cada incidente deve registrar severidade, contenção, investigacao, comunicacoes e encerramento em `security_incidents`. O canal configurado pela clinica deve ser monitorado por uma pessoa responsavel.
