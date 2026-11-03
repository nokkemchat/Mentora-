import React, { useEffect, useRef } from 'react';
import {
  drawLiquidShape,
  type LiquidGlassOptions,
  type LiquidGlassController
} from '../lib/liquidGlassThree';

interface LiquidGlassCanvasProps {
  kind?: 'rect' | 'capsule' | 'ellipse';
  options?: Partial<LiquidGlassOptions>;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

export const LiquidGlassCanvas: React.FC<LiquidGlassCanvasProps> = ({
  kind = 'rect',
  options,
  className = '',
  style,
  children
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<LiquidGlassController | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    try {
      const controller = drawLiquidShape(
        containerRef.current,
        options,
        kind,
        'LiquidGlassCanvas'
      );
      controllerRef.current = controller;

      return () => {
        controller.destroy();
        controllerRef.current = null;
      };
    } catch (err) {
      console.warn('Failed to initialize Three.js liquid glass canvas:', err);
    }
  }, [kind]);

  useEffect(() => {
    if (controllerRef.current && options) {
      controllerRef.current.update(options);
    }
  }, [options]);

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={style}
    >
      <div
        ref={containerRef}
        className="absolute inset-0 pointer-events-none z-0"
      />
      {children && (
        <div className="relative z-10 w-full h-full">
          {children}
        </div>
      )}
    </div>
  );
};

export default LiquidGlassCanvas;
