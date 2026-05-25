import React, { useRef, useEffect } from 'react';
import './BorderGlow.css';

interface HSLColor {
  h: number;
  s: number;
  l: number;
}

function parseHSL(hslStr: string): HSLColor {
  const match = hslStr.match(/([\d.]+)\s*([\d.]+)%?\s*([\d.]+)%?/);
  if (!match) return { h: 40, s: 80, l: 80 };
  return { h: parseFloat(match[1]), s: parseFloat(match[2]), l: parseFloat(match[3]) };
}

function buildGlowVars(glowColor: string, intensity: number): Record<string, string> {
  const { h, s, l } = parseHSL(glowColor);
  const base = `${h}deg ${s}% ${l}%`;
  const opacities = [100, 60, 50, 40, 30, 20, 10];
  const keys = ['', '-60', '-50', '-40', '-30', '-20', '-10'];
  const vars: Record<string, string> = {};
  for (let i = 0; i < opacities.length; i++) {
    vars[`--glow-color${keys[i]}`] = `hsl(${base} / ${Math.min(opacities[i] * intensity, 100)}%)`;
  }
  return vars;
}

const GRADIENT_POSITIONS = ['80% 55%', '69% 34%', '8% 6%', '41% 38%', '86% 85%', '82% 18%', '51% 4%'];
const GRADIENT_KEYS = ['--gradient-one', '--gradient-two', '--gradient-three', '--gradient-four', '--gradient-five', '--gradient-six', '--gradient-seven'];
const COLOR_MAP = [0, 1, 2, 0, 1, 2, 1];

function buildGradientVars(colors: string[]): Record<string, string> {
  const vars: Record<string, string> = {};
  for (let i = 0; i < 7; i++) {
    const c = colors[Math.min(COLOR_MAP[i], colors.length - 1)];
    vars[GRADIENT_KEYS[i]] = `radial-gradient(at ${GRADIENT_POSITIONS[i]}, ${c} 0px, transparent 50%)`;
  }
  vars['--gradient-base'] = `linear-gradient(${colors[0]} 0 100%)`;
  return vars;
}

function easeOutCubic(x: number): number { return 1 - Math.pow(1 - x, 3); }

interface AnimateValueProps {
  start?: number;
  end?: number;
  duration?: number;
  delay?: number;
  ease?: (x: number) => number;
  onUpdate: (v: number) => void;
  onEnd?: () => void;
}

function animateValue({ start = 0, end = 100, duration = 1000, delay = 0, ease = easeOutCubic, onUpdate, onEnd }: AnimateValueProps) {
  const t0 = performance.now() + delay;
  function tick() {
    const elapsed = performance.now() - t0;
    const t = Math.min(elapsed / duration, 1);
    onUpdate(start + (end - start) * ease(t));
    if (t < 1) requestAnimationFrame(tick);
    else if (onEnd) onEnd();
  }
  setTimeout(() => requestAnimationFrame(tick), delay);
}

export interface BorderGlowProps {
  children: React.ReactNode;
  className?: string;
  edgeSensitivity?: number;
  glowColor?: string;
  backgroundColor?: string;
  borderRadius?: number;
  glowRadius?: number;
  glowIntensity?: number;
  coneSpread?: number;
  colors?: string[];
  fillOpacity?: number;
}

const BorderGlow: React.FC<BorderGlowProps> = ({
  children,
  className = '',
  edgeSensitivity = 30,
  glowColor = '40 80 80',
  backgroundColor = '#120F17',
  borderRadius = 28,
  glowRadius = 40,
  glowIntensity = 1.0,
  coneSpread = 25,
  colors = ['#c084fc', '#f472b6', '#38bdf8'],
  fillOpacity = 0.5,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);

  // Auto sweep exactly 1 loop on mount to draw attention, then stop completely
  useEffect(() => {
    if (!cardRef.current) return;
    const card = cardRef.current;
    const angleStart = 110;
    const angleEnd = 465;

    // Set initial active state and angle
    card.classList.add('sweep-active');
    card.style.setProperty('--cursor-angle', `${angleStart}deg`);

    // 1. Fade in edge proximity (0 -> 100) over 400ms
    animateValue({
      start: 0,
      end: 100,
      duration: 400,
      onUpdate: (v) => card.style.setProperty('--edge-proximity', String(v))
    });

    // 2. Sweeping rotation (110deg -> 465deg) over 1500ms (1 full loop!)
    animateValue({
      ease: easeOutCubic,
      start: 0,
      end: 100,
      duration: 1500,
      onUpdate: (v) => {
        const currentAngle = (angleEnd - angleStart) * (v / 100) + angleStart;
        card.style.setProperty('--cursor-angle', `${currentAngle.toFixed(3)}deg`);
      }
    });

    // 3. Fade out edge proximity (100 -> 0) starting at 1200ms over 400ms
    animateValue({
      ease: easeOutCubic,
      delay: 1200,
      duration: 400,
      start: 100,
      end: 0,
      onUpdate: (v) => card.style.setProperty('--edge-proximity', String(v)),
      onEnd: () => {
        card.classList.remove('sweep-active');
        card.style.removeProperty('--edge-proximity');
        card.style.removeProperty('--cursor-angle');
      }
    });
  }, []);

  const glowVars = buildGlowVars(glowColor, glowIntensity);

  return (
    <div
      ref={cardRef}
      className={`border-glow-card ${className}`}
      style={{
        '--card-bg': backgroundColor,
        '--edge-sensitivity': String(edgeSensitivity),
        '--border-radius': `${borderRadius}px`,
        '--glow-padding': `${glowRadius}px`,
        '--cone-spread': String(coneSpread),
        '--fill-opacity': String(fillOpacity),
        ...glowVars,
        ...buildGradientVars(colors),
      } as React.CSSProperties}
    >
      <span className="edge-light" />
      <div className="border-glow-inner">
        {children}
      </div>
    </div>
  );
};

export default BorderGlow;
