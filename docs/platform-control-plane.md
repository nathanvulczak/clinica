# Console do Proprietario

O console tecnico fica em `/console` e nao depende de uma clinica ativa. Ele
possui login dedicado e nao aparece no menu do sistema clinico.

## Primeiro acesso

1. Crie ou confirme a conta do proprietario no Supabase Auth.
2. No SQL Editor, cadastre somente a conta do proprietario:

```sql
insert into public.platform_operators(user_id, role, status, display_name, mfa_required)
select id, 'owner', 'active', 'Nathan', true
from public.profiles
where lower(email) = lower('SEU_EMAIL_DO_CONSOLE@DOMINIO.COM')
on conflict (user_id) do update
set role = 'owner', status = 'active', display_name = 'Nathan', mfa_required = true, updated_at = now();
```

3. Acesse `/console/login` usando a conta cadastrada.

Nao existe login por clinica no console e nenhuma conta de clinica recebe esse
acesso automaticamente. A senha continua armazenada apenas pelo Supabase Auth.

## Escopos

- `owner`: operacoes, limites, billing, erros, uso agregado, saude e seguranca.
- `support`: saude, diagnosticos e erros tecnicos.
- `billing`: planos e sincronizacao de assinatura.
- `security`: saude, erros e solicitacoes emergenciais.

O primeiro acesso deve permanecer como `owner` do proprietario da plataforma.
O console exige MFA TOTP. No primeiro acesso, configure o autenticador em
`/console/mfa`; sem MFA validado a sessao nao entra no console.

## Break glass

O recurso cria uma solicitacao com motivo, clinica alvo opcional, prazo de ate
60 minutos, somente leitura e aprovacao obrigatoria. Ele nao abre prontuarios
nem libera conteudo clinico. A aprovacao deve ser feita por outro operador com
escopo de seguranca; o console nao possui uma rota de acesso assistencial
automatico.

## Dados exibidos

O console exibe somente metadados administrativos e tecnicos: contagens,
limites, status de clinicas, assinaturas, erros, uso agregado, migrations,
health checks e operacoes. Nao exibe CPF, pacientes, prontuarios, laudos,
documentos medicos ou conteudo de consultas.
