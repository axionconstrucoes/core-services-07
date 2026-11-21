-- ROLLBACK de 20261126100000_p0_gate_record_risk_alert_action.sql: NADA a desfazer. A migration só confere o corpo e reafirma
-- a ACL já protegida (revoke de PUBLIC/anon, grant a authenticated/service_role); não cria objetos nem altera dados.
-- Para "remover" basta não aplicar (ou apagar o registro do histórico, se tiver sido registrada). NUNCA reverter a ACL.
select 1;
