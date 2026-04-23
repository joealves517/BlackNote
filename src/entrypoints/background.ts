export default defineBackground(() => {
  // Open side panel when extension icon is clicked
  browser.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error: Error) => console.error("Side panel setup error:", error));
});
