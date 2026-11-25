-- ROLLBACK (manual, NAO e migration) de 20261120130000_risk_alert_action_server_side_guard.sql (Fase 6/H5): NO-OP DELIBERADO.
-- A migration so redefine record_risk_alert_action (versao intermediaria, ja ignorada quando o hotfix 20261121090000 esta efetivo). Reverter significaria voltar a um corpo MENOS seguro.
-- NUNCA reaplicar o corpo antigo de record_risk_alert_action: o rollback de nenhuma migration pode rebaixar o P0 (md5 do corpo 930f6d75898793479b418950b0053bd9).
begin;
select 1;
commit;
