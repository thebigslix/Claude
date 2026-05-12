const CDN = 'https://unpkg.com/maplibre-gl@5/dist/maplibre-gl';

export async function loadMapLibre(): Promise<any> {
  if ((window as any).maplibregl) return (window as any).maplibregl;

  if (!document.getElementById('ml-css')) {
    const link = document.createElement('link');
    link.id = 'ml-css';
    link.rel = 'stylesheet';
    link.href = `${CDN}.css`;
    document.head.appendChild(link);
  }

  return new Promise<any>((resolve, reject) => {
    if (document.getElementById('ml-js')) {
      const wait = setInterval(() => {
        if ((window as any).maplibregl) { clearInterval(wait); resolve((window as any).maplibregl); }
      }, 50);
      return;
    }
    const s = document.createElement('script');
    s.id = 'ml-js';
    s.src = `${CDN}.js`;
    s.onload = () => resolve((window as any).maplibregl);
    s.onerror = reject;
    document.head.appendChild(s);
  });
}
