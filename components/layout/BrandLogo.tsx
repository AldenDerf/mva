import React from "react";
import Image from "next/image";
import Link from "next/link";

export interface BrandLogoProps {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
  textColor?: "dark" | "light";
  href?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = "md",
  showText = true,
  textColor = "dark",
  href = "/",
}) => {
  const dimensions = {
    sm: { width: 38, height: 38, textSize: "text-sm", subTextSize: "text-[10px]" },
    md: { width: 48, height: 48, textSize: "text-base", subTextSize: "text-xs" },
    lg: { width: 64, height: 64, textSize: "text-xl", subTextSize: "text-xs" },
  };

  const current = dimensions[size];

  const content = (
    <div className="flex items-center gap-3 select-none">
      <div className="relative shrink-0 flex items-center justify-center">
        <Image
          src="/images/MVA Official Logo.png"
          alt="Mahatao Volleyball Association Official Logo"
          width={current.width}
          height={current.height}
          priority
          className="object-contain h-auto w-auto max-h-[64px]"
        />
      </div>
      {showText && (
        <div className="flex flex-col">
          <span
            className={`font-black tracking-tight leading-tight ${current.textSize} ${
              textColor === "light" ? "text-white" : "text-[#172019]"
            }`}
          >
            MAHATAO
          </span>
          <span
            className={`font-semibold tracking-widest uppercase ${current.subTextSize} ${
              textColor === "light" ? "text-[#F5D025]" : "text-[#205823]"
            }`}
          >
            Volleyball Association
          </span>
        </div>
      )}
    </div>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="inline-flex items-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#205823] focus-visible:ring-offset-2 transition-opacity hover:opacity-90"
        aria-label="Mahatao Volleyball Association Home"
      >
        {content}
      </Link>
    );
  }

  return content;
};
