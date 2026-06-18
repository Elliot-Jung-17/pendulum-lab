# Pendulum Lab Benchmark Report

Generated: 2026-06-18T12:22:57.417Z

| Build | FPS | Physics ms/frame | Memory bytes | Worker latency ms | URL |
|---|---:|---:|---:|---:|---|
| original | 11.059092417197565 | 0.10000002384185791 | 12700000 | n/a | http://127.0.0.1:5173/ |
| candidate | 11.156563778356265 | 0.20000004768371582 | 12700000 | n/a | http://127.0.0.1:5173/ |

## Original vs candidate

Status: WARN (same URL sampled twice)

| Metric | Direction | Original | Candidate | Delta | Relative delta | Status |
|---|---|---:|---:|---:|---:|---|
| fps | higher-is-better | 11.06 | 11.16 | 0.09747 | 0.88% | pass |
| physicsMsPerFrame | lower-is-better | 0.1000 | 0.2000 | 0.1000 | 100.00% | warn |
| memoryBytes | lower-is-better | 12700000 | 12700000 | 0.000 | 0.00% | pass |
| workerLatencyMs | lower-is-better | n/a | n/a | n/a | n/a | missing |
