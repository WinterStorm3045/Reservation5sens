(() => {
  const viewport = document.querySelector('meta[name="viewport"]');
  const screenWidth = window.screen.width;
  const isMobileBrowser =
    navigator.userAgentData?.mobile ||
    /Android.*Mobile|iPhone|iPod|IEMobile|Windows Phone|Mobile/i.test(navigator.userAgent);
  const hasDesktopSizedViewport = window.innerWidth > screenWidth * 1.5;
  const viewportWidth = screenWidth <= 700 ? screenWidth : 390;

  if (
    viewport &&
    screenWidth > 0 &&
    (isMobileBrowser || (screenWidth <= 700 && hasDesktopSizedViewport))
  ) {
    viewport.setAttribute("content", `width=${viewportWidth}, initial-scale=1`);
  }
})();
