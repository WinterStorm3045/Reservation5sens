(() => {
  const viewport = document.querySelector('meta[name="viewport"]');
  if (!viewport) return;

  function updateViewport() {
    const screenWidth = window.screen.width;
    const screenHeight = window.screen.height;
    const aspectRatio = screenWidth / screenHeight;
    const isNarrowPortraitRatio = aspectRatio <= 1;

    document.documentElement.classList.toggle("ratio-mobile", isNarrowPortraitRatio);
    viewport.setAttribute(
      "content",
      isNarrowPortraitRatio
        ? `width=${screenWidth}, initial-scale=1`
        : "width=device-width, initial-scale=1",
    );

  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", updateViewport, { once: true });
  } else {
    updateViewport();
  }
  window.addEventListener("orientationchange", updateViewport);
})();
