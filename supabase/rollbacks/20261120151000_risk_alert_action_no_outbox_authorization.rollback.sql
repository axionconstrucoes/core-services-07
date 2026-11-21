-- ROLLBACK (manual, NAO e migration) de 20261120151000_risk_alert_action_no_outbox_authorization.sql (Fase 6/H5): NO-OP DELIBERADO.
-- A migration so redefine record_risk_alert_action (versao intermediaria, ja ignorada quando o hotfix esta efetivo). Reverter significaria voltar a um corpo MENOS seguro.
-- NUNCA reaplicar o corpo antigo de record_risk_alert_action: o rollback de nenhuma migration pode rebaixar o P0 (md5 do corpo 930f6d75898793479b418950b0053bd9).
begin;
select 1;
commit;
