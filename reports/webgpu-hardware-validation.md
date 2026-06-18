# WebGPU Hardware Validation

Generated: 2026-06-18T11:41:38.569Z

Status: **pass**

Browser channel: `chrome`

Ensemble backend: `webgpu`

Full-spectrum backend: `webgpu`

## Ensemble Reduction

| Metric | Value |
|---|---:|
| n | 25 |
| rmsSpread GPU | 2.7608410 |
| rmsSpread CPU | 2.7608408 |
| max mean diff | 1.665e-16 |
| max covariance diff | 1.082e-6 |
| rms spread diff | 2.420e-7 |

## Full-Spectrum Promotion

| Metric | Value |
|---|---:|
| passed | true |
| spectrum max abs diff | 4.524e-6 |
| sum abs diff | 4.072e-7 |
| Kaplan-Yorke abs diff | 5.109e-7 |

The on-device WebGPU ensemble reduction and full-spectrum Lyapunov candidate matched the CPU f64 oracle within the declared f32 tolerances.
