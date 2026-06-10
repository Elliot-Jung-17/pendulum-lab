if (location.protocol !== 'file:') {
  import('/src/main.ts').catch((error) => {
    console.error('[PendulumLab index bootstrap]', error);
  });
}
