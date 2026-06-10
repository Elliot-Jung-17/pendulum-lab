const canvasDescriptions: Record<string, string> = {
  main: 'Primary pendulum simulation canvas. It shows rod and bob positions over time.',
  energy: 'Energy history chart for kinetic, potential, and total energy.',
  phase: 'Phase portrait canvas for angular state trajectories.',
  poincare: 'Poincare section plot canvas.',
  lyap: 'Lyapunov estimate chart canvas.'
};

export function installAccessibilityEnhancements(): void {
  for (const canvas of document.querySelectorAll<HTMLCanvasElement>('canvas')) {
    const id = canvas.id || 'simulation-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('tabindex', '0');
    canvas.setAttribute('aria-label', canvasDescriptions[id] ?? 'Pendulum Lab scientific visualization canvas.');
    if (!canvas.textContent?.trim()) {
      canvas.textContent = canvasDescriptions[id] ?? 'Scientific visualization. Use export controls for data tables and reports.';
    }
  }

  for (const button of document.querySelectorAll<HTMLButtonElement>('button')) {
    if (!button.getAttribute('aria-label') && !button.textContent?.trim()) {
      button.setAttribute('aria-label', button.title || button.dataset.tip || 'Pendulum Lab command');
    }
  }

  document.documentElement.classList.add('focus-visible-ready');
}
