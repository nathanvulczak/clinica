# CliniCore: prontidao comercial

Este documento organiza o que precisa estar pronto antes de vender o sistema para uma clinica real.

## Produto e operacao

- [ ] Validar com pelo menos duas clinicas-piloto e profissionais de duas especialidades.
- [ ] Confirmar os fluxos de agenda, chegada, pre-consulta, prontuario, documentos e cobranca.
- [ ] Publicar protocolos clinicos por servico e treinar o administrador da clinica.
- [ ] Criar um ambiente de demonstracao com dados ficticios e acessos por funcao.
- [ ] Publicar central de ajuda com fluxos curtos e canal de suporte.

## Seguranca, LGPD e continuidade

- [ ] Revisar termos de uso, politica de privacidade e politica de retencao com advogado.
- [ ] Definir responsavel por privacidade, canal de incidentes e prazo de resposta.
- [ ] Testar exportacao, retificacao e exclusao conforme a base legal e os prazos contratados.
- [ ] Fazer teste real de restauracao de backup, nao apenas exportacao de arquivo.
- [ ] Definir retencao, controle de acesso, revogacao de usuarios e rotacao de credenciais.
- [ ] Manter producao e homologacao separadas, com projetos Supabase e contas Stripe distintas.

## Billing e contrato

- [ ] Configurar Stripe em modo producao, precos, webhook e Customer Portal de producao.
- [ ] Testar cancelamento, upgrade, downgrade, inadimplencia, reembolso e fim do ciclo pago.
- [ ] Definir limites por plano, politica de cancelamento e tratamento de dados apos encerramento.
- [ ] Emitir nota fiscal e documento contratual conforme a operacao da empresa.

## Qualidade

- [ ] Rodar lint, typecheck, build e testes RLS em todo pull request.
- [ ] Ter testes E2E dos cinco fluxos criticos: cadastro, assinatura, agenda, atendimento e cobranca.
- [ ] Monitorar erros de servidor, webhook, tempo de resposta e falhas de permissao.
- [ ] Conferir `app_migration_history` em cada ambiente antes de publicar uma migration.

O codigo fornece a base tecnica. Itens juridicos e regulatorios acima sao modelos operacionais e exigem validacao profissional antes de serem apresentados como aconselhamento legal.
