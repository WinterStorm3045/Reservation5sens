(() => {
  const viewport = document.querySelector('meta[name="viewport"]');
  const screenWidth = window.screen.width;

  if (
    viewport &&
    screenWidth > 0 &&
    screenWidth <= 700 &&
    window.innerWidth > screenWidth * 1.5
  ) {
    viewport.setAttribute("content", `width=${screenWidth}, initial-scale=1`);
  }
})();
