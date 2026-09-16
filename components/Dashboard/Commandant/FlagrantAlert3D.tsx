import { motion } from 'framer-motion';
import { ReactNode } from 'react';

interface FlagrantAlertProps {
  children: ReactNode;
}

export default function FlagrantAlert3D({ children }: FlagrantAlertProps) {
  return (
    <motion.div
      // Establish 3D perspective context
      style={{ perspective: 1000 }}
      initial={{ 
        opacity: 0, 
        rotateX: -90, // Starts flipped backwards in 3D space
        scale: 0.8,
        y: -50 
      }}
      animate={{ 
        opacity: 1, 
        rotateX: 0, 
        scale: 1,
        y: 0,
        // High-energy pulsing gold glow
        boxShadow: [
          "0px 0px 0px rgba(212, 175, 55, 0)",
          "0px 0px 30px rgba(212, 175, 55, 0.6)",
          "0px 0px 10px rgba(212, 175, 55, 0.2)"
        ]
      }}
      transition={{
        duration: 0.8,
        type: "spring",
        bounce: 0.6, // High bounce for that aggressive "snap" into place
        boxShadow: {
          duration: 1.5,
          repeat: Infinity,
          ease: "easeInOut"
        }
      }}
      className="relative z-50 w-full"
    >
      {children}
    </motion.div>
  );
}
