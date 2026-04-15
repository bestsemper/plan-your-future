import React from 'react';
import { icons } from './icons-map';

interface IconProps {
  name: string;
  color?: string;
  width?: number;
  height?: number;
  className?: string;
  alt?: string;
}

export const Icon: React.FC<IconProps> = ({
  name,
  color = 'currentColor',
  width = 24,
  height = 24,
  className = '',
  alt = '',
}) => {
  const svgContent = icons[name];

  if (!svgContent) {
    console.warn(`Icon "${name}" not found in icons-map.ts`);
    return null;
  }

  const modifiedSvg = color === 'currentColor'
    ? svgContent
    : svgContent.replace(/stroke="currentColor"/g, `stroke="${color}"`);

  return (
    <div
      className={className}
      style={{ width: `${width}px`, height: `${height}px`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
      dangerouslySetInnerHTML={{ __html: modifiedSvg }}
      aria-label={alt}
    />
  );
};
