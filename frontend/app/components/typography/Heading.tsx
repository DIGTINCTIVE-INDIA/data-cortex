import type { CSSProperties, ElementType, ReactNode } from "react";

type HeadingProps = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
};

const baseStyle: CSSProperties = {
  fontFamily: "Manrope, sans-serif",
  lineHeight: 1.2,
  margin: 0,
};

const createHeading = (Tag: ElementType, fontSize: number, fontWeight: number) => {
  const Component = ({ children, className = "", style }: HeadingProps) => (
    <Tag
      className={className}
      style={{
        ...baseStyle,
        fontSize: `${fontSize}px`,
        fontWeight,
        ...style,
      }}>
      {children}
    </Tag>
  );

  return Component;
};

/** 64px · 400 */
const GreaterHeader = createHeading("h1", 64, 400);

/** 48px · 700 */
const SuperHeader = createHeading("h1", 48, 700);

/** 32px · 700 */
const H1 = createHeading("h1", 32, 700);

/** 24px · 700 */
const H2 = createHeading("h2", 24, 700);

/** 20px · 700 */
const H3 = createHeading("h3", 20, 700);

/** 16px · 700 */
const H4 = createHeading("h4", 16, 700);

/** 14px · 700 */
const H5 = createHeading("h5", 14, 700);

/** 12px · 700 */
const H6 = createHeading("h6", 12, 700);

export { GreaterHeader, H1, H2, H3, H4, H5, H6, SuperHeader };
