import { motion } from "framer-motion";

const SuspenseFallback = () => {
  return (
    <div className="flex h-[calc(100vh-200px)] w-full items-center justify-center">
      <motion.div
        className="size-11 rounded-full"
        style={{
          background:
            "conic-gradient(from 0deg, transparent 0deg, var(--primary) 90deg, var(--primary) 180deg, transparent 320deg)",
          WebkitMask: "radial-gradient(farthest-side, transparent calc(100% - 4px), black calc(100% - 4px))",
          mask: "radial-gradient(farthest-side, transparent calc(100% - 4px), black calc(100% - 4px))",
        }}
        animate={{ rotate: 360 }}
        transition={{
          repeat: Infinity,
          duration: 0.8,
          ease: "linear",
        }}
      />
    </div>
  );
};

export default SuspenseFallback;
