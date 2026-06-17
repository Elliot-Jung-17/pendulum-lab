# Pendulum Lab Benchmark Report

Generated: 2026-06-17T08:09:49.208Z

| Build | FPS | Physics ms/frame | Memory bytes | Worker latency ms | URL |
|---|---:|---:|---:|---:|---|
| original | 9.324299123498609 | 0.20000001788139343 | 11900000 | n/a | http://127.0.0.1:5173/ |
| candidate | 10.278196519180412 | 0 | 11200000 | n/a | http://127.0.0.1:5173/ |

## Original vs candidate

Status: PASS (same URL sampled twice)

| Metric | Direction | Original | Candidate | Delta | Relative delta | Status |
|---|---|---:|---:|---:|---:|---|
| fps | higher-is-better | 9.324 | 10.28 | 0.9539 | 10.23% | pass |
| physicsMsPerFrame | lower-is-better | 0.2000 | 0.000 | -0.2000 | -100.00% | pass |
| memoryBytes | lower-is-better | 11900000 | 11200000 | -700000 | -5.88% | pass |
| workerLatencyMs | lower-is-better | n/a | n/a | n/a | n/a | missing |
