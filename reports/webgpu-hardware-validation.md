# WebGPU Hardware Validation

Generated: 2026-06-18T12:28:36.119Z

Status: **pass**

Browser channel: `chrome`

Ensemble backend: `webgpu`

Full-spectrum backend: `webgpu`

CLV backend: `webgpu`

Variational-FTLE backend: `webgpu`

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

## CLV Promotion

| Metric | Value |
|---|---:|
| passed | true |
| exponent max abs diff | 1.779e-6 |
| mean angle abs diff | 1.677e-5 |
| min angle abs diff | 1.206e-5 |

## Variational-FTLE Promotion

| Metric | Value |
|---|---:|
| passed | true |
| shape | 4x4 |
| field max abs diff | 2.429e-5 |
| field mean abs diff | 5.859e-6 |

The on-device WebGPU ensemble reduction, full-spectrum Lyapunov, CLV, and variational-FTLE candidates matched the CPU f64 oracle within the declared f32 tolerances.
