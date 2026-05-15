const fs = require('fs');
const path = require('path');

// --- 1. Update Tooltip.tsx ---
const tooltipPath = path.join(__dirname, '../src/components/Tooltip.tsx');
let tooltipContent = fs.readFileSync(tooltipPath, 'utf8');

tooltipContent = tooltipContent.replace(
  'type Placement = "top" | "bottom";',
  'type Placement = "top" | "bottom" | "left";'
);

// Update `show` logic
const showStart = tooltipContent.indexOf('const show = useCallback((el: HTMLElement, title: string) => {');
const showEnd = tooltipContent.indexOf('setState({ x, y, placement });', showStart) + 'setState({ x, y, placement });'.length;
const oldShowBlock = tooltipContent.substring(showStart, showEnd);

const newShowBlock = `const show = useCallback((el: HTMLElement, title: string) => {
    const rect = el.getBoundingClientRect();
    const viewportW = window.innerWidth;
    const requestedPlacement = el.getAttribute("data-placement") as Placement | null;

    let placement: Placement = "top";
    let x = 0;
    let y = 0;

    if (requestedPlacement === "left") {
      placement = "left";
      x = rect.left;
      y = rect.top + rect.height / 2;
    } else {
      const spaceAbove = rect.top;
      placement = spaceAbove < TOOLTIP_HEIGHT_ESTIMATE + TOOLTIP_GAP ? "bottom" : "top";
      y = placement === "top" ? rect.top : rect.bottom;
      x = Math.max(40, Math.min(rect.left + rect.width / 2, viewportW - 40));
    }

    setState({ x, y, placement });`;

tooltipContent = tooltipContent.replace(oldShowBlock, newShowBlock);

// Update render logic
tooltipContent = tooltipContent.replace(
  'className={`custom-tooltip ${isTop ? "custom-tooltip-top" : "custom-tooltip-bottom"}`}',
  'className={`custom-tooltip ${state.placement === "left" ? "custom-tooltip-left" : isTop ? "custom-tooltip-top" : "custom-tooltip-bottom"}`}'
);

fs.writeFileSync(tooltipPath, tooltipContent);

// --- 2. Update index.css for tooltip left ---
const cssPath = path.join(__dirname, '../src/index.css');
let cssContent = fs.readFileSync(cssPath, 'utf8');

if (!cssContent.includes('.custom-tooltip-left')) {
  cssContent = cssContent.replace(
    '.custom-tooltip-bottom {',
    `.custom-tooltip-left {
  transform: translate(calc(-100% - 6px), -50%);
  animation: tooltip-in-left 0.15s ease-out;
}

.custom-tooltip-bottom {`
  );

  cssContent = cssContent.replace(
    '@keyframes tooltip-in-top {',
    `@keyframes tooltip-in-left {
  from {
    opacity: 0;
    transform: translate(calc(-100% - 2px), -50%);
  }
  to {
    opacity: 1;
    transform: translate(calc(-100% - 6px), -50%);
  }
}

@keyframes tooltip-in-top {`
  );
  fs.writeFileSync(cssPath, cssContent);
}

// --- 3. Update App.tsx ---
const appPath = path.join(__dirname, '../src/components/App.tsx');
let appContent = fs.readFileSync(appPath, 'utf8');

// Replace standard <Sparkles ... /> with custom SVG
appContent = appContent.replace(
  '<Sparkles size={20} strokeWidth={1.25} />',
  '<SparklesIcon className="w-5 h-5 transition-transform duration-700 group-hover:rotate-[360deg]" />'
);

// Replace button classes in Right Toolbar
// Use a regex to match rounded-md or rounded-full and replace with rounded-[10px] inside the right toolbar.
// Right toolbar starts at `{/* ─── Vertical Right Toolbar ─── */}`
const rtStart = appContent.indexOf('{/* ─── Vertical Right Toolbar ─── */}');
const rtEnd = appContent.indexOf('</AnimatePresence>', rtStart);
let rtBlock = appContent.substring(rtStart, rtEnd);

// Replace all button rounded classes to `rounded-[10px]`
rtBlock = rtBlock.replace(/rounded-md/g, 'rounded-[10px]');
rtBlock = rtBlock.replace(/rounded-full/g, 'rounded-[10px]');

// Except we want the avatar wrapper to stay round if it has rounded-[10px], wait, avatar is just an img inside it.
// The button for Account is:
// <button className="flex items-center justify-center w-9 h-9 rounded-[10px] hover:bg-black/5 dark:hover:bg-white/10 transition-all" ... >
// We'll leave it as `rounded-[10px]` to match Sider.

// Add group class to buttons so `group-hover` works
rtBlock = rtBlock.replace(/transition-colors/g, 'transition-all group');

// Ensure Ask AI button has opacity-40 hover:opacity-100 group
if (rtBlock.includes('onClick={() => window.dispatchEvent(new CustomEvent("open-note-chat"))}')) {
  // Find Ask AI button declaration
  const askAiBtnClass = 'className="flex items-center justify-center w-9 h-9 rounded-[10px] hover:bg-black/5 dark:hover:bg-white/10 transition-all group"';
  rtBlock = rtBlock.replace(askAiBtnClass, 'className="flex items-center justify-center w-9 h-9 rounded-[10px] hover:bg-black/5 dark:hover:bg-white/10 transition-all group text-muted-foreground opacity-40 hover:opacity-100"');
}

appContent = appContent.substring(0, rtStart) + rtBlock + appContent.substring(rtEnd);
fs.writeFileSync(appPath, appContent);

console.log('UI Tweaks completed.');
