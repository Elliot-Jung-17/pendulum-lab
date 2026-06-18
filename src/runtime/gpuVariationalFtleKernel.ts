export const WGSL_VARIATIONAL_FTLE_FIELD_KERNEL = /* wgsl */ `
struct Params {
  m1: f32, m2: f32, l1: f32, l2: f32,
  g: f32, damping: f32, dt: f32, steps: f32,
  n: f32, lo: f32, hi: f32, totalTime: f32,
  pad0: f32, pad1: f32, pad2: f32, pad3: f32,
};

@group(0) @binding(0) var<storage, read_write> data: array<f32>;
@group(0) @binding(1) var<uniform> params: Params;

fn rhs4(x: array<f32, 4>) -> array<f32, 4> {
  var out: array<f32, 4>;
  let t1 = x[0];
  let t2 = x[1];
  let w1 = x[2];
  let w2 = x[3];
  let delta = t1 - t2;
  let sinD = sin(delta);
  let cosD = cos(delta);
  let m11 = (params.m1 + params.m2) * params.l1 * params.l1;
  let m22 = params.m2 * params.l2 * params.l2;
  let b = params.m2 * params.l1 * params.l2;
  let m12 = b * cosD;
  let det = m11 * m22 - m12 * m12;
  out[0] = w1;
  out[1] = w2;
  if (abs(det) < 1e-7) {
    out[2] = 0.0;
    out[3] = 0.0;
    return out;
  }
  let f1 = -b * sinD * w2 * w2 - (params.m1 + params.m2) * params.g * params.l1 * sin(t1) - params.damping * w1;
  let f2 = b * sinD * w1 * w1 - params.m2 * params.g * params.l2 * sin(t2) - params.damping * w2;
  out[2] = (m22 * f1 - m12 * f2) / det;
  out[3] = (-m12 * f1 + m11 * f2) / det;
  return out;
}

fn jac4(x: array<f32, 4>) -> array<f32, 16> {
  var jac: array<f32, 16>;
  let t1 = x[0];
  let t2 = x[1];
  let w1 = x[2];
  let w2 = x[3];
  let delta = t1 - t2;
  let sinD = sin(delta);
  let cosD = cos(delta);
  let m11 = (params.m1 + params.m2) * params.l1 * params.l1;
  let m22 = params.m2 * params.l2 * params.l2;
  let b = params.m2 * params.l1 * params.l2;
  let m12 = b * cosD;
  let det = m11 * m22 - m12 * m12;
  jac[0] = 0.0; jac[1] = 0.0; jac[2] = 1.0; jac[3] = 0.0;
  jac[4] = 0.0; jac[5] = 0.0; jac[6] = 0.0; jac[7] = 1.0;
  if (abs(det) < 1e-7) {
    for (var i = 8u; i < 16u; i = i + 1u) {
      jac[i] = 0.0;
    }
    return jac;
  }
  let f1 = -b * sinD * w2 * w2 - (params.m1 + params.m2) * params.g * params.l1 * sin(t1) - params.damping * w1;
  let f2 = b * sinD * w1 * w1 - params.m2 * params.g * params.l2 * sin(t2) - params.damping * w2;
  let n2 = m22 * f1 - m12 * f2;
  let n3 = -m12 * f1 + m11 * f2;
  let det2 = det * det;
  let dm12 = array<f32, 4>(-b * sinD, b * sinD, 0.0, 0.0);
  let ddet = array<f32, 4>(-2.0 * m12 * dm12[0], -2.0 * m12 * dm12[1], 0.0, 0.0);
  let df1 = array<f32, 4>(
    -b * cosD * w2 * w2 - (params.m1 + params.m2) * params.g * params.l1 * cos(t1),
    b * cosD * w2 * w2,
    -params.damping,
    -2.0 * b * sinD * w2
  );
  let df2 = array<f32, 4>(
    b * cosD * w1 * w1,
    -b * cosD * w1 * w1 - params.m2 * params.g * params.l2 * cos(t2),
    2.0 * b * sinD * w1,
    -params.damping
  );
  for (var j = 0u; j < 4u; j = j + 1u) {
    let dn2 = m22 * df1[j] - (dm12[j] * f2 + m12 * df2[j]);
    let dn3 = -(dm12[j] * f1 + m12 * df1[j]) + m11 * df2[j];
    jac[8u + j] = (dn2 * det - n2 * ddet[j]) / det2;
    jac[12u + j] = (dn3 * det - n3 * ddet[j]) / det2;
  }
  return jac;
}

fn add20(a: array<f32, 20>, b: array<f32, 20>, scale: f32) -> array<f32, 20> {
  var out: array<f32, 20>;
  for (var i = 0u; i < 20u; i = i + 1u) {
    out[i] = a[i] + scale * b[i];
  }
  return out;
}

fn rhs_aug(s: array<f32, 20>) -> array<f32, 20> {
  var x = array<f32, 4>(s[0], s[1], s[2], s[3]);
  let fx = rhs4(x);
  let jac = jac4(x);
  var out: array<f32, 20>;
  for (var i = 0u; i < 4u; i = i + 1u) {
    out[i] = fx[i];
  }
  for (var j = 0u; j < 4u; j = j + 1u) {
    let base = 4u + j * 4u;
    for (var r = 0u; r < 4u; r = r + 1u) {
      var acc = 0.0;
      for (var c = 0u; c < 4u; c = c + 1u) {
        acc = acc + jac[r * 4u + c] * s[base + c];
      }
      out[base + r] = acc;
    }
  }
  return out;
}

fn rk4_aug(s: array<f32, 20>, h: f32) -> array<f32, 20> {
  let k1 = rhs_aug(s);
  let k2 = rhs_aug(add20(s, k1, 0.5 * h));
  let k3 = rhs_aug(add20(s, k2, 0.5 * h));
  let k4 = rhs_aug(add20(s, k3, h));
  var out: array<f32, 20>;
  for (var i = 0u; i < 20u; i = i + 1u) {
    out[i] = s[i] + (h / 6.0) * (k1[i] + 2.0 * k2[i] + 2.0 * k3[i] + k4[i]);
  }
  return out;
}

fn ftle_from_stm(aug: array<f32, 20>) -> f32 {
  var c: array<f32, 16>;
  for (var row = 0u; row < 4u; row = row + 1u) {
    for (var col = 0u; col < 4u; col = col + 1u) {
      var acc = 0.0;
      for (var k = 0u; k < 4u; k = k + 1u) {
        let mik = aug[4u + col * 4u + k];
        let mir = aug[4u + row * 4u + k];
        acc = acc + mir * mik;
      }
      c[row * 4u + col] = acc;
    }
  }
  var v = array<f32, 4>(0.5, 0.5, 0.5, 0.5);
  var lambda = 0.0;
  for (var it = 0u; it < 48u; it = it + 1u) {
    var u: array<f32, 4>;
    for (var row = 0u; row < 4u; row = row + 1u) {
      var acc = 0.0;
      for (var col = 0u; col < 4u; col = col + 1u) {
        acc = acc + c[row * 4u + col] * v[col];
      }
      u[row] = acc;
    }
    var normSq = 0.0;
    for (var row = 0u; row < 4u; row = row + 1u) {
      normSq = normSq + u[row] * u[row];
    }
    let norm = sqrt(max(normSq, 0.0));
    if (norm == 0.0) {
      return 0.0;
    }
    for (var row = 0u; row < 4u; row = row + 1u) {
      v[row] = u[row] / norm;
    }
    lambda = norm;
  }
  let sigma = sqrt(max(lambda, 0.0));
  return select(0.0, log(sigma) / params.totalTime, params.totalTime > 0.0 && sigma > 0.0);
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let n = u32(params.n);
  let idx = gid.x;
  if (idx >= n * n) {
    return;
  }
  let ix = idx % n;
  let iy = idx / n;
  let denom = max(1.0, f32(n - 1u));
  let theta1 = params.lo + ((params.hi - params.lo) * f32(ix)) / denom;
  let theta2 = params.lo + ((params.hi - params.lo) * f32(iy)) / denom;
  var aug: array<f32, 20>;
  aug[0] = theta1;
  aug[1] = theta2;
  aug[2] = 0.0;
  aug[3] = 0.0;
  for (var j = 0u; j < 4u; j = j + 1u) {
    aug[4u + j * 4u + j] = 1.0;
  }
  for (var step = 0u; step < u32(params.steps); step = step + 1u) {
    aug = rk4_aug(aug, params.dt);
  }
  data[idx] = ftle_from_stm(aug);
}
`;
