import assert from "node:assert/strict";
import { buildHeartbeatPayload } from "./scheduler-heartbeat.mjs";

assert.deepEqual(buildHeartbeatPayload("weekly-all", "success", "2026-11-18T10:00:00Z"), {
  p_job: "weekly-all", p_status: "success", p_started_at: "2026-11-18T10:00:00.000Z", p_failure_code: null,
});
assert.equal(buildHeartbeatPayload("mpp-worker", "failure").p_failure_code, "JOB_FAILURE");
assert.equal(buildHeartbeatPayload("gmail-sync", "cancelled", "lixo").p_started_at, null);
assert.throws(() => buildHeartbeatPayload("desconhecido", "success"));
assert.throws(() => buildHeartbeatPayload("weekly-all", "ok"));
console.log("scheduler-heartbeat: ok");
