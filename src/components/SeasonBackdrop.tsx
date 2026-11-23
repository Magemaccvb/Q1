import { useEffect, useRef } from 'react';
import { SeasonId } from '../game/soundEffects';

export interface SeasonAdaptiveTheme {
  accentText: string;
  accentBg: string;
  accentGlow: string;
  boardTintTop: string;
  boardTintMid: string;
  boardTintBottom: string;
  ambientWash: string;
  buttonBg: string;
  buttonHover: string;
  buttonText: string;
}

export interface SeasonMeta {
  id: SeasonId;
  label: string;
  imageSrc: string;
  fallbackGradient: string;
  theme: SeasonAdaptiveTheme;
}

export const SEASONS: SeasonMeta[] = [
  {
    id: 'spring',
    label: '春櫻',
    imageSrc: '/src/assets/images/season_spring_sakura_1795404975637.jpg',
    fallbackGradient:
      'linear-gradient(135deg, #1b1730 0%, #2a1d36 50%, #111521 100%)',
    theme: {
      accentText: 'text-pink-200',
      accentBg: 'bg-pink-300',
      accentGlow: 'rgba(244, 114, 182, 0.22)',
      boardTintTop: 'rgba(32, 16, 34, 0.34)',
      boardTintMid: 'rgba(24, 13, 28, 0.44)',
      boardTintBottom: 'rgba(18, 10, 24, 0.52)',
      ambientWash:
        'radial-gradient(circle at 50% 45%, rgba(244, 114, 182, 0.14) 0%, rgba(24, 12, 28, 0.28) 55%, rgba(10, 8, 16, 0.58) 100%)',
      buttonBg: 'bg-pink-300 hover:bg-pink-200',
      buttonHover: 'hover:bg-pink-300/20',
      buttonText: 'text-slate-950',
    },
  },
  {
    id: 'summer',
    label: '夏夜',
    imageSrc: '/src/assets/images/season_summer_fireflies_1795404976154.jpg',
    fallbackGradient:
      'linear-gradient(135deg, #0b1c26 0%, #102b27 50%, #09111a 100%)',
    theme: {
      accentText: 'text-lime-200',
      accentBg: 'bg-amber-300',
      accentGlow: 'rgba(190, 242, 100, 0.2)',
      boardTintTop: 'rgba(9, 25, 24, 0.34)',
      boardTintMid: 'rgba(8, 20, 22, 0.44)',
      boardTintBottom: 'rgba(6, 14, 18, 0.54)',
      ambientWash:
        'radial-gradient(circle at 50% 45%, rgba(163, 230, 53, 0.12) 0%, rgba(8, 24, 22, 0.28) 55%, rgba(5, 11, 14, 0.58) 100%)',
      buttonBg: 'bg-amber-300 hover:bg-amber-200',
      buttonHover: 'hover:bg-lime-300/20',
      buttonText: 'text-slate-950',
    },
  },
  {
    id: 'autumn',
    label: '秋楓',
    imageSrc: '/src/assets/images/season_autumn_maple_1795404975710.jpg',
    fallbackGradient:
      'linear-gradient(135deg, #271516 0%, #341d15 50%, #131117 100%)',
    theme: {
      accentText: 'text-orange-200',
      accentBg: 'bg-orange-400',
      accentGlow: 'rgba(251, 146, 60, 0.22)',
      boardTintTop: 'rgba(34, 16, 12, 0.34)',
      boardTintMid: 'rgba(26, 13, 12, 0.44)',
      boardTintBottom: 'rgba(18, 9, 10, 0.54)',
      ambientWash:
        'radial-gradient(circle at 50% 45%, rgba(251, 146, 60, 0.14) 0%, rgba(28, 14, 10, 0.28) 55%, rgba(12, 8, 8, 0.58) 100%)',
      buttonBg: 'bg-amber-400 hover:bg-amber-300',
      buttonHover: 'hover:bg-orange-400/20',
      buttonText: 'text-slate-950',
    },
  },
  {
    id: 'winter',
    label: '冬雪',
    imageSrc: '/src/assets/images/season_winter_snow_1795404975217.jpg',
    fallbackGradient:
      'linear-gradient(135deg, #0f1b2d 0%, #1a2a40 50%, #0c121d 100%)',
    theme: {
      accentText: 'text-sky-200',
      accentBg: 'bg-sky-300',
      accentGlow: 'rgba(125, 211, 252, 0.22)',
      boardTintTop: 'rgba(11, 22, 38, 0.34)',
      boardTintMid: 'rgba(9, 18, 32, 0.44)',
      boardTintBottom: 'rgba(7, 13, 24, 0.54)',
      ambientWash:
        'radial-gradient(circle at 50% 45%, rgba(125, 211, 252, 0.14) 0%, rgba(10, 20, 36, 0.28) 55%, rgba(6, 10, 18, 0.58) 100%)',
      buttonBg: 'bg-sky-300 hover:bg-sky-200',
      buttonHover: 'hover:bg-sky-300/20',
      buttonText: 'text-slate-950',
    },
  },
];

export const SEASON_THEMES: Record<SeasonId, SeasonAdaptiveTheme> = {
  spring: SEASONS[0].theme,
  summer: SEASONS[1].theme,
  autumn: SEASONS[2].theme,
  winter: SEASONS[3].theme,
};

interface AmbientParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rot: number;
  vRot: number;
  phase: number;
  alpha: number;
  color: string;
}

function createParticleForSeason(
  season: SeasonId,
  width: number,
  height: number,
  randomY = false
): AmbientParticle {
  const x = Math.random() * width;
  const y = randomY ? Math.random() * height : -16;

  if (season === 'spring') {
    const colors = ['#FBCFE8', '#F9A8D4', '#F472B6', '#FCE7F3'];
    return {
      x,
      y,
      vx: 14 + Math.random() * 24,
      vy: 26 + Math.random() * 28,
      size: 4 + Math.random() * 4.5,
      rot: Math.random() * Math.PI * 2,
      vRot: (Math.random() - 0.5) * 2.2,
      phase: Math.random() * Math.PI * 2,
      alpha: 0.45 + Math.random() * 0.35,
      color: colors[Math.floor(Math.random() * colors.length)],
    };
  }

  if (season === 'summer') {
    const colors = ['#FDE047', '#FACC15', '#FEF08A', '#BEF264'];
    return {
      x,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 22,
      vy: -8 - Math.random() * 14,
      size: 2 + Math.random() * 2.6,
      rot: 0,
      vRot: 0,
      phase: Math.random() * Math.PI * 2,
      alpha: 0.35 + Math.random() * 0.5,
      color: colors[Math.floor(Math.random() * colors.length)],
    };
  }

  if (season === 'autumn') {
    const colors = ['#F97316', '#EA580C', '#EF4444', '#F59E0B'];
    return {
      x,
      y,
      vx: -18 - Math.random() * 22,
      vy: 30 + Math.random() * 34,
      size: 5 + Math.random() * 5,
      rot: Math.random() * Math.PI * 2,
      vRot: (Math.random() - 0.5) * 2.6,
      phase: Math.random() * Math.PI * 2,
      alpha: 0.5 + Math.random() * 0.35,
      color: colors[Math.floor(Math.random() * colors.length)],
    };
  }

  // winter
  return {
    x,
    y,
    vx: (Math.random() - 0.5) * 18,
    vy: 22 + Math.random() * 32,
    size: 1.8 + Math.random() * 3,
    rot: 0,
    vRot: 0,
    phase: Math.random() * Math.PI * 2,
    alpha: 0.4 + Math.random() * 0.45,
    color: '#E2E8F0',
  };
}

interface SeasonBackdropProps {
  season: SeasonId;
}

export function SeasonBackdrop({ season }: SeasonBackdropProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const seasonRef = useRef<SeasonId>(season);
  seasonRef.current = season;

  useEffect(() => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = window.innerWidth;
    let height = window.innerHeight;

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const PARTICLE_COUNT = 38;
    let currentParticlesSeason = seasonRef.current;
    let particles: AmbientParticle[] = Array.from({ length: PARTICLE_COUNT }, () =>
      createParticleForSeason(currentParticlesSeason, width, height, true)
    );

    let rafId = 0;
    let lastTime = performance.now();

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      if (currentParticlesSeason !== seasonRef.current) {
        currentParticlesSeason = seasonRef.current;
        particles = Array.from({ length: PARTICLE_COUNT }, () =>
          createParticleForSeason(currentParticlesSeason, width, height, true)
        );
      }

      ctx.clearRect(0, 0, width, height);

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.phase += dt * 1.8;
        p.rot += p.vRot * dt;

        if (currentParticlesSeason === 'summer') {
          p.x += (p.vx + Math.sin(p.phase) * 14) * dt;
          p.y += (p.vy + Math.cos(p.phase * 0.8) * 10) * dt;
          if (p.y < -12 || p.x < -12 || p.x > width + 12) {
            particles[i] = createParticleForSeason('summer', width, height, true);
          }

          const pulse = 0.35 + 0.65 * Math.abs(Math.sin(p.phase * 0.9));
          ctx.save();
          ctx.globalAlpha = p.alpha * pulse;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        } else if (currentParticlesSeason === 'winter') {
          p.x += (p.vx + Math.sin(p.phase) * 14) * dt;
          p.y += p.vy * dt;
          if (p.y > height + 12) {
            particles[i] = createParticleForSeason('winter', width, height, false);
          }

          ctx.save();
          ctx.globalAlpha = p.alpha;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        } else {
          // Spring sakura petals & Autumn maple leaves
          p.x += (p.vx + Math.sin(p.phase) * 16) * dt;
          p.y += p.vy * dt;
          if (p.y > height + 16 || p.x < -20 || p.x > width + 20) {
            particles[i] = createParticleForSeason(currentParticlesSeason, width, height, false);
          }

          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.globalAlpha = p.alpha;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          if (currentParticlesSeason === 'spring') {
            ctx.ellipse(0, 0, p.size * 0.72, p.size * 0.42, 0, 0, Math.PI * 2);
          } else {
            // Stylized maple leaf diamond
            ctx.moveTo(0, -p.size * 0.7);
            ctx.lineTo(p.size * 0.65, 0);
            ctx.lineTo(0, p.size * 0.7);
            ctx.lineTo(-p.size * 0.65, 0);
            ctx.closePath();
          }
          ctx.fill();
          ctx.restore();
        }
      }

      rafId = requestAnimationFrame(frame);
    };

    rafId = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
      {SEASONS.map((item) => {
        const active = item.id === season;
        return (
          <div
            key={item.id}
            className={`absolute inset-0 transition-opacity duration-[2200ms] ease-in-out ${
              active ? 'opacity-100' : 'opacity-0'
            }`}
            style={{ background: item.fallbackGradient }}
          >
            <img
              src={item.imageSrc}
              alt=""
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover scale-[1.02]"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          </div>
        );
      })}

      {/* Ambient seasonal particle overlay */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {/* Adaptive seasonal atmospheric wash so every edge blends organically */}
      {SEASONS.map((item) => (
        <div
          key={`wash-${item.id}`}
          className={`absolute inset-0 transition-opacity duration-[2200ms] ease-in-out ${
            item.id === season ? 'opacity-100' : 'opacity-0'
          }`}
          style={{ background: item.theme.ambientWash }}
        />
      ))}
    </div>
  );
}
