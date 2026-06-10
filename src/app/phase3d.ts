/**
 * Pure 3D→2D projection for the phase-space tab: rotate a point by the camera
 * yaw (about the vertical axis) then pitch (about the horizontal axis) and
 * orthographically project. Returns screen offsets plus a depth for fading.
 * Pure and unit-tested.
 */

export interface Projected {
  x: number;
  y: number;
  depth: number;
}

export function rotateProject(p: { x: number; y: number; z: number }, yaw: number, pitch: number): Projected {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  // Yaw about the y-axis.
  const x1 = p.x * cy + p.z * sy;
  const z1 = -p.x * sy + p.z * cy;
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  // Pitch about the x-axis.
  const y2 = p.y * cp - z1 * sp;
  const z2 = p.y * sp + z1 * cp;
  return { x: x1, y: y2, depth: z2 };
}
