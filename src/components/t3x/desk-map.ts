import "maplibre-gl/dist/maplibre-gl.css";

export const DESK_STYLE = "https://tiles.openfreemap.org/styles/bright";

export async function openDeskMap(
  container: HTMLElement,
  options: { center: [number, number]; zoom: number },
) {
  const ml = await import("maplibre-gl");
  const map = new ml.Map({
    container,
    style: DESK_STYLE,
    center: options.center,
    zoom: options.zoom,
    fadeDuration: 0,
    pitchWithRotate: false,
    dragRotate: false,
    attributionControl: { compact: true },
  });
  map.addControl(new ml.NavigationControl({ showCompass: false, visualizePitch: false }), "top-right");
  map.touchZoomRotate.disableRotation();

  const resize = () => map.resize();
  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", resize);
  const viewport = window.visualViewport;
  viewport?.addEventListener("resize", resize);
  const observer = new ResizeObserver(resize);
  observer.observe(container);

  return {
    ml,
    map,
    destroy() {
      window.removeEventListener("resize", resize);
      window.removeEventListener("orientationchange", resize);
      viewport?.removeEventListener("resize", resize);
      observer.disconnect();
      map.remove();
    },
  };
}
