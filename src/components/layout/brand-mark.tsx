import Image from "next/image";

interface BrandMarkProps {
  variant?: "page" | "sidebar";
}

const sizes = {
  page:    { width: 120, height: 34, objectPosition: "center" as const },
  sidebar: { width: 90,  height: 26, objectPosition: "left"   as const },
};

export function BrandMark({ variant = "page" }: BrandMarkProps) {
  const { width, height, objectPosition } = sizes[variant];
  return (
    <Image
      src="/overra-logo.png"
      alt="OVERRA"
      width={width}
      height={height}
      style={{ objectFit: "contain", objectPosition }}
      priority={variant === "page"}
    />
  );
}
