import { motion } from "framer-motion";
import { Ban } from "lucide-react";
import { useNavigate } from "react-router"; // Or use next/router if in Next.js
import { Button } from "../components/ui/button";

const NotFoundPage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-[calc(100vh-3rem)] bg-white rounded-none border dark:bg-zinc-900 flex items-center justify-center px-6">
      <motion.div
        className="max-w-md text-center"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}>
        <div className="flex items-center justify-center mb-6">
          <Ban className="w-16 h-16 text-red-500 dark:text-red-400 animate-pulse" />
        </div>
        <h1 className="text-5xl font-bold text-zinc-900 dark:text-white mb-4">404</h1>
        <p className="text-lg text-zinc-600 dark:text-zinc-300 mb-6">
          Oops! The page you're looking for doesn't exist or has been moved.
        </p>
        <Button variant="primary" className="text-white" onClick={() => navigate("/login")}>
          Go Home
        </Button>
      </motion.div>
    </div>
  );
};

export default NotFoundPage;
