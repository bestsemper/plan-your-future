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

  let modifiedSvg = svgContent.replace(/(<svg\b[^>]*?)(\s*\/?>)/, (_, attrs, close) => {
    let updated = attrs;
    if (!/\bwidth=/.test(attrs)) updated += ' width="100%"';
    if (!/\bheight=/.test(attrs)) updated += ' height="100%"';
    return updated + close;
  });

  if (color !== 'currentColor') {
    modifiedSvg = modifiedSvg.replace(/stroke="currentColor"/g, `stroke="${color}"`);
  }

  return (
    <div
      className={className}
      style={{ width: `${width}px`, height: `${height}px`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
      dangerouslySetInnerHTML={{ __html: modifiedSvg }}
      aria-label={alt}
    />
  );
};
