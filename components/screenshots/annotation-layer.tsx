import type { AnnotationShape } from "@/lib/domain/types";

/**
 * Renders annotation shapes over an image. Shapes use 0–1 coordinates;
 * the SVG uses the image's pixel size as its viewBox so strokes and text
 * scale with the image.
 */
export function AnnotationLayer({
  shapes,
  width,
  height,
  className,
}: {
  shapes: readonly AnnotationShape[];
  width: number;
  height: number;
  className?: string;
}) {
  const stroke = Math.max(2, Math.round(width / 450));
  const fontSize = Math.max(14, Math.round(width / 45));

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-hidden
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {shapes.map((shape, i) => {
        switch (shape.kind) {
          case "pen":
            return (
              <polyline
                key={i}
                points={shape.points.map(([x, y]) => `${x * width},${y * height}`).join(" ")}
                stroke={shape.color}
                strokeWidth={stroke}
              />
            );
          case "rect":
            return (
              <rect
                key={i}
                x={shape.x * width}
                y={shape.y * height}
                width={shape.w * width}
                height={shape.h * height}
                stroke={shape.color}
                strokeWidth={stroke}
              />
            );
          case "arrow": {
            const x1 = shape.x1 * width;
            const y1 = shape.y1 * height;
            const x2 = shape.x2 * width;
            const y2 = shape.y2 * height;
            const angle = Math.atan2(y2 - y1, x2 - x1);
            const head = stroke * 5;
            const p = (a: number) => `${x2 - head * Math.cos(angle + a)},${y2 - head * Math.sin(angle + a)}`;
            return (
              <g key={i} stroke={shape.color} strokeWidth={stroke}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} />
                <polyline points={`${p(0.45)} ${x2},${y2} ${p(-0.45)}`} />
              </g>
            );
          }
          case "text":
            return (
              <text
                key={i}
                x={shape.x * width}
                y={shape.y * height}
                fill={shape.color}
                stroke="rgba(0,0,0,0.65)"
                strokeWidth={fontSize / 8}
                paintOrder="stroke"
                fontSize={fontSize}
                fontFamily="var(--font-geist-sans), sans-serif"
                fontWeight={600}
              >
                {shape.text}
              </text>
            );
        }
      })}
    </svg>
  );
}
