'use client';

import React, { useEffect, useState } from 'react';

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
  const [svgContent, setSvgContent] = useState<string>('');

  useEffect(() => {
    const fetchSvg = async () => {
      try {
        const response = await fetch(`/icons/${name}.svg`);
        if (!response.ok) throw new Error(`Failed to load icon: ${name}`);
        const content = await response.text();
        setSvgContent(content);
      } catch (error) {
        console.error(`Error loading icon ${name}:`, error);
      }
    };

    fetchSvg();
  }, [name]);

  if (!svgContent) {
    return null;
  }

  // Parse and modify SVG to apply color
  const modifiedSvg = svgContent
    .replace(/stroke="[^"]*"/g, `stroke="${color}"`)
    .replace(/stroke="currentColor"/g, `stroke="${color}"`)

  return (
    <div
      className={className}
      style={{ width: `${width}px`, height: `${height}px`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
      dangerouslySetInnerHTML={{ __html: modifiedSvg }}
      aria-label={alt}
    />
  );
};
