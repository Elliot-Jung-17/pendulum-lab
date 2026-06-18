/**
 * Generic workgroup pipeline for planar N-chain tangent dynamics.
 *
 * The nonlinear reference trajectory and its Jacobian tape are generated in
 * f64 on the CPU. WebGPU consumes that tape and performs the expensive dense
 * tangent-matrix propagation, QR tape, Ginelli backward solve, and finite-time
 * singular-value estimate. The fixed 16-dimensional ceiling covers chains up
 * to N=8 while keeping workgroup storage portable across WebGPU adapters.
 */
export const WGSL_NCHAIN_VARIATIONAL_KERNEL = /* wgsl */ `
struct Params {
  dim: f32, renormEvery: f32, forwardTransient: f32, window: f32,
  backwardTransient: f32, dt: f32, jacOffset: f32, framesOffset: f32,
  rOffset: f32, outputVectorsOffset: f32, pad0: f32, pad1: f32,
  pad2: f32, pad3: f32, pad4: f32, pad5: f32,
};

@group(0) @binding(0) var<storage, read_write> data: array<f32>;
@group(0) @binding(1) var<uniform> params: Params;

var<workgroup> frame: array<f32, 256>;
var<workgroup> stm: array<f32, 256>;
var<workgroup> firstProduct: array<f32, 256>;
var<workgroup> secondProduct: array<f32, 256>;
var<workgroup> stmFirst: array<f32, 256>;
var<workgroup> stmSecond: array<f32, 256>;

fn qrFrame(dim: u32, destination: u32, writeFactor: bool) {
  if (writeFactor) {
    for (var i = 0u; i < dim * dim; i = i + 1u) {
      data[destination + i] = 0.0;
    }
  }
  for (var col = 0u; col < dim; col = col + 1u) {
    for (var prev = 0u; prev < col; prev = prev + 1u) {
      var dot = 0.0;
      for (var row = 0u; row < dim; row = row + 1u) {
        dot = dot + frame[row * dim + col] * frame[row * dim + prev];
      }
      if (writeFactor) {
        data[destination + prev * dim + col] = dot;
      }
      for (var row = 0u; row < dim; row = row + 1u) {
        frame[row * dim + col] = frame[row * dim + col] - dot * frame[row * dim + prev];
      }
    }
    var normSquared = 0.0;
    for (var row = 0u; row < dim; row = row + 1u) {
      let value = frame[row * dim + col];
      normSquared = normSquared + value * value;
    }
    let norm = sqrt(max(normSquared, 0.0));
    if (writeFactor) {
      data[destination + col * dim + col] = norm;
    }
    let inverse = select(0.0, 1.0 / norm, norm > 1e-20);
    for (var row = 0u; row < dim; row = row + 1u) {
      frame[row * dim + col] = frame[row * dim + col] * inverse;
    }
  }
}

fn storeFrame(dim: u32, destination: u32) {
  for (var i = 0u; i < dim * dim; i = i + 1u) {
    data[destination + i] = frame[i];
  }
}

@compute @workgroup_size(256)
fn main(@builtin(local_invocation_id) localId: vec3<u32>, @builtin(workgroup_id) groupId: vec3<u32>) {
  if (groupId.x != 0u) { return; }
  let local = localId.x;
  let dim = u32(params.dim);
  let matrixSize = dim * dim;
  if (dim < 2u || dim > 16u || u32(params.window) == 0u || u32(params.renormEvery) == 0u || u32(params.backwardTransient) >= u32(params.window)) {
    if (local == 0u) { data[0] = -1.0; }
    return;
  }

  if (local < matrixSize) {
    let row = local / dim;
    let col = local % dim;
    let identity = select(0.0, 1.0, row == col);
    frame[local] = identity;
    stm[local] = identity;
  }
  workgroupBarrier();

  let totalIntervals = u32(params.forwardTransient) + u32(params.window);
  let totalSteps = totalIntervals * u32(params.renormEvery);
  for (var step = 0u; step < totalSteps; step = step + 1u) {
    let jacobian = u32(params.jacOffset) + step * matrixSize;
    if (local < matrixSize) {
      let row = local / dim;
      let col = local % dim;
      var frameValue = 0.0;
      var stmValue = 0.0;
      for (var inner = 0u; inner < dim; inner = inner + 1u) {
        let j = data[jacobian + row * dim + inner];
        frameValue = frameValue + j * frame[inner * dim + col];
        stmValue = stmValue + j * stm[inner * dim + col];
      }
      firstProduct[local] = frameValue;
      stmFirst[local] = stmValue;
    }
    workgroupBarrier();
    if (local < matrixSize) {
      let row = local / dim;
      let col = local % dim;
      var frameValue = 0.0;
      var stmValue = 0.0;
      for (var inner = 0u; inner < dim; inner = inner + 1u) {
        let j = data[jacobian + row * dim + inner];
        frameValue = frameValue + j * firstProduct[inner * dim + col];
        stmValue = stmValue + j * stmFirst[inner * dim + col];
      }
      secondProduct[local] = frameValue;
      stmSecond[local] = stmValue;
    }
    workgroupBarrier();
    if (local < matrixSize) {
      let halfDtSquared = 0.5 * params.dt * params.dt;
      frame[local] = frame[local] + params.dt * firstProduct[local] + halfDtSquared * secondProduct[local];
      stm[local] = stm[local] + params.dt * stmFirst[local] + halfDtSquared * stmSecond[local];
    }
    workgroupBarrier();

    if ((step + 1u) % u32(params.renormEvery) == 0u) {
      let interval = (step + 1u) / u32(params.renormEvery);
      if (local == 0u) {
        if (interval <= u32(params.forwardTransient)) {
          qrFrame(dim, 0u, false);
          if (interval == u32(params.forwardTransient)) {
            for (var i = 0u; i < matrixSize; i = i + 1u) { stm[i] = select(0.0, 1.0, (i / dim) == (i % dim)); }
            storeFrame(dim, u32(params.framesOffset));
          }
        } else {
          let windowIndex = interval - u32(params.forwardTransient) - 1u;
          let factorDestination = u32(params.rOffset) + windowIndex * matrixSize;
          qrFrame(dim, factorDestination, true);
          storeFrame(dim, u32(params.framesOffset) + (windowIndex + 1u) * matrixSize);
          for (var col = 0u; col < dim; col = col + 1u) {
            data[8u + col] = data[8u + col] + log(max(data[factorDestination + col * dim + col], 1e-20));
          }
        }
      }
      workgroupBarrier();
    }
  }

  if (local == 0u) {
    let window = u32(params.window);
    let intervalTime = f32(u32(params.renormEvery)) * params.dt;
    let totalTime = f32(window) * intervalTime;
    var exponents: array<f32, 16>;
    var maxAbsExponent = 0.0;
    for (var i = 0u; i < dim; i = i + 1u) {
      exponents[i] = data[8u + i] / totalTime;
      data[8u + i] = exponents[i];
      maxAbsExponent = max(maxAbsExponent, abs(exponents[i]));
    }

    var coeffs: array<f32, 256>;
    var solved: array<f32, 256>;
    var vectors: array<f32, 256>;
    for (var i = 0u; i < matrixSize; i = i + 1u) {
      coeffs[i] = select(0.0, 1.0, (i / dim) == (i % dim));
    }
    var angleSum = 0.0;
    var angleMin = 1.57079632679;
    var angleCount = 0.0;
    let zeroTolerance = 1e-6 + 0.05 * maxAbsExponent;
    let analysisMax = window - u32(params.backwardTransient);
    var backwards = i32(window) - 1i;
    loop {
      if (backwards < 0i) { break; }
      let index = u32(backwards);
      let factor = u32(params.rOffset) + index * matrixSize;
      for (var i = 0u; i < matrixSize; i = i + 1u) { solved[i] = 0.0; }
      for (var col = 0u; col < dim; col = col + 1u) {
        var row = i32(dim) - 1i;
        loop {
          var value = coeffs[u32(row) * dim + col];
          for (var inner = u32(row + 1i); inner < dim; inner = inner + 1u) {
            value = value - data[factor + u32(row) * dim + inner] * solved[inner * dim + col];
          }
          let diagonal = data[factor + u32(row) * dim + u32(row)];
          solved[u32(row) * dim + col] = select(0.0, value / diagonal, abs(diagonal) > 1e-20);
          if (row == 0i) { break; }
          row = row - 1i;
        }
        var normSquared = 0.0;
        for (var r = 0u; r < dim; r = r + 1u) { normSquared = normSquared + solved[r * dim + col] * solved[r * dim + col]; }
        let inverse = select(0.0, inverseSqrt(normSquared), normSquared > 0.0);
        for (var r = 0u; r < dim; r = r + 1u) { coeffs[r * dim + col] = solved[r * dim + col] * inverse; }
      }
      if (index <= analysisMax) {
        let qFrame = u32(params.framesOffset) + index * matrixSize;
        for (var row = 0u; row < dim; row = row + 1u) {
          for (var col = 0u; col < dim; col = col + 1u) {
            var value = 0.0;
            for (var inner = 0u; inner < dim; inner = inner + 1u) {
              value = value + data[qFrame + row * dim + inner] * coeffs[inner * dim + col];
            }
            vectors[row * dim + col] = value;
          }
        }
        for (var col = 0u; col < dim; col = col + 1u) {
          var normSquared = 0.0;
          for (var row = 0u; row < dim; row = row + 1u) { normSquared = normSquared + vectors[row * dim + col] * vectors[row * dim + col]; }
          let inverse = select(0.0, inverseSqrt(normSquared), normSquared > 0.0);
          for (var row = 0u; row < dim; row = row + 1u) { vectors[row * dim + col] = vectors[row * dim + col] * inverse; }
        }
        if (index == 0u) {
          for (var col = 0u; col < dim; col = col + 1u) {
            for (var row = 0u; row < dim; row = row + 1u) {
              data[u32(params.outputVectorsOffset) + col * dim + row] = vectors[row * dim + col];
            }
          }
        }
        var foundPair = false;
        var localMin = 1.57079632679;
        for (var expanding = 0u; expanding < dim; expanding = expanding + 1u) {
          if (exponents[expanding] <= zeroTolerance) { continue; }
          for (var contracting = 0u; contracting < dim; contracting = contracting + 1u) {
            if (exponents[contracting] >= -zeroTolerance) { continue; }
            var dot = 0.0;
            for (var row = 0u; row < dim; row = row + 1u) {
              dot = dot + vectors[row * dim + expanding] * vectors[row * dim + contracting];
            }
            localMin = min(localMin, acos(clamp(abs(dot), 0.0, 1.0)));
            foundPair = true;
          }
        }
        if (foundPair) {
          angleSum = angleSum + localMin;
          angleMin = min(angleMin, localMin);
          angleCount = angleCount + 1.0;
        }
      }
      backwards = backwards - 1i;
    }

    var cauchyGreen: array<f32, 256>;
    for (var row = 0u; row < dim; row = row + 1u) {
      for (var col = 0u; col < dim; col = col + 1u) {
        var value = 0.0;
        for (var inner = 0u; inner < dim; inner = inner + 1u) { value = value + stm[inner * dim + row] * stm[inner * dim + col]; }
        cauchyGreen[row * dim + col] = value;
      }
    }
    var power: array<f32, 16>;
    var nextPower: array<f32, 16>;
    for (var i = 0u; i < dim; i = i + 1u) { power[i] = 1.0 / sqrt(f32(dim)); }
    for (var iteration = 0u; iteration < 24u; iteration = iteration + 1u) {
      var normSquared = 0.0;
      for (var row = 0u; row < dim; row = row + 1u) {
        var value = 0.0;
        for (var col = 0u; col < dim; col = col + 1u) { value = value + cauchyGreen[row * dim + col] * power[col]; }
        nextPower[row] = value;
        normSquared = normSquared + value * value;
      }
      let inverse = select(0.0, inverseSqrt(normSquared), normSquared > 0.0);
      for (var i = 0u; i < dim; i = i + 1u) { power[i] = nextPower[i] * inverse; }
    }
    var eigenvalue = 0.0;
    for (var row = 0u; row < dim; row = row + 1u) {
      var value = 0.0;
      for (var col = 0u; col < dim; col = col + 1u) { value = value + cauchyGreen[row * dim + col] * power[col]; }
      eigenvalue = eigenvalue + power[row] * value;
    }

    data[0] = 1.0;
    data[1] = f32(dim);
    data[2] = 0.5 * log(max(eigenvalue, 1e-20)) / totalTime;
    data[3] = select(-1.0, angleSum / angleCount, angleCount > 0.0);
    data[4] = select(-1.0, angleMin, angleCount > 0.0);
    data[5] = angleCount;
    data[6] = totalTime;
    data[7] = f32(window);
  }
}
`;
