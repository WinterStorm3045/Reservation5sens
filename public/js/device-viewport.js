(() => {
  const viewport = document.querySelector('meta[name="viewport"]');
  if (!viewport) return;

  const fontScale = 3;
  const originalFontStyles = new Map();
  let fontObserver;

  function getElements(root) {
    return [root, ...root.querySelectorAll("*")];
  }

  function scaleFonts() {
    const elements = getElements(document.body);
    const fontSizes = elements.map((element) => ({
      element,
      size: Number.parseFloat(window.getComputedStyle(element).fontSize),
    }));

    fontSizes.forEach(({ element, size }) => {
      if (!Number.isFinite(size) || originalFontStyles.has(element)) return;
      originalFontStyles.set(element, {
        value: element.style.getPropertyValue("font-size"),
        priority: element.style.getPropertyPriority("font-size"),
      });
      element.style.setProperty("font-size", `${size * fontScale}px`, "important");
    });
  }

  function restoreFonts() {
    originalFontStyles.forEach(({ value, priority }, element) => {
      if (value) {
        element.style.setProperty("font-size", value, priority);
      } else {
        element.style.removeProperty("font-size");
      }
    });
    originalFontStyles.clear();
  }

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

    if (isNarrowPortraitRatio) {
      scaleFonts();
      if (!fontObserver) {
        fontObserver = new MutationObserver((mutations) => {
          mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
              if (node instanceof HTMLElement) scaleFontsForNode(node);
            });
          });
        });
        fontObserver.observe(document.body, { childList: true, subtree: true });
      }
    } else {
      restoreFonts();
    }
  }

  function scaleFontsForNode(root) {
    getElements(root).forEach((element) => {
      if (originalFontStyles.has(element)) return;
      const size = Number.parseFloat(window.getComputedStyle(element).fontSize);
      if (!Number.isFinite(size)) return;
      originalFontStyles.set(element, {
        value: element.style.getPropertyValue("font-size"),
        priority: element.style.getPropertyPriority("font-size"),
      });
      element.style.setProperty("font-size", `${size * fontScale}px`, "important");
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", updateViewport, { once: true });
  } else {
    updateViewport();
  }
  window.addEventListener("orientationchange", updateViewport);
})();
