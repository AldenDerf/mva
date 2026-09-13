import React from "react";

export interface SectionProps extends React.HTMLAttributes<HTMLElement> {
  spacing?: "sm" | "md" | "lg";
}

export const Section: React.FC<SectionProps> = ({
  children,
  className = "",
  spacing = "md",
  ...props
}) => {
  const spacingStyles = {
    sm: "py-8 sm:py-12",
    md: "py-12 sm:py-16 lg:py-20",
    lg: "py-16 sm:py-24 lg:py-28",
  };

  return (
    <section
      className={`relative w-full ${spacingStyles[spacing]} ${className}`}
      {...props}
    >
      {children}
    </section>
  );
};
