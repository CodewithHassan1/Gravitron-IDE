'use client';

import React, { useEffect, useRef } from 'react';
import { ShieldCheck, Cpu, Sparkles } from 'lucide-react';

interface GravitronAuthVisualProps {
  mode: 'signin' | 'signup';
  align?: 'upper-left' | 'lower-right';
}

/**
 * Persistent animated grain-gradient visual panel tailored to Gravitron IDE's
 * obsidian (#05050a), electric blue (#0055ff), and cyan (#00f0ff) palette.
 * Respects prefers-reduced-motion and falls back cleanly on software renderers.
 */
export function GravitronAuthVisual({ mode, align = 'lower-right' }: GravitronAuthVisualProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    let animId = 0;
    let startTime = performance.now();

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.max(320, Math.floor(rect.width * dpr));
      canvas.height = Math.max(240, Math.floor(rect.height * dpr));
    };

    resize();
    window.addEventListener('resize', resize);

    const renderFrame = (now: number) => {
      const t = reducedMotion ? 0 : (now - startTime) * 0.00045;
      const w = canvas.width;
      const h = canvas.height;

      ctx.fillStyle = '#05050a';
      ctx.fillRect(0, 0, w, h);

      // Primary deep blue energy orb
      const x1 = w * (0.35 + 0.18 * Math.sin(t * 1.1));
      const y1 = h * (0.38 + 0.16 * Math.cos(t * 0.9));
      const g1 = ctx.createRadialGradient(x1, y1, w * 0.04, x1, y1, w * 0.72);
      g1.addColorStop(0, 'rgba(0, 85, 255, 0.42)');
      g1.addColorStop(0.5, 'rgba(0, 50, 180, 0.18)');
      g1.addColorStop(1, 'rgba(5, 5, 10, 0)');
      ctx.fillStyle = g1;
      ctx.fillRect(0, 0, w, h);

      // Secondary cyan ribbon orb
      const x2 = w * (0.68 + 0.16 * Math.cos(t * 0.8));
      const y2 = h * (0.62 + 0.18 * Math.sin(t * 1.2));
      const g2 = ctx.createRadialGradient(x2, y2, w * 0.02, x2, y2, w * 0.56);
      g2.addColorStop(0, 'rgba(0, 240, 255, 0.24)');
      g2.addColorStop(0.45, 'rgba(0, 140, 255, 0.10)');
      g2.addColorStop(1, 'rgba(5, 5, 10, 0)');
      ctx.fillStyle = g2;
      ctx.fillRect(0, 0, w, h);

      // Diagonal architectural grid lines
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.06)';
      ctx.lineWidth = 1;
      const step = 48;
      for (let offset = -h; offset < w + h; offset += step) {
        ctx.beginPath();
        ctx.moveTo(offset, 0);
        ctx.lineTo(offset + h * 0.45, h);
        ctx.stroke();
      }

      if (!reducedMotion) {
        animId = requestAnimationFrame(renderFrame);
      }
    };

    animId = requestAnimationFrame(renderFrame);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  const isUpperLeft = align === 'upper-left';

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#05050a] select-none">
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="absolute inset-0 w-full h-full block"
      />

      {/* Fine organic grain overlay */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.14] mix-blend-overlay"
        style={{
          backgroundImage:
            'radial-gradient(rgba(255,255,255,0.6) 0.5px, transparent 0.5px)',
          backgroundSize: '3px 3px',
        }}
      />

      {/* Subtle directional vignette */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#0055ff]/10 via-transparent to-[#05050a]/85"
      />

      {/* Editorial Gravitron Content */}
      <div
        className={`relative z-10 h-full flex flex-col justify-between p-8 lg:p-12 ${
          isUpperLeft ? 'items-start text-left pr-16 lg:pr-24' : 'items-end text-right pl-16 lg:pl-24'
        }`}
      >
        <div className="flex items-center space-x-3">
          <div className="bg-white/95 px-3 py-1.5 rounded-xl shadow-md">
            <img
              src="/brand/gravitron-logo.png"
              alt="Gravitron IDE"
              className="h-6 w-auto object-contain"
            />
          </div>
        </div>

        <div className={`max-w-sm space-y-4 ${isUpperLeft ? '' : 'ml-auto'}`}>
          <div
            className={`inline-flex items-center space-x-2 rounded-full border border-[#00f0ff]/25 bg-[#00f0ff]/10 px-3 py-1 text-[11px] font-medium text-[#00f0ff] ${
              isUpperLeft ? '' : 'ml-auto'
            }`}
          >
            <Sparkles className="w-3 h-3" />
            <span>{mode === 'signin' ? 'Autonomous Workspace' : 'Local + Cloud AI'}</span>
          </div>

          <h2 className="text-2xl lg:text-3xl font-bold tracking-tight text-white leading-tight">
            Think faster.
            <br />
            <span className="text-[#00f0ff]">Build smarter.</span>
          </h2>

          <p className="text-xs lg:text-sm text-zinc-300/90 leading-relaxed">
            Gravitron IDE pairs multi-agent engineering workflows with encrypted credentials and
            optional offline local models.
          </p>

          <div
            className={`flex flex-wrap gap-2 pt-1 ${
              isUpperLeft ? 'justify-start' : 'justify-end'
            }`}
          >
            <span className="inline-flex items-center space-x-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-zinc-300">
              <ShieldCheck className="w-3.5 h-3.5 text-[#00f0ff]" />
              <span>OS Keychain Security</span>
            </span>
            <span className="inline-flex items-center space-x-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-zinc-300">
              <Cpu className="w-3.5 h-3.5 text-[#0055ff]" />
              <span>Cloud &amp; Offline Models</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
