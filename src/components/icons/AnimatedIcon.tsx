import React from "react";
import { motion, HTMLMotionProps } from "framer-motion";

interface AnimatedIconProps extends HTMLMotionProps<"span"> {
  children: React.ReactNode;
  animation?: "hover" | "bounce" | "spin";
}

export function AnimatedIcon({ children, animation = "hover", className, ...props }: AnimatedIconProps) {
  let whileHover = {};
  let transition = {};

  switch (animation) {
    case "hover":
      whileHover = { scale: 1.15 };
      transition = { type: "spring", stiffness: 400, damping: 10 };
      break;
    case "bounce":
      whileHover = { y: -2 };
      transition = { type: "spring", stiffness: 300, damping: 15 };
      break;
    case "spin":
      whileHover = { rotate: 90 };
      transition = { type: "spring", stiffness: 200, damping: 15 };
      break;
  }

  return (
    <motion.span
      className={className}
      style={{ display: 'inline-block', lineHeight: 0 }}
      whileHover={whileHover}
      whileTap={{ scale: 0.9 }}
      transition={transition}
      {...props}
    >
      {children}
    </motion.span>
  );
}
