-- ROLLBACK de 20261121177000_sla_medio_baixo_prazos_aprovados.sql (Fase 6/H5): IRREVERSIVEL POR SCRIPT (recusa).
-- A migration ALTERA DADOS de configuracao (desativa a regra geral antiga e cria a nova; atualiza regras por area em lugar) e a
-- matriz e auditada por gatilhos; nao ha como saber, so pelo banco, quais linhas eram as antigas sem o historico. Nada e apagado ou alterado aqui.
-- Para voltar: RESTAURAR DO BACKUP/PITR (snapshot de sla_matrix_rules tirado antes da janela) OU, por decisao do Dono, o procedimento por
-- dado AUDITADO descrito em docs/implantacao/03 (reativar as 2 regras antigas e desativar as novas). Esta migration e prospectiva:
-- nao alterou nenhuma sla_actions existente (as 9 abertas mantem prazo).
begin;
do $$
begin
  raise exception 'ROLLBACK_IRREVERSIVEL: 20261121177000 altera dados de configuracao de SLA. Restaurar do backup/PITR (ou aplicar o procedimento por dado auditado do doc 03 com autorizacao do Dono). Nada foi alterado.';
end $$;
rollback;
