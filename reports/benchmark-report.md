# Pendulum Lab Benchmark Report

Generated: 2026-06-18T16:54:19.235Z

| Build | FPS | Physics ms/frame | Memory bytes | Worker latency ms | URL |
|---|---:|---:|---:|---:|---|
| original | 8.759379835968595 | 0.09999996423721313 | 11900000 | n/a | http://127.0.0.1:5173/ |
| candidate | 8.847208705560057 | 0.19999998807907104 | 13400000 | n/a | http://127.0.0.1:5173/ |

## Original vs candidate

Status: WARN (same URL sampled twice)

| Metric | Direction | Original | Candidate | Delta | Relative delta | Status |
|---|---|---:|---:|---:|---:|---|
| fps | higher-is-better | 8.759 | 8.847 | 0.08783 | 1.00% | pass |
| physicsMsPerFrame | lower-is-better | 0.1000 | 0.2000 | 0.1000 | 100.00% | warn |
| memoryBytes | lower-is-better | 11900000 | 13400000 | 1500000 | 12.61% | pass |
| workerLatencyMs | lower-is-better | n/a | n/a | n/a | n/a | missing |
