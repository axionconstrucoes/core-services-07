import assert from "node:assert/strict";
import { buildHeartbeatPayload } from "./scheduler-heartbeat.mjs";

const env = { GITHUB_RUN_ID: "44223845567", GITHUB_RUN_ATTEMPT: "1" };
assert.deepEqual(buildHeartbeatPayload("weekly-all", "started", undefined, env), { p_job: "weekly-all", p_event: "started", p_run_id: 44223845567, p_run_attempt: 1, p_conclusion: null });
assert.deepEqual(buildHeartbeatPayload("mpp-worker", "finished", "FAILURE", env), { p_job: "mpp-worker", p_event: "finished", p_run_id: 44223845567, p_run_attempt: 1, p_conclusion: "failure" });
assert.equal(buildHeartbeatPayload("gmail-sync", "started", undefined, { GITHUB_RUN_ID: "x;drop" }).p_run_id, null);
assert.throws(() => buildHeartbeatPayload("desconhecido", "started"));
assert.throws(() => buildHeartbeatPayload("weekly-all", "finished", "ok"));
assert.throws(() => buildHeartbeatPayload("weekly-all", "dispatched"));
console.log("scheduler-heartbeat: ok");
