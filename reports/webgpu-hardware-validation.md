# WebGPU Hardware Validation

Generated: 2026-06-18T08:32:58.262Z

Status: **pass**

Browser channel: `chrome`

Backend: `webgpu`

| Metric | Value |
|---|---:|
| n | 25 |
| rmsSpread GPU | 2.7608410 |
| rmsSpread CPU | 2.7608408 |
| max mean diff | 1.665e-16 |
| max covariance diff | 1.082e-6 |
| rms spread diff | 2.420e-7 |

The on-device WebGPU ensemble reduction matched the CPU f64 oracle within the declared f32 tolerances.
